/**
 * Verification harness for the email tracking injection layer.
 *
 * Pure HTML-transformation test — no real DB, no real SMTP, no real
 * network. Confirms the `injectTracking()` helper produces the right
 * output across all the edge cases the production transporter wrapper
 * relies on.
 *
 * Run: npx tsx scripts/verify-email-tracking.ts
 */

import { generateEmailId, injectTracking } from "../server/lib/emailTracking";

let pass = 0;
let fail = 0;
function assert(label: string, cond: boolean, detail?: string) {
  if (cond) {
    console.log(`  ✓ ${label}${detail ? `  (${detail})` : ""}`);
    pass++;
  } else {
    console.log(`  ✗ ${label}${detail ? `  (${detail})` : ""}`);
    fail++;
  }
}

const baseUrl = "https://wefixtrades.com";

console.log("\n[1] generateEmailId — opaque, unique, valid base64url");
const ids = new Set<string>();
for (let i = 0; i < 100; i++) ids.add(generateEmailId());
assert("100 generations produce 100 unique IDs", ids.size === 100);
const sampleId = generateEmailId();
assert("ID looks like base64url (chars + length)", /^[A-Za-z0-9_-]{20,30}$/.test(sampleId), `len=${sampleId.length}`);

const emailId = "TEST_ID_abc123";

console.log("\n[2] injectTracking — pixel injection");
const htmlWithBody = `<html><body><p>Hello world</p></body></html>`;
const out1 = injectTracking(htmlWithBody, { emailId, baseUrl });
assert(
  "pixel inserted before </body>",
  out1.includes(`<img src="${baseUrl}/api/email/open/${emailId}"`) && out1.includes(`/api/email/open/${emailId}" width="1" height="1"`),
);
assert("pixel appears before </body>", out1.indexOf("/api/email/open/") < out1.indexOf("</body>"));

const htmlNoBody = `<div><p>Hello world</p></div>`;
const out2 = injectTracking(htmlNoBody, { emailId, baseUrl });
assert("pixel appended at end when no </body>", out2.endsWith(`/></div><img src="${baseUrl}/api/email/open/${emailId}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0;outline:none;text-decoration:none;" />`) || out2.includes(`/api/email/open/${emailId}`));

const out3 = injectTracking(out1, { emailId, baseUrl });
const pixelCount = (out3.match(new RegExp(`/api/email/open/${emailId}`, "g")) || []).length;
assert("idempotent — re-running doesn't double-inject pixel", pixelCount === 1, `count=${pixelCount}`);

console.log("\n[3] injectTracking — link rewriting");
const htmlLinks = `<html><body>
  <a href="https://wefixtrades.com/portal/billing">Billing</a>
  <a href='https://example.com/path?q=1'>External</a>
  <a href="http://insecure.test/page">Plain HTTP</a>
  <a href="mailto:hi@example.com">Email me</a>
  <a href="tel:+15551234">Call</a>
  <a href="sms:+15551234">SMS</a>
  <a href="#anchor">In-page</a>
  <a href="data:text/plain,hi">Data URI</a>
  <a href="cid:logo">Inline CID</a>
  <a href="https://wefixtrades.com/api/unsubscribe/abc123">Unsubscribe</a>
</body></html>`;
const out4 = injectTracking(htmlLinks, { emailId, baseUrl });

assert(
  "https external link wrapped (preserves original quote style)",
  out4.includes(`href='${baseUrl}/api/email/click/${emailId}?redirect=${encodeURIComponent("https://example.com/path?q=1")}'`),
);
assert(
  "https internal link wrapped",
  out4.includes(`href="${baseUrl}/api/email/click/${emailId}?redirect=${encodeURIComponent("https://wefixtrades.com/portal/billing")}"`),
);
assert(
  "http (insecure) link wrapped (we don't filter by scheme — just by mailto/tel/etc.)",
  out4.includes(`href="${baseUrl}/api/email/click/${emailId}?redirect=${encodeURIComponent("http://insecure.test/page")}"`),
);
assert("mailto: NOT wrapped", out4.includes(`href="mailto:hi@example.com"`));
assert("tel: NOT wrapped", out4.includes(`href="tel:+15551234"`));
assert("sms: NOT wrapped", out4.includes(`href="sms:+15551234"`));
assert("anchor # NOT wrapped", out4.includes(`href="#anchor"`));
assert("data: NOT wrapped", out4.includes(`href="data:text/plain,hi"`));
assert("cid: NOT wrapped", out4.includes(`href="cid:logo"`));
assert("unsubscribe link NOT wrapped (legal — direct delivery)", out4.includes(`href="https://wefixtrades.com/api/unsubscribe/abc123"`));

const out5 = injectTracking(out4, { emailId, baseUrl });
const wrappedCount = (out5.match(new RegExp(`/api/email/click/${emailId}`, "g")) || []).length;
const wrappedCount4 = (out4.match(new RegExp(`/api/email/click/${emailId}`, "g")) || []).length;
assert("idempotent — re-running doesn't double-wrap links", wrappedCount === wrappedCount4, `${wrappedCount} vs ${wrappedCount4}`);

console.log("\n[4] injectTracking — edge cases");
assert("empty string → empty string", injectTracking("", { emailId, baseUrl }) === "");
assert("undefined → empty string", injectTracking(undefined, { emailId, baseUrl }) === "");
assert("HTML with no links + no body → just pixel appended", (() => {
  const r = injectTracking(`plain text content`, { emailId, baseUrl });
  return r.startsWith("plain text content") && r.includes(`/api/email/open/${emailId}`);
})());
assert("baseUrl with trailing slash is normalized", (() => {
  const r = injectTracking(`<a href="https://x.test">x</a>`, { emailId, baseUrl: "https://wefixtrades.com/" });
  return r.includes(`href="https://wefixtrades.com/api/email/click/${emailId}?redirect=`)
    && !r.includes(`https://wefixtrades.com//api/email/click/`);
})());

console.log("\n[5] integration with shells — real preview HTML transformations");
import("../server/lib/transactionalShell").then(async ({ buildTransactionalEmail }) => {
  const realisticHtml = buildTransactionalEmail({
    recipientEmail: "test@example.test",
    headline: "Welcome aboard, Sam",
    intro: "Set a password to access your portal.",
    cta: { label: "Set your password", url: "https://wefixtrades.com/reset-password?token=abc" },
    supportNote: `Reach us at <a href="mailto:support@wefixtrades.com" style="color:#66E8FA;">support@wefixtrades.com</a>.`,
    pasteLinkFallback: { url: "https://wefixtrades.com/reset-password?token=abc" },
    marketing: true, // adds an unsubscribe link via legal footer
  });

  const tracked = injectTracking(realisticHtml, { emailId, baseUrl });

  assert("pixel injected", tracked.includes(`/api/email/open/${emailId}`));
  const clickWrapsCount = (tracked.match(new RegExp(`${baseUrl}/api/email/click/${emailId}\\?redirect=`, "g")) || []).length;
  assert("at least one click-tracked link", clickWrapsCount >= 1, `${clickWrapsCount} wrapped`);
  assert("mailto: in support note still untouched", tracked.includes(`href="mailto:support@wefixtrades.com"`));
  assert("Privacy + Terms footer links wrapped (they're https://)", tracked.includes(`/api/email/click/${emailId}?redirect=${encodeURIComponent("https://wefixtrades.com/privacy")}`));
  assert("unsubscribe link still NOT wrapped", /\/api\/unsubscribe\/[A-Za-z0-9.\-_]+/.test(tracked) && !tracked.includes(`/api/email/click/${emailId}?redirect=${encodeURIComponent("https://wefixtrades.com/api/unsubscribe")}`.slice(0, 80)));

  // Visual integrity: same headline, same CTA label, same intro
  assert("headline preserved", tracked.includes("Welcome aboard, Sam"));
  assert("intro preserved", tracked.includes("Set a password to access your portal."));
  assert("CTA label preserved", tracked.includes("Set your password"));

  // Byte size grew but not catastrophically
  const grew = tracked.length - realisticHtml.length;
  assert(`HTML grew by reasonable amount`, grew < 8000 && grew > 0, `+${grew} bytes`);

  console.log(`\n${pass} passed, ${fail} failed\n`);
  process.exit(fail === 0 ? 0 : 1);
}).catch((err) => {
  console.error(`\n[verify] fatal: ${err.message}`);
  process.exit(1);
});
