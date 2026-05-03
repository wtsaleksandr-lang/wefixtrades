/**
 * V5 — Apple-style monumental dark.
 * Aesthetic: massive typography, full-bleed sections, edge-to-edge, scroll storytelling.
 * Each section is one big idea. Maximum drama.
 */

import { Link } from "wouter";
import { ArrowRight, Phone } from "lucide-react";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { mkt } from "@/theme/tokens";
import { getProductBySlug } from "@/config/products";

const cfg = getProductBySlug("tradeline")!;

export default function TradeLineV5() {
  return (
    <MarketingLayout>
      <div style={{ background: "#000", color: "#fff", minHeight: "100vh", overflow: "hidden", fontFamily: "Inter, system-ui, sans-serif" }}>

        {/* HERO — full-bleed monumental */}
        <section style={{
          minHeight: "100vh",
          position: "relative",
          display: "flex", alignItems: "center", justifyContent: "center",
          padding: "120px 24px 80px",
          background: `radial-gradient(ellipse 80% 60% at 50% 0%, rgba(102,232,250,0.12) 0%, transparent 60%), #000`,
        }}>
          <div style={{ maxWidth: 1280, margin: "0 auto", textAlign: "center", position: "relative" }}>
            <div style={{ fontSize: 13, letterSpacing: "0.4em", textTransform: "uppercase", color: mkt.accent, marginBottom: 32, fontWeight: 600 }}>
              TradeLine
            </div>
            <h1 style={{
              fontSize: "clamp(72px, 12vw, 200px)",
              fontWeight: 700, lineHeight: 0.92,
              letterSpacing: "-0.06em",
              marginBottom: 32,
              color: "#fff",
            }}>
              Always<br />
              <span style={{
                background: `linear-gradient(180deg, #fff 0%, ${mkt.accent} 100%)`,
                WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text",
              }}>
                answered.
              </span>
            </h1>
            <p style={{ fontSize: "clamp(20px, 2.2vw, 28px)", lineHeight: 1.4, color: "rgba(255,255,255,0.7)", maxWidth: 720, margin: "0 auto 56px", letterSpacing: "-0.01em" }}>
              The 24/7 receptionist for trades. Picks up. Quotes. Books. Never sleeps.
            </p>
            <div style={{ display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap" }}>
              <Link href={cfg.primaryCTA.href} style={primaryCta}>{cfg.primaryCTA.label}</Link>
              <Link href={cfg.secondaryCTA!.href} style={secondaryCta}>{cfg.secondaryCTA!.label} <ArrowRight size={16} /></Link>
            </div>
            {/* Scroll indicator */}
            <div style={{ marginTop: 80, fontSize: 12, color: "rgba(255,255,255,0.4)", letterSpacing: "0.2em", textTransform: "uppercase" }}>Scroll ↓</div>
          </div>
        </section>

        {/* SECTION 1 — One Big Number */}
        <FullBleedSection bg="#000">
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: "clamp(160px, 20vw, 320px)", fontWeight: 800, lineHeight: 0.85, letterSpacing: "-0.07em", color: mkt.accent, marginBottom: 24 }}>
              24/7
            </div>
            <h2 style={{ fontSize: "clamp(36px, 5vw, 64px)", fontWeight: 600, letterSpacing: "-0.04em", lineHeight: 1.05, maxWidth: 900, margin: "0 auto" }}>
              Every minute of every day.<br />
              <span style={{ color: "rgba(255,255,255,0.5)" }}>Including the ones you're not awake for.</span>
            </h2>
          </div>
        </FullBleedSection>

        {/* SECTION 2 — Quote that books itself */}
        <FullBleedSection bg="linear-gradient(180deg, #000 0%, #0a0a0a 100%)">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 80, alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 13, letterSpacing: "0.3em", textTransform: "uppercase", color: mkt.accent, marginBottom: 24, fontWeight: 600 }}>
                Instant pricing
              </div>
              <h2 style={{ fontSize: "clamp(48px, 6vw, 88px)", fontWeight: 700, letterSpacing: "-0.05em", lineHeight: 0.95, marginBottom: 32 }}>
                Quotes<br />itself.<br />
                <span style={{ color: mkt.accent }}>Books itself.</span>
              </h2>
              <p style={{ fontSize: 19, lineHeight: 1.55, color: "rgba(255,255,255,0.7)", maxWidth: 460 }}>
                Configure your pricing once — flat, hourly, tiered. TradeLine quotes every caller using your real numbers. No transfers. No callbacks. No lost leads.
              </p>
            </div>
            {/* Quote card visual */}
            <div style={{ position: "relative" }}>
              <div style={{
                background: "linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0.01))",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 24, padding: 40,
                backdropFilter: "blur(20px)",
              }}>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginBottom: 12, fontFamily: "monospace" }}>ESTIMATE_2847</div>
                <div style={{ fontSize: 14, color: "rgba(255,255,255,0.6)", marginBottom: 24 }}>Drain unblock — kitchen sink, 78704</div>
                <div style={{ fontSize: "clamp(56px, 6vw, 96px)", fontWeight: 700, lineHeight: 1, letterSpacing: "-0.04em", marginBottom: 16, color: mkt.accent }}>$185</div>
                <div style={{ fontSize: 14, color: "rgba(255,255,255,0.4)", marginBottom: 32 }}>– $240 with parts</div>
                <div style={{ display: "flex", gap: 8 }}>
                  <div style={{ flex: 1, padding: "12px 16px", borderRadius: 10, background: mkt.accent, color: "#000", fontSize: 14, fontWeight: 600, textAlign: "center" }}>Confirm & dispatch</div>
                </div>
                <div style={{ marginTop: 16, fontSize: 12, color: "#10B981", textAlign: "center" }}>✓ Tech ETA: 41 min</div>
              </div>
            </div>
          </div>
        </FullBleedSection>

        {/* SECTION 3 — Big stack of features as monumental statements */}
        <FullBleedSection bg="#000" pad="160px 24px">
          <div style={{ maxWidth: 1100, margin: "0 auto" }}>
            <div style={{ fontSize: 13, letterSpacing: "0.3em", textTransform: "uppercase", color: mkt.accent, marginBottom: 24, fontWeight: 600, textAlign: "center" }}>
              Capabilities
            </div>
            <h2 style={{ fontSize: "clamp(48px, 6.5vw, 96px)", fontWeight: 700, letterSpacing: "-0.05em", lineHeight: 0.95, marginBottom: 80, textAlign: "center" }}>
              Six things that<br />
              <span style={{ color: "rgba(255,255,255,0.5)" }}>used to need a person.</span>
            </h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
              {cfg.highlights.map((h, i) => {
                const [title, desc] = h.split(" — ");
                return (
                  <div key={i} style={{
                    display: "grid", gridTemplateColumns: "auto 1fr 1fr", gap: 40, alignItems: "baseline",
                    padding: "40px 0",
                    borderTop: i === 0 ? "1px solid rgba(255,255,255,0.08)" : undefined,
                    borderBottom: "1px solid rgba(255,255,255,0.08)",
                  }}>
                    <div style={{ fontSize: 14, color: mkt.accent, fontFamily: "monospace", fontWeight: 600 }}>0{i + 1}</div>
                    <h3 style={{ fontSize: "clamp(24px, 3vw, 44px)", fontWeight: 700, letterSpacing: "-0.03em", lineHeight: 1.05 }}>{title}</h3>
                    <p style={{ fontSize: 16, lineHeight: 1.55, color: "rgba(255,255,255,0.6)" }}>{desc}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </FullBleedSection>

        {/* SECTION 4 — Outcomes split */}
        <FullBleedSection bg="linear-gradient(180deg, #000 0%, #050505 100%)">
          <div style={{ textAlign: "center", marginBottom: 80 }}>
            <h2 style={{ fontSize: "clamp(48px, 7vw, 112px)", fontWeight: 700, letterSpacing: "-0.05em", lineHeight: 0.95 }}>
              The result?
            </h2>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 24 }}>
            {cfg.outcomes.map((o) => (
              <div key={o.title} style={{
                padding: 48,
                background: "rgba(255,255,255,0.02)",
                border: "1px solid rgba(255,255,255,0.06)",
                borderRadius: 24,
              }}>
                <h3 style={{ fontSize: 32, fontWeight: 700, letterSpacing: "-0.03em", marginBottom: 16, lineHeight: 1.05 }}>{o.title}</h3>
                <p style={{ fontSize: 16, lineHeight: 1.55, color: "rgba(255,255,255,0.65)" }}>{o.desc}</p>
              </div>
            ))}
          </div>
        </FullBleedSection>

        {/* FINAL CTA — full-bleed dramatic */}
        <FullBleedSection bg={`radial-gradient(ellipse 80% 80% at 50% 50%, rgba(102,232,250,0.10) 0%, transparent 70%), #000`} pad="200px 24px">
          <div style={{ textAlign: "center" }}>
            <h2 style={{ fontSize: "clamp(64px, 10vw, 160px)", fontWeight: 700, letterSpacing: "-0.06em", lineHeight: 0.92, marginBottom: 48 }}>
              Get it.<br />
              <span style={{ color: mkt.accent }}>Live tonight.</span>
            </h2>
            <Link href={cfg.primaryCTA.href} style={{ ...primaryCta, fontSize: 18, padding: "20px 40px" }}>
              {cfg.primaryCTA.label}
            </Link>
            <p style={{ marginTop: 32, fontSize: 14, color: "rgba(255,255,255,0.4)" }}>5-minute setup · No card required · Cancel anytime</p>
          </div>
        </FullBleedSection>
      </div>
    </MarketingLayout>
  );
}

function FullBleedSection({ children, bg, pad = "120px 24px" }: { children: React.ReactNode; bg: string; pad?: string }) {
  return (
    <section style={{ background: bg, padding: pad, position: "relative" }}>
      <div style={{ maxWidth: 1280, margin: "0 auto" }}>
        {children}
      </div>
    </section>
  );
}

const primaryCta: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 8,
  padding: "16px 32px", borderRadius: 999,
  background: "#fff", color: "#000", fontSize: 16, fontWeight: 600,
  textDecoration: "none", letterSpacing: "-0.01em",
};

const secondaryCta: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 8,
  padding: "16px 28px", borderRadius: 999,
  background: "transparent", color: "#fff", fontSize: 16, fontWeight: 500,
  textDecoration: "none", border: "1px solid rgba(255,255,255,0.2)",
};
