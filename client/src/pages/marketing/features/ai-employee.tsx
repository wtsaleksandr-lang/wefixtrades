import { Bot, MessageSquare, Zap, Users, PhoneCall } from "lucide-react";
import FeaturePage, { C, SHADOW, type FeaturePageConfig } from "@/components/marketing/FeaturePage";

/* ── Mockup ──────────────────────────────────── */
function AiMockup() {
  const messages = [
    { text: "Hey, what would it cost to repaint the exterior of my house? It's about 260m².", user: true },
    { text: "Great question! For 260m² exterior, I'm calculating $4,200 – $5,800 depending on prep work and paint grade. Want me to break that down?", user: false },
    { text: "Yeah please — and can you book someone for next week?", user: true },
    { text: "Of course! There are slots available Tuesday and Thursday morning. Want me to hold Tuesday at 9am? I'll need a $300 deposit to confirm.", user: false },
  ];

  return (
    <div
      style={{
        background: C.navy,
        borderRadius: 20,
        padding: 24,
        width: "100%",
        maxWidth: 400,
        boxShadow: SHADOW.hero,
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18, paddingBottom: 16, borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
        <div style={{ width: 38, height: 38, borderRadius: "50%", background: `linear-gradient(135deg, ${C.sage}, ${C.sageLight})`, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Bot size={18} color="#FFFFFF" />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#FFFFFF" }}>AI Employee</div>
          <div style={{ fontSize: 11, color: "#22C55E", display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#22C55E", display: "inline-block" }} />
            Online 24/7
          </div>
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          {["Web", "SMS", "WA"].map((ch) => (
            <span key={ch} style={{ fontSize: 10, fontWeight: 700, background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.45)", padding: "2px 8px", borderRadius: 20 }}>{ch}</span>
          ))}
        </div>
      </div>

      {/* Messages */}
      {messages.map((m, i) => (
        <div key={i} style={{ display: "flex", justifyContent: m.user ? "flex-end" : "flex-start", marginBottom: 10 }}>
          {!m.user && (
            <div style={{ width: 22, height: 22, borderRadius: "50%", background: `linear-gradient(135deg, ${C.sage}, ${C.sageLight})`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginRight: 6, marginTop: 2 }}>
              <Bot size={11} color="#FFFFFF" />
            </div>
          )}
          <div style={{
            maxWidth: "78%",
            padding: "9px 13px",
            borderRadius: m.user ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
            background: m.user ? C.sage : "rgba(255,255,255,0.09)",
            fontSize: 12.5,
            color: "#FFFFFF",
            lineHeight: 1.55,
          }}>
            {m.text}
          </div>
        </div>
      ))}

      {/* Escalation hint */}
      <div style={{ marginTop: 14, background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.25)", borderRadius: 10, padding: "9px 12px", display: "flex", alignItems: "center", gap: 8 }}>
        <PhoneCall size={13} color="#F59E0B" style={{ flexShrink: 0 }} />
        <span style={{ fontSize: 11.5, color: "rgba(255,255,255,0.6)", lineHeight: 1.4 }}>
          AI will escalate to <strong style={{ color: "rgba(255,255,255,0.8)" }}>you</strong> if the customer requests a human
        </span>
      </div>

      {/* Input */}
      <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
        <div style={{ flex: 1, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: "9px 13px", fontSize: 12, color: "rgba(255,255,255,0.3)" }}>
          Type a message…
        </div>
        <div style={{ width: 34, height: 34, borderRadius: 10, background: C.sage, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, cursor: "pointer" }}>
          <Bot size={15} color="#FFFFFF" />
        </div>
      </div>
    </div>
  );
}

const config: FeaturePageConfig = {
  meta: { title: "AI Employee — QuickQuotePro | 24/7 Sales & Support Automation" },
  hero: {
    badge: "AI Employee System",
    badgeColor: C.purple,
    headline: "An Employee Who Works 24/7 — Without a Salary",
    highlightedWords: ["24/7", "Without a Salary"],
    sub: "Your AI employee chats with visitors, answers trade questions, generates instant estimates, and books appointments — completely automatically.",
    accentColor: C.purple,
  },
  demo: {
    label: "See It Live",
    title: "Real conversations. Real estimates. Real bookings.",
    description: "Train your AI employee with your services, pricing, availability, and tone — using a simple structured form in your dashboard. It handles the entire customer journey from first question to confirmed booking.",
    bullets: [
      "Answers questions specific to your trade and service area",
      "Generates live estimates using your actual pricing formulas",
      "Books appointments and collects deposits automatically",
      "Escalates to you by phone or email when a human is needed",
    ],
    bulletColor: C.purple,
    mockup: AiMockup,
  },
  benefits: [
    {
      icon: Bot,
      title: "24/7 Coverage",
      body: "Never miss a lead again. Your AI employee responds to enquiries at 2am on a Sunday — when your competitors are unavailable.",
      color: C.purple, bg: C.purpleTint,
    },
    {
      icon: MessageSquare,
      title: "All Channels",
      body: "One AI brain available across web chat, SMS, and WhatsApp. Customers reach you however they prefer.",
      color: C.sage, bg: C.sageTint,
    },
    {
      icon: Zap,
      title: "Live Estimates",
      body: "The AI doesn't just chat — it accesses your pricing engine in real time and gives customers an actual quote range.",
      color: C.blue, bg: C.blueTint,
    },
    {
      icon: Users,
      title: "Smart Escalation",
      body: "When a customer requests a human, or when AI isn't certain, it escalates to you immediately via your preferred channel.",
      color: C.orange, bg: C.orangeTint,
    },
  ],
  steps: [
    { num: "01", title: "Configure Training Profile", body: "Fill in your services, service area, working hours, emergency availability, and preferred tone — using a simple structured form. No coding required." },
    { num: "02", title: "Activate Your Trial", body: "Start your 14-day free trial with one click. Your AI employee goes live immediately on your calculator widget, SMS, and WhatsApp." },
    { num: "03", title: "Review & Refine", body: "Monitor all AI conversations from your dashboard. See what questions customers ask, adjust your training profile, and improve over time." },
  ],
  faqs: [
    { q: "Does the AI use my actual pricing?", a: "Yes. The AI calls your pricing engine in real time using function calling — so it gives customers the same estimate your calculator would produce, not a guess." },
    { q: "What is the 14-day free trial?", a: "You get full AI Employee access for 14 days at no charge, on any plan. After the trial, you'll need to upgrade to a plan that includes AI Employee to continue using it." },
    { q: "What happens when the AI can't answer?", a: "The AI is trained to escalate gracefully. When it's unsure, or when the customer requests a human, it sends a notification to you via email or SMS (configurable) and lets the customer know you'll follow up." },
    { q: "Can I customise the AI's tone?", a: "Yes. You can choose from Professional, Friendly, or Direct tones during configuration. All responses stay consistent with your chosen style." },
    { q: "What channels does it cover?", a: "Web chat (embedded on your calculator page), SMS via Twilio, and WhatsApp Business via Twilio. Each channel can be toggled on/off independently in your dashboard." },
  ],
  cta: {
    headline: "Start Your 14-Day AI Employee Trial",
    sub: "No credit card required. Activate in under 5 minutes and let AI handle your leads tonight.",
  },
};

export default function AiEmployeePage() {
  return <FeaturePage config={config} />;
}
