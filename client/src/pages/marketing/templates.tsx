import { useState, useEffect } from "react";
import { Link } from "wouter";
import { ArrowRight, Play, Check, Calendar } from "lucide-react";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { useScrollReveal } from "@/hooks/useScrollReveal";
import { TEMPLATES, TAG_STYLES } from "@/config/templateConfig";

const C = {
  navy: "#0B1F3A",
  sage: "#4A7C6F",
  sageTint: "#F0F7F4",
  bg: "#FFFFFF",
  bgGray: "#F8FAFC",
  heading: "#0F172A",
  body: "#334155",
  muted: "#64748B",
  border: "#E2E8F0",
};

const ALL_TAGS = ["All", "Single Page", "Multi-Step", "Package Cards", "Estimate + Book"];

/* ─── Inline template preview ─────────────────────── */
function TemplatePreview({ gradient, emoji, name, tag }: { gradient: string; emoji: string; name: string; tag: string }) {
  const tagStyle = TAG_STYLES[tag] || { bg: "#F3F4F6", color: "#64748B" };
  return (
    <div style={{ background: gradient, height: 168, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, padding: "20px", position: "relative", overflow: "hidden" }}>
      {/* Fake UI wireframe */}
      <div style={{ width: "84%", background: "rgba(255,255,255,0.85)", borderRadius: 10, padding: "12px 14px", boxShadow: "0 2px 12px rgba(0,0,0,0.08)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <span style={{ fontSize: 18 }}>{emoji}</span>
          <div>
            <div style={{ height: 7, width: 100, background: "#94A3B8", borderRadius: 4, marginBottom: 4 }} />
            <div style={{ height: 5, width: 70, background: "#CBD5E1", borderRadius: 4 }} />
          </div>
        </div>
        <div style={{ height: 5, background: "#E2E8F0", borderRadius: 4, marginBottom: 6 }} />
        <div style={{ height: 5, width: "80%", background: "#E2E8F0", borderRadius: 4, marginBottom: 10 }} />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ height: 20, width: 70, background: C.sage, borderRadius: 5 }} />
          <span style={{ fontSize: 11, fontWeight: 700, color: tagStyle.color, background: tagStyle.bg, padding: "2px 8px", borderRadius: 20 }}>{tag}</span>
        </div>
      </div>
    </div>
  );
}

export default function TemplatesPage() {
  useScrollReveal();
  const [activeFilter, setActiveFilter] = useState("All");

  useEffect(() => { document.title = "Calculator Templates — QuickQuotePro"; }, []);

  const filtered = activeFilter === "All" ? TEMPLATES : TEMPLATES.filter((t) => t.tag === activeFilter);

  return (
    <MarketingLayout>
      <div data-testid="templates-page" style={{ overflowX: "hidden" }}>

        {/* Hero */}
        <div style={{ background: `linear-gradient(160deg, ${C.navy} 0%, #0F2744 100%)`, padding: "80px 28px 72px", textAlign: "center" }}>
          <div style={{ maxWidth: 720, margin: "0 auto" }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "rgba(45,106,79,0.25)", border: "1px solid rgba(45,106,79,0.4)", borderRadius: 20, padding: "5px 16px", marginBottom: 24 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#6EE7B7", letterSpacing: "0.04em" }}>
                {TEMPLATES.length} Templates Available
              </span>
            </div>
            <h1 style={{ fontSize: "clamp(30px, 4vw, 50px)", fontWeight: 800, color: "#FFFFFF", margin: "0 0 16px", lineHeight: 1.1, letterSpacing: "-0.02em" }}>
              {TEMPLATES.length} High-Converting Calculator Templates
            </h1>
            <p style={{ fontSize: 18, color: "rgba(255,255,255,0.65)", margin: "0 0 36px", lineHeight: 1.6, maxWidth: 540, marginLeft: "auto", marginRight: "auto" }}>
              Pick a template, enter your pricing, and go live in minutes. Every template includes a live demo you can try right now.
            </p>
            <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
              <Link href="/Wizard" data-testid="templates-cta-build" style={{ display: "inline-block", padding: "12px 28px", borderRadius: 10, background: C.sage, color: "#FFFFFF", fontSize: 15, fontWeight: 700, textDecoration: "none" }}>
                Build Yours Free
              </Link>
              <a href="#template-grid" style={{ display: "inline-block", padding: "12px 24px", borderRadius: 10, background: "transparent", color: "#FFFFFF", fontSize: 15, fontWeight: 600, textDecoration: "none", border: "1.5px solid rgba(255,255,255,0.28)" }}>
                Browse Templates ↓
              </a>
            </div>
          </div>
        </div>

        {/* Filter pills */}
        <div style={{ background: C.bg, borderBottom: `1px solid ${C.border}`, position: "sticky", top: 72, zIndex: 20 }}>
          <div style={{ maxWidth: 1160, margin: "0 auto", padding: "14px 28px", display: "flex", gap: 8, flexWrap: "wrap" as const, alignItems: "center" }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: C.muted, marginRight: 4, textTransform: "uppercase", letterSpacing: "0.06em" }}>Filter:</span>
            {ALL_TAGS.map((tag) => (
              <button
                key={tag}
                onClick={() => setActiveFilter(tag)}
                data-testid={`filter-${tag.toLowerCase().replace(/\s+/g, "-")}`}
                style={{
                  padding: "6px 16px", borderRadius: 20,
                  border: `1.5px solid ${activeFilter === tag ? C.sage : C.border}`,
                  background: activeFilter === tag ? C.sage : "transparent",
                  color: activeFilter === tag ? "#FFFFFF" : C.body,
                  fontSize: 13, fontWeight: 600, cursor: "pointer",
                  transition: "all 0.15s ease",
                }}
              >
                {tag} {tag !== "All" && `(${TEMPLATES.filter((t) => t.tag === tag).length})`}
              </button>
            ))}
          </div>
        </div>

        {/* Template grid */}
        <div id="template-grid" style={{ background: C.bgGray, padding: "56px 28px 96px" }}>
          <div style={{ maxWidth: 1160, margin: "0 auto" }}>
            <p style={{ fontSize: 14, color: C.muted, marginBottom: 28 }}>
              Showing <strong>{filtered.length}</strong> template{filtered.length !== 1 ? "s" : ""}
              {activeFilter !== "All" ? ` in "${activeFilter}"` : ""}
            </p>

            <div className="templates-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 24 }}>
              {filtered.map((template, i) => {
                const tagStyle = TAG_STYLES[template.tag] || { bg: "#F3F4F6", color: "#64748B" };
                return (
                  <div
                    key={template.id}
                    data-testid={`template-card-${template.id}`}
                    data-reveal="fade-up"
                    data-delay={String(((i % 3) + 1) * 100)}
                    className="mkt-feature-card"
                    style={{ background: C.bg, borderRadius: 16, border: `1px solid ${C.border}`, overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.05)", display: "flex", flexDirection: "column" }}
                  >
                    {/* Visual preview */}
                    <TemplatePreview gradient={template.previewGradient} emoji={template.emoji} name={template.name} tag={template.tag} />

                    {/* Card content */}
                    <div style={{ padding: "20px 22px 22px", flex: 1, display: "flex", flexDirection: "column" }}>
                      {/* Header row */}
                      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, marginBottom: 10 }}>
                        <h3 style={{ fontSize: 16, fontWeight: 700, color: C.heading, margin: 0, lineHeight: 1.3 }}>
                          {template.emoji} {template.name}
                        </h3>
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                          <span style={{ flexShrink: 0, fontSize: 10, fontWeight: 700, letterSpacing: "0.04em", padding: "2px 10px", borderRadius: 20, background: tagStyle.bg, color: tagStyle.color, whiteSpace: "nowrap" as const }}>
                            {template.tag}
                          </span>
                          {template.hasBooking && (
                            <span style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 10, fontWeight: 700, color: C.sage, background: C.sageTint, padding: "2px 8px", borderRadius: 20 }}>
                              <Calendar size={9} /> Book
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Description */}
                      <p style={{ fontSize: 13, color: C.muted, lineHeight: 1.6, margin: "0 0 14px" }}>
                        {template.description}
                      </p>

                      {/* Best for */}
                      <div style={{ marginBottom: 12 }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 }}>Best for</div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                          {template.bestFor.map((b) => (
                            <span key={b} style={{ fontSize: 11, fontWeight: 600, color: C.body, background: C.bgGray, border: `1px solid ${C.border}`, padding: "2px 9px", borderRadius: 20 }}>
                              {b}
                            </span>
                          ))}
                        </div>
                      </div>

                      {/* Inputs used */}
                      <div style={{ marginBottom: 18 }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 }}>Inputs used</div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                          {template.inputsSummary.split(", ").map((inp) => (
                            <span key={inp} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: C.muted, background: C.bgGray, border: `1px solid ${C.border}`, padding: "2px 9px", borderRadius: 20 }}>
                              <Check size={9} color={C.sage} strokeWidth={2.5} /> {inp}
                            </span>
                          ))}
                        </div>
                      </div>

                      {/* CTAs */}
                      <div style={{ display: "flex", gap: 8, marginTop: "auto" }}>
                        <Link
                          href={`/demo/${template.id}`}
                          data-testid={`demo-cta-${template.id}`}
                          style={{ display: "inline-flex", alignItems: "center", gap: 6, flex: 1, justifyContent: "center", padding: "9px 0", borderRadius: 8, background: C.sage, color: "#FFFFFF", fontSize: 13, fontWeight: 700, textDecoration: "none" }}
                        >
                          <Play size={11} fill="currentColor" /> Try live demo
                        </Link>
                        <Link
                          href="/Wizard"
                          data-testid={`use-cta-${template.id}`}
                          style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "9px 14px", borderRadius: 8, background: "transparent", color: C.sage, fontSize: 13, fontWeight: 700, textDecoration: "none", border: `1.5px solid ${C.sage}` }}
                        >
                          Use <ArrowRight size={11} />
                        </Link>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <style>{`
            @media(max-width:900px){.templates-grid{grid-template-columns:1fr 1fr!important;}}
            @media(max-width:560px){.templates-grid{grid-template-columns:1fr!important;}}
          `}</style>
        </div>

        {/* CTA band */}
        <div style={{ background: `linear-gradient(135deg, ${C.sage} 0%, #1B4332 100%)`, padding: "96px 28px", textAlign: "center" }}>
          <div style={{ maxWidth: 640, margin: "0 auto" }}>
            <h2 style={{ fontSize: "clamp(26px, 3vw, 40px)", fontWeight: 800, color: "#FFFFFF", margin: "0 0 14px", letterSpacing: "-0.02em" }}>
              Not sure which template to use?
            </h2>
            <p style={{ fontSize: 17, color: "rgba(255,255,255,0.72)", margin: "0 0 36px", lineHeight: 1.65 }}>
              Our setup wizard recommends the best template for your trade, pricing model, and goals — then configures it for you.
            </p>
            <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
              <Link href="/Wizard" style={{ display: "inline-block", padding: "14px 32px", borderRadius: 10, background: "#FFFFFF", color: C.sage, fontSize: 16, fontWeight: 800, textDecoration: "none" }}>
                Get a Recommendation
              </Link>
              <Link href="/pricing" style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "14px 24px", borderRadius: 10, background: "transparent", color: "#FFFFFF", fontSize: 15, fontWeight: 600, textDecoration: "none", border: "1.5px solid rgba(255,255,255,0.3)" }}>
                View Pricing
              </Link>
            </div>
          </div>
        </div>

      </div>
    </MarketingLayout>
  );
}
