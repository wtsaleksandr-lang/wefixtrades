/**
 * Branded proposal-PDF lead packet generator.
 *
 * When a homeowner submits a quote through a contractor's roof/solar widget,
 * the CONTRACTOR gets a clean, branded PDF they can use to follow up. This
 * composes that packet PURELY from data — no headless browser, no Chromium.
 * Prod ships without a Chromium binary (that's why /api/roofquote/capture
 * 502'd), so we use PDFKit, the same pure-Node library the audit-report PDF
 * (server/lib/pdfGenerator.ts) already uses.
 *
 * The packet header carries the contractor's branding (business name, license,
 * phone, website); the body carries the homeowner's contact + property address
 * and a clean quote summary (roof and/or solar price range, system size, panel
 * count, measurements, selected material/tier). Roof, solar, and generic leads
 * are all supported; missing branding/data degrades gracefully (rows hidden,
 * never crash).
 */

import PDFDocument from "pdfkit";
import type { Calculator, Lead } from "@shared/schema";
import { resolveYearsInBusiness } from "@shared/templatePresets";
import { createLogger } from "./logger";

const log = createLogger("ProposalPDF");

/* ── Palette (mirrors server/lib/pdfGenerator.ts) ── */
const C = {
  dark: "#1A1A2E",
  white: "#FFFFFF",
  grey: "#6B7280",
  lightGrey: "#E5E7EB",
  brandBlue: "#0d3cfc",
  green: "#22C55E",
  panel: "#F8FAFC",
  textBody: "#4B5563",
};

const PAGE_W = 595; // A4 width
const MARGIN = 40;
const W = PAGE_W - MARGIN * 2; // 515 usable width

/** Normalised, render-ready view of one lead packet. Pure data → PDF. */
export interface ProposalPdfData {
  // Contractor branding
  businessName: string;
  brandColor: string;
  trade: string;
  contractorPhone: string | null;
  contractorEmail: string | null;
  website: string | null;
  licenseNumber: string | null;
  insuredAmount: string | null;
  yearsInBusiness: number | null;
  googleRating: number | null;
  googleReviewCount: number | null;
  // Homeowner / property
  homeownerName: string | null;
  homeownerPhone: string | null;
  homeownerEmail: string | null;
  propertyAddress: string | null;
  // Quote summary
  quoteLabel: string; // "Roof Replacement", "Solar Installation", "Quote"
  priceLow: number | null;
  priceHigh: number | null;
  // Roof specifics
  roofSqft: number | null;
  selectedMaterial: string | null;
  // Solar specifics
  systemSizeKw: number | null;
  panelCount: number | null;
  tier: string | null;
  // Engagement signals (roof widget supplies these)
  timeline: string | null;
  priorities: string[] | null;
  leadScore: number | null;
  // Generic key inputs (wizard answers) — fallback summary rows
  extraRows: Array<{ label: string; value: string }>;
  createdAt: string;
  // QuoteQuick "Powered by" footer credit. Free tier shows it; paid tiers
  // (Pro/Business) remove it — mirrors the widget badge gating, which keys off
  // calc.show_powered_by_badge (server-side tier-enforced at save time).
  showPoweredBy: boolean;
}

function asNumber(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v) : (v as number);
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

function asTrimmed(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

/**
 * Normalise a string to characters PDFKit's Standard-14 Helvetica (WinAnsi
 * encoding) can render. Smart punctuation and Unicode dashes that come in via
 * lead data or formatting silently drop or mis-render otherwise (e.g. an
 * en-dash "–" vanished from the price band, "★" rendered as "&"). We map the
 * common offenders to safe ASCII and strip anything still outside the printable
 * Latin-1 range. Applied centrally right before every doc.text() call.
 */
function safe(s: string): string {
  return s
    .replace(/[‐-―−]/g, "-") // hyphen/en/em/figure dashes + minus → "-"
    .replace(/[‘’‚‛]/g, "'") // smart single quotes → '
    .replace(/[“”„‟]/g, '"') // smart double quotes → "
    .replace(/[…]/g, "...") // ellipsis
    .replace(/[★☆]/g, "*") // star glyphs (no WinAnsi glyph)
    // Drop any remaining char outside printable ASCII + the WinAnsi punctuation
    // we deliberately keep (• U+2022 renders fine in Helvetica).
    .replace(/[^\x20-\x7E•]/g, "");
}

function titleCase(s: string): string {
  // Collapse underscores to spaces, but PRESERVE a hyphen that sits between two
  // characters (e.g. "1-3_months" → "1-3 Months") so ranges aren't mangled into
  // "1 3 Months". Leading/trailing hyphens still collapse to a space.
  return s
    .replace(/_+/g, " ")
    .replace(/(^|[^A-Za-z0-9])-+|-+(?=[^A-Za-z0-9]|$)/g, "$1 ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\s+/g, " ")
    .trim();
}

function fmtMoney(n: number): string {
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

/**
 * Build the normalised packet view from a Calculator + Lead. Tolerant of every
 * missing field — roof-widget leads carry roof/solar data in `answers`, wizard
 * leads carry arbitrary `answers`, and branding may be partial.
 */
export function buildProposalData(calc: Calculator, lead: Lead): ProposalPdfData {
  const settings = (calc.calculator_settings as any) || {};
  const advanced = settings.advanced || {};
  const profile = (advanced.businessProfile || {}) as Record<string, unknown>;
  const answers = (lead.answers as Record<string, any>) || {};

  // Trade / source classification.
  const source = asTrimmed(answers.source);
  const tradeRaw = asTrimmed(answers.trade) || asTrimmed(calc.trade_type) || "";
  const isSolar =
    /solar/i.test(tradeRaw) ||
    asTrimmed(answers.tier) != null ||
    asNumber(answers.kw) != null;
  const isRoof = source === "roof_visualizer" || /roof/i.test(tradeRaw);

  const quoteLabel = isSolar
    ? "Solar Installation"
    : isRoof
      ? "Roof Replacement"
      : tradeRaw
        ? titleCase(tradeRaw)
        : "Quote Request";

  // Price range — roof widget supplies priceLo/priceHi in answers; otherwise
  // fall back to the single lead.quote_amount as the "high" anchor.
  const priceLo = asNumber(answers.priceLo);
  const priceHiAns = asNumber(answers.priceHi);
  const quoteAmount =
    typeof lead.quote_amount === "number" && Number.isFinite(lead.quote_amount)
      ? lead.quote_amount
      : null;
  const priceHigh = priceHiAns ?? quoteAmount;
  const priceLow = priceLo ?? (priceHigh != null && quoteAmount == null ? priceHigh : priceLo);

  // System size + panels (solar). Google Solar / PVWatts produce kw; some
  // payloads also carry an explicit panel count.
  const systemSizeKw = asNumber(answers.kw) ?? asNumber(answers.systemSizeKw);
  const panelCount =
    asNumber(answers.panelCount) ??
    asNumber(answers.panels) ??
    (systemSizeKw != null ? Math.round((systemSizeKw * 1000) / 400) : null); // ~400W panels

  // Which answer keys we render as dedicated rows — everything else that's a
  // scalar becomes a generic "key inputs" row so wizard leads still surface
  // their captured fields.
  const HANDLED = new Set([
    "source", "trade", "address", "priceLo", "priceHi", "kw", "systemSizeKw",
    "panelCount", "panels", "roofSqft", "tier", "timeline", "priorities",
    "leadScore", "intent", "material", "selectedMaterial",
  ]);
  const extraRows: Array<{ label: string; value: string }> = [];
  for (const [k, v] of Object.entries(answers)) {
    if (HANDLED.has(k)) continue;
    if (v == null) continue;
    if (typeof v === "object") continue; // skip nested structures
    const val = String(v).trim();
    if (!val) continue;
    extraRows.push({ label: titleCase(k), value: val });
    if (extraRows.length >= 8) break;
  }

  return {
    businessName: asTrimmed(calc.business_name) || "Your Contractor",
    brandColor: asTrimmed(calc.primary_color) || C.brandBlue,
    trade: tradeRaw ? titleCase(tradeRaw) : titleCase(calc.trade_type || ""),
    contractorPhone: asTrimmed(calc.owner_phone),
    contractorEmail: asTrimmed(calc.owner_email),
    website: asTrimmed(calc.website_url),
    licenseNumber: asTrimmed(profile.licenseNumber),
    insuredAmount: asTrimmed(profile.insuredAmount),
    yearsInBusiness: resolveYearsInBusiness(asNumber(profile.yearsInBusiness)),
    googleRating: asNumber(profile.googleRating),
    googleReviewCount: asNumber(profile.googleReviewCount),

    homeownerName: asTrimmed(lead.name),
    homeownerPhone: asTrimmed(lead.phone),
    homeownerEmail: asTrimmed(lead.email),
    propertyAddress: asTrimmed(answers.address),

    quoteLabel,
    priceLow: priceLow ?? null,
    priceHigh: priceHigh ?? null,

    roofSqft: asNumber(answers.roofSqft),
    selectedMaterial: asTrimmed(answers.selectedMaterial) || asTrimmed(answers.material),

    systemSizeKw,
    panelCount,
    tier: asTrimmed(answers.tier),

    timeline: asTrimmed(answers.timeline),
    priorities: Array.isArray(answers.priorities)
      ? answers.priorities.map((p: unknown) => String(p)).filter(Boolean).slice(0, 6)
      : null,
    leadScore: asNumber(answers.leadScore),

    extraRows,
    createdAt: (lead as any).created_date
      ? new Date((lead as any).created_date).toISOString()
      : new Date().toISOString(),
    // Default ON (free tier) when the column is null/undefined — same default
    // as the widget (dashboardRoutes serves `show_powered_by_badge ?? true`).
    // Only an explicit `false` (paid tier removed it) hides the credit.
    showPoweredBy: (calc as any).show_powered_by_badge !== false,
  };
}

/**
 * Render the proposal packet to a PDF Buffer. Pure Node (PDFKit) — no browser.
 * Validates the %PDF- signature before returning. Returns ok:false on failure
 * so the caller can degrade gracefully (send the plain email without the PDF).
 */
export async function generateProposalPdf(
  calc: Calculator,
  lead: Lead,
): Promise<
  | { ok: true; buffer: Buffer; filename: string; data: ProposalPdfData }
  | { ok: false; error: string }
> {
  try {
    const data = buildProposalData(calc, lead);
    const buffer = await renderProposalPdf(data);

    const sig = buffer.slice(0, 5).toString("ascii");
    if (sig !== "%PDF-") {
      log.error(`[proposal-pdf] invalid signature "${sig}"`);
      return { ok: false, error: "PDF generation produced invalid output" };
    }

    const safeName = data.businessName
      .replace(/[^a-zA-Z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .slice(0, 50);
    const filename = `${safeName || "Lead"}-Proposal-Lead-${lead.id}.pdf`;

    log.info(`[proposal-pdf] OK: ${buffer.length} bytes for lead ${lead.id} (${data.businessName})`);
    return { ok: true, buffer, filename, data };
  } catch (err: any) {
    log.error(`[proposal-pdf] failed for lead ${lead?.id}: ${err?.message}`);
    return { ok: false, error: `Proposal PDF generation failed: ${err?.message}` };
  }
}

/** Add a page when remaining vertical space is below `needed`. */
function ensureSpace(doc: PDFKit.PDFDocument, y: number, needed: number): number {
  if (y + needed > 790) {
    doc.addPage();
    return 50;
  }
  return y;
}

function renderProposalPdf(data: ProposalPdfData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const doc = new PDFDocument({ size: "A4", margin: MARGIN, bufferPages: true });
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    // Sanitise EVERY rendered string centrally — wrap doc.text so any caller
    // (current or future) can't leak a non-WinAnsi char into the output. Keeps
    // the render code below readable while guaranteeing the en-dash/star/smart-
    // quote class of bug can't recur.
    const rawText = doc.text.bind(doc);
    (doc as any).text = (text: any, ...rest: any[]) =>
      rawText(typeof text === "string" ? safe(text) : text, ...rest);

    const brand = /^#[0-9a-fA-F]{6}$/.test(data.brandColor) ? data.brandColor : C.brandBlue;

    // ── Branded header bar ──
    doc.rect(MARGIN, MARGIN, W, 58).fill(brand);
    doc.font("Helvetica-Bold").fontSize(18).fill(C.white)
      .text(data.businessName, MARGIN + 16, MARGIN + 12, { width: W - 32 });
    const headerMeta = [
      data.trade || null,
      data.contractorPhone,
      data.website ? data.website.replace(/^https?:\/\//, "") : null,
    ].filter(Boolean).join("   •   ");
    if (headerMeta) {
      doc.font("Helvetica").fontSize(9).fill("rgba(255,255,255,0.85)")
        .text(headerMeta, MARGIN + 16, MARGIN + 38, { width: W - 32 });
    }

    let y = MARGIN + 58 + 12;

    // ── Credential strip (license / insured / years / rating) ──
    const creds: string[] = [];
    if (data.licenseNumber) creds.push(`Licensed #${data.licenseNumber}`);
    if (data.insuredAmount) creds.push(data.insuredAmount);
    if (data.yearsInBusiness) creds.push(`${data.yearsInBusiness} yrs in business`);
    if (data.googleRating != null) {
      // Standard-14 Helvetica (WinAnsi) has no U+2605 star glyph — it renders
      // as a fallback char. Use plain "X.X / 5" wording so the strip is clean
      // in every PDF viewer without embedding a custom font.
      creds.push(
        data.googleReviewCount != null
          ? `${data.googleRating}/5 Google (${data.googleReviewCount.toLocaleString("en-US")} reviews)`
          : `${data.googleRating}/5 Google`,
      );
    }
    if (creds.length) {
      doc.font("Helvetica").fontSize(9).fill(C.grey)
        .text(creds.join("    •    "), MARGIN, y, { width: W });
      y = (doc as any).y + 8;
    }

    // ── Title ──
    doc.font("Helvetica-Bold").fontSize(15).fill(C.dark)
      .text("New Lead — Proposal Packet", MARGIN, y);
    y = (doc as any).y + 2;
    const dateStr = new Date(data.createdAt).toLocaleString("en-US", {
      year: "numeric", month: "long", day: "numeric", hour: "numeric", minute: "2-digit",
    });
    doc.font("Helvetica").fontSize(8.5).fill(C.grey)
      .text(`${data.quoteLabel}  •  Captured ${dateStr}`, MARGIN, y);
    y = (doc as any).y + 14;

    // ── Quote headline band ──
    if (data.priceHigh != null) {
      doc.roundedRect(MARGIN, y, W, 56, 8).fill(C.dark);
      doc.font("Helvetica").fontSize(8.5).fill("rgba(255,255,255,0.6)")
        .text(`Estimated ${data.quoteLabel} Range`, MARGIN, y + 10, { width: W, align: "center" });
      const priceText =
        data.priceLow != null && data.priceLow !== data.priceHigh
          ? `${fmtMoney(data.priceLow)} – ${fmtMoney(data.priceHigh)}`
          : fmtMoney(data.priceHigh);
      doc.font("Helvetica-Bold").fontSize(22).fill(C.white)
        .text(priceText, MARGIN, y + 26, { width: W, align: "center" });
      y += 56 + 16;
    }

    // ── Two info cards: Homeowner | Property + Quote details ──
    const labeledRows = (
      title: string,
      rows: Array<[string, string | null]>,
      colX: number,
      colW: number,
      startY: number,
    ): number => {
      const present = rows.filter(([, v]) => v != null && v !== "");
      doc.font("Helvetica-Bold").fontSize(10).fill(C.dark).text(title, colX, startY);
      let ry = startY + 16;
      if (present.length === 0) {
        doc.font("Helvetica").fontSize(9).fill(C.grey).text("—", colX, ry);
        return ry + 14;
      }
      for (const [label, value] of present) {
        doc.font("Helvetica").fontSize(7.5).fill(C.grey)
          .text(label.toUpperCase(), colX, ry, { width: colW, characterSpacing: 0.3 });
        ry = (doc as any).y + 1;
        doc.font("Helvetica-Bold").fontSize(10).fill(C.dark)
          .text(String(value), colX, ry, { width: colW });
        ry = (doc as any).y + 8;
      }
      return ry;
    };

    y = ensureSpace(doc, y, 160);
    const colGap = 24;
    const colW = (W - colGap) / 2;
    const leftX = MARGIN;
    const rightX = MARGIN + colW + colGap;
    const cardTop = y;

    // Card background panels — sized after we know the taller column. Render
    // text first into a measured pass by computing rows, then draw panels behind.
    const homeownerRows: Array<[string, string | null]> = [
      ["Name", data.homeownerName],
      ["Phone", data.homeownerPhone],
      ["Email", data.homeownerEmail],
      ["Property Address", data.propertyAddress],
    ];

    const quoteRows: Array<[string, string | null]> = [];
    if (data.systemSizeKw != null) quoteRows.push(["System Size", `${data.systemSizeKw} kW`]);
    if (data.panelCount != null) quoteRows.push(["Panels (est.)", String(data.panelCount)]);
    if (data.tier) quoteRows.push(["Selected Tier", titleCase(data.tier)]);
    if (data.roofSqft != null) quoteRows.push(["Roof Area", `${data.roofSqft.toLocaleString("en-US")} sq ft`]);
    if (data.selectedMaterial) quoteRows.push(["Selected Material", titleCase(data.selectedMaterial)]);
    if (data.timeline) quoteRows.push(["Timeline", titleCase(data.timeline)]);
    if (data.leadScore != null) quoteRows.push(["Lead Score", `${data.leadScore}/100`]);
    if (quoteRows.length === 0) quoteRows.push(["Details", "See key inputs below"]);

    // Draw the two cards (text), measuring each column's end-Y.
    const padX = 12;
    const padY = 12;
    const leftEnd = labeledRows("Homeowner & Property", homeownerRows, leftX + padX, colW - padX * 2, cardTop + padY);
    const rightEnd = labeledRows("Quote Summary", quoteRows, rightX + padX, colW - padX * 2, cardTop + padY);
    const cardBottom = Math.max(leftEnd, rightEnd) + padY - 4;
    const cardH = cardBottom - cardTop;

    // Panels behind text: PDFKit draws in order, so re-stroke borders on top
    // without a fill (text already painted). Use a light outline only.
    doc.roundedRect(leftX, cardTop, colW, cardH, 8).lineWidth(1).stroke(C.lightGrey);
    doc.roundedRect(rightX, cardTop, colW, cardH, 8).lineWidth(1).stroke(C.lightGrey);

    y = cardBottom + 18;

    // ── Priorities ──
    if (data.priorities && data.priorities.length) {
      y = ensureSpace(doc, y, 50);
      doc.font("Helvetica-Bold").fontSize(10).fill(C.dark).text("Homeowner Priorities", MARGIN, y);
      y = (doc as any).y + 8;
      let chipX = MARGIN;
      for (const p of data.priorities) {
        const label = titleCase(p);
        const chipW = doc.font("Helvetica").fontSize(8).widthOfString(label) + 18;
        if (chipX + chipW > MARGIN + W) {
          chipX = MARGIN;
          y += 22;
          y = ensureSpace(doc, y, 24);
        }
        doc.roundedRect(chipX, y, chipW, 16, 8).fill(C.panel);
        doc.font("Helvetica").fontSize(8).fill(C.textBody).text(label, chipX + 9, y + 4);
        chipX += chipW + 8;
      }
      y += 28;
    }

    // ── Key inputs (generic wizard answers) ──
    if (data.extraRows.length) {
      y = ensureSpace(doc, y, 60);
      doc.font("Helvetica-Bold").fontSize(10).fill(C.dark).text("Key Inputs", MARGIN, y);
      y = (doc as any).y + 10;
      for (const row of data.extraRows) {
        y = ensureSpace(doc, y, 18);
        doc.font("Helvetica").fontSize(9).fill(C.grey).text(row.label, MARGIN, y, { width: 200 });
        doc.font("Helvetica-Bold").fontSize(9).fill(C.dark)
          .text(row.value, MARGIN + 210, y, { width: W - 210, align: "right" });
        y += 16;
      }
      y += 4;
    }

    // ── Follow-up CTA strip ──
    y = ensureSpace(doc, y, 64);
    y += 4;
    doc.roundedRect(MARGIN, y, W, 50, 8).fill(C.panel);
    doc.font("Helvetica-Bold").fontSize(10).fill(C.dark)
      .text("Next step: reply within the hour", MARGIN + 14, y + 10, { width: W - 28 });
    const contactBits = [
      data.homeownerPhone ? `Call ${data.homeownerPhone}` : null,
      data.homeownerEmail ? `Email ${data.homeownerEmail}` : null,
    ].filter(Boolean).join("   •   ") || "Contact details above";
    doc.font("Helvetica").fontSize(9).fill(C.textBody)
      .text(contactBits, MARGIN + 14, y + 28, { width: W - 28 });
    y += 50;

    // ── Footer ──
    // The "Powered by" credit is gated by tier: free shows it, paid (Pro/
    // Business) removes it — same flag as the widget badge (show_powered_by_badge).
    // Paid tiers get a clean, contractor-only footer line instead.
    y = ensureSpace(doc, y, 30);
    y += 14;
    doc.rect(MARGIN, y, W, 0.5).fill(C.lightGrey);
    y += 8;
    const footerText = data.showPoweredBy
      ? `Lead packet for ${data.businessName} — generated by WeFixTrades / QuoteQuick`
      : `Lead packet for ${data.businessName}`;
    doc.font("Helvetica").fontSize(7).fill(C.grey)
      .text(footerText, MARGIN, y, { width: W, align: "center" });

    doc.end();
  });
}
