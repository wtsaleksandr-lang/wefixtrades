/**
 * V4 — Stripe/Resend light premium (DIVERGENT from homepage).
 * Aesthetic: white/cream, generous whitespace, soft shadows, blue accent, large product mockup.
 * For the user who wants to escape the dark trend.
 */

import { Link } from "wouter";
import { ArrowRight, Phone, Check, MessageSquare, Calendar, Star, Zap } from "lucide-react";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { getProductBySlug } from "@/config/products";

const cfg = getProductBySlug("tradeline")!;

const BG = "#FAFAFA";
const SURFACE = "#FFFFFF";
const INK = "#0F172A";
const MUTED = "#475569";
const FAINT = "#94A3B8";
const BORDER = "#E2E8F0";
const ACCENT = "#635BFF"; // Stripe purple
const ACCENT_TINT = "#EEF2FF";

export default function TradeLineV4() {
  return (
    <MarketingLayout>
      <div style={{ background: BG, color: INK, minHeight: "100vh", fontFamily: "Inter, system-ui, sans-serif" }}>

        {/* HERO with floating gradient orb + product card */}
        <section style={{ position: "relative", overflow: "hidden", paddingTop: 120, paddingBottom: 100 }}>
          {/* Soft gradient backdrop */}
          <div style={{
            position: "absolute", top: -200, left: "50%", transform: "translateX(-50%)",
            width: 1400, height: 700,
            background: `radial-gradient(ellipse, ${ACCENT}22 0%, transparent 50%), radial-gradient(ellipse 60% 60% at 30% 50%, #06b6d422 0%, transparent 50%)`,
            filter: "blur(80px)", pointerEvents: "none",
          }} />
          <div style={{ maxWidth: 1180, margin: "0 auto", padding: "0 24px", position: "relative", textAlign: "center" }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 14px", borderRadius: 999, background: SURFACE, border: `1px solid ${BORDER}`, fontSize: 13, fontWeight: 500, color: MUTED, marginBottom: 32, boxShadow: "0 1px 2px rgba(0,0,0,0.04)" }}>
              <span style={{ width: 6, height: 6, background: "#10B981", borderRadius: "50%" }} />
              Live in 5 minutes — no card required
            </div>
            <h1 style={{ fontSize: "clamp(48px, 6.5vw, 80px)", fontWeight: 700, lineHeight: 1.0, letterSpacing: "-0.04em", maxWidth: 900, margin: "0 auto 28px" }}>
              The 24/7 receptionist<br />
              <span style={{ background: `linear-gradient(135deg, ${ACCENT}, #06b6d4)`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
                that pays for itself.
              </span>
            </h1>
            <p style={{ fontSize: 19, lineHeight: 1.55, color: MUTED, maxWidth: 600, margin: "0 auto 40px" }}>
              TradeLine answers every call, gives instant estimates, books jobs, and follows up — even at 2 AM. One missed call covers a month.
            </p>
            <div style={{ display: "flex", gap: 12, justifyContent: "center", marginBottom: 64 }}>
              <Link href={cfg.primaryCTA.href} style={{
                display: "inline-flex", alignItems: "center", gap: 8,
                padding: "14px 28px", borderRadius: 10,
                background: INK, color: "#fff", fontSize: 15, fontWeight: 600, textDecoration: "none",
                boxShadow: "0 4px 12px rgba(15,23,42,0.15), 0 1px 0 rgba(255,255,255,0.2) inset",
              }}>
                {cfg.primaryCTA.label} <ArrowRight size={16} />
              </Link>
              <Link href={cfg.secondaryCTA!.href} style={{
                display: "inline-flex", alignItems: "center", gap: 8,
                padding: "14px 28px", borderRadius: 10,
                background: SURFACE, color: INK, fontSize: 15, fontWeight: 600, textDecoration: "none",
                border: `1px solid ${BORDER}`, boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
              }}>
                {cfg.secondaryCTA!.label}
              </Link>
            </div>

            {/* Floating product card — dashboard mockup */}
            <DashboardMockup />
          </div>
        </section>

        {/* TRUST STRIP */}
        <section style={{ padding: "60px 24px", background: SURFACE, borderTop: `1px solid ${BORDER}`, borderBottom: `1px solid ${BORDER}` }}>
          <div style={{ maxWidth: 1180, margin: "0 auto" }}>
            <p style={{ textAlign: "center", fontSize: 13, color: FAINT, marginBottom: 24 }}>
              Used by 240+ trades businesses across 8 service categories
            </p>
            <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 24, alignItems: "center" }}>
              {cfg.bestFor.map(t => (
                <span key={t} style={{ fontSize: 14, fontWeight: 500, color: MUTED }}>{t}</span>
              ))}
            </div>
          </div>
        </section>

        {/* OUTCOMES — feature cards with soft shadows */}
        <section style={{ padding: "100px 24px" }}>
          <div style={{ maxWidth: 1180, margin: "0 auto" }}>
            <div style={{ textAlign: "center", marginBottom: 64 }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: ACCENT, marginBottom: 14 }}>Outcomes</p>
              <h2 style={{ fontSize: "clamp(36px, 4.5vw, 56px)", fontWeight: 700, lineHeight: 1.05, letterSpacing: "-0.03em", maxWidth: 720, margin: "0 auto" }}>
                Quote, book, follow up.<br />Without lifting a finger.
              </h2>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 20 }}>
              {cfg.outcomes.map((o, i) => {
                const icons = [Phone, Zap, MessageSquare, Star];
                const Icon = icons[i % icons.length];
                return (
                  <div key={o.title} style={{
                    background: SURFACE,
                    borderRadius: 16,
                    padding: 28,
                    border: `1px solid ${BORDER}`,
                    boxShadow: "0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02)",
                  }}>
                    <div style={{ width: 44, height: 44, borderRadius: 12, background: ACCENT_TINT, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 20 }}>
                      <Icon size={20} color={ACCENT} />
                    </div>
                    <h3 style={{ fontSize: 17, fontWeight: 600, marginBottom: 8, letterSpacing: "-0.01em" }}>{o.title}</h3>
                    <p style={{ fontSize: 14, lineHeight: 1.55, color: MUTED }}>{o.desc}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* HIGHLIGHTS — split layout: left text, right checked list */}
        <section style={{ padding: "100px 24px", background: SURFACE, borderTop: `1px solid ${BORDER}`, borderBottom: `1px solid ${BORDER}` }}>
          <div style={{ maxWidth: 1180, margin: "0 auto" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1.2fr", gap: 80, alignItems: "start" }}>
              <div style={{ position: "sticky", top: 100 }}>
                <p style={{ fontSize: 13, fontWeight: 600, color: ACCENT, marginBottom: 14 }}>What's included</p>
                <h2 style={{ fontSize: "clamp(32px, 4vw, 48px)", fontWeight: 700, lineHeight: 1.1, letterSpacing: "-0.03em", marginBottom: 24 }}>
                  Six things that used to need a person.
                </h2>
                <p style={{ fontSize: 16, lineHeight: 1.6, color: MUTED, marginBottom: 28 }}>
                  Each one saves time, captures revenue, or keeps customers from going to a competitor while you're on a job site.
                </p>
                <Link href={cfg.primaryCTA.href} style={{ display: "inline-flex", alignItems: "center", gap: 6, color: ACCENT, fontWeight: 600, fontSize: 15, textDecoration: "none" }}>
                  See how it works <ArrowRight size={16} />
                </Link>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                {cfg.highlights.map((h, i) => {
                  const [title, desc] = h.split(" — ");
                  return (
                    <div key={i} style={{ display: "flex", gap: 18, alignItems: "flex-start" }}>
                      <div style={{ width: 28, height: 28, borderRadius: 8, background: ACCENT_TINT, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        <Check size={14} color={ACCENT} strokeWidth={3} />
                      </div>
                      <div>
                        <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 4, letterSpacing: "-0.01em" }}>{title}</h3>
                        <p style={{ fontSize: 14, lineHeight: 1.55, color: MUTED }}>{desc}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        {/* HOW IT WORKS — numbered steps with connecting line */}
        <section style={{ padding: "100px 24px" }}>
          <div style={{ maxWidth: 1180, margin: "0 auto" }}>
            <div style={{ textAlign: "center", marginBottom: 80 }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: ACCENT, marginBottom: 14 }}>Setup</p>
              <h2 style={{ fontSize: "clamp(36px, 4.5vw, 56px)", fontWeight: 700, lineHeight: 1.05, letterSpacing: "-0.03em" }}>
                Three steps. Live in minutes.
              </h2>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 24, position: "relative" }}>
              {/* Connecting line */}
              <div style={{ position: "absolute", top: 32, left: "16.6%", right: "16.6%", height: 1, background: BORDER, zIndex: 0 }} />
              {cfg.howItWorks.map((s, i) => (
                <div key={s.title} style={{ position: "relative", zIndex: 1, textAlign: "center" }}>
                  <div style={{
                    width: 64, height: 64, borderRadius: "50%",
                    background: SURFACE, border: `2px solid ${ACCENT}`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 22, fontWeight: 700, color: ACCENT, margin: "0 auto 24px",
                    boxShadow: "0 4px 12px rgba(99,91,255,0.18)",
                  }}>
                    {i + 1}
                  </div>
                  <h3 style={{ fontSize: 19, fontWeight: 600, marginBottom: 10, letterSpacing: "-0.01em" }}>{s.title}</h3>
                  <p style={{ fontSize: 15, lineHeight: 1.6, color: MUTED, maxWidth: 320, margin: "0 auto" }}>{s.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section style={{ padding: "60px 24px 120px" }}>
          <div style={{
            maxWidth: 1180, margin: "0 auto",
            padding: "80px 40px",
            borderRadius: 24, textAlign: "center",
            background: `linear-gradient(135deg, ${INK} 0%, #1e293b 100%)`,
            color: "#fff",
            position: "relative", overflow: "hidden",
          }}>
            <div style={{ position: "absolute", top: -100, right: -100, width: 400, height: 400, background: `radial-gradient(circle, ${ACCENT}55 0%, transparent 70%)`, pointerEvents: "none" }} />
            <h2 style={{ fontSize: "clamp(36px, 4.5vw, 56px)", fontWeight: 700, lineHeight: 1.05, letterSpacing: "-0.03em", marginBottom: 20, position: "relative" }}>
              Stop missing calls. Start booking jobs.
            </h2>
            <p style={{ fontSize: 17, color: "rgba(255,255,255,0.7)", marginBottom: 32, position: "relative" }}>
              No credit card. Cancel anytime. Live in 5 minutes.
            </p>
            <Link href={cfg.primaryCTA.href} style={{
              display: "inline-flex", alignItems: "center", gap: 10,
              padding: "16px 32px", borderRadius: 10,
              background: "#fff", color: INK, fontSize: 16, fontWeight: 600, textDecoration: "none",
              position: "relative",
            }}>
              {cfg.primaryCTA.label} <ArrowRight size={18} />
            </Link>
          </div>
        </section>
      </div>
    </MarketingLayout>
  );
}

function DashboardMockup() {
  return (
    <div style={{ position: "relative", maxWidth: 960, margin: "0 auto" }}>
      <div style={{
        background: SURFACE, borderRadius: 16,
        boxShadow: "0 30px 80px rgba(15,23,42,0.18), 0 8px 24px rgba(15,23,42,0.08)",
        border: `1px solid ${BORDER}`,
        overflow: "hidden",
        textAlign: "left",
      }}>
        <div style={{ padding: "12px 20px", borderBottom: `1px solid ${BORDER}`, display: "flex", alignItems: "center", gap: 8, background: "#FBFBFB" }}>
          <div style={{ width: 12, height: 12, borderRadius: "50%", background: "#FF5F57" }} />
          <div style={{ width: 12, height: 12, borderRadius: "50%", background: "#FEBC2E" }} />
          <div style={{ width: 12, height: 12, borderRadius: "50%", background: "#28C840" }} />
          <div style={{ marginLeft: 16, fontSize: 12, color: FAINT }}>tradeline.app/calls</div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "240px 1fr", minHeight: 380 }}>
          {/* Sidebar */}
          <div style={{ padding: 16, borderRight: `1px solid ${BORDER}`, background: "#FBFBFB" }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: FAINT, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 12, padding: "0 8px" }}>Today</div>
            {[
              { name: "Sarah K.", desc: "Burst pipe — 78704", time: "2:47 AM", booked: true },
              { name: "Mike R.", desc: "AC quote requested", time: "11:14 PM", booked: true },
              { name: "Unknown", desc: "Estimate, deck repaint", time: "8:33 PM", booked: false },
              { name: "Diana L.", desc: "Follow-up confirmed", time: "5:12 PM", booked: true },
            ].map((row, i) => (
              <div key={i} style={{ padding: 10, borderRadius: 8, marginBottom: 4, background: i === 0 ? ACCENT_TINT : "transparent", borderLeft: i === 0 ? `3px solid ${ACCENT}` : "3px solid transparent" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{row.name}</span>
                  <span style={{ fontSize: 10, color: FAINT, fontFamily: "monospace" }}>{row.time}</span>
                </div>
                <div style={{ fontSize: 11, color: MUTED, marginBottom: 4 }}>{row.desc}</div>
                {row.booked && <div style={{ fontSize: 10, color: "#10B981", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 3 }}><Check size={9} /> Booked</div>}
              </div>
            ))}
          </div>
          {/* Main */}
          <div style={{ padding: 24 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 600 }}>Sarah Klein</div>
                <div style={{ fontSize: 12, color: FAINT, fontFamily: "monospace" }}>(512) 555-0119 • 2:47 AM</div>
              </div>
              <div style={{ padding: "4px 10px", borderRadius: 999, background: "#ECFDF5", color: "#059669", fontSize: 11, fontWeight: 600 }}>BOOKED</div>
            </div>
            <div style={{ marginBottom: 16, padding: 12, borderRadius: 10, background: BG, border: `1px solid ${BORDER}` }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: FAINT, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>Issue</div>
              <div style={{ fontSize: 13, color: INK }}>Burst pipe under kitchen sink. Water is currently shut off.</div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
              <Stat2 label="Estimate" value="$185–$240" />
              <Stat2 label="Tech ETA" value="41 min" />
            </div>
            <div style={{ padding: 14, borderRadius: 10, background: ACCENT_TINT, fontSize: 12, color: ACCENT, fontWeight: 500, lineHeight: 1.5 }}>
              ✓ Quote sent to Sarah's phone<br />
              ✓ Tech dispatched (Mike, ETA 41 min)<br />
              ✓ Calendar event added · review request scheduled
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat2({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ padding: 12, borderRadius: 10, background: BG, border: `1px solid ${BORDER}` }}>
      <div style={{ fontSize: 11, color: FAINT, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700, fontFamily: "Inter" }}>{value}</div>
    </div>
  );
}
