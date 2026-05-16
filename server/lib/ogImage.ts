import { db } from "../db";
import { auditReports } from "@shared/schema";
import { eq } from "drizzle-orm";
import type { Request, Response } from "express";
import { createLogger } from "./logger";

const log = createLogger("OGImage");

/**
 * GET /api/audit/report/:id/og-image
 *
 * Returns a 1200×630 SVG image for social sharing previews.
 * SVG is universally supported by social platforms (Facebook, Twitter, LinkedIn, WhatsApp)
 * and requires zero external dependencies.
 */
export async function handleOgImage(req: Request, res: Response) {
  try {
    const id = String(req.params.id || "").trim();
    if (!id) return res.status(400).send("Missing report ID");

    const rows = await db
      .select({
        business_name: auditReports.business_name,
        audit_data: auditReports.audit_data,
        ai_narrative: auditReports.ai_narrative,
      })
      .from(auditReports)
      .where(eq(auditReports.id, id))
      .limit(1);

    if (rows.length === 0) return res.status(404).send("Report not found");

    const row = rows[0];
    const audit: any = row.audit_data || {};
    const narrative: any = row.ai_narrative || {};
    const businessName = row.business_name || "Business";
    const score = audit.scores?.total ?? null;
    const grade = audit.scores?.grade || narrative.grade || "";
    const trade = audit.trade || "";
    const city = audit.city || "";

    const svg = renderOgSvg({ businessName, score, grade, trade, city });

    res
      .status(200)
      .set({
        "Content-Type": "image/svg+xml",
        "Cache-Control": "public, max-age=86400, s-maxage=86400",
      })
      .send(svg);
  } catch (err) {
    log.error("[og-image] Error:", { error: String(err) });
    res.status(500).send("Failed to generate image");
  }
}

function renderOgSvg(opts: {
  businessName: string;
  score: number | null;
  grade: string;
  trade: string;
  city: string;
}): string {
  const { businessName, score, grade, trade, city } = opts;

  const gradeColors: Record<string, { main: string; bg: string }> = {
    A: { main: "#22C55E", bg: "#052E16" },
    B: { main: "#0d3cfc", bg: "#042F2E" },
    C: { main: "#F59E0B", bg: "#3D2800" },
    D: { main: "#EF4444", bg: "#3B0808" },
  };
  const colors = gradeColors[grade] || { main: "#6B7280", bg: "#1F2937" };

  const scoreText = score != null ? `${score}` : "—";
  const subtitle = [trade, city].filter(Boolean).join(" · ");

  // Truncate business name for display
  const name = businessName.length > 40
    ? businessName.slice(0, 37) + "..."
    : businessName;

  // The score ring: circumference = 2 * PI * 90 ≈ 565.5
  const circumference = 565.5;
  const pct = score != null ? Math.min(score, 100) / 100 : 0;
  const dashOffset = circumference * (1 - pct);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1200" y2="630" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#0F0F1E"/>
      <stop offset="100%" stop-color="#1A1A2E"/>
    </linearGradient>
    <linearGradient id="ring" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${esc(colors.main)}"/>
      <stop offset="100%" stop-color="${esc(colors.main)}" stop-opacity="0.6"/>
    </linearGradient>
  </defs>

  <!-- Background -->
  <rect width="1200" height="630" fill="url(#bg)"/>

  <!-- Subtle grid pattern -->
  <g opacity="0.03">
    ${Array.from({ length: 20 }, (_, i) => `<line x1="${i * 60}" y1="0" x2="${i * 60}" y2="630" stroke="white" stroke-width="1"/>`).join("\n    ")}
    ${Array.from({ length: 11 }, (_, i) => `<line x1="0" y1="${i * 60}" x2="1200" y2="${i * 60}" stroke="white" stroke-width="1"/>`).join("\n    ")}
  </g>

  <!-- Score Circle -->
  <g transform="translate(260, 315)">
    <!-- Track -->
    <circle cx="0" cy="0" r="90" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="10"/>
    <!-- Progress arc -->
    <circle cx="0" cy="0" r="90" fill="none" stroke="url(#ring)" stroke-width="10"
      stroke-linecap="round" stroke-dasharray="${circumference}" stroke-dashoffset="${dashOffset}"
      transform="rotate(-90)"/>
    <!-- Score number -->
    <text x="0" y="8" text-anchor="middle" fill="white" font-family="system-ui,sans-serif"
      font-size="56" font-weight="800">${esc(scoreText)}</text>
    <text x="0" y="36" text-anchor="middle" fill="rgba(255,255,255,0.5)" font-family="system-ui,sans-serif"
      font-size="16" font-weight="500">out of 100</text>
  </g>

  <!-- Grade badge -->
  <g transform="translate(260, 430)">
    <rect x="-32" y="-16" width="64" height="32" rx="8" fill="${esc(colors.main)}" opacity="0.15"/>
    <text x="0" y="6" text-anchor="middle" fill="${esc(colors.main)}" font-family="system-ui,sans-serif"
      font-size="18" font-weight="700">Grade ${esc(grade)}</text>
  </g>

  <!-- Brand logo (top-left). Bare icon (no badge), white open checkbox so it
       reads on the dark gradient bg; check stays brand blue. -->
  <g transform="translate(60, 60)">
    <g transform="scale(2)">
      <path d="M12 7 H4 V20 H17 V12.5" stroke="#F9F9F9" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
      <path d="M8 13 11.5 16.5 21 5" stroke="#0d3cfc" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
    </g>
    <text x="64" y="34" fill="#F9F9F9" font-family="system-ui,sans-serif"
      font-size="28" font-weight="700" letter-spacing="-0.02em">We<tspan fill="#0d3cfc">Fix</tspan>Trades</text>
  </g>

  <!-- Right side text -->
  <g transform="translate(480, 220)">
    <!-- Brand label (kept for layout balance — small uppercase eyebrow) -->
    <text x="0" y="0" fill="${esc(colors.main)}" font-family="system-ui,sans-serif"
      font-size="14" font-weight="700" letter-spacing="2">WEFIXTRADES</text>

    <!-- Title -->
    <text x="0" y="40" fill="white" font-family="system-ui,sans-serif"
      font-size="18" font-weight="500" opacity="0.7">Website Audit Report</text>

    <!-- Business name -->
    <text x="0" y="90" fill="white" font-family="system-ui,sans-serif"
      font-size="36" font-weight="800">${esc(name)}</text>

    <!-- Subtitle -->
    ${subtitle ? `<text x="0" y="125" fill="rgba(255,255,255,0.5)" font-family="system-ui,sans-serif"
      font-size="16" font-weight="400">${esc(subtitle)}</text>` : ""}

    <!-- CTA -->
    <g transform="translate(0, 175)">
      <rect x="0" y="-14" width="200" height="40" rx="8" fill="${esc(colors.main)}"/>
      <text x="100" y="8" text-anchor="middle" fill="#0F0F1E" font-family="system-ui,sans-serif"
        font-size="14" font-weight="700">View Full Report</text>
    </g>
  </g>

  <!-- Bottom bar -->
  <rect x="0" y="610" width="1200" height="20" fill="${esc(colors.main)}" opacity="0.3"/>
</svg>`;
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
