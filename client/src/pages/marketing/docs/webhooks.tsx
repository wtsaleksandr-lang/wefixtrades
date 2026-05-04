import { useEffect } from "react";
import DocsLayout, { Step, CodeBlock, InfoBox, DocH2, DocH3, Checklist, Accordion } from "@/components/marketing/DocsLayout";
import { mkt } from "@/theme/tokens";

export default function DocsWebhooks() {
  useEffect(() => { document.title = "Webhooks — QuoteQuick Pro Docs"; }, []);

  return (
    <DocsLayout
      activeSlug="webhooks"
      title="Webhooks"
      description="Send real-time events to your own systems, Zapier, or Make.com when leads, bookings, and estimates are created."
    >

      <InfoBox type="info">
        Webhooks are available on <strong>Elite plans</strong>. For Starter and Pro, use the CSV export or check the Dashboard for lead data.
      </InfoBox>

      <DocH2>What Are Webhooks?</DocH2>
      <p style={{ fontSize: 15, color: mkt.onDarkMuted, lineHeight: 1.7, marginBottom: 12 }}>
        A webhook is an automatic HTTP POST request sent from QuoteQuick Pro to a URL you specify — every time a specific event happens (e.g. a new lead, a booking confirmed). This lets you connect to any other system: your CRM, a Google Sheet via Zapier, a Slack channel, or your own backend.
      </p>

      <DocH2>Setting Up a Webhook</DocH2>
      <Step n={1} title="Go to Dashboard → Settings → Webhooks">
        Click <strong>Add Webhook Endpoint</strong>.
      </Step>
      <Step n={2} title="Enter your endpoint URL">
        Paste the URL you want to receive events (e.g. a Zapier webhook URL, a Make.com hook, or your own API endpoint).
        <CodeBlock lang="text" code={`https://hooks.zapier.com/hooks/catch/YOUR_ZAPIER_ID/
https://hook.eu1.make.com/YOUR_MAKE_HOOK_ID
https://your-crm.com/api/qqp-webhook`} />
      </Step>
      <Step n={3} title="Select which events to send">
        Choose one or more events (see below). You can add multiple endpoints with different event filters.
      </Step>
      <Step n={4} title="Test your webhook">
        Click <strong>Send Test Event</strong> — we send a sample payload to your endpoint so you can verify it's receiving correctly.
      </Step>

      <DocH2>Events Reference</DocH2>
      <Checklist items={[
        "lead_created — fired when a customer submits their details after seeing an estimate",
        "estimate_generated — fired when an estimate is calculated (even without lead capture)",
        "booking_created — fired when a customer completes a booking (with or without a deposit)",
        "booking_cancelled — fired when a booking is cancelled",
        "deposit_received — fired when a Stripe deposit payment is confirmed",
        "coupon_redeemed — fired when a promo code is used",
      ]} />

      <DocH2>Sample Payloads</DocH2>

      <Accordion title="lead_created" icon="📋">
        <CodeBlock lang="json" code={`{
  "event": "lead_created",
  "timestamp": "2026-03-01T09:22:14Z",
  "calculator_id": "calc_abc123",
  "calculator_name": "Bathroom Reno Quote",
  "lead": {
    "id": "lead_xyz789",
    "name": "Sarah Johnson",
    "email": "sarah@example.com",
    "phone": "+61412345678",
    "estimate_min": 1200,
    "estimate_max": 1680,
    "currency": "AUD",
    "inputs": {
      "bedrooms": 2,
      "sq_ft": 450,
      "service_type": "full_reno"
    },
    "created_at": "2026-03-01T09:22:14Z"
  }
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
        "Paste it into Dashboard → Settings → Webhooks → Add Endpoint",
        "Select your events and save",
        "Click Send Test Event in the Dashboard",
        "In Zapier, click Test Trigger — you should see the sample payload",
        "Set up your Zapier action (e.g. Add row in Google Sheets, Create contact in CRM)",
      ]} />

      <DocH2>Connecting to Make.com</DocH2>
      <Checklist items={[
        "In Make.com, create a new scenario → Add module: Webhooks → Custom webhook",
        "Click Add → copy the webhook URL",
        "Paste it into Dashboard → Settings → Webhooks → Add Endpoint",
        "Click Send Test Event — Make.com will capture the structure automatically",
        "Add your next module (e.g. Google Sheets, HubSpot, Slack)",
      ]} />

      <DocH2>Security</DocH2>
      <p style={{ fontSize: 15, color: mkt.onDarkMuted, lineHeight: 1.7, marginBottom: 12 }}>
        Each webhook endpoint has a secret signing key. We include an <code>X-QQP-Signature</code> header with each request — you can verify it to confirm the payload came from us:
      </p>
      <CodeBlock lang="javascript" code={`const crypto = require('crypto');

function verifyWebhook(payload, signature, secret) {
  const expected = crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(payload))
    .digest('hex');
  return \`sha256=\${expected}\` === signature;
}

// In your Express route:
app.post('/qqp-webhook', (req, res) => {
  const sig = req.headers['x-qqp-signature'];
  if (!verifyWebhook(req.body, sig, process.env.QQP_WEBHOOK_SECRET)) {
    return res.status(401).send('Invalid signature');
  }
  // Handle event...
  res.sendStatus(200);
});`} />

      <InfoBox type="warn">
        Always respond with a <strong>200 status</strong> within 10 seconds. If we receive a non-200 or timeout, we retry up to 3 times with exponential backoff (1 min, 5 min, 30 min).
      </InfoBox>

    </DocsLayout>
  );
}
