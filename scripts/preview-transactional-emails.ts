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
        <tr><td style="padding:6px 12px 6px 0;vertical-align:top;width:22px;"><span style="display:inline-block;width:20px;height:20px;background:rgba(13,60,252,0.12);color:#0d3cfc;font-size:11px;font-weight:700;border-radius:5px;text-align:center;line-height:20px;">1</span></td><td style="padding:6px 0;font-size:13px;color:#CDD1D6;line-height:1.5;">Setup forms for every service you've purchased</td></tr>
        <tr><td style="padding:6px 12px 6px 0;vertical-align:top;width:22px;"><span style="display:inline-block;width:20px;height:20px;background:rgba(13,60,252,0.12);color:#0d3cfc;font-size:11px;font-weight:700;border-radius:5px;text-align:center;line-height:20px;">2</span></td><td style="padding:6px 0;font-size:13px;color:#CDD1D6;line-height:1.5;">Live task progress so you can see exactly what we're doing</td></tr>
        <tr><td style="padding:6px 12px 6px 0;vertical-align:top;width:22px;"><span style="display:inline-block;width:20px;height:20px;background:rgba(13,60,252,0.12);color:#0d3cfc;font-size:11px;font-weight:700;border-radius:5px;text-align:center;line-height:20px;">3</span></td><td style="padding:6px 0;font-size:13px;color:#CDD1D6;line-height:1.5;">Invoices, reports, and support — all in one place</td></tr>
      </table>`,
    pasteLinkFallback: { url: setPasswordUrl },
    supportNote: `Need anything? Just reply to this email or reach us at <a href="mailto:${supportEmail}" style="color:#0d3cfc;text-decoration:none;">${supportEmail}</a>.`,
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
      <div style="background:rgba(13,60,252,0.06);border-left:2px solid #0d3cfc;border-radius:4px;padding:12px 14px;margin:0 0 22px;">
        <p style="font-size:13px;color:#CDD1D6;line-height:1.55;margin:0;">
          <strong style="color:#0d3cfc;font-weight:600;">Next:</strong> Grab the embed code from your portal and paste it into your site's footer — takes 30 seconds.
        </p>
      </div>
      <table style="width:100%;border-collapse:separate;border-spacing:0;">
        <tr><td style="padding:0 0 10px;"><a href="https://wefixtrades.com/portal" style="display:block;background:#0F141A;border:1px solid rgba(255,255,255,0.06);border-radius:10px;padding:13px 16px;text-decoration:none;font-family:'Inter',system-ui,Arial,sans-serif;"><table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%"><tr><td style="font-size:14px;font-weight:600;color:#F0F0F0;">Your dashboard</td><td align="right" style="font-size:14px;font-weight:700;color:#0d3cfc;white-space:nowrap;">→</td></tr></table></a></td></tr>
        <tr><td style="padding:0 0 10px;"><a href="https://wefixtrades.com/portal/services" style="display:block;background:#0F141A;border:1px solid rgba(255,255,255,0.06);border-radius:10px;padding:13px 16px;text-decoration:none;font-family:'Inter',system-ui,Arial,sans-serif;"><table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%"><tr><td style="font-size:14px;font-weight:600;color:#F0F0F0;">Calculator &amp; embed code</td><td align="right" style="font-size:14px;font-weight:700;color:#0d3cfc;white-space:nowrap;">→</td></tr></table></a></td></tr>
      </table>`,
    showDividerBeforeSupport: true,
    supportNote: `<strong style="color:#CDD1D6;font-weight:600;">Need anything?</strong> Reply to this email or reach us at <a href="mailto:support@wefixtrades.com" style="color:#0d3cfc;text-decoration:none;">support@wefixtrades.com</a>. We monitor every inbox and reply fast.`,
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
        <tr><td style="padding:8px 12px 8px 0;vertical-align:top;width:24px;"><span style="display:inline-block;width:22px;height:22px;background:rgba(13,60,252,0.12);color:#0d3cfc;font-size:11px;font-weight:700;border-radius:6px;text-align:center;line-height:22px;">1</span></td><td style="padding:8px 0;font-size:13px;color:#CDD1D6;line-height:1.5;">You answer a few quick questions</td></tr>
        <tr><td style="padding:8px 12px 8px 0;vertical-align:top;width:24px;"><span style="display:inline-block;width:22px;height:22px;background:rgba(13,60,252,0.12);color:#0d3cfc;font-size:11px;font-weight:700;border-radius:6px;text-align:center;line-height:22px;">2</span></td><td style="padding:8px 0;font-size:13px;color:#CDD1D6;line-height:1.5;">We configure your system automatically</td></tr>
        <tr><td style="padding:8px 12px 8px 0;vertical-align:top;width:24px;"><span style="display:inline-block;width:22px;height:22px;background:rgba(13,60,252,0.12);color:#0d3cfc;font-size:11px;font-weight:700;border-radius:6px;text-align:center;line-height:22px;">3</span></td><td style="padding:8px 0;font-size:13px;color:#CDD1D6;line-height:1.5;">You go live and start capturing jobs</td></tr>
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
          <td style="padding:14px;font-size:18px;font-weight:800;color:#0d3cfc;text-align:right;">${formatUsd(totalCents)}</td>
        </tr>
      </table>
      <table style="width:100%;font-size:12px;color:#8B919A;margin:0 0 8px;">
        <tr><td style="padding:4px 0;">Business</td><td style="padding:4px 0;text-align:right;color:#CDD1D6;">Acme Plumbing</td></tr>
        <tr><td style="padding:4px 0;">Date</td><td style="padding:4px 0;text-align:right;color:#CDD1D6;">April 28, 2026</td></tr>
        <tr><td style="padding:4px 0;">Reference</td><td style="padding:4px 0;text-align:right;color:#CDD1D6;font-family:'DM Mono',monospace;">CS_TEST_123XYZ</td></tr>
      </table>`,
    cta: { label: "View in your portal", url: "https://wefixtrades.com/portal/billing" },
    supportNote: `Questions about this charge? Reply to this email or reach us at <a href="mailto:support@wefixtrades.com" style="color:#0d3cfc;text-decoration:none;">support@wefixtrades.com</a>.`,
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

  /* ─── 6a. bookingEmails.ts (customer confirmation, dark theme) ─── */
  const bookingHtml = buildTransactionalEmail({
    recipientEmail: "customer@example.test",
    subjectForTitle: "Booking confirmed — Friday, May 9, 2026 at 3:00 PM",
    eyebrow: "Booking confirmed",
    headline: "Your appointment is set",
    intro: `Your appointment with <strong style="color:#F0F0F0;">Acme Plumbing</strong> has been confirmed.`,
    bodyHtml: `
      <table style="width:100%;border-collapse:collapse;background:#0F141A;border:1px solid rgba(255,255,255,0.06);border-radius:10px;padding:8px 14px;">
        <tr><td style="padding:6px 0;font-size:12px;color:#8B919A;text-transform:uppercase;letter-spacing:0.06em;width:120px;">Date</td><td style="padding:6px 0;font-size:14px;color:#F0F0F0;font-weight:600;text-align:right;">Friday, May 9, 2026</td></tr>
        <tr><td style="padding:6px 0;font-size:12px;color:#8B919A;text-transform:uppercase;letter-spacing:0.06em;width:120px;">Time</td><td style="padding:6px 0;font-size:14px;color:#F0F0F0;font-weight:600;text-align:right;">3:00 PM</td></tr>
        <tr><td style="padding:6px 0;font-size:12px;color:#8B919A;text-transform:uppercase;letter-spacing:0.06em;width:120px;">Estimated quote</td><td style="padding:6px 0;font-size:14px;color:#F0F0F0;font-weight:600;text-align:right;">$420</td></tr>
        <tr><td style="padding:6px 0;font-size:12px;color:#8B919A;text-transform:uppercase;letter-spacing:0.06em;width:120px;">Deposit paid</td><td style="padding:6px 0;font-size:14px;color:#0d3cfc;font-weight:600;text-align:right;">$80</td></tr>
      </table>`,
    supportNote: `If you need to reschedule or cancel, please contact <strong style="color:#CDD1D6;font-weight:600;">Acme Plumbing</strong> directly.`,
    showDividerBeforeSupport: true,
  });
  previews.push({
    slug: "07-booking-confirmation",
    source: "server/bookingEmails.ts",
    subject: "Booking confirmed — Friday, May 9, 2026 at 3:00 PM",
    html: bookingHtml,
  });

  /* ─── 6b. missedCallFollowup.ts buildImmediateResultsEmail ─── */
  const missedCallHtml = buildTransactionalEmail({
    recipientEmail: "lead@example.test",
    subjectForTitle: "Your Missed Call Report: $48,000/yr in lost plumbing revenue",
    headerTagline: "plumbing business estimate",
    eyebrow: "Missed-call revenue report",
    eyebrowColor: "#EF4444",
    headline: "Your missed-call revenue estimate",
    intro: `Based on 12 missed calls/week at a 25% close rate with an average job value of <strong style="color:#F0F0F0;">$1,200</strong>.`,
    bodyHtml: `
      <table cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 16px;">
        <tr>
          <td style="padding:16px 18px;background:rgba(239,68,68,0.10);border:1px solid rgba(239,68,68,0.20);border-radius:10px;text-align:center;">
            <p style="margin:0 0 4px;font-size:11px;color:#FCA5A5;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;">Estimated annual loss</p>
            <p style="margin:0;font-size:30px;font-weight:800;color:#F87171;">$48,000</p>
          </td>
        </tr>
      </table>
      <table cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 18px;">
        <tr>
          <td style="padding:12px 14px;background:#0F141A;border:1px solid rgba(255,255,255,0.06);border-radius:8px;width:48%;text-align:center;">
            <p style="margin:0;font-size:11px;color:#8B919A;text-transform:uppercase;letter-spacing:0.06em;">Per month</p>
            <p style="margin:4px 0 0;font-size:17px;font-weight:700;color:#F0F0F0;">$4,000</p>
          </td>
          <td style="width:10px;"></td>
          <td style="padding:12px 14px;background:#0F141A;border:1px solid rgba(255,255,255,0.06);border-radius:8px;width:48%;text-align:center;">
            <p style="margin:0;font-size:11px;color:#8B919A;text-transform:uppercase;letter-spacing:0.06em;">Per day</p>
            <p style="margin:4px 0 0;font-size:17px;font-weight:700;color:#F0F0F0;">$132</p>
          </td>
        </tr>
      </table>
      <div style="border-top:1px solid rgba(255,255,255,0.06);padding-top:18px;margin-top:4px;">
        <p style="font-size:14px;font-weight:700;color:#F0F0F0;margin:0 0 6px;">How to recover this revenue</p>
        <p style="font-size:13px;color:#CDD1D6;line-height:1.6;margin:0;">
          TradeLine answers your calls 24/7 with AI, sends instant SMS replies to missed calls, captures every lead, and follows up automatically. Most businesses see results within 2 weeks.
        </p>
      </div>`,
    cta: { label: "See TradeLine plans — from $97/mo", url: "https://wefixtrades.com/products/tradeline" },
  });
  previews.push({
    slug: "08-missed-call-results",
    source: "server/lib/missedCallFollowup.ts",
    subject: "Your Missed Call Report: $48,000/yr in lost plumbing revenue",
    html: missedCallHtml,
  });

  /* ─── 6c. demoQuoteFollowup.ts buildDemoQuoteEmail ─── */
  const demoQuoteHtml = buildTransactionalEmail({
    recipientEmail: "lead@example.test",
    subjectForTitle: "Your roofing quote from Maple Ridge Roofing — $8,200",
    headerTagline: "from Maple Ridge Roofing (demo)",
    eyebrow: "Your roofing quote",
    headline: "Here's your estimate",
    intro: `This quote was generated using the QuoteQuick demo for roofing services. In a real scenario, a roofing business would receive your details and follow up directly.`,
    bodyHtml: `
      <table cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 16px;">
        <tr>
          <td style="padding:16px 18px;background:rgba(13,60,252,0.08);border:1px solid rgba(13,60,252,0.20);border-radius:10px;text-align:center;">
            <p style="margin:0 0 4px;font-size:11px;color:#0d3cfc;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;">Your estimate</p>
            <p style="margin:0;font-size:32px;font-weight:800;color:#F0F0F0;">$8,200</p>
          </td>
        </tr>
      </table>
      <div style="border-top:1px solid rgba(255,255,255,0.06);padding-top:18px;margin-top:4px;">
        <p style="font-size:14px;font-weight:700;color:#F0F0F0;margin:0 0 6px;">Want this on YOUR website?</p>
        <p style="font-size:13px;color:#CDD1D6;line-height:1.6;margin:0;">
          QuoteQuick lets your customers get instant quotes 24/7 and sends every lead straight to you. No code needed — live in under 10 minutes.
        </p>
      </div>`,
    cta: { label: "Get QuoteQuick — from $49/mo", url: "https://wefixtrades.com/signup?product=quotequick" },
  });
  previews.push({
    slug: "09-demo-quote",
    source: "server/lib/demoQuoteFollowup.ts",
    subject: "Your roofing quote from Maple Ridge Roofing — $8,200",
    html: demoQuoteHtml,
  });

  /* ─── 6d. notificationWorker.ts buildBusinessNotificationEmail ─── */
  const notificationHtml = buildTransactionalEmail({
    recipientEmail: "owner@acmeplumbing.test",
    headerTagline: "Acme Plumbing · plumbing",
    eyebrow: "New quote request",
    headline: "Sam Rodriguez just requested a quote",
    intro: `Quote: <strong style="color:#0d3cfc;">$1,850</strong>. Full details below — reply within an hour for the best conversion.`,
    bodyHtml: `
      <table style="width:100%;border-collapse:collapse;background:#0F141A;border:1px solid rgba(255,255,255,0.06);border-radius:10px;padding:8px 14px;">
        <tr><td style="padding:6px 0;font-size:12px;color:#8B919A;text-transform:uppercase;letter-spacing:0.06em;width:80px;">Name</td><td style="padding:6px 0;font-size:14px;color:#F0F0F0;font-weight:600;text-align:right;">Sam Rodriguez</td></tr>
        <tr><td style="padding:6px 0;font-size:12px;color:#8B919A;text-transform:uppercase;letter-spacing:0.06em;width:80px;">Phone</td><td style="padding:6px 0;font-size:14px;color:#F0F0F0;font-weight:600;text-align:right;">+1 555 0142</td></tr>
        <tr><td style="padding:6px 0;font-size:12px;color:#8B919A;text-transform:uppercase;letter-spacing:0.06em;width:80px;">Email</td><td style="padding:6px 0;font-size:14px;color:#F0F0F0;font-weight:600;text-align:right;">sam@example.test</td></tr>
        <tr><td style="padding:6px 0;font-size:12px;color:#8B919A;text-transform:uppercase;letter-spacing:0.06em;width:80px;">Quote</td><td style="padding:6px 0;font-size:14px;color:#0d3cfc;font-weight:600;text-align:right;">$1,850</td></tr>
      </table>
      <div style="margin:16px 0 0;padding:12px 14px;background:#0F141A;border:1px solid rgba(255,255,255,0.06);border-radius:8px;">
        <p style="font-size:11px;color:#8B919A;margin:0 0 8px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;">Key inputs</p>
        <table style="width:100%;border-collapse:collapse;font-size:13px;color:#CDD1D6;">
          <tr><td style="padding:3px 0;color:#8B919A;">job_type</td><td style="padding:3px 0;color:#F0F0F0;text-align:right;">water-heater-replacement</td></tr>
          <tr><td style="padding:3px 0;color:#8B919A;">unit_size</td><td style="padding:3px 0;color:#F0F0F0;text-align:right;">50-gallon</td></tr>
          <tr><td style="padding:3px 0;color:#8B919A;">urgency</td><td style="padding:3px 0;color:#F0F0F0;text-align:right;">within-week</td></tr>
        </table>
      </div>`,
    cta: { label: "View in dashboard", url: "https://wefixtrades.com/portal/quotequick" },
    ctaFinePrint: `Or open the calculator directly: <a href="https://wefixtrades.com/calc/acme-plumbing" style="color:#0d3cfc;text-decoration:none;">https://wefixtrades.com/calc/acme-plumbing</a>`,
  });
  previews.push({
    slug: "10-quote-request-notification",
    source: "server/jobs/notificationWorker.ts",
    subject: "New Quote Request — Sam Rodriguez (plumbing)",
    html: notificationHtml,
  });

  /* ─── 6. contentReviewEmail.ts (customer revision-ready, light theme) ─── */
  const revisionHtml = buildTransactionalEmail({
    recipientEmail: "owner@acmeplumbing.test",
    theme: "light",
    maxWidth: 600,
    subjectForTitle: "Your revised article is ready for review",
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
    subject: "Your revised article is ready for review",
    html: revisionHtml,
  });

  /* ═══════════════════════════════════════════════════════════════════
     SPRINT 2D — Admin alert previews
     ═══════════════════════════════════════════════════════════════════ */
  const { buildAdminAlertEmail } = await import("../server/lib/adminAlertShell");

  /* 11. lowRatingAlert.ts */
  const stars = (rating: number) => {
    let s = "";
    for (let i = 1; i <= 5; i++) {
      s += `<span style="color:${i <= rating ? "#FBBF24" : "#D1D5DB"};font-size:18px;">&#9733;</span>`;
    }
    return s;
  };
  previews.push({
    slug: "11-low-rating-alert",
    source: "server/lib/lowRatingAlert.ts",
    subject: "New 1-star Google review for Acme Plumbing",
    html: buildAdminAlertEmail({
      recipientEmail: "ops@acmeplumbing.test",
      subjectForTitle: "New 1-star Google review for Acme Plumbing",
      alertType: "Low-rating review alert",
      alertTone: "critical",
      headline: "New 1-star review on Google",
      summary: "Responding quickly can help with recovery. The reviewer's text is below.",
      detailRows: [
        { label: "Business", value: "Acme Plumbing" },
        { label: "Platform", value: "Google" },
        { label: "Reviewer", value: "Jordan T." },
      ],
      bodyHtml: `
        <div style="background:rgba(185,28,28,0.06);border:1px solid rgba(185,28,28,0.18);border-radius:8px;padding:14px 16px;">
          <div style="margin-bottom:8px;">${stars(1)}</div>
          <p style="font-size:13px;color:#374151;line-height:1.5;margin:0;">Showed up two hours late, charged double the quote, and left a mess. Won't be using them again.</p>
        </div>`,
      cta: { label: "View &amp; respond", url: "https://wefixtrades.com/portal/reviews" },
      footerNote: "ReputationShield alert · adjust alert settings in your portal.",
    }),
  });

  /* 12. mapguardAlerts.ts */
  previews.push({
    slug: "12-mapguard-alert",
    source: "server/services/mapguardAlerts.ts",
    subject: "MapGuard Critical: Visibility score dropped 18 points",
    html: buildAdminAlertEmail({
      subjectForTitle: "MapGuard Critical: Visibility score dropped 18 points",
      alertType: "MapGuard Critical",
      alertTone: "critical",
      headline: "Visibility score dropped 18 points",
      summary: "Acme Plumbing's Google Business Profile visibility dropped sharply this week. Investigate ASAP.",
      detailRows: [
        { label: "Client", value: "Acme Plumbing" },
        { label: "Score change", value: "-18 pts", valueColor: "#B91C1C" },
        { label: "Current score", value: "62/100" },
        { label: "Keywords affected", value: "12" },
      ],
      cta: { label: "View client", url: "https://wefixtrades.com/admin/crm/clients/5001" },
      footerNote: "MapGuard monitoring · WeFixTrades",
    }),
  });

  /* 13. socialSync alertService */
  previews.push({
    slug: "13-socialsync-alert",
    source: "server/services/socialSync/alertService.ts",
    subject: "SocialSync Token Expired: Acme Plumbing",
    html: buildAdminAlertEmail({
      subjectForTitle: "SocialSync Token Expired: Acme Plumbing",
      alertType: "SocialSync · Token Expired",
      alertTone: "critical",
      headline: "Facebook token has expired for Acme Plumbing. Reconnection required.",
      detailRows: [
        { label: "Client", value: "Acme Plumbing" },
        { label: "Platform", value: "facebook" },
      ],
      cta: { label: "View in admin", url: "https://wefixtrades.com/admin/crm/clients/5001?tab=socialsync" },
      footerNote: "SocialSync internal alert",
    }),
  });

  /* 14. contactEmails admin */
  previews.push({
    slug: "14-contact-admin",
    source: "server/lib/contactEmails.ts (admin notif)",
    subject: "New contact form submission · Pricing question — Jamie Walker",
    html: buildAdminAlertEmail({
      subjectForTitle: "New contact form submission · Pricing question — Jamie Walker",
      alertType: "New contact form submission",
      alertTone: "info",
      headline: "Jamie Walker sent a message",
      summary: "Reply directly — the customer's address is the reply-to on this email.",
      detailRows: [
        { label: "From", value: "Jamie Walker &lt;jamie@example.test&gt;" },
        { label: "Subject", value: "Pricing question" },
        { label: "Lead ID", value: "#1042" },
      ],
      bodyHtml: `
        <div style="background:#F9FAFB;border:1px solid #E5E7EB;border-radius:8px;padding:14px 16px;">
          <p style="margin:0 0 6px;font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:0.06em;">Message</p>
          <pre style="margin:0;font-family:inherit;font-size:14px;color:#111827;white-space:pre-wrap;line-height:1.5;">Hi — interested in MapGuard for our roofing business in Ottawa. What's the typical setup timeline?</pre>
        </div>`,
      footerNote: "Sent by WeFixTrades contact form",
    }),
  });

  /* 15. wftSalesLine */
  previews.push({
    slug: "15-sales-call-summary",
    source: "server/services/wftSalesLine.ts",
    subject: "[Sales call] Sam Owner — Acme Plumbing",
    html: buildAdminAlertEmail({
      subjectForTitle: "[Sales call] Sam Owner — Acme Plumbing",
      alertType: "Sales lead",
      alertTone: "success",
      headline: "Caller asked for pricing on TradeLine and QuoteQuick.",
      detailRows: [
        { label: "Name", value: "Sam Owner" },
        { label: "Business", value: "Acme Plumbing" },
        { label: "Email", value: "sam@acmeplumbing.test" },
        { label: "Phone", value: "+1 555 0142" },
        { label: "Trade", value: "plumbing" },
        { label: "Intent", value: "pricing_question" },
        { label: "Call ID", value: "vapi_abc123" },
        { label: "Duration", value: "4m 12s" },
      ],
      bodyHtml: `
        <div style="background:#F9FAFB;border:1px solid #E5E7EB;border-radius:8px;padding:14px 16px;">
          <p style="margin:0 0 8px;font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:0.06em;">Full transcript</p>
          <pre style="margin:0;font-family:'Menlo','Monaco',monospace;font-size:12px;color:#374151;white-space:pre-wrap;line-height:1.55;">Riley: WeFixTrades, this is Riley — how can I help?
Sam: Hey, I run Acme Plumbing, looking at your TradeLine product...
Riley: Sure, TradeLine starts at $97/month and includes...
[transcript truncated]</pre>
        </div>`,
      footerNote: "WeFixTrades sales line",
    }),
  });

  /* 16. supplierDispatch */
  previews.push({
    slug: "16-supplier-dispatch",
    source: "server/services/supplierDispatch.ts",
    subject: "[HIGH] Generate Q2 ad creatives — Acme Plumbing",
    html: buildAdminAlertEmail({
      subjectForTitle: "[HIGH] Generate Q2 ad creatives — Acme Plumbing",
      alertType: "New task · high",
      alertTone: "warning",
      headline: "Generate Q2 ad creatives",
      summary: "Need 6 ad creatives for the Q2 campaign — 4 image-only + 2 video. Match the brand colors and tone outlined in the previous quarter's brief.",
      detailRows: [
        { label: "Client", value: "Acme Plumbing" },
        { label: "Service", value: "AdFlow Growth" },
        { label: "Priority", value: "HIGH" },
        { label: "Due", value: "Mon May 12 2026" },
      ],
      bodyHtml: `
        <div style="font-size:13px;color:#6B7280;line-height:1.55;background:#F9FAFB;border:1px solid #E5E7EB;border-radius:8px;padding:12px 14px;">
          Reply to this email to update the task or ask questions. WeFixTrades will track the reply against this client's file.
        </div>`,
      footerNote: "Sent by WeFixTrades ops · ops@wefixtrades.com",
    }),
  });

  /* 17. bookingEmails business notif */
  previews.push({
    slug: "17-booking-business-notif",
    source: "server/bookingEmails.ts (business notif)",
    subject: "New booking: Sam Rodriguez — Friday, May 9, 2026 at 3:00 PM",
    html: buildAdminAlertEmail({
      subjectForTitle: "New booking: Sam Rodriguez — Friday, May 9, 2026 at 3:00 PM",
      alertType: "New booking",
      alertTone: "success",
      headline: "Sam Rodriguez just booked",
      summary: "A customer has booked an appointment via your calculator.",
      detailRows: [
        { label: "Customer", value: "Sam Rodriguez" },
        { label: "Email", value: "sam@example.test" },
        { label: "Phone", value: "+1 555 0142" },
        { label: "Date & time", value: "Friday, May 9, 2026 at 3:00 PM" },
        { label: "Quote", value: "$420" },
        { label: "Deposit", value: "$80 (paid)" },
      ],
      footerNote: "Sent by your QuoteQuick calculator",
    }),
  });

  /* 18. demoLead internal */
  previews.push({
    slug: "18-demo-lead-internal",
    source: "server/lib/demoQuoteFollowup.ts (internal)",
    subject: "[Demo Lead] lead@example.test — roofing — $8,200",
    html: buildAdminAlertEmail({
      subjectForTitle: "[Demo Lead] lead@example.test — roofing — $8,200",
      alertType: "New demo quote lead",
      alertTone: "info",
      headline: "lead@example.test just generated a demo quote",
      detailRows: [
        { label: "Email", value: "lead@example.test" },
        { label: "Trade", value: "roofing" },
        { label: "Demo business", value: "Maple Ridge Roofing" },
        { label: "Quote amount", value: "$8,200", valueColor: "#15803D" },
      ],
      footerNote: "QuoteQuick demo · WeFixTrades",
    }),
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
    hasHeader: /We<span[^>]*>Fix<\/span>Trades/i.test(html),
    // Marketing footer (transactionalShell) OR compact admin footer (adminAlertShell)
    hasFooter: /Helping trade businesses win more jobs|WeFixTrades Alerts/i.test(html),
    hasChatBubble: /Have a question\?/i.test(html),
    theme: /background:\s*#0B0F14/i.test(html) ? "dark" : /background:\s*#F3F4F6/i.test(html) ? "light" : "unknown",
    ctaCount: ctaUrls.length,
    ctaUrls: ctaUrls.join(", "),
    httpUnsafeLinks: httpLinks,
  };
}
