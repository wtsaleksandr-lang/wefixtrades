import { useMemo, useState } from "react";
import { Link } from "wouter";
import { ArrowRight, Search } from "lucide-react";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { PageMeta } from "@/components/seo/PageMeta";
import { mkt } from "@/theme/tokens";
import { V7PageShell } from "@/components/marketing/v7";
import { SANS, MONO } from "@/components/effortel-blocks";
import AiReceptionistCard from "@/components/marketing/AiReceptionistCard";
import AiReceptionistPreviewModal from "@/components/marketing/AiReceptionistPreviewModal";
import { AI_RECEPTIONISTS, type AiReceptionist } from "@/data/aiReceptionists";

const CS = {
  bg: "#C2D0D6",
  ink: "#0F1418",
  inkMuted: "#3F4549",
  inkFaint: "#4A5258",
  inputBorder: "rgba(15,20,24,0.20)",
};

export default function AiReceptionistsPage() {
  const [query, setQuery] = useState("");
  const [preview, setPreview] = useState<{ mode: "voice" | "chat"; data: AiReceptionist } | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return AI_RECEPTIONISTS;
    return AI_RECEPTIONISTS.filter(
      (r) => r.label.toLowerCase().includes(q) || r.cardBenefits.some((b) => b.toLowerCase().includes(q)),
    );
  }, [query]);

  return (
    <MarketingLayout>
      <PageMeta
        title="AI receptionists for every trade — answer every call 24/7"
        description="A ready-made AI receptionist for plumbers, electricians, HVAC, roofers, cleaners and 35+ more trades. Answers calls, books jobs, gives estimates and follows up — in your business's voice, with male or female voices."
        canonical="/ai-receptionists"
      />
      <V7PageShell>
        {/* Hero */}
        <section style={{ background: mkt.bg, padding: "8px 24px 28px" }}>
          <div style={{ maxWidth: 1000, margin: "0 auto", textAlign: "center" }}>
            <div style={{
              fontFamily: MONO, fontSize: 11, fontWeight: 600, letterSpacing: "0.10em",
              textTransform: "uppercase", color: mkt.onDarkMuted, marginBottom: 14,
            }}>
              AI Receptionist templates
            </div>
            <h1 style={{
              fontSize: "clamp(30px, 4.6vw, 52px)", fontWeight: 700, color: mkt.onDark,
              margin: 0, lineHeight: 1.08, letterSpacing: "-0.025em", fontFamily: SANS,
            }}>
              An AI receptionist built for <span style={{ color: mkt.accent }}>your trade</span>
            </h1>
            <p style={{
              fontSize: 16, color: mkt.onDarkMuted, lineHeight: 1.7,
              margin: "18px auto 0", maxWidth: 660,
            }}>
              Pick your trade and your AI receptionist is ready in minutes — pre-trained on
              the industry, customised to your business, and answering every call and message
              24/7. It quotes, books jobs, answers questions, and follows up so you never miss
              work. Male and female voices, every trade.
            </p>
          </div>
        </section>

        {/* Grey gallery panel */}
        <section style={{ background: CS.bg, padding: "44px 24px 72px", borderRadius: "32px 32px 0 0", marginTop: 20 }}>
          <div style={{ maxWidth: 1400, margin: "0 auto" }}>
            {/* Search */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 14, marginBottom: 28 }}>
              <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 600, color: CS.inkMuted, letterSpacing: "0.04em" }}>
                {filtered.length} trade{filtered.length === 1 ? "" : "s"}
              </div>
              <div style={{
                display: "inline-flex", alignItems: "center", gap: 8,
                background: "rgba(255,255,255,0.7)", border: `1px solid ${CS.inputBorder}`,
                borderRadius: 10, padding: "9px 13px", minWidth: 260,
              }}>
                <Search size={16} strokeWidth={2} style={{ color: CS.inkMuted }} />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search trades…"
                  aria-label="Search trades"
                  style={{
                    border: "none", outline: "none", background: "transparent",
                    fontSize: 14, color: CS.ink, width: "100%", fontFamily: SANS,
                  }}
                />
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 14 }}>
              {filtered.map((r) => (
                <AiReceptionistCard
                  key={r.id}
                  data={r}
                  readMoreHref={`/ai-receptionists/${r.slug}`}
                  onPreview={(mode, data) => setPreview({ mode, data })}
                />
              ))}
            </div>

            {filtered.length === 0 && (
              <p style={{ textAlign: "center", color: CS.inkMuted, marginTop: 40, fontSize: 15 }}>
                No trades match “{query}”. Don't see yours?{" "}
                <Link href="/contact" style={{ color: mkt.accent }}>Tell us</Link> — we add new trades fast.
              </p>
            )}
          </div>
        </section>

        {/* CTA */}
        <section style={{ padding: "48px 16px 72px", background: mkt.bg, textAlign: "center" }}>
          <h2 style={{ fontSize: "clamp(24px, 4vw, 34px)", fontWeight: 700, color: mkt.onDark, margin: "0 0 14px", letterSpacing: "-0.02em" }}>
            Don't see your trade?
          </h2>
          <p style={{ fontSize: 16, color: mkt.onDarkMuted, margin: "0 auto 28px", maxWidth: 520, lineHeight: 1.6 }}>
            We're adding trades every week. Tell us yours and we'll build your AI receptionist.
          </p>
          <div style={{ display: "flex", justifyContent: "center", gap: 12, flexWrap: "wrap" }}>
            <Link href="/contact" style={{
              display: "inline-flex", alignItems: "center", gap: 8, padding: "13px 26px", borderRadius: 12,
              background: mkt.accent, color: mkt.onDark, fontSize: 15, fontWeight: 700, textDecoration: "none",
            }}>
              Request your trade <ArrowRight size={16} />
            </Link>
            <Link href="/products/quickquotepro" style={{
              display: "inline-block", padding: "13px 26px", borderRadius: 12, background: "transparent",
              color: mkt.onDark, fontSize: 15, fontWeight: 600, textDecoration: "none",
              border: `1px solid ${mkt.onDarkBorder}`,
            }}>
              See how TradeLine works
            </Link>
          </div>
        </section>
      </V7PageShell>

      {preview && (
        <AiReceptionistPreviewModal
          data={preview.data}
          initialMode={preview.mode}
          onClose={() => setPreview(null)}
        />
      )}
    </MarketingLayout>
  );
}
