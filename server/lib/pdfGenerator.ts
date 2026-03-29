import { db } from "../db";
import { auditReports } from "@shared/schema";
import { eq } from "drizzle-orm";
import { buildPdfHtml, type PdfReportData } from "./pdfTemplate";

/**
 * Generates a PDF buffer for an audit report.
 * Uses Playwright (already installed as devDep for e2e tests).
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

  // 2. Extract data for template
  const pdfData: PdfReportData = {
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

  // 3. Build HTML
  const html = buildPdfHtml(pdfData);

  // 4. Render PDF with Playwright
  let browser;
  try {
    const { chromium } = await import("playwright");
    browser = await chromium.launch({
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load" });
    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "0mm", bottom: "0mm", left: "0mm", right: "0mm" },
    });

    const safeName = row.business_name
      .replace(/[^a-zA-Z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .slice(0, 60);
    const filename = `WeFixTrades-Audit-${safeName}.pdf`;

    return { ok: true, buffer: Buffer.from(pdfBuffer), filename };
  } catch (err: any) {
    console.error("[pdf-generator] Playwright error:", err?.message);
    return { ok: false, error: "PDF generation failed" };
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}
