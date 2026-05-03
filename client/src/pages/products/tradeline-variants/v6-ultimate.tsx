/**
 * V6 — ULTIMATE MASTER TEMPLATE
 * Merge of V1 (Linear Dark) + V4 (Stripe Light), with deliberately alternating
 * dark/light sections to create visual rhythm. This is the template that will
 * scale to all 12 product pages.
 *
 * Section rhythm:
 *   1. HERO              dark    — chat/demo mockup on right (THE killer visual)
 *   2. TRUST STRIP       dark    — continuation
 *   3. OUTCOMES          LIGHT   — 4 soft-shadow cards
 *   4. SECONDARY DEMO    LIGHT   — full dashboard mockup
 *   5. SIX THINGS        dark    — terminal-style highlights
 *   6. HOW IT WORKS      LIGHT   — connecting-line numbered circles
 *   7. FINAL CTA         dark    — gradient closer
 *
 * Demo placeholders use <DemoSlot/> so an animated version can swap in
 * without touching the rest of the page. See docs/product-demo-simulations.md
 * for the per-product demo spec.
 */

import type { ReactNode } from "react";
import { Link } from "wouter";
import { ArrowRight, Phone, MessageSquare, Star, Check, Sparkles, Calendar, Zap } from "lucide-react";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { mkt } from "@/theme/tokens";
import { getProductBySlug } from "@/config/products";

const cfg = getProductBySlug("tradeline")!;

/* ─── Light mode palette (Stripe-inspired) ─── */
const LIGHT = {
  bg: "#FAFAFA",
  surface: "#FFFFFF",
  ink: "#0F172A",
  muted: "#475569",
  faint: "#94A3B8",
  border: "#E2E8F0",
  accent: "#635BFF",
  accentTint: "#EEF2FF",
};

/* ─── Dark mode palette (your existing mkt tokens) ─── */
const DARK = {
  bg: mkt.bg,
  surface: mkt.dark,
  ink: mkt.onDark,
  muted: mkt.onDarkMuted,
  faint: mkt.onDarkFaint,
  border: mkt.onDarkBorder,
  accent: mkt.accent,
};

export default function TradeLineV6() {
  return (
    <MarketingLayout>
      <div style={{ fontFamily: "Inter, system-ui, sans-serif" }}>
        <Hero />
        <TrustStrip />
        <Outcomes />
        <SecondaryDemo />
        <SixThings />
        <HowItWorks />
        <FinalCta />
      </div>
    </MarketingLayout>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   1. HERO  (DARK)
   ═══════════════════════════════════════════════════════════════════ */
function Hero() {
  return (
    <section style={{
      background: DARK.bg, color: DARK.ink,
      position: "relative", overflow: "hidden",
      padding: "140px 24px 100px",
      borderBottom: `1px solid ${DARK.border}`,
    }}>
      {/* Gradient mesh */}
      <div style={{
        position: "absolute", inset: 0,
        background: `
          radial-gradient(ellipse 80% 60% at 50% 0%, rgba(102,232,250,0.10) 0%, transparent 60%),
          radial-gradient(ellipse 60% 80% at 100% 50%, rgba(102,232,250,0.06) 0%, transparent 60%),
          radial-gradient(ellipse 60% 80% at 0% 70%, rgba(47,107,255,0.05) 0%, transparent 60%)
        `,
        pointerEvents: "none",
      }} />
      {/* Grid overlay */}
      <div style={{
        position: "absolute", inset: 0,
        backgroundImage: `linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)`,
        backgroundSize: "48px 48px",
        maskImage: "radial-gradient(ellipse 80% 60% at 50% 30%, black 0%, transparent 70%)",
        pointerEvents: "none",
      }} />

      <div style={{ maxWidth: 1180, margin: "0 auto", position: "relative", display: "grid", gridTemplateColumns: "1.1fr 1fr", gap: 80, alignItems: "center" }} className="hero-grid-fix">
        <div>
          <Badge>
            <Sparkles size={12} /> Always-On Lead Handling
          </Badge>
          <h1 style={{
            fontSize: "clamp(48px, 6vw, 72px)", fontWeight: 700, lineHeight: 1.02,
            letterSpacing: "-0.04em", color: DARK.ink, marginBottom: 24,
          }}>
            Never miss<br />
            a lead<br />
            <span style={{ color: DARK.accent }}>again.</span>
          </h1>
          <p style={{ fontSize: 18, lineHeight: 1.55, color: DARK.muted, marginBottom: 40, maxWidth: 480 }}>
            TradeLine answers calls and chats 24/7, gives instant estimates, books jobs, and follows up — automatically. No voicemail. No missed revenue.
          </p>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <Link href={cfg.primaryCTA.href} style={ctaPrimaryDark}>
              {cfg.primaryCTA.label} <ArrowRight size={16} />
            </Link>
            <Link href={cfg.secondaryCTA!.href} style={ctaGhostDark}>
              {cfg.secondaryCTA!.label}
            </Link>
          </div>
          <div style={{ marginTop: 40, display: "flex", alignItems: "center", gap: 16, fontSize: 13, color: DARK.faint }}>
            <div style={{ display: "flex", gap: 2 }}>
              {[1, 2, 3, 4, 5].map(i => <Star key={i} size={13} fill={DARK.accent} stroke={DARK.accent} />)}
            </div>
            <span>4.9 / 5 — 240+ trades businesses</span>
          </div>
        </div>

        <DemoSlot product="tradeline" placement="hero">
          <ChatMockup />
        </DemoSlot>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   2. TRUST STRIP  (DARK)
   ═══════════════════════════════════════════════════════════════════ */
function TrustStrip() {
  return (
    <section style={{ background: DARK.bg, padding: "48px 24px", borderBottom: `1px solid ${DARK.border}` }}>
      <div style={{ maxWidth: 1180, margin: "0 auto" }}>
        <p style={{ textAlign: "center", fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: DARK.faint, marginBottom: 24 }}>
          Powering trades businesses across
        </p>
        <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 24, alignItems: "center", maxWidth: 880, margin: "0 auto" }}>
          {cfg.bestFor.map(t => (
            <span key={t} style={{ fontSize: 14, fontWeight: 500, color: DARK.muted, fontFamily: "'DM Mono', monospace" }}>{t}</span>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   3. OUTCOMES  (LIGHT)
   ═══════════════════════════════════════════════════════════════════ */
function Outcomes() {
  const icons = [Phone, Zap, MessageSquare, Star];
  return (
    <section style={{ background: LIGHT.bg, color: LIGHT.ink, padding: "120px 24px" }}>
      <div style={{ maxWidth: 1180, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 64 }}>
          <p style={{ fontSize: 13, fontWeight: 600, color: LIGHT.accent, marginBottom: 14 }}>The result</p>
          <h2 style={{ fontSize: "clamp(36px, 4.5vw, 56px)", fontWeight: 700, lineHeight: 1.05, letterSpacing: "-0.03em", maxWidth: 720, margin: "0 auto" }}>
            Quote, capture, follow up.<br />
            <span style={{ color: LIGHT.muted }}>Without you lifting a finger.</span>
          </h2>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 20 }} className="outcomes-grid-fix">
          {cfg.outcomes.map((o, i) => {
            const Icon = icons[i % icons.length];
            return (
              <div key={o.title} style={{
                background: LIGHT.surface,
                borderRadius: 16, padding: 28,
                border: `1px solid ${LIGHT.border}`,
                boxShadow: "0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02)",
              }}>
                <div style={{ width: 44, height: 44, borderRadius: 12, background: LIGHT.accentTint, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 20 }}>
                  <Icon size={20} color={LIGHT.accent} />
                </div>
                <h3 style={{ fontSize: 17, fontWeight: 600, marginBottom: 8, letterSpacing: "-0.01em" }}>{o.title}</h3>
                <p style={{ fontSize: 14, lineHeight: 1.55, color: LIGHT.muted }}>{o.desc}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   4. SECONDARY DEMO  (LIGHT)
   ═══════════════════════════════════════════════════════════════════ */
function SecondaryDemo() {
  return (
    <section style={{ background: LIGHT.bg, padding: "0 24px 120px" }}>
      <div style={{ maxWidth: 1180, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 56 }}>
          <p style={{ fontSize: 13, fontWeight: 600, color: LIGHT.accent, marginBottom: 14 }}>Your dashboard</p>
          <h2 style={{ fontSize: "clamp(32px, 4vw, 48px)", fontWeight: 700, lineHeight: 1.1, letterSpacing: "-0.03em", color: LIGHT.ink, maxWidth: 680, margin: "0 auto" }}>
            Every conversation in one inbox.
          </h2>
        </div>
        <DemoSlot product="tradeline" placement="dashboard">
          <DashboardMockup />
        </DemoSlot>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   5. SIX THINGS  (DARK)
   ═══════════════════════════════════════════════════════════════════ */
function SixThings() {
  return (
    <section style={{ background: DARK.bg, color: DARK.ink, padding: "120px 24px", borderTop: `1px solid ${DARK.border}`, borderBottom: `1px solid ${DARK.border}` }}>
      <div style={{ maxWidth: 1180, margin: "0 auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 60, alignItems: "start" }} className="sixthings-grid-fix">
          <div style={{ position: "sticky", top: 100 }}>
            <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: DARK.accent, marginBottom: 16 }}>Capabilities</p>
            <h2 style={{ fontSize: "clamp(32px, 3.6vw, 44px)", fontWeight: 700, lineHeight: 1.08, letterSpacing: "-0.03em", color: DARK.ink, marginBottom: 24 }}>
              Six things that used to need a person.
            </h2>
            <p style={{ fontSize: 16, lineHeight: 1.6, color: DARK.muted }}>
              Each one saves you calls, time, and lost revenue. Together they replace an after-hours answering service at a fraction of the cost.
            </p>
          </div>
          <div style={{
            background: DARK.surface, borderRadius: 16, border: `1px solid ${DARK.border}`,
            padding: "8px 0", overflow: "hidden", boxShadow: "0 24px 60px rgba(0,0,0,0.5)",
          }}>
            <div style={{ padding: "12px 20px", borderBottom: `1px solid ${DARK.border}`, display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#FF5F57" }} />
              <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#FEBC2E" }} />
              <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#28C840" }} />
              <span style={{ marginLeft: 12, fontSize: 12, fontFamily: "monospace", color: DARK.faint }}>tradeline.config.ts</span>
            </div>
            {cfg.highlights.map((h, i) => {
              const [title, desc] = h.split(" — ");
              return (
                <div key={i} style={{ padding: "18px 24px", borderBottom: i < cfg.highlights.length - 1 ? `1px solid ${DARK.border}` : undefined, display: "flex", gap: 14, alignItems: "flex-start" }}>
                  <Check size={16} color={DARK.accent} style={{ marginTop: 3, flexShrink: 0 }} />
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: DARK.ink, marginBottom: 4 }}>{title}</div>
                    <div style={{ fontSize: 13, lineHeight: 1.55, color: DARK.muted }}>{desc}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   6. HOW IT WORKS  (LIGHT)
   ═══════════════════════════════════════════════════════════════════ */
function HowItWorks() {
  return (
    <section style={{ background: LIGHT.bg, color: LIGHT.ink, padding: "120px 24px" }}>
      <div style={{ maxWidth: 1180, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 80 }}>
          <p style={{ fontSize: 13, fontWeight: 600, color: LIGHT.accent, marginBottom: 14 }}>Setup</p>
          <h2 style={{ fontSize: "clamp(36px, 4.5vw, 56px)", fontWeight: 700, lineHeight: 1.05, letterSpacing: "-0.03em" }}>
            Three steps. Live in minutes.
          </h2>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 24, position: "relative" }} className="howitworks-grid-fix">
          <div style={{ position: "absolute", top: 32, left: "16.6%", right: "16.6%", height: 1, background: LIGHT.border, zIndex: 0 }} className="howitworks-line-fix" />
          {cfg.howItWorks.map((s, i) => (
            <div key={s.title} style={{ position: "relative", zIndex: 1, textAlign: "center" }}>
              <div style={{
                width: 64, height: 64, borderRadius: "50%",
                background: LIGHT.surface, border: `2px solid ${LIGHT.accent}`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 22, fontWeight: 700, color: LIGHT.accent, margin: "0 auto 24px",
                boxShadow: "0 4px 12px rgba(99,91,255,0.18)",
              }}>
                {i + 1}
              </div>
              <h3 style={{ fontSize: 19, fontWeight: 600, marginBottom: 10, letterSpacing: "-0.01em" }}>{s.title}</h3>
              <p style={{ fontSize: 15, lineHeight: 1.6, color: LIGHT.muted, maxWidth: 320, margin: "0 auto" }}>{s.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   7. FINAL CTA  (DARK)
   ═══════════════════════════════════════════════════════════════════ */
function FinalCta() {
  return (
    <section style={{ background: DARK.bg, padding: "120px 24px" }}>
      <div style={{
        maxWidth: 1180, margin: "0 auto",
        padding: "80px 40px",
        borderRadius: 24, textAlign: "center",
        background: `linear-gradient(135deg, ${DARK.surface} 0%, #0a1418 100%)`,
        color: DARK.ink, position: "relative", overflow: "hidden",
        border: `1px solid ${DARK.border}`,
      }}>
        <div style={{ position: "absolute", top: -100, right: -100, width: 400, height: 400, background: `radial-gradient(circle, ${DARK.accent}33 0%, transparent 70%)`, pointerEvents: "none" }} />
        <h2 style={{ fontSize: "clamp(36px, 4.5vw, 56px)", fontWeight: 700, lineHeight: 1.05, letterSpacing: "-0.03em", marginBottom: 20, position: "relative" }}>
          Stop missing calls.<br />
          <span style={{ color: DARK.accent }}>Start booking jobs.</span>
        </h2>
        <p style={{ fontSize: 17, color: DARK.muted, marginBottom: 32, position: "relative" }}>
          Setup is 5 minutes. No card required. Cancel anytime.
        </p>
        <Link href={cfg.primaryCTA.href} style={{ ...ctaPrimaryDark, fontSize: 16, padding: "16px 32px", position: "relative" }}>
          {cfg.primaryCTA.label} <ArrowRight size={18} />
        </Link>
      </div>
    </section>
  );
}

/* ─── Shared bits ─── */

function Badge({ children }: { children: ReactNode }) {
  return (
    <div style={{
      display: "inline-flex", alignItems: "center", gap: 8,
      padding: "6px 14px", borderRadius: 999,
      background: "rgba(102,232,250,0.08)", border: `1px solid rgba(102,232,250,0.20)`,
      fontSize: 12, fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase",
      color: DARK.accent, marginBottom: 28,
    }}>{children}</div>
  );
}

const ctaPrimaryDark: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 8,
  padding: "14px 24px", borderRadius: 10,
  background: DARK.accent, color: mkt.dark, fontSize: 15, fontWeight: 700,
  textDecoration: "none", letterSpacing: "-0.01em",
};

const ctaGhostDark: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 8,
  padding: "14px 24px", borderRadius: 10,
  background: "rgba(255,255,255,0.05)", color: DARK.ink, fontSize: 15, fontWeight: 600,
  border: `1px solid ${DARK.border}`, textDecoration: "none",
};

/**
 * DemoSlot — the swap point for animated product simulations.
 *
 * Future agents replace `children` with the animated component for this product
 * + placement. See docs/product-demo-simulations.md for the per-product spec.
 *
 * Keeping this as a wrapper means animations can be swapped in product-by-product
 * without touching the template.
 */
function DemoSlot({ children }: { product: string; placement: "hero" | "dashboard"; children: ReactNode }) {
  return <>{children}</>;
}

/* ─── Static demo placeholders (will be replaced by animated versions) ─── */

function ChatMockup() {
  return (
    <div style={{ position: "relative" }}>
      <div style={{
        position: "absolute", inset: -40,
        background: "radial-gradient(ellipse, rgba(102,232,250,0.12) 0%, transparent 60%)",
        pointerEvents: "none", filter: "blur(40px)",
      }} />
      <div style={{
        position: "relative",
        background: DARK.surface, borderRadius: 20, border: `1px solid ${DARK.border}`,
        padding: 0, overflow: "hidden", boxShadow: "0 32px 80px rgba(0,0,0,0.5)",
      }}>
        <div style={{ padding: "16px 20px", borderBottom: `1px solid ${DARK.border}`, display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 36, height: 36, borderRadius: "50%", background: `linear-gradient(135deg, ${DARK.accent}, ${mkt.accentDark})`, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Phone size={16} color={mkt.dark} />
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: DARK.ink }}>TradeLine</div>
            <div style={{ fontSize: 11, color: mkt.success, display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: mkt.success, display: "inline-block" }} /> Live
            </div>
          </div>
        </div>
        <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 12, minHeight: 380 }}>
          <Bubble who="them" text="Hi! Looking for an emergency plumber. Burst pipe under the sink." />
          <Bubble who="us" text="Sorry to hear that — I can dispatch someone within 60 minutes. Can I grab your zip code and a number to text the ETA?" />
          <Bubble who="them" text="78704. (512) 555-0119" />
          <Bubble who="us" text="Got it. Estimated $185–$240 for emergency call-out plus parts. Tap to confirm and we'll send a tech." />
          <div style={{
            margin: "8px 0 0 36px",
            padding: "10px 14px",
            borderRadius: 10,
            background: DARK.accent, color: mkt.dark,
            fontSize: 13, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 8, alignSelf: "flex-start",
          }}>
            ✓ Booked — Tech ETA 41 min
          </div>
          <div style={{ marginTop: "auto", paddingTop: 12, borderTop: `1px solid ${DARK.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ fontSize: 11, color: DARK.faint, fontFamily: "monospace" }}>2:47 AM • Auto-handled</div>
            <div style={{ fontSize: 11, color: DARK.accent, fontWeight: 600 }}>+$185 captured</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Bubble({ who, text }: { who: "us" | "them"; text: string }) {
  const isUs = who === "us";
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "flex-start", flexDirection: isUs ? "row-reverse" : "row" }}>
      <div style={{
        width: 26, height: 26, borderRadius: "50%",
        background: isUs ? DARK.accent : "rgba(255,255,255,0.08)",
        display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
      }}>
        {isUs ? <Phone size={11} color={mkt.dark} /> : <MessageSquare size={11} color={DARK.muted} />}
      </div>
      <div style={{
        maxWidth: "75%",
        padding: "10px 14px",
        borderRadius: 14,
        background: isUs ? "rgba(102,232,250,0.10)" : "rgba(255,255,255,0.04)",
        border: `1px solid ${isUs ? "rgba(102,232,250,0.18)" : DARK.border}`,
        fontSize: 13, lineHeight: 1.5, color: DARK.ink,
      }}>
        {text}
      </div>
    </div>
  );
}

function DashboardMockup() {
  return (
    <div style={{ position: "relative", maxWidth: 1080, margin: "0 auto" }}>
      <div style={{
        background: LIGHT.surface, borderRadius: 16,
        boxShadow: "0 30px 80px rgba(15,23,42,0.18), 0 8px 24px rgba(15,23,42,0.08)",
        border: `1px solid ${LIGHT.border}`,
        overflow: "hidden", textAlign: "left",
      }}>
        <div style={{ padding: "12px 20px", borderBottom: `1px solid ${LIGHT.border}`, display: "flex", alignItems: "center", gap: 8, background: "#FBFBFB" }}>
          <div style={{ width: 12, height: 12, borderRadius: "50%", background: "#FF5F57" }} />
          <div style={{ width: 12, height: 12, borderRadius: "50%", background: "#FEBC2E" }} />
          <div style={{ width: 12, height: 12, borderRadius: "50%", background: "#28C840" }} />
          <div style={{ marginLeft: 16, fontSize: 12, color: LIGHT.faint }}>tradeline.app/calls</div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "240px 1fr", minHeight: 420 }}>
          <div style={{ padding: 16, borderRight: `1px solid ${LIGHT.border}`, background: "#FBFBFB" }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: LIGHT.faint, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 12, padding: "0 8px" }}>Today</div>
            {[
              { name: "Sarah K.", desc: "Burst pipe — 78704", time: "2:47 AM", booked: true },
              { name: "Mike R.", desc: "AC quote requested", time: "11:14 PM", booked: true },
              { name: "Unknown", desc: "Estimate, deck repaint", time: "8:33 PM", booked: false },
              { name: "Diana L.", desc: "Follow-up confirmed", time: "5:12 PM", booked: true },
            ].map((row, i) => (
              <div key={i} style={{ padding: 10, borderRadius: 8, marginBottom: 4, background: i === 0 ? LIGHT.accentTint : "transparent", borderLeft: i === 0 ? `3px solid ${LIGHT.accent}` : "3px solid transparent" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: LIGHT.ink }}>{row.name}</span>
                  <span style={{ fontSize: 10, color: LIGHT.faint, fontFamily: "monospace" }}>{row.time}</span>
                </div>
                <div style={{ fontSize: 11, color: LIGHT.muted, marginBottom: 4 }}>{row.desc}</div>
                {row.booked && <div style={{ fontSize: 10, color: "#10B981", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 3 }}><Check size={9} /> Booked</div>}
              </div>
            ))}
          </div>
          <div style={{ padding: 24 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 600, color: LIGHT.ink }}>Sarah Klein</div>
                <div style={{ fontSize: 12, color: LIGHT.faint, fontFamily: "monospace" }}>(512) 555-0119 • 2:47 AM</div>
              </div>
              <div style={{ padding: "4px 10px", borderRadius: 999, background: "#ECFDF5", color: "#059669", fontSize: 11, fontWeight: 600 }}>BOOKED</div>
            </div>
            <div style={{ marginBottom: 16, padding: 12, borderRadius: 10, background: LIGHT.bg, border: `1px solid ${LIGHT.border}` }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: LIGHT.faint, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>Issue</div>
              <div style={{ fontSize: 13, color: LIGHT.ink }}>Burst pipe under kitchen sink. Water is currently shut off.</div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
              <DStat label="Estimate" value="$185–$240" />
              <DStat label="Tech ETA" value="41 min" />
            </div>
            <div style={{ padding: 14, borderRadius: 10, background: LIGHT.accentTint, fontSize: 12, color: LIGHT.accent, fontWeight: 500, lineHeight: 1.5 }}>
              ✓ Quote sent to Sarah's phone<br />
              ✓ Tech dispatched (Mike, ETA 41 min)<br />
              ✓ Calendar event added · review request scheduled
            </div>
            <div style={{ marginTop: 16, padding: 12, borderRadius: 10, background: "#FBFBFB", border: `1px solid ${LIGHT.border}`, display: "flex", alignItems: "center", gap: 10 }}>
              <Calendar size={16} color={LIGHT.accent} />
              <div style={{ fontSize: 12, color: LIGHT.muted }}>Next follow-up: <span style={{ color: LIGHT.ink, fontWeight: 600 }}>Tomorrow 9:00 AM</span> — review request</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function DStat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ padding: 12, borderRadius: 10, background: LIGHT.bg, border: `1px solid ${LIGHT.border}` }}>
      <div style={{ fontSize: 11, color: LIGHT.faint, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700, fontFamily: "Inter", color: LIGHT.ink }}>{value}</div>
    </div>
  );
}
