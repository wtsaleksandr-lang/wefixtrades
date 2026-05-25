/**
 * Dev-only smoke runner for the Full Audit Master pipeline. Hits the
 * 5 real section runners against a URL passed on the command line and
 * prints the validated MasterAuditReport JSON.
 *
 * Usage: tsx scripts/dev-full-audit-smoke.ts https://example.com
 * Requires PAGESPEED_API_KEY in env (or the network calls degrade to
 * "fail" envelopes — still useful for shape verification).
 */
import { runFullAuditMaster } from "../server/services/fullAuditMaster/pipeline";

const url = process.argv[2];
if (!url) {
  console.error("Usage: tsx scripts/dev-full-audit-smoke.ts <https://url>");
  process.exit(1);
}

runFullAuditMaster({
  orderId: "smoke-" + Date.now(),
  websiteUrl: url,
  businessName: new URL(url).hostname.replace(/^www\./, ""),
})
  .then((report) => {
    console.log(JSON.stringify(report, null, 2));
  })
  .catch((err) => {
    console.error("Pipeline threw:", err?.message || err);
    process.exit(1);
  });
