import { useState } from "react";
import { Link, useRoute } from "wouter";
import { ArrowLeft, ArrowRight, Check, Phone, MessageCircle, Sparkles, GraduationCap, Brain, Mic } from "lucide-react";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { PageMeta } from "@/components/seo/PageMeta";
import { mkt } from "@/theme/tokens";
import { V7PageShell } from "@/components/marketing/v7";
import { SANS, MONO } from "@/components/effortel-blocks";
import AiReceptionistPreviewModal from "@/components/marketing/AiReceptionistPreviewModal";
import { getReceptionist, receptionistFeatures, type AiReceptionist } from "@/data/aiReceptionists";

const VALUE_PROPS = [
  { icon: GraduationCap, title: "Pre-trained for your trade", body: "Ships knowing your industry — the jobs, the lingo, the questions customers ask — from day one." },
  { icon: Sparkles, title: "Customised to your business", body: "Learns your services, pricing, service area, and hours so every answer sounds like you." },
  { icon: Brain, title: "Gets smarter over time", body: "Learns from past conversations and remembers what to avoid, so it improves with every call." },
  { icon: Mic, title: "Male & female voices", body: "Choose the voice that fits your brand — both are included, switchable any time." },
];

function faqFor(r: AiReceptionist) {
  return [
    { q: `What can the ${r.label} AI receptionist do?`, a: `It answers calls and messages 24/7, gives rough estimates, books jobs, answers ${r.label.toLowerCase()} questions, updates customers on scheduling, and follows up after the job to request reviews — all in your business's voice.` },
    { q: "Will it sound like a robot?", a: "No. It speaks naturally with a male or female voice of your choice, and it always says it's an AI assistant rather than pretending to be a person." },
    { q: "How long does it take to set up?", a: "Minutes. Pick your trade, add your services, pricing, and hours, and your receptionist is ready — pre-trained on the industry and customised to your business." },
    { q: "Does it really book jobs?", a: "Yes. It captures the details, checks your availability, and books the appointment — then keeps customers updated and follows up afterwards." },
  ];
}

export default function AiReceptionistDetailPage() {
  const [, params] = useRoute("/ai-receptionists/:slug");
  const [preview, setPreview] = useState<{ mode: "voice" | "chat" } | null>(null);
  const r = params?.slug ? getReceptionist(params.slug) : undefined;

  if (!r) {
    return (
      <MarketingLayout>
        <PageMeta title="AI receptionist not found" description="This AI receptionist template could not be found." canonical="/ai-receptionists" />
        <V7PageShell>
          <section style={{ padding: "80px 24px", textAlign: "center" }}>
            <h1 style={{ color: mkt.onDark, fontSize: 28, fontWeight: 700, marginBottom: 12 }}>Trade not found</h1>
            <Link href="/ai-receptionists" style={{ color: mkt.accent }}>← Back to all AI receptionists</Link>
          </section>
        </V7PageShell>
      </MarketingLayout>
    );
  }

  const features = receptionistFeatures(r.id);
  const faqs = faqFor(r);
  const faqLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
  };

  return (
    <MarketingLayout>
      <PageMeta
        title={`${r.label} AI receptionist — answers calls, books jobs 24/7`}
        description={`A ready-made AI receptionist for ${r.label.toLowerCase()} businesses. Answers every call and message 24/7, gives estimates, books jobs, and follows up — pre-trained for the trade, customised to your business, with male or female voices.`}
        canonical={`/ai-receptionists/${r.slug}`}
      />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }} />
      <V7PageShell>
        {/* Hero */}
        <section style={{ background: mkt.bg, padding: "12px 24px 44px" }}>
          <div style={{ maxWidth: 1080, margin: "0 auto" }}>
            <Link href="/ai-receptionists" style={{ display: "inline-flex", alignItems: "center", gap: 6, color: mkt.onDarkMuted, fontSize: 13, textDecoration: "none", marginBottom: 22 }}>
              <ArrowLeft size={16} /> All AI receptionists
            </Link>
            <div style={{ display: "grid", gridTemplateColumns: "1.1fr 0.9fr", gap: 36, alignItems: "center" }} className="airx-hero">
              <div>
                <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 600, letterSpacing: "0.10em", textTransform: "uppercase", color: mkt.onDarkMuted, marginBottom: 14 }}>
                  {r.label} · AI Receptionist
                </div>
                <h1 style={{ fontSize: "clamp(28px, 4.2vw, 46px)", fontWeight: 700, color: mkt.onDark, margin: 0, lineHeight: 1.1, letterSpacing: "-0.025em", fontFamily: SANS }}>
                  Never miss another <span style={{ color: mkt.accent }}>{r.label.toLowerCase()}</span> job
                </h1>
                <p style={{ fontSize: 16, color: mkt.onDarkMuted, lineHeight: 1.7, margin: "18px 0 0", maxWidth: 520 }}>
                  Your AI receptionist answers every call and message around the clock — quoting,
                  booking, and following up so leads never slip away. Pre-trained for {r.label.toLowerCase()},
                  customised to your business, with male and female voices.
                </p>
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 26 }}>
                  <button type="button" onClick={() => setPreview({ mode: "voice" })} style={primaryBtn}>
                    <Phone size={16} /> Call the demo
                  </button>
                  <button type="button" onClick={() => setPreview({ mode: "chat" })} style={secondaryBtn}>
                    <MessageCircle size={16} /> Chat with it
                  </button>
                </div>
              </div>
              {/* Worker on blue */}
              <div style={{ position: "relative", borderRadius: 24, background: "#0D3CFC", minHeight: 300, display: "flex", alignItems: "flex-end", justifyContent: "center", overflow: "hidden" }}>
                <img src={r.illustration} alt={`${r.label} AI receptionist`} style={{ height: 360, width: "auto", marginBottom: -6, filter: "drop-shadow(0 16px 30px rgba(0,0,0,0.28))" }} />
              </div>
            </div>
          </div>
        </section>

        {/* What it does */}
        <section style={{ background: mkt.sectionLight, padding: "56px 24px", borderRadius: "32px 32px 0 0" }}>
          <div style={{ maxWidth: 1080, margin: "0 auto" }}>
            <h2 style={{ fontSize: "clamp(24px, 3vw, 34px)", fontWeight: 700, color: mkt.onDark, margin: "0 0 28px", letterSpacing: "-0.02em", fontFamily: SANS }}>
              What it does for your {r.label.toLowerCase()} business
            </h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14 }}>
              {features.map((f, i) => (
                <div key={i} style={{ display: "flex", gap: 11, alignItems: "flex-start", background: "rgba(255,255,255,0.03)", border: `1px solid ${mkt.onDarkBorder}`, borderRadius: 14, padding: "16px 18px" }}>
                  <Check size={20} strokeWidth={2.5} style={{ flex: "0 0 20px", color: mkt.accent, marginTop: 1 }} />
                  <span style={{ fontSize: 14.5, color: mkt.onDarkMuted, lineHeight: 1.5 }}>{f}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Value props */}
        <section style={{ background: mkt.bg, padding: "56px 24px" }}>
          <div style={{ maxWidth: 1080, margin: "0 auto" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16 }}>
              {VALUE_PROPS.map((v, i) => (
                <div key={i} style={{ padding: "8px 6px" }}>
                  <div style={{ width: 44, height: 44, borderRadius: 12, background: "rgba(13,60,252,0.10)", border: "1px solid rgba(13,60,252,0.30)", display: "flex", alignItems: "center", justifyContent: "center", color: mkt.accent, marginBottom: 14 }}>
                    <v.icon size={24} strokeWidth={1.8} />
                  </div>
                  <h3 style={{ fontSize: 16, fontWeight: 700, color: mkt.onDark, margin: "0 0 6px" }}>{v.title}</h3>
                  <p style={{ fontSize: 13.5, color: mkt.onDarkMuted, lineHeight: 1.55, margin: 0 }}>{v.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section style={{ background: mkt.bg, padding: "8px 24px 56px" }}>
          <div style={{ maxWidth: 760, margin: "0 auto" }}>
            <h2 style={{ fontSize: "clamp(22px, 3vw, 30px)", fontWeight: 700, color: mkt.onDark, margin: "0 0 22px", letterSpacing: "-0.02em" }}>
              Questions, answered
            </h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {faqs.map((f, i) => (
                <div key={i} style={{ background: mkt.sectionLight, border: `1px solid ${mkt.onDarkBorder}`, borderRadius: 14, padding: "18px 20px" }}>
                  <h3 style={{ fontSize: 15, fontWeight: 700, color: mkt.onDark, margin: "0 0 8px" }}>{f.q}</h3>
                  <p style={{ fontSize: 14, color: mkt.onDarkMuted, lineHeight: 1.6, margin: 0 }}>{f.a}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section style={{ padding: "20px 16px 72px", background: mkt.bg, textAlign: "center" }}>
          <h2 style={{ fontSize: "clamp(24px, 4vw, 34px)", fontWeight: 700, color: mkt.onDark, margin: "0 0 14px", letterSpacing: "-0.02em" }}>
            Put your {r.label.toLowerCase()} receptionist to work
          </h2>
          <div style={{ display: "flex", justifyContent: "center", gap: 12, flexWrap: "wrap", marginTop: 8 }}>
            <button type="button" onClick={() => setPreview({ mode: "chat" })} style={primaryBtn}>
              Try it now <ArrowRight size={16} />
            </button>
            <Link href="/pricing" style={secondaryLink}>See pricing</Link>
          </div>
        </section>
      </V7PageShell>

      {preview && (
        <AiReceptionistPreviewModal data={r} initialMode={preview.mode} onClose={() => setPreview(null)} />
      )}

      <style>{`@media (max-width: 820px){ .airx-hero{ grid-template-columns: 1fr !important; } }`}</style>
    </MarketingLayout>
  );
}

const primaryBtn = {
  display: "inline-flex", alignItems: "center", gap: 8, cursor: "pointer", padding: "13px 24px",
  borderRadius: 12, background: mkt.accent, color: mkt.onDark, fontSize: 15, fontWeight: 700,
  border: "none", fontFamily: "inherit",
} as const;
const secondaryBtn = {
  display: "inline-flex", alignItems: "center", gap: 8, cursor: "pointer", padding: "13px 24px",
  borderRadius: 12, background: "transparent", color: mkt.onDark, fontSize: 15, fontWeight: 600,
  border: `1px solid ${mkt.onDarkBorder}`, fontFamily: "inherit",
} as const;
const secondaryLink = {
  display: "inline-block", padding: "13px 24px", borderRadius: 12, background: "transparent",
  color: mkt.onDark, fontSize: 15, fontWeight: 600, textDecoration: "none", border: `1px solid ${mkt.onDarkBorder}`,
} as const;
