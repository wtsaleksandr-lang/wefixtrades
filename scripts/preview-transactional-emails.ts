/**
 * Render preview HTML for every email migrated to transactionalShell.ts.
 *
 * Builds each template with realistic fixture data, writes the HTML to
 * `data/email-previews/<slug>.html`, then dumps a structural summary
 * (subject, doctype, viewport meta, header/footer presence, CTA URL,
 * approximate byte size) so the PR reviewer can scan for surprises
 * without opening every file.
 *
 * Sends zero emails. Uses zero env vars beyond what tsx already needs.
 *
 * Run: npx tsx scripts/preview-transactional-emails.ts
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, "../data/email-previews");

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

interface Preview {
  slug: string;
  source: string;
  subject: string;
  html: string;
}

const previews: Preview[] = [];

/* ─── 1. accountWelcomeEmail.ts ─── */
import("../server/lib/transactionalShell").then(async ({ buildTransactionalEmail }) => {
  // Re-implement what the migrated buildHtml() in accountWelcomeEmail.ts produces
  const setPasswordUrl = "https://wefixtrades.com/reset-password?token=ABCDEFG&setup=1";
  const supportEmail = "support@wefixtrades.com";
  const html = buildTransactionalEmail({
    recipientEmail: "owner@acmeplumbing.test",
    subjectForTitle: "Welcome to WeFixTrades — set your portal password",
    eyebrow: "Your portal is ready",
    headline: "Welcome aboard, Sam",
    intro: `We've set up your account for <strong style="color:#F0F0F0;">Acme Plumbing</strong>. Set a password below, then you'll have one dashboard for every service, invoice, and piece of support.`,
    cta: { label: "Set your password", url: setPasswordUrl },
    ctaFinePrint: `The link works for one hour. If it expires, just use "Forgot password" on the login page.`,
    bodyHtml: `
      <div style="border-top:1px solid rgba(255,255,255,0.06);margin:28px 0 22px;line-height:1px;font-size:0;">&nbsp;</div>
      <p style="font-size:12px;font-weight:600;color:#8B919A;text-transform:uppercase;letter-spacing:0.06em;margin:0 0 14px;">What's waiting for you</p>
      <table style="width:100%;border-collapse:collapse;">
        <tr><td style="padding:6px 12px 6px 0;vertical-align:top;width:22px;"><span style="display:inline-block;width:20px;height:20px;background:rgba(102,232,250,0.12);color:#66E8FA;font-size:11px;font-weight:700;border-radius:5px;text-align:center;line-height:20px;">1</span></td><td style="padding:6px 0;font-size:13px;color:#CDD1D6;line-height:1.5;">Setup forms for every service you've purchased</td></tr>
        <tr><td style="padding:6px 12px 6px 0;vertical-align:top;width:22px;"><span style="display:inline-block;width:20px;height:20px;background:rgba(102,232,250,0.12);color:#66E8FA;font-size:11px;font-weight:700;border-radius:5px;text-align:center;line-height:20px;">2</span></td><td style="padding:6px 0;font-size:13px;color:#CDD1D6;line-height:1.5;">Live task progress so you can see exactly what we're doing</td></tr>
        <tr><td style="padding:6px 12px 6px 0;vertical-align:top;width:22px;"><span style="display:inline-block;width:20px;height:20px;background:rgba(102,232,250,0.12);color:#66E8FA;font-size:11px;font-weight:700;border-radius:5px;text-align:center;line-height:20px;">3</span></td><td style="padding:6px 0;font-size:13px;color:#CDD1D6;line-height:1.5;">Invoices, reports, and support — all in one place</td></tr>
      </table>`,
    pasteLinkFallback: { url: setPasswordUrl },
    supportNote: `Need anything? Just reply to this email or reach us at <a href="mailto:${supportEmail}" style="color:#66E8FA;text-decoration:none;">${supportEmail}</a>.`,
  });
  previews.push({
    slug: "01-account-welcome",
    source: "server/lib/accountWelcomeEmail.ts",
    subject: "Welcome to WeFixTrades — set your portal password",
    html,
  });

  /* ─── 2. welcomeEmail.ts (service-activation, QuoteQuick example) ─── */
  const welcomeHtml = buildTransactionalEmail({
    recipientEmail: "owner@acmeplumbing.test",
    subjectForTitle: "QuoteQuick Pro is live — welcome aboard",
    eyebrow: "You're live · QuoteQuick Pro",
    headline: "Your instant quote calculator is live",
    intro: `Hi Sam, customers visiting your website can now get real-time quotes and submit qualified leads straight to your inbox.`,
    bodyHtml: `
      <div style="background:rgba(102,232,250,0.06);border-left:2px solid #66E8FA;border-radius:4px;padding:12px 14px;margin:0 0 22px;">
        <p style="font-size:13px;color:#CDD1D6;line-height:1.55;margin:0;">
          <strong style="color:#66E8FA;font-weight:600;">Next:</strong> Grab the embed code from your portal and paste it into your site's footer — takes 30 seconds.
        </p>
      </div>
      <table style="width:100%;border-collapse:separate;border-spacing:0;">
        <tr><td style="padding:0 0 10px;"><a href="https://wefixtrades.com/portal" style="display:block;background:#0F141A;border:1px solid rgba(255,255,255,0.06);border-radius:10px;padding:13px 16px;text-decoration:none;font-family:'Inter',system-ui,Arial,sans-serif;"><table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%"><tr><td style="font-size:14px;font-weight:600;color:#F0F0F0;">Your dashboard</td><td align="right" style="font-size:14px;font-weight:700;color:#66E8FA;white-space:nowrap;">→</td></tr></table></a></td></tr>
        <tr><td style="padding:0 0 10px;"><a href="https://wefixtrades.com/portal/services" style="display:block;background:#0F141A;border:1px solid rgba(255,255,255,0.06);border-radius:10px;padding:13px 16px;text-decoration:none;font-family:'Inter',system-ui,Arial,sans-serif;"><table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%"><tr><td style="font-size:14px;font-weight:600;color:#F0F0F0;">Calculator &amp; embed code</td><td align="right" style="font-size:14px;font-weight:700;color:#66E8FA;white-space:nowrap;">→</td></tr></table></a></td></tr>
      </table>`,
    showDividerBeforeSupport: true,
    supportNote: `<strong style="color:#CDD1D6;font-weight:600;">Need anything?</strong> Reply to this email or reach us at <a href="mailto:support@wefixtrades.com" style="color:#66E8FA;text-decoration:none;">support@wefixtrades.com</a>. We monitor every inbox and reply fast.`,
  });
  previews.push({
    slug: "02-welcome-service-activation",
    source: "server/lib/welcomeEmail.ts",
    subject: "QuoteQuick Pro is live — welcome aboard",
    html: welcomeHtml,
  });

  /* ─── 3. onboardingEmail.ts ─── */
  const onboardingUrl = "https://wefixtrades.com/onboarding/eyJhbGc";
  const onboardingHtml = buildTransactionalEmail({
    recipientEmail: "owner@acmeplumbing.test",
    subjectForTitle: "Your system is ready — let's finish setup",
    headline: "Your system is ready",
    intro: "Takes 2–3 minutes. We'll handle the rest.",
    cta: { label: "Complete Setup", url: onboardingUrl, style: "block" },
    bodyHtml: `
      <div style="border-top:1px solid rgba(255,255,255,0.06);margin:28px 0;line-height:1px;font-size:0;">&nbsp;</div>
      <p style="font-size:12px;font-weight:600;color:#8B919A;text-transform:uppercase;letter-spacing:0.06em;margin:0 0 16px;">What happens next</p>
      <table style="width:100%;border-collapse:collapse;">
        <tr><td style="padding:8px 12px 8px 0;vertical-align:top;width:24px;"><span style="display:inline-block;width:22px;height:22px;background:rgba(102,232,250,0.12);color:#66E8FA;font-size:11px;font-weight:700;border-radius:6px;text-align:center;line-height:22px;">1</span></td><td style="padding:8px 0;font-size:13px;color:#CDD1D6;line-height:1.5;">You answer a few quick questions</td></tr>
        <tr><td style="padding:8px 12px 8px 0;vertical-align:top;width:24px;"><span style="display:inline-block;width:22px;height:22px;background:rgba(102,232,250,0.12);color:#66E8FA;font-size:11px;font-weight:700;border-radius:6px;text-align:center;line-height:22px;">2</span></td><td style="padding:8px 0;font-size:13px;color:#CDD1D6;line-height:1.5;">We configure your system automatically</td></tr>
        <tr><td style="padding:8px 12px 8px 0;vertical-align:top;width:24px;"><span style="display:inline-block;width:22px;height:22px;background:rgba(102,232,250,0.12);color:#66E8FA;font-size:11px;font-weight:700;border-radius:6px;text-align:center;line-height:22px;">3</span></td><td style="padding:8px 0;font-size:13px;color:#CDD1D6;line-height:1.5;">You go live and start capturing jobs</td></tr>
      </table>`,
    pasteLinkFallback: { label: "If the button doesn’t work, copy this link:", url: onboardingUrl },
    supportNote: "No technical work required. Everything is handled for you.",
    showDividerBeforeSupport: true,
  });
  previews.push({
    slug: "03-onboarding",
    source: "server/lib/onboardingEmail.ts",
    subject: "Your system is ready — let's finish setup",
    html: onboardingHtml,
  });

  /* ─── 4. paymentReceiptEmail.ts ─── */
  const items = [
    { service_name: "QuoteQuick Pro", amount_cents: 4900, billing_period: "monthly" },
    { service_name: "MapGuard Standard", amount_cents: 9900, billing_period: "monthly" },
  ];
  const totalCents = items.reduce((s, it) => s + it.amount_cents, 0);
  const formatUsd = (c: number) => `$${(c / 100).toFixed(2)}`;
  const rows = items.map(it => `
    <tr>
      <td style="padding:12px 14px;border-bottom:1px solid rgba(255,255,255,0.06);font-size:14px;color:#F0F0F0;">
        ${it.service_name}
        <div style="font-size:11px;color:#8B919A;margin-top:2px;">Billed ${it.billing_period}</div>
      </td>
      <td style="padding:12px 14px;border-bottom:1px solid rgba(255,255,255,0.06);font-size:14px;color:#F0F0F0;text-align:right;font-weight:600;">${formatUsd(it.amount_cents)}</td>
    </tr>`).join("");

  const receiptHtml = buildTransactionalEmail({
    recipientEmail: "owner@acmeplumbing.test",
    subjectForTitle: `Receipt · ${formatUsd(totalCents)} paid to WeFixTrades`,
    eyebrow: "Payment received",
    headline: "Thanks, Sam",
    intro: "Your payment to WeFixTrades has been received. Full details below — keep this for your records.",
    bodyHtml: `
      <table style="width:100%;border-collapse:collapse;background:#0F141A;border:1px solid rgba(255,255,255,0.06);border-radius:10px;margin:0 0 20px;">
        ${rows}
        <tr>
          <td style="padding:14px;font-size:12px;font-weight:700;color:#8B919A;text-transform:uppercase;letter-spacing:0.06em;">Total paid</td>
          <td style="padding:14px;font-size:18px;font-weight:800;color:#66E8FA;text-align:right;">${formatUsd(totalCents)}</td>
        </tr>
      </table>
      <table style="width:100%;font-size:12px;color:#8B919A;margin:0 0 8px;">
        <tr><td style="padding:4px 0;">Business</td><td style="padding:4px 0;text-align:right;color:#CDD1D6;">Acme Plumbing</td></tr>
        <tr><td style="padding:4px 0;">Date</td><td style="padding:4px 0;text-align:right;color:#CDD1D6;">April 28, 2026</td></tr>
        <tr><td style="padding:4px 0;">Reference</td><td style="padding:4px 0;text-align:right;color:#CDD1D6;font-family:'DM Mono',monospace;">CS_TEST_123XYZ</td></tr>
      </table>`,
    cta: { label: "View in your portal", url: "https://wefixtrades.com/portal/billing" },
    supportNote: `Questions about this charge? Reply to this email or reach us at <a href="mailto:support@wefixtrades.com" style="color:#66E8FA;text-decoration:none;">support@wefixtrades.com</a>.`,
  });
  previews.push({
    slug: "04-payment-receipt",
    source: "server/lib/paymentReceiptEmail.ts",
    subject: `Receipt · ${formatUsd(totalCents)} paid to WeFixTrades`,
    html: receiptHtml,
  });

  /* ─── 5. contactEmails.ts (customer ack) ─── */
  const contactHtml = buildTransactionalEmail({
    recipientEmail: "prospect@example.test",
    subjectForTitle: "We got your message — WeFixTrades",
    headline: "Got it, Jamie — we'll be in touch",
    intro: "Your message is with our team. We reply within one business day, usually much sooner.",
    bodyHtml: `
      <div style="background:#0F141A;border:1px solid rgba(255,255,255,0.06);border-radius:10px;padding:16px;">
        <p style="font-size:11px;font-weight:600;color:#8B919A;text-transform:uppercase;letter-spacing:0.08em;margin:0 0 6px;">Your message · Pricing question</p>
        <p style="font-size:13px;color:#CDD1D6;line-height:1.6;margin:0;white-space:pre-wrap;">Hi — interested in MapGuard for our roofing business in Ottawa. What's the typical setup timeline?</p>
      </div>`,
    supportNote: "If you need us sooner, just reply to this email — it lands in the same inbox our team is watching.",
    showDividerBeforeSupport: false,
  });
  previews.push({
    slug: "05-contact-ack",
    source: "server/lib/contactEmails.ts",
    subject: "We got your message — WeFixTrades",
    html: contactHtml,
  });

  /* ─── 6. contentReviewEmail.ts (customer revision-ready, light theme) ─── */
  const revisionHtml = buildTransactionalEmail({
    recipientEmail: "owner@acmeplumbing.test",
    theme: "light",
    maxWidth: 600,
    subjectForTitle: "Your Revised Article Is Ready",
    headerTagline: "Article ready for your review",
    headline: "Hi Sam,",
    intro: "Your team has revised the article you asked us to update. It's ready for your review.",
    bodyHtml: `
      <div style="font-size:12px;color:#6B7280;text-transform:uppercase;letter-spacing:0.05em;margin:24px 0 4px;">Article</div>
      <div style="font-size:16px;color:#111827;font-weight:500;line-height:1.4;">5 Signs Your Furnace Needs Maintenance Before Winter</div>`,
    cta: { label: "Review revised article", url: "https://wefixtrades.com/portal/contentflow/articles" },
  });
  previews.push({
    slug: "06-content-revision-ready",
    source: "server/lib/contentReviewEmail.ts",
    subject: "Your Revised Article Is Ready",
    html: revisionHtml,
  });

  /* ─── Write previews + summary ─── */
  console.log("\n══════════════════════════════════════════════════════════════════");
  console.log("  TRANSACTIONAL EMAIL PREVIEWS — Sprint 2A + 2B");
  console.log("══════════════════════════════════════════════════════════════════\n");

  for (const p of previews) {
    const filePath = path.join(OUT_DIR, `${p.slug}.html`);
    fs.writeFileSync(filePath, p.html, "utf-8");

    const summary = analyzeHtml(p.html);
    console.log(`📧 ${p.slug}`);
    console.log(`   source     : ${p.source}`);
    console.log(`   subject    : ${p.subject}`);
    console.log(`   doctype    : ${summary.hasDoctype ? "✓" : "✗ MISSING"}`);
    console.log(`   viewport   : ${summary.hasViewport ? "✓" : "✗ MISSING"}`);
    console.log(`   header     : ${summary.hasHeader ? "✓" : "✗ MISSING"}`);
    console.log(`   footer     : ${summary.hasFooter ? "✓" : "✗ MISSING"}`);
    console.log(`   chat bubble: ${summary.hasChatBubble ? "✓" : "—"}`);
    console.log(`   theme      : ${summary.theme}`);
    console.log(`   ctas       : ${summary.ctaCount} (urls: ${summary.ctaUrls.slice(0, 80)}${summary.ctaUrls.length > 80 ? "..." : ""})`);
    console.log(`   http://    : ${summary.httpUnsafeLinks > 0 ? `✗ ${summary.httpUnsafeLinks} unsafe` : "✓ none"}`);
    console.log(`   bytes      : ${summary.bytes.toLocaleString()}`);
    console.log(`   file       : data/email-previews/${p.slug}.html`);
    console.log("");
  }

  console.log(`Wrote ${previews.length} preview(s) to ${path.relative(process.cwd(), OUT_DIR)}/`);
  console.log("");

  const anyMissing = previews.some(p => {
    const a = analyzeHtml(p.html);
    return !a.hasDoctype || !a.hasViewport || !a.hasHeader || !a.hasFooter || a.httpUnsafeLinks > 0;
  });
  process.exit(anyMissing ? 1 : 0);
}).catch(err => {
  console.error("preview script failed:", err);
  process.exit(1);
});

function analyzeHtml(html: string): {
  bytes: number;
  hasDoctype: boolean;
  hasViewport: boolean;
  hasHeader: boolean;
  hasFooter: boolean;
  hasChatBubble: boolean;
  theme: "dark" | "light" | "unknown";
  ctaCount: number;
  ctaUrls: string;
  httpUnsafeLinks: number;
} {
  const ctaMatches = [...html.matchAll(/<a\s+href="([^"]+)"[^>]*style="[^"]*background:[^"]*"[^>]*>/gi)];
  const ctaUrls = ctaMatches.map(m => m[1]).filter(u => !u.startsWith("mailto:") && !u.startsWith("tel:"));
  const httpLinks = [...html.matchAll(/href="(http:\/\/[^"]+)"/gi)].length;
  return {
    bytes: Buffer.byteLength(html, "utf-8"),
    hasDoctype: /^<!DOCTYPE/i.test(html.trim()),
    hasViewport: /name="viewport"/i.test(html),
    hasHeader: /WeFixTrades<\/.+font-weight:\s*7|We<span[^>]*>Fix<\/span>Trades/i.test(html),
    hasFooter: /Helping trade businesses win more jobs/i.test(html),
    hasChatBubble: /Have a question\?/i.test(html),
    theme: /background:\s*#0B0F14/i.test(html) ? "dark" : /background:\s*#F3F4F6/i.test(html) ? "light" : "unknown",
    ctaCount: ctaUrls.length,
    ctaUrls: ctaUrls.join(", "),
    httpUnsafeLinks: httpLinks,
  };
}
