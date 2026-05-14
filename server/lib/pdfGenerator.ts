import { db } from "../db";
import { auditReports } from "@shared/schema";
import { eq } from "drizzle-orm";
import type { PdfReportData } from "./pdfTemplate";
import PDFDocument from "pdfkit";
import { createLogger } from "./logger";

const log = createLogger("PDFGenerator");

/**
 * Generates a PDF buffer for an audit report using PDFKit.
 * Pure Node.js — no Chromium, no browser, no external processes.
 */
export async function generateReportPdf(
  reportId: string,
  origin: string,
): Promise<{ ok: true; buffer: Buffer; filename: string } | { ok: false; error: string }> {
  // 1. Fetch report from DB
  const rows = await db
    .select({
      business_name: auditReports.business_name,
      audit_data: auditReports.audit_data,
      ai_narrative: auditReports.ai_narrative,
      created_at: auditReports.created_at,
    })
    .from(auditReports)
    .where(eq(auditReports.id, reportId))
    .limit(1);

  if (rows.length === 0) return { ok: false, error: "Report not found" };

  const row = rows[0];
  const ad: any = row.audit_data || {};
  const narrative: any = row.ai_narrative || {};
  const biz = ad.business || {};

  // 2. Extract data
  const data: PdfReportData = {
    businessName: row.business_name || biz.name || "Business",
    address: biz.address || "",
    phone: biz.phone || null,
    website: biz.website || null,
    rating: biz.rating ?? null,
    reviewsCount: biz.reviewsCount || 0,
    trade: ad.trade || "",
    city: ad.city || "",
    createdAt: row.created_at?.toISOString() || "",
    overallScore: ad.scores?.total ?? ad.scores?.overall ?? 0,
    grade: ad.scores?.grade || narrative.grade || "D",
    executiveSummary: narrative.executiveSummary || "",
    scores: {
      googleMaps: ad.scores?.googleMaps || { score: 0, max: 25 },
      websiteQuality: ad.scores?.websiteQuality || null,
      searchVisibility: ad.scores?.searchVisibility || { score: 0, max: 20 },
      competitorPositioning: ad.scores?.competitorPositioning || { score: 0, max: 15 },
      adOpportunity: ad.scores?.adOpportunity || { score: 0, max: 10 },
      demandCoverage: ad.scores?.demandCoverage || { score: 0, max: 10 },
    },
    actionPlan: narrative.actionPlan || [],
    competitors: ad.competitors || [],
    keywords: ad.keywords || [],
    revenueLoss: ad.estimatedRevenueLoss || null,
    quickWin: narrative.quickWin || null,
    speedData: ad.speedData || null,
    reportUrl: `${origin}/audit/report/${reportId}`,
  };

  // 3. Generate PDF
  try {
    const buf = await renderPdf(data);

    // Validate
    const sig = buf.slice(0, 5).toString("ascii");
    if (sig !== "%PDF-") {
      log.error(`[pdf-generator] Invalid signature "${sig}"`);
      return { ok: false, error: "PDF generation produced invalid output" };
    }

    const safeName = row.business_name
      .replace(/[^a-zA-Z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .slice(0, 60);

    log.info(`[pdf-generator] OK: ${buf.length} bytes for "${row.business_name}"`);
    return { ok: true, buffer: buf, filename: `WeFixTrades-Audit-${safeName}.pdf` };
  } catch (err: any) {
    log.error(`[pdf-generator] Failed for ${reportId}: ${err?.message}`);
    return { ok: false, error: `PDF generation failed: ${err?.message}` };
  }
}

/* ── PDF rendering with PDFKit ── */

const C = {
  dark: "#1A1A2E",
  white: "#FFFFFF",
  grey: "#6B7280",
  lightGrey: "#E5E7EB",
  cyan: "#0d3cfc",
  green: "#22C55E",
  amber: "#F59E0B",
  red: "#EF4444",
};

function gradeColor(g: string): string {
  return g === "A" ? C.green : g === "B" ? C.cyan : g === "C" ? C.amber : C.red;
}

function scoreColor(score: number, max: number): string {
  const pct = max > 0 ? (score / max) * 100 : 0;
  return pct >= 70 ? C.green : pct >= 45 ? C.amber : C.red;
}

function fmtNum(n: number): string { return n.toLocaleString("en-US"); }

function renderPdf(data: PdfReportData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const doc = new PDFDocument({ size: "A4", margin: 40, bufferPages: true });
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const W = 515; // usable width (A4 width 595 - 2*40 margin)
    const gc = gradeColor(data.grade);

    // ── Header bar ──
    doc.rect(40, 40, W, 48).fill(C.dark);
    doc.fontSize(16).fill(C.white).text("WeFixTrades", 56, 52, { continued: false });
    doc.fontSize(8).fill("rgba(255,255,255,0.5)");
    const dateStr = data.createdAt ? new Date(data.createdAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }) : "";
    doc.text(`Local Business Audit Report${dateStr ? `  •  ${dateStr}` : ""}`, 56, 70);

    // ── Business info + score ──
    let y = 108;
    doc.fontSize(18).fill(C.dark).text(data.businessName, 40, y);
    y += 24;

    const meta = [data.address, data.phone, data.website?.replace(/^https?:\/\//, "")].filter(Boolean).join("  •  ");
    if (meta) {
      doc.fontSize(9).fill(C.grey).text(meta, 40, y, { width: W - 100 });
      y += 14;
    }

    if (data.rating != null) {
      doc.fontSize(9).fill(C.amber).text(`★ ${data.rating} (${data.reviewsCount} reviews)`, 40, y);
      y += 14;
    }

    // Score badge (right-aligned)
    const scoreX = 480;
    doc.roundedRect(scoreX, 108, 75, 50, 8).fill(gc);
    doc.fontSize(22).fill(C.white).text(`${data.overallScore}`, scoreX, 114, { width: 75, align: "center" });
    doc.fontSize(8).fill(C.white).text(`/ 100`, scoreX, 138, { width: 75, align: "center" });

    // Executive summary
    y += 8;
    if (data.executiveSummary) {
      doc.rect(40, y, W, 1).fill(C.lightGrey);
      y += 10;
      doc.fontSize(9).fill("#4B5563").text(data.executiveSummary, 40, y, { width: W, lineGap: 2 });
      y = (doc as any).y + 16;
    }

    // ── Score Breakdown ──
    y = ensureSpace(doc, y, 120);
    doc.fontSize(13).fill(C.dark).text("Score Breakdown", 40, y);
    y += 22;

    const cats = [
      { key: "googleMaps" as const, label: "Google Maps Profile", max: 25 },
      { key: "websiteQuality" as const, label: "Website Quality", max: 20 },
      { key: "searchVisibility" as const, label: "Search Visibility", max: 20 },
      { key: "competitorPositioning" as const, label: "Competitor Position", max: 15 },
      { key: "adOpportunity" as const, label: "Ad Opportunity", max: 10 },
      { key: "demandCoverage" as const, label: "Demand Coverage", max: 10 },
    ];

    for (const cat of cats) {
      const sc = data.scores[cat.key];
      if (!sc) continue;
      const pct = sc.max > 0 ? (sc.score / sc.max) : 0;
      const clr = scoreColor(sc.score, sc.max);

      doc.fontSize(9).fill(C.dark).text(cat.label, 40, y, { width: 130 });

      // Bar background
      const barX = 178;
      const barW = 280;
      doc.roundedRect(barX, y + 2, barW, 8, 3).fill("#F3F4F6");
      // Bar fill
      if (pct > 0) doc.roundedRect(barX, y + 2, barW * pct, 8, 3).fill(clr);

      doc.fontSize(9).fill(clr).text(`${sc.score} / ${sc.max}`, 468, y, { width: 80, align: "right" });
      y += 20;
    }

    // ── Action Plan ──
    if (data.actionPlan.length > 0) {
      y = ensureSpace(doc, y, 80);
      y += 8;
      doc.fontSize(13).fill(C.dark).text("What's Holding You Back", 40, y);
      y += 22;

      for (const item of data.actionPlan) {
        y = ensureSpace(doc, y, 60);
        const prio = (item.priority || "medium").toLowerCase();
        const prioColor = prio === "high" ? C.red : prio === "low" ? C.green : C.amber;

        // Priority badge
        doc.roundedRect(40, y, 50, 14, 3).fill(prioColor + "20");
        doc.fontSize(7).fill(prioColor).text(prio.toUpperCase(), 42, y + 3, { width: 46, align: "center" });

        if (item.estimatedImpact) {
          doc.roundedRect(96, y, 100, 14, 3).fill("#F3F4F6");
          doc.fontSize(7).fill(C.grey).text(item.estimatedImpact, 98, y + 3, { width: 96 });
        }
        y += 20;

        doc.fontSize(10).fill(C.dark).text(item.title, 40, y, { width: W });
        y = (doc as any).y + 4;
        doc.fontSize(8).fill("#4B5563").text(item.detail, 40, y, { width: W, lineGap: 1 });
        y = (doc as any).y + 4;

        const tags = [item.estimatedCost, item.timeToResult].filter(Boolean);
        if (tags.length) {
          doc.fontSize(7).fill(C.grey).text(tags.join("  •  "), 40, y);
          y = (doc as any).y + 4;
        }
        y += 8;
      }
    }

    // ── Competitors ──
    if (data.competitors.length > 0) {
      y = ensureSpace(doc, y, 100);
      y += 8;
      doc.fontSize(13).fill(C.dark).text("How You Compare Locally", 40, y);
      y += 22;

      // Table header
      const cols = [40, 200, 270, 330, 390, 460];
      doc.fontSize(7).fill(C.grey);
      doc.text("#", cols[0], y);
      doc.text("BUSINESS", cols[1] - 140, y);
      doc.text("RATING", cols[2], y);
      doc.text("REVIEWS", cols[3], y);
      doc.text("WEBSITE", cols[4], y);
      doc.text("SCORE", cols[5], y);
      y += 14;
      doc.rect(40, y - 2, W, 0.5).fill(C.lightGrey);

      // Your row
      doc.rect(40, y, W, 18).fill(gc + "10");
      doc.fontSize(8).fill(C.dark);
      doc.text("★ YOU", cols[0], y + 4);
      doc.font("Helvetica-Bold").text(data.businessName.slice(0, 28), cols[1] - 140, y + 4);
      doc.font("Helvetica").text(String(data.rating ?? "—"), cols[2], y + 4);
      doc.text(String(data.reviewsCount), cols[3], y + 4);
      doc.text(data.website ? "✓" : "✗", cols[4], y + 4);
      doc.fill(gc).text(String(data.overallScore), cols[5], y + 4);
      y += 22;

      for (let i = 0; i < Math.min(data.competitors.length, 5); i++) {
        y = ensureSpace(doc, y, 22);
        const c = data.competitors[i];
        const cColor = c.score >= 70 ? C.green : c.score >= 45 ? C.amber : C.red;
        doc.fontSize(8).fill(C.dark);
        doc.text(String(i + 1), cols[0], y + 2);
        doc.text(c.name.slice(0, 28), cols[1] - 140, y + 2);
        doc.text(String(c.rating || "—"), cols[2], y + 2);
        doc.text(String(c.reviewsCount), cols[3], y + 2);
        doc.text(c.hasWebsite ? "✓" : "✗", cols[4], y + 2);
        doc.fill(cColor).text(String(c.score), cols[5], y + 2);
        y += 18;
      }
    }

    // ── Keywords ──
    if (data.keywords.length > 0) {
      y = ensureSpace(doc, y, 80);
      y += 8;
      doc.fontSize(13).fill(C.dark).text("What Customers Search For", 40, y);
      y += 22;

      for (const kw of data.keywords.slice(0, 10)) {
        y = ensureSpace(doc, y, 16);
        const rankColor = kw.organicRank ? (kw.organicRank <= 3 ? C.green : kw.organicRank <= 10 ? C.amber : C.red) : C.red;
        const rankText = kw.organicRank ? `#${kw.organicRank}` : "Not ranking";

        doc.fontSize(8).fill(C.dark).text(kw.keyword, 40, y, { width: 200 });
        doc.fill(C.grey).text(`${fmtNum(kw.monthlySearches)}/mo`, 250, y, { width: 60, align: "right" });
        doc.text(`$${kw.cpc?.toFixed(2) ?? "0.00"}`, 320, y, { width: 50, align: "right" });
        doc.fill(rankColor).text(rankText, 380, y, { width: 80 });
        if (kw.isInLocalPack) doc.fill(C.green).text("Map Pack", 460, y, { width: 60 });
        y += 16;
      }
    }

    // ── Revenue Loss ──
    if (data.revenueLoss && data.revenueLoss.high > 0) {
      y = ensureSpace(doc, y, 70);
      y += 12;
      doc.roundedRect(40, y, W, 55, 6).fill(C.dark);
      doc.fontSize(8).fill("rgba(255,255,255,0.6)").text("Estimated Monthly Revenue Left on the Table", 40, y + 8, { width: W, align: "center" });
      doc.fontSize(20).fill(C.red).text(`$${fmtNum(data.revenueLoss.low)} – $${fmtNum(data.revenueLoss.high)}`, 40, y + 24, { width: W, align: "center" });
      y += 65;
    }

    // ── Quick Win ──
    if (data.quickWin) {
      y = ensureSpace(doc, y, 60);
      y += 8;
      doc.roundedRect(40, y, W, 50, 6).fillAndStroke("#F0FFF4", "#BBF7D0");
      doc.fontSize(10).fill("#166534").text(`⚡ Quick Win${data.quickWin.timeRequired ? ` (${data.quickWin.timeRequired})` : ""}`, 52, y + 8);
      doc.fontSize(8).fill("#4B5563").text(data.quickWin.action, 52, y + 24, { width: W - 24, lineGap: 1 });
      y += 58;
    }

    // ── Speed ──
    if (data.speedData && (data.speedData.mobile || data.speedData.desktop)) {
      y = ensureSpace(doc, y, 80);
      y += 8;
      doc.fontSize(13).fill(C.dark).text("Website Speed", 40, y);
      y += 22;

      for (const device of ["mobile", "desktop"] as const) {
        const d = data.speedData[device];
        if (!d) continue;
        const sc = Math.round(d.score);
        const clr = sc >= 90 ? C.green : sc >= 50 ? C.amber : C.red;

        doc.fontSize(8).fill(C.grey).text(device === "mobile" ? "MOBILE" : "DESKTOP", 40, y);
        doc.fontSize(16).fill(clr).text(`${sc}`, 100, y - 4);
        doc.fontSize(8).fill(C.grey).text("/100", 130, y);

        const metrics = [
          { name: "FCP", val: d.fcp != null ? `${Number(d.fcp).toFixed(2)}s` : "—" },
          { name: "LCP", val: d.lcp != null ? `${Number(d.lcp).toFixed(2)}s` : "—" },
          { name: "TBT", val: d.tbt != null ? `${Math.round(Number(d.tbt))}ms` : "—" },
          { name: "CLS", val: d.cls != null ? String(d.cls) : "—" },
        ];
        let mx = 200;
        for (const m of metrics) {
          doc.fontSize(7).fill(C.grey).text(`${m.name}: `, mx, y + 2, { continued: true });
          doc.fill(C.dark).text(m.val, { continued: false });
          mx += 80;
        }
        y += 24;
      }
    }

    // ── Footer ──
    y = ensureSpace(doc, y, 40);
    y += 16;
    doc.rect(40, y, W, 0.5).fill(C.lightGrey);
    y += 10;
    doc.fontSize(7).fill(C.grey).text(`Generated by WeFixTrades  •  ${data.reportUrl}`, 40, y, { width: W, align: "center" });

    doc.end();
  });
}

/** Add a new page if remaining space is less than `needed` pixels. */
function ensureSpace(doc: PDFKit.PDFDocument, y: number, needed: number): number {
  if (y + needed > 780) { // A4 height 842 minus bottom margin
    doc.addPage();
    return 50;
  }
  return y;
}
