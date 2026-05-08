/**
 * V2 — Vercel-inspired geometric dark.
 * Aesthetic: black bg, sharp typography, geometric divider lines, monospace accents.
 * Hero: split layout with stat callouts. Heavy use of grid lines and badges.
 */

import { Link } from "wouter";
import { ArrowUpRight, Phone, Zap, ShieldCheck, Clock, TrendingUp, Bot } from "lucide-react";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { mkt } from "@/theme/tokens";
import { getProductBySlug } from "@/config/products";

const cfg = getProductBySlug("tradeline")!;
const ICONS = [Phone, Zap, Clock, ShieldCheck, TrendingUp, Bot];

const BLACK = "#0a0a0a";
const PANEL = "#111";
const LINE = "rgba(255,255,255,0.06)";
const LINE_BRIGHT = "rgba(255,255,255,0.12)";

export default function TradeLineV2() {
  return (
    <MarketingLayout>
      <div style={{ background: BLACK, color: "#fff", minHeight: "100vh", fontFamily: "Inter, system-ui, sans-serif" }}>
        {/* HERO with bordered grid frame */}
        <section style={{ position: "relative", borderBottom: `1px solid ${LINE}` }}>
          <div style={{ maxWidth: 1280, margin: "0 auto", padding: "120px 24px 80px", position: "relative" }}>
            {/* Corner crosshairs */}
            <Crosshair pos="tl" />
            <Crosshair pos="tr" />

            <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 720px) 1fr", gap: 60, alignItems: "end" }}>
              <div>
                <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, letterSpacing: "0.1em", color: mkt.accent, marginBottom: 20, textTransform: "uppercase" }}>
                  /// 24/7 TradeLine v2.4
                </div>
                <h1 style={{
                  fontSize: "clamp(56px, 7vw, 96px)", fontWeight: 700, lineHeight: 0.95,
                  letterSpacing: "-0.05em", marginBottom: 28,
                }}>
                  The phone that <span style={{ fontFamily: "Georgia, serif", fontWeight: 400, fontStyle: "italic", color: mkt.accent }}>never sleeps.</span>
                </h1>
                <p style={{ fontSize: 18, lineHeight: 1.55, color: "rgba(255,255,255,0.6)", maxWidth: 540, marginBottom: 40 }}>
                  AI answers every call, quotes every job, books every appointment. While you're driving, on a job site, or asleep.
                </p>
                <div style={{ display: "flex", gap: 12 }}>
                  <Link href={cfg.primaryCTA.href} style={ctaPrimary}>{cfg.primaryCTA.label}<ArrowUpRight size={16} /></Link>
                  <Link href={cfg.secondaryCTA!.href} style={ctaGhost}>{cfg.secondaryCTA!.label}</Link>
                </div>
              </div>

              {/* Stat panel — right side */}
              <div style={{ borderLeft: `1px solid ${LINE}`, paddingLeft: 32, display: "flex", flexDirection: "column", gap: 24 }}>
                <Stat label="Calls answered" value="100%" suffix="while you're on the job" />
                <Stat label="Avg booking time" value="< 2 min" suffix="caller to confirmed" />
                <Stat label="Replaces" value="$240/mo" suffix="answering service cost" />
              </div>
            </div>
          </div>
        </section>

        {/* HOW IT WORKS — horizontal flow */}
        <section style={{ borderBottom: `1px solid ${LINE}` }}>
          <div style={{ maxWidth: 1280, margin: "0 auto", padding: "100px 24px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 64 }}>
              <h2 style={{ fontSize: "clamp(36px, 4vw, 52px)", fontWeight: 700, letterSpacing: "-0.04em", lineHeight: 1.05 }}>
                Three steps. Then it just runs.
              </h2>
              <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: "rgba(255,255,255,0.4)", letterSpacing: "0.1em", textTransform: "uppercase" }}>03 STEPS</div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 0, border: `1px solid ${LINE}`, borderRadius: 16, overflow: "hidden" }}>
              {cfg.howItWorks.map((s, i) => (
                <div key={s.title} style={{
                  padding: 40,
                  borderRight: i < cfg.howItWorks.length - 1 ? `1px solid ${LINE}` : undefined,
                  background: PANEL, position: "relative",
                }}>
                  <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: mkt.accent, letterSpacing: "0.1em", marginBottom: 32 }}>
                    STEP_0{i + 1}
                  </div>
                  <h3 style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em", marginBottom: 12 }}>{s.title}</h3>
                  <p style={{ fontSize: 14, lineHeight: 1.6, color: "rgba(255,255,255,0.55)" }}>{s.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* FEATURES — 6 cell technical grid */}
        <section style={{ borderBottom: `1px solid ${LINE}` }}>
          <div style={{ maxWidth: 1280, margin: "0 auto", padding: "100px 24px" }}>
            <div style={{ marginBottom: 56, maxWidth: 600 }}>
              <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, letterSpacing: "0.1em", color: mkt.accent, marginBottom: 16, textTransform: "uppercase" }}>
                /// CAPABILITIES
              </div>
              <h2 style={{ fontSize: "clamp(36px, 4vw, 52px)", fontWeight: 700, letterSpacing: "-0.04em", lineHeight: 1.05 }}>
                Everything a great front desk does.<br />
                <span style={{ color: "rgba(255,255,255,0.4)" }}>Without the front desk.</span>
              </h2>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 0, border: `1px solid ${LINE}`, borderRadius: 16, overflow: "hidden" }}>
              {cfg.highlights.map((h, i) => {
                const Icon = ICONS[i % ICONS.length];
                const [title, desc] = h.split(" — ");
                return (
                  <div key={i} style={{
                    padding: 32, background: PANEL,
                    borderRight: (i % 3 !== 2) ? `1px solid ${LINE}` : undefined,
                    borderBottom: i < 3 ? `1px solid ${LINE}` : undefined,
                  }}>
                    <Icon size={20} color={mkt.accent} style={{ marginBottom: 24 }} />
                    <h3 style={{ fontSize: 16, fontWeight: 700, letterSpacing: "-0.01em", marginBottom: 8 }}>{title}</h3>
                    <p style={{ fontSize: 13, lineHeight: 1.55, color: "rgba(255,255,255,0.55)" }}>{desc}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* OUTCOMES — big numbers */}
        <section style={{ borderBottom: `1px solid ${LINE}`, background: PANEL }}>
          <div style={{ maxWidth: 1280, margin: "0 auto", padding: "100px 24px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1.4fr repeat(4, 1fr)", gap: 0, alignItems: "stretch" }}>
              <div style={{ paddingRight: 40 }}>
                <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, letterSpacing: "0.1em", color: mkt.accent, marginBottom: 16, textTransform: "uppercase" }}>
                  Outcomes
                </div>
                <h2 style={{ fontSize: 36, fontWeight: 700, letterSpacing: "-0.04em", lineHeight: 1.1 }}>
                  Every call captured. Every quote sent. Every review asked.
                </h2>
              </div>
              {cfg.outcomes.map((o) => (
                <div key={o.title} style={{
                  padding: "0 24px", borderLeft: `1px solid ${LINE_BRIGHT}`,
                  display: "flex", flexDirection: "column", justifyContent: "space-between",
                }}>
                  <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, letterSpacing: "-0.01em" }}>{o.title}</div>
                  <div style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", lineHeight: 1.5 }}>{o.desc}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section>
          <div style={{ maxWidth: 1280, margin: "0 auto", padding: "120px 24px", textAlign: "center", position: "relative" }}>
            <Crosshair pos="tl" />
            <Crosshair pos="tr" />
            <Crosshair pos="bl" />
            <Crosshair pos="br" />
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, letterSpacing: "0.1em", color: mkt.accent, marginBottom: 24, textTransform: "uppercase" }}>
              /// READY?
            </div>
            <h2 style={{ fontSize: "clamp(48px, 6vw, 80px)", fontWeight: 700, lineHeight: 1, letterSpacing: "-0.04em", marginBottom: 32 }}>
              Pick up every call.<br />
              <span style={{ fontFamily: "Georgia, serif", fontWeight: 400, fontStyle: "italic", color: mkt.accent }}>Starting tonight.</span>
            </h2>
            <Link href={cfg.primaryCTA.href} style={{
              ...ctaPrimary, fontSize: 16, padding: "18px 36px",
            }}>
              {cfg.primaryCTA.label} <ArrowUpRight size={18} />
            </Link>
          </div>
        </section>
      </div>
    </MarketingLayout>
  );
}

const ctaPrimary: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 8,
  padding: "12px 22px", borderRadius: 8,
  background: "#fff", color: "#0a0a0a", fontSize: 14, fontWeight: 600,
  textDecoration: "none", letterSpacing: "-0.01em",
  border: "1px solid rgba(0,0,0,0.1)",
};

const ctaGhost: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 8,
  padding: "12px 22px", borderRadius: 8,
  background: "transparent", color: "#fff", fontSize: 14, fontWeight: 500,
  textDecoration: "none", border: `1px solid ${LINE_BRIGHT}`,
};

function Stat({ label, value, suffix }: { label: string; value: string; suffix: string }) {
  return (
    <div>
      <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, letterSpacing: "0.1em", color: "rgba(255,255,255,0.4)", textTransform: "uppercase", marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 40, fontWeight: 700, letterSpacing: "-0.04em", lineHeight: 1, marginBottom: 6 }}>{value}</div>
      <div style={{ fontSize: 13, color: "rgba(255,255,255,0.55)" }}>{suffix}</div>
    </div>
  );
}

function Crosshair({ pos }: { pos: "tl" | "tr" | "bl" | "br" }) {
  const isLeft = pos.includes("l");
  const isTop = pos.includes("t");
  return (
    <div style={{
      position: "absolute",
      [isTop ? "top" : "bottom"]: 16,
      [isLeft ? "left" : "right"]: 16,
      width: 12, height: 12, pointerEvents: "none",
    } as React.CSSProperties}>
      <div style={{ position: "absolute", inset: 0, borderTop: isTop ? `1px solid ${mkt.accent}` : undefined, borderBottom: !isTop ? `1px solid ${mkt.accent}` : undefined, borderLeft: isLeft ? `1px solid ${mkt.accent}` : undefined, borderRight: !isLeft ? `1px solid ${mkt.accent}` : undefined }} />
    </div>
  );
}
