import { useEffect } from "react";
import DocsLayout, { Step, InfoBox, DocH2, DocH3, Checklist, Accordion } from "@/components/marketing/DocsLayout";
import { mkt } from "@/theme/tokens";

export default function DocsAi() {
  useEffect(() => { document.title = "AI Employee — QuoteQuick™ Docs"; }, []);

  return (
    <DocsLayout
      activeSlug="ai"
      title="AI Employee"
      description="Your AI responds to leads instantly, 24/7 — answering questions, generating estimates, and booking jobs, so you don't have to."
    >

      <InfoBox type="tip">
        Every account gets a <strong>14-day free trial</strong> of the AI Employee — no credit card needed. After the trial, a Pro plan or above keeps it active.
      </InfoBox>

      <DocH2>What the AI Employee Does</DocH2>
      <p style={{ fontSize: 15, color: mkt.onDarkMuted, lineHeight: 1.7, marginBottom: 12 }}>
        A chat widget appears on your hosted quote page (and optionally on your own website). When a visitor asks a question, the AI responds in seconds — at any time of day or night.
      </p>
      <Checklist items={[
        "Answers common questions about your services, pricing, and availability",
        "Generates an instant estimate using your pricing formula",
        "Offers a booking link when the customer is ready",
        "Escalates to you (via SMS notification) when a human is needed",
        "Continues conversations over SMS and WhatsApp (Pro plan)",
      ]} />

      <DocH2>Enabling the AI Employee</DocH2>
      <Step n={1} title="Go to Dashboard → AI Employee">
        Find the AI Employee tab in your dashboard. Toggle it on. Your 14-day trial starts immediately.
      </Step>
      <Step n={2} title="Complete your business profile">
        Fill in your training profile (see below). The more details you provide, the better the AI answers your customers.
      </Step>
      <Step n={3} title="Set escalation rules">
        Choose what triggers a handoff to you — e.g. "customer wants to speak to a human", "question about warranty", "complaint". You get an SMS when the AI escalates.
      </Step>
      <Step n={4} title="Test it in preview mode">
        Click Preview in the AI Employee tab to chat with your own AI before going live. Adjust the profile until you're happy with the responses.
      </Step>

      <DocH2>Training Profile</DocH2>
      <p style={{ fontSize: 15, color: mkt.onDarkMuted, lineHeight: 1.7, marginBottom: 12 }}>
        The AI learns from structured fields — not a wall of text. Complete each section:
      </p>
      <Checklist items={[
        "Business name and trade type (e.g. 'Smith Plumbing — residential plumber')",
        "Services you offer (list each one)",
        "Service areas (suburbs, postcodes, or regions you cover)",
        "Hours of operation",
        "Common FAQs (3–10 questions + answers)",
        "Your tone: friendly, professional, or casual",
        "What the AI should NOT quote or commit to (e.g. emergency call-out rates)",
      ]} />

      <InfoBox type="warn">
        The AI uses your pricing formula to generate estimates — it does not make up numbers. It can only quote for services with a configured calculator. Keep your pricing formula up to date.
      </InfoBox>

      <DocH2>What the AI Is Allowed to Do</DocH2>

      <DocH3>Permitted actions:</DocH3>
      <Checklist items={[
        "Answer FAQ questions from your training profile",
        "Generate an estimate via your configured pricing formula",
        "Show the customer their estimate summary",
        "Offer a booking link or open the booking calendar",
        "Escalate to you and notify you by SMS",
        "Collect the customer's name and contact details",
      ]} />

      <DocH3>Not permitted:</DocH3>
      <Checklist items={[
        "Make promises about exact arrival times or completion dates",
        "Override your pricing formula or offer discounts without your approval",
        "Access or share other customers' data",
        "Take payment directly (booking deposits go through Stripe, not the AI)",
      ]} />

      <DocH2>Channels</DocH2>

      <Accordion title="Website chat widget (available now)" icon="💬">
        <p style={{ fontSize: 14, color: mkt.onDarkMuted, lineHeight: 1.7, margin: 0 }}>
          The AI chat widget appears on your hosted quote page by default. You can also embed it on any website using a 2-line script (same as the calculator embed). Find the script under AI Employee → Deploy Widget.
        </p>
      </Accordion>

      <Accordion title="SMS conversations (Pro plan)" icon="📱">
        <p style={{ fontSize: 14, color: mkt.onDarkMuted, lineHeight: 1.7, margin: 0 }}>
          Requires Twilio setup (takes about 10 minutes). Once connected, the AI handles inbound SMS replies from your follow-up sequences. You can "Take Over" any SMS thread from the Dashboard → Messages tab at any time.
        </p>
      </Accordion>

      <Accordion title="WhatsApp (Pro plan)" icon="💚">
        <p style={{ fontSize: 14, color: mkt.onDarkMuted, lineHeight: 1.7, margin: 0 }}>
          Requires a Twilio WhatsApp sender and a Meta-approved business account. Once connected, follow-ups and inbound messages flow through the same Messages tab as SMS. Full conversation history is stored.
        </p>
      </Accordion>

      <Accordion title="Voice (Roadmap)" icon="🔊">
        <p style={{ fontSize: 14, color: mkt.onDarkMuted, lineHeight: 1.7, margin: 0 }}>
          AI voice calling is on our product roadmap. When available, it will allow the AI to handle inbound calls, gather job details, and quote callers — all logged to the Dashboard. Subscribe to product updates to be notified when it launches.
        </p>
      </Accordion>

      <DocH2>Take Over Mode</DocH2>
      <p style={{ fontSize: 15, color: mkt.onDarkMuted, lineHeight: 1.7, marginBottom: 12 }}>
        If you want to jump into any conversation personally:
      </p>
      <Checklist items={[
        "Go to Dashboard → Messages",
        "Find the conversation thread",
        "Click Take Over — the AI immediately pauses for that thread",
        "Reply directly from the Dashboard",
        "Click Hand Back to AI when you're done",
      ]} />

      <InfoBox type="info">
        The customer never knows they've been transferred — the conversation continues seamlessly. The AI waits until you hand control back before responding again.
      </InfoBox>

    </DocsLayout>
  );
}
