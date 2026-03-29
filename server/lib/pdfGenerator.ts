import { db } from "../db";
import { auditReports } from "@shared/schema";
import { eq } from "drizzle-orm";
import { buildPdfHtml, type PdfReportData } from "./pdfTemplate";
import fs from "fs";
import path from "path";

const PDF_TIMEOUT_MS = 30_000;

/**
 * Finds the Chromium executable from Playwright's cache.
 * Checks common cache locations used by Playwright browser installs.
 */
function findChromiumExecutable(): string | null {
  const cacheBase = process.env.PLAYWRIGHT_BROWSERS_PATH
    || path.join(process.env.HOME || "/root", ".cache", "ms-playwright");

  if (!fs.existsSync(cacheBase)) return null;

  // Look for chromium-XXXX directories, pick the latest
  const entries = fs.readdirSync(cacheBase)
    .filter(d => d.startsWith("chromium-") && !d.includes("headless") && !d.includes("tip"))
    .sort()
    .reverse();

  for (const dir of entries) {
    // Linux path
    const linuxPath = path.join(cacheBase, dir, "chrome-linux", "chrome");
    if (fs.existsSync(linuxPath)) return linuxPath;
    // Mac path
    const macPath = path.join(cacheBase, dir, "chrome-mac", "Chromium.app", "Contents", "MacOS", "Chromium");
    if (fs.existsSync(macPath)) return macPath;
  }

  return null;
}

const chromiumPath = findChromiumExecutable();
if (chromiumPath) {
  console.log(`[pdf-generator] Chromium found at: ${chromiumPath}`);
} else {
  console.warn("[pdf-generator] WARNING: Chromium not found. PDF generation will fail. Run: npx playwright install chromium");
}

/**
 * Generates a PDF buffer for an audit report.
 */
export async function generateReportPdf(
  reportId: string,
  origin: string,
): Promise<{ ok: true; buffer: Buffer; filename: string } | { ok: false; error: string }> {
  if (!chromiumPath) {
    return { ok: false, error: "Chromium browser not available for PDF generation" };
  }

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
    const { chromium } = await import("playwright-core");
    browser = await chromium.launch({
      executablePath: chromiumPath,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
      ],
    });

    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.setContent(html, { waitUntil: "load", timeout: PDF_TIMEOUT_MS });

    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "0mm", bottom: "0mm", left: "0mm", right: "0mm" },
    });

    await context.close();

    // 5. Validate the generated PDF
    const buf = Buffer.from(pdfBuffer);
    if (buf.length < 100) {
      console.error(`[pdf-generator] PDF too small (${buf.length} bytes) for report ${reportId}`);
      return { ok: false, error: "PDF generation produced empty output" };
    }
    const signature = buf.slice(0, 5).toString("ascii");
    if (signature !== "%PDF-") {
      console.error(`[pdf-generator] Invalid PDF signature "${signature}" for report ${reportId}`);
      return { ok: false, error: "PDF generation produced invalid output" };
    }

    const safeName = row.business_name
      .replace(/[^a-zA-Z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .slice(0, 60);
    const filename = `WeFixTrades-Audit-${safeName}.pdf`;

    console.log(`[pdf-generator] Generated ${buf.length} byte PDF for "${row.business_name}"`);
    return { ok: true, buffer: buf, filename };
  } catch (err: any) {
    const msg = err?.message || "Unknown error";
    console.error(`[pdf-generator] Failed for report ${reportId}: ${msg}`);
    return { ok: false, error: "PDF generation failed" };
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}
