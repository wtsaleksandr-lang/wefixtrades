import { MessageSquare, RefreshCcw, UserCheck, Shield, Clock } from "lucide-react";
import FeaturePage, { C, SHADOW, type FeaturePageConfig } from "@/components/marketing/FeaturePage";

/* ── Mockup ──────────────────────────────────── */
function SmsMockup() {
  const thread = [
    { from: "ai", text: "Hi Sarah! It's Ben from Ridge Roofing. Just following up on your quote from yesterday ($4,200 – $5,800). Any questions?", time: "9:02 AM" },
    { from: "customer", text: "Yeah actually — can you match $4,000 flat?", time: "9:47 AM" },
    { from: "ai", text: "I'll need to check with Ben on that — he'll get back to you within the hour. In the meantime, want me to hold a slot for next Thursday?", time: "9:47 AM" },
    { from: "customer", text: "Sure, Thursday works 👍", time: "9:49 AM" },
    { from: "ai", text: "Done! Thursday 10am is reserved. Sending you a booking link now to confirm with a $300 deposit.", time: "9:49 AM" },
  ];

  return (
    <div
      style={{
        background: "#F1F5F9",
        borderRadius: 20,
        padding: 20,
        width: "100%",
        maxWidth: 380,
        boxShadow: SHADOW.hero,
      }}
    >
      {/* Phone chrome */}
      <div style={{ background: C.bg, borderRadius: 16, overflow: "hidden", boxShadow: SHADOW.card }}>
        {/* Status bar */}
        <div style={{ background: C.navy, padding: "10px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "#FFFFFF" }}>Messages</span>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 10, background: C.sage, color: "#FFF", padding: "2px 8px", borderRadius: 20, fontWeight: 700 }}>AI Active</span>
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>Ridge Roofing</span>
          </div>
        </div>

        {/* Thread */}
        <div style={{ padding: "16px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
          {thread.map((m, i) => (
            <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: m.from === "customer" ? "flex-end" : "flex-start" }}>
              <div style={{
                maxWidth: "82%",
                padding: "9px 12px",
                borderRadius: m.from === "customer" ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
                background: m.from === "customer" ? "#DCF8C6" : C.bg,
                border: m.from !== "customer" ? `1px solid ${C.border}` : "none",
                fontSize: 12.5,
                color: C.heading,
                lineHeight: 1.5,
              }}>
                {m.text}
              </div>
              <span style={{ fontSize: 10, color: C.muted, marginTop: 3 }}>{m.time}</span>
            </div>
          ))}
        </div>

        {/* Take over banner */}
        <div style={{ margin: "0 14px 14px", background: `${C.orange}15`, border: `1px solid ${C.orange}30`, borderRadius: 10, padding: "10px 12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 11.5, color: C.orange, fontWeight: 600 }}>🤖 AI is responding</span>
          <span style={{ fontSize: 11, fontWeight: 700, color: C.orange, cursor: "pointer" }}>Take Over →</span>
        </div>
      </div>
    </div>
  );
}

const config: FeaturePageConfig = {
  meta: { title: "SMS & WhatsApp — QuickQuotePro | Automated Lead Follow-Ups That Win Jobs" },
  hero: {
    badge: "SMS & WhatsApp Automation",
    badgeColor: C.pink,
    headline: "Follow Up Automatically. Win Back Lost Leads.",
    highlightedWords: ["Automatically", "Win Back Lost Leads"],
    sub: "Leads who didn't book get smart, personalised follow-ups via SMS and WhatsApp — powered by AI and sent at exactly the right time.",
    accentColor: C.pink,
  },
  demo: {
    label: "Two-Way Conversations",
    title: "Real conversations that convert cold leads into booked jobs",
    description: "When a lead drops off, your AI employee reaches out via SMS or WhatsApp — naturally, not like a spam blast. It answers replies in real time, provides estimates, and can even book appointments. You can jump in anytime with Take Over mode.",
    bullets: [
      "Automated thank-you, reminder, and last-call sequences",
      "Two-way AI replies — not just one-way broadcasts",
      "Take Over mode — jump in as a human anytime",
      "AI-managed rate limiting — never spam classified",
    ],
    bulletColor: C.pink,
    mockup: SmsMockup,
  },
  benefits: [
    {
      icon: RefreshCcw,
      title: "Re-Engage Cold Leads",
      body: "Studies show 60–70% of leads need more than one touch before deciding. Automated follow-ups do this at scale, without effort.",
      color: C.pink, bg: C.pinkTint,
    },
    {
      icon: MessageSquare,
      title: "Two-Way AI Replies",
      body: "Unlike broadcast SMS tools, QuickQuotePro's AI responds to replies — answering questions, providing estimates, and booking jobs.",
      color: C.purple, bg: C.purpleTint,
    },
    {
      icon: UserCheck,
      title: "Seamless Hand-Off",
      body: "Take Over mode lets you jump into any AI conversation instantly. The customer sees a smooth transition from AI to human.",
      color: C.sage, bg: C.sageTint,
    },
    {
      icon: Shield,
      title: "Compliant & Safe",
      body: "Opt-in consent capture, configurable opt-out, and AI rate limiting protect your reputation and keep you GDPR/TCPA compliant.",
      color: C.orange, bg: C.orangeTint,
    },
  ],
  steps: [
    { num: "01", title: "Connect Twilio", body: "Link your Twilio account or use ours. Configure which channels to activate — SMS, WhatsApp, or both. Takes under 5 minutes." },
    { num: "02", title: "Set Follow-Up Sequences", body: "Define your drip timing: thank-you at 1 hour, reminder at 24 hours, last-call at 72 hours. Include a discount code in the final message to incentivise." },
    { num: "03", title: "Watch Jobs Roll In", body: "Monitor all conversations from your dashboard. Pause the AI on any thread, take over manually, or let it run automatically." },
  ],
  faqs: [
    { q: "Do I need my own Twilio account?", a: "Yes — Twilio is the underlying carrier for SMS and WhatsApp. You'll need a free Twilio account and a registered Twilio phone number. We walk you through setup in under 10 minutes." },
    { q: "Can customers opt out?", a: "Yes. Customers can reply STOP at any time. QuickQuotePro automatically processes opt-outs and suppresses that contact from future messages." },
    { q: "How does AI rate limiting work?", a: "The AI sends a maximum of 3 messages per lead per day and 50 messages per business per day. This prevents your number from being flagged as spam by carriers." },
    { q: "Can I include a discount code in follow-ups?", a: "Yes. You can attach a promo code to your final 'last-call' follow-up. The discount is validated and applied automatically when the lead uses the code in your calculator." },
    { q: "What is Take Over mode?", a: "Take Over pauses the AI on a specific conversation and lets you reply manually. The customer sees no difference — the messages come from the same number. You can hand back to AI at any time." },
  ],
  cta: {
    headline: "Stop Letting Leads Go Cold",
    sub: "Activate SMS and WhatsApp follow-ups today. Set up once, win jobs automatically from then on.",
  },
};

export default function SmsPage() {
  return <FeaturePage config={config} />;
}
