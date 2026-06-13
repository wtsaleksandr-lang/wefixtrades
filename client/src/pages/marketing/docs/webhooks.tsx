import DocsLayout, { Step, CodeBlock, InfoBox, DocH2, DocH3, Checklist, Accordion } from "@/components/marketing/DocsLayout";
import { PageMeta } from "@/components/seo/PageMeta";
import { mkt } from "@/theme/tokens";

export default function DocsWebhooks() {
  // Title + meta tags handled by <PageMeta> below.

  return (
    <>
    <PageMeta
      title="Webhooks — QuoteQuick docs"
      description="Subscribe to WeFixTrades webhook events: leads captured, bookings confirmed, deposits paid, AI handoffs, and more. Signed payloads with retries."
      canonical="/docs/webhooks"
    />
    <DocsLayout
      activeSlug="webhooks"
      title="Webhooks"
      description="Send real-time events to your own systems, Zapier, or Make.com when leads, bookings, and estimates are created."
    >

      <InfoBox type="info">
        The <strong>lead webhook is free on every plan</strong>. Turn it on in your calculator's <strong>Action → Integrations</strong> panel: paste a URL, copy the signing secret, and every new lead is POSTed to you in real time. The richer event subscriptions below (bookings, deposits, multi-endpoint) are part of the API platform.
      </InfoBox>

      <DocH2>What Are Webhooks?</DocH2>
      <p style={{ fontSize: 15, color: mkt.onDarkMuted, lineHeight: 1.7, marginBottom: 12 }}>
        A webhook is an automatic HTTP POST request sent from QuoteQuick to a URL you specify — every time a specific event happens (e.g. a new lead, a booking confirmed). This lets you connect to any other system: your CRM, a Google Sheet via Zapier, a Slack channel, or your own backend.
      </p>

      <DocH2>Setting Up the Lead Webhook (free, all plans)</DocH2>
      <Step n={1} title="Open your calculator → Action tab → Integrations">
        In the wizard, switch on <strong>Send a webhook on every new lead</strong>.
      </Step>
      <Step n={2} title="Enter your endpoint URL">
        Paste the <strong>https://</strong> URL you want to receive events (e.g. a Zapier catch-hook, a Make.com hook, a Slack incoming webhook, or your own API). Only public <code>https://</code> URLs are accepted.
        <CodeBlock lang="text" code={`https://hooks.zapier.com/hooks/catch/YOUR_ZAPIER_ID/
https://hook.eu1.make.com/YOUR_MAKE_HOOK_ID
https://your-crm.com/api/qq-webhook`} />
      </Step>
      <Step n={3} title="Copy your signing secret">
        QuoteQuick generates a per-calculator <code>whsec_…</code> secret. Use it to verify the <code>X-WFT-Signature</code> header (see Security below). You can regenerate it any time.
      </Step>
      <Step n={4} title="Send a test event">
        Click <strong>Send test</strong> — we POST a sample <code>lead.created</code> payload (marked <code>"test": true</code>) to your endpoint and show you the delivery result inline.
      </Step>

      <DocH2>Events Reference</DocH2>
      <Checklist items={[
        "lead.created — (free, all plans) fired from your calculator's Integrations panel when a customer submits their details after seeing a quote",
        "estimate_generated — (API platform) fired when an estimate is calculated (even without lead capture)",
        "booking_created — (API platform) fired when a customer completes a booking (with or without a deposit)",
        "booking_cancelled — (API platform) fired when a booking is cancelled",
        "deposit_received — (API platform) fired when a Stripe deposit payment is confirmed",
        "coupon_redeemed — (API platform) fired when a promo code is used",
      ]} />

      <DocH2>Sample Payloads</DocH2>

      <Accordion title="lead.created (free lead webhook)" icon="📋">
        <p style={{ fontSize: 14, color: mkt.onDarkMuted, lineHeight: 1.6, marginBottom: 10 }}>
          This is the exact body POSTed by the free Integrations lead webhook. A
          test send is identical but adds <code>"test": true</code>. <code>total</code>{' '}
          and <code>deposit</code> are whole units of <code>currency</code> (or <code>null</code>).
        </p>
        <CodeBlock lang="json" code={`{
  "event": "lead.created",
  "calculator_id": 1234,
  "business_name": "Bathroom Reno Quote",
  "lead_id": 56789,
  "contact": {
    "name": "Sarah Johnson",
    "email": "sarah@example.com",
    "phone": "+61412345678",
    "company": "Johnson Renovations"
  },
  "answers": {
    "bedrooms": 2,
    "sq_ft": 450,
    "service_type": "full_reno"
  },
  "total": 1680,
  "deposit": 200,
  "currency": "AUD",
  "created_at": "2026-03-01T09:22:14.000Z"
}`} />
      </Accordion>

      <Accordion title="booking_created" icon="📅">
        <CodeBlock lang="json" code={`{
  "event": "booking_created",
  "timestamp": "2026-03-01T09:45:00Z",
  "calculator_id": "calc_abc123",
  "booking": {
    "id": "book_def456",
    "lead_id": "lead_xyz789",
    "customer_name": "Sarah Johnson",
    "customer_email": "sarah@example.com",
    "scheduled_at": "2026-03-10T09:00:00Z",
    "duration_minutes": 120,
    "deposit_amount": 200,
    "deposit_currency": "AUD",
    "deposit_paid": true,
    "status": "confirmed"
  }
}`} />
      </Accordion>

      <Accordion title="estimate_generated" icon="💡">
        <CodeBlock lang="json" code={`{
  "event": "estimate_generated",
  "timestamp": "2026-03-01T09:20:00Z",
  "calculator_id": "calc_abc123",
  "estimate": {
    "min": 1200,
    "max": 1680,
    "currency": "AUD",
    "inputs": {
      "bedrooms": 2,
      "sq_ft": 450
    },
    "session_id": "sess_ghi012"
  }
}`} />
      </Accordion>

      <DocH2>Connecting to Zapier</DocH2>
      <Checklist items={[
        `In Zapier, create a new Zap → Trigger: "Webhooks by Zapier" → Catch Hook`,
        "Copy the Zapier webhook URL",
        "Paste it into your calculator → Action → Integrations and turn the webhook on",
        "Click Send test in the Integrations panel",
        "In Zapier, click Test Trigger — you should see the sample payload",
        "Set up your Zapier action (e.g. Add row in Google Sheets, Create contact in CRM)",
      ]} />

      <DocH2>Connecting to Make.com</DocH2>
      <Checklist items={[
        "In Make.com, create a new scenario → Add module: Webhooks → Custom webhook",
        "Click Add → copy the webhook URL",
        "Paste it into your calculator → Action → Integrations and turn the webhook on",
        "Click Send test — Make.com will capture the structure automatically",
        "Add your next module (e.g. Google Sheets, HubSpot, Slack)",
      ]} />

      <DocH2>Security — verifying the signature</DocH2>
      <p style={{ fontSize: 15, color: mkt.onDarkMuted, lineHeight: 1.7, marginBottom: 12 }}>
        Every request carries an <code>X-WFT-Signature</code> header of the form{' '}
        <code>t=&lt;unix_seconds&gt;,v1=&lt;hex&gt;</code>. The signature is an HMAC-SHA256
        of the string <code>&#96;$&#123;t&#125;.$&#123;rawBody&#125;&#96;</code> using your
        calculator's signing secret. <strong>Verify against the raw request body</strong>{' '}
        (not a re-serialized object) and compare in constant time:
      </p>
      <CodeBlock lang="javascript" code={`const crypto = require('crypto');

// secret = your calculator's whsec_… signing secret
function verifyWftSignature(rawBody, header, secret, toleranceSec = 300) {
  const parts = Object.fromEntries(
    header.split(',').map((kv) => {
      const i = kv.indexOf('=');
      return [kv.slice(0, i), kv.slice(i + 1)];
    }),
  );
  const t = parseInt(parts.t, 10);
  if (!Number.isFinite(t)) return false;
  // Reject stale timestamps to block replays.
  if (Math.abs(Math.floor(Date.now() / 1000) - t) > toleranceSec) return false;

  const expected = crypto
    .createHmac('sha256', secret)
    .update(\`\${t}.\${rawBody}\`, 'utf8')
    .digest('hex');
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(parts.v1 || '', 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Express — capture the RAW body so the signature matches byte-for-byte:
app.post('/qq-webhook', express.raw({ type: 'application/json' }), (req, res) => {
  const raw = req.body.toString('utf8');
  const sig = req.headers['x-wft-signature'];
  if (!verifyWftSignature(raw, sig, process.env.QQ_WEBHOOK_SECRET)) {
    return res.status(401).send('Invalid signature');
  }
  const event = JSON.parse(raw); // { event: 'lead.created', ... }
  // Use event.lead_id to de-duplicate.
  res.sendStatus(200);
});`} />

      <InfoBox type="warn">
        Respond with a <strong>2xx status</strong> quickly (within 5 seconds). The free lead webhook is best-effort: on a network error or timeout we retry up to 2 more times, then give up — your lead is always saved regardless. A non-2xx response is treated as final (not retried). De-duplicate on <code>lead_id</code>.
      </InfoBox>

    </DocsLayout>
    </>
  );
}
