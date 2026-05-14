/**
 * V1 — Linear-inspired dark minimal.
 * Aesthetic: matches existing homepage (mkt.bg dark, cyan accent). Linear/Vercel feel.
 * Hero: gradient mesh + animated chat mockup. Typography-led.
 */

import { Link } from "wouter";
import { ArrowRight, Phone, MessageSquare, Star, Check, Sparkles } from "lucide-react";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { mkt } from "@/theme/tokens";
import { getProductBySlug } from "@/config/products";

const cfg = getProductBySlug("tradeline")!;

export default function TradeLineV1() {
  return (
    <MarketingLayout>
      <div style={{ background: mkt.bg, color: mkt.onDark, minHeight: "100vh" }}>
        {/* HERO */}
        <section style={{
          position: "relative",
          padding: "140px 24px 100px",
          overflow: "hidden",
          borderBottom: `1px solid ${mkt.onDarkBorder}`,
        }}>
          {/* Gradient mesh */}
          <div style={{
            position: "absolute", inset: 0,
            background: `
              radial-gradient(ellipse 80% 60% at 50% 0%, rgba(13,60,252,0.10) 0%, transparent 60%),
              radial-gradient(ellipse 60% 80% at 100% 50%, rgba(13,60,252,0.06) 0%, transparent 60%),
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

          <div style={{ maxWidth: 1180, margin: "0 auto", position: "relative", display: "grid", gridTemplateColumns: "1.1fr 1fr", gap: 80, alignItems: "center" }}>
            {/* Left: copy */}
            <div>
              <div style={{
                display: "inline-flex", alignItems: "center", gap: 8,
                padding: "6px 14px", borderRadius: 999,
                background: "rgba(13,60,252,0.08)", border: `1px solid rgba(13,60,252,0.20)`,
                fontSize: 12, fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase",
                color: mkt.accent, marginBottom: 28,
              }}>
                <Sparkles size={12} /> Always-On Lead Handling
              </div>
              <h1 style={{
                fontSize: "clamp(48px, 6vw, 72px)", fontWeight: 700, lineHeight: 1.02,
                letterSpacing: "-0.04em", color: mkt.onDark, marginBottom: 24,
              }}>
                Never miss<br />
                a lead<br />
                <span style={{ color: mkt.accent }}>again.</span>
              </h1>
              <p style={{ fontSize: 18, lineHeight: 1.55, color: mkt.onDarkMuted, marginBottom: 40, maxWidth: 480 }}>
                TradeLine answers calls and chats 24/7, gives instant estimates, books jobs, and follows up — automatically. No voicemail. No missed revenue.
              </p>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                <Link href={cfg.primaryCTA.href} style={{
                  display: "inline-flex", alignItems: "center", gap: 8,
                  padding: "14px 24px", borderRadius: 10,
                  background: mkt.accent, color: mkt.dark, fontSize: 15, fontWeight: 700,
                  textDecoration: "none", letterSpacing: "-0.01em",
                }}>
                  {cfg.primaryCTA.label} <ArrowRight size={16} />
                </Link>
                <Link href={cfg.secondaryCTA!.href} style={{
                  display: "inline-flex", alignItems: "center", gap: 8,
                  padding: "14px 24px", borderRadius: 10,
                  background: "rgba(255,255,255,0.05)", color: mkt.onDark, fontSize: 15, fontWeight: 600,
                  border: `1px solid ${mkt.onDarkBorder}`, textDecoration: "none",
                }}>
                  {cfg.secondaryCTA!.label}
                </Link>
              </div>
              <div style={{ marginTop: 40, display: "flex", alignItems: "center", gap: 16, fontSize: 13, color: mkt.onDarkFaint }}>
                <div style={{ display: "flex", gap: 2 }}>
                  {[1, 2, 3, 4, 5].map(i => <Star key={i} size={13} fill={mkt.accent} stroke={mkt.accent} />)}
                </div>
                <span>4.9 / 5 — answered every call last month for 240+ trades businesses</span>
              </div>
            </div>

            {/* Right: chat mockup */}
            <ChatMockup />
          </div>
        </section>

        {/* TRUST */}
        <section style={{ padding: "48px 24px", borderBottom: `1px solid ${mkt.onDarkBorder}` }}>
          <div style={{ maxWidth: 1180, margin: "0 auto" }}>
            <p style={{ textAlign: "center", fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: mkt.onDarkFaint, marginBottom: 24 }}>
              Powering trades businesses across
            </p>
            <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 24, alignItems: "center", maxWidth: 880, margin: "0 auto" }}>
              {cfg.bestFor.map(t => (
                <span key={t} style={{ fontSize: 14, fontWeight: 500, color: mkt.onDarkMuted, fontFamily: "'DM Mono', monospace" }}>{t}</span>
              ))}
            </div>
          </div>
        </section>

        {/* OUTCOMES — 4-column grid */}
        <section style={{ padding: "120px 24px" }}>
          <div style={{ maxWidth: 1180, margin: "0 auto" }}>
            <div style={{ maxWidth: 640, marginBottom: 64 }}>
              <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: mkt.accent, marginBottom: 16 }}>What changes</p>
              <h2 style={{ fontSize: "clamp(36px, 4vw, 52px)", fontWeight: 700, lineHeight: 1.05, letterSpacing: "-0.03em", color: mkt.onDark }}>
                Quote, capture, follow up.<br />
                <span style={{ color: mkt.onDarkMuted }}>Without you lifting a finger.</span>
              </h2>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
              {cfg.outcomes.map((o, i) => (
                <div key={o.title} style={{
                  padding: 28,
                  borderRadius: 16,
                  background: "rgba(255,255,255,0.03)",
                  border: `1px solid ${mkt.onDarkBorder}`,
                  position: "relative",
                }}>
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", color: mkt.accent, marginBottom: 12 }}>0{i + 1}</div>
                  <h3 style={{ fontSize: 18, fontWeight: 600, color: mkt.onDark, marginBottom: 8, letterSpacing: "-0.01em" }}>{o.title}</h3>
                  <p style={{ fontSize: 14, lineHeight: 1.55, color: mkt.onDarkMuted }}>{o.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* HIGHLIGHTS — terminal-style */}
        <section style={{ padding: "60px 24px 120px" }}>
          <div style={{ maxWidth: 1180, margin: "0 auto" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 40, alignItems: "start" }}>
              <div style={{ position: "sticky", top: 100 }}>
                <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: mkt.accent, marginBottom: 16 }}>What it does</p>
                <h2 style={{ fontSize: "clamp(32px, 3.6vw, 44px)", fontWeight: 700, lineHeight: 1.08, letterSpacing: "-0.03em", color: mkt.onDark, marginBottom: 24 }}>
                  Six things that used to need a person.
                </h2>
                <p style={{ fontSize: 16, lineHeight: 1.6, color: mkt.onDarkMuted }}>
                  Each one saves you calls, time, and lost revenue. Together they replace an after-hours answering service at a fraction of the cost.
                </p>
              </div>
              <div style={{
                background: mkt.dark, borderRadius: 16, border: `1px solid ${mkt.onDarkBorder}`,
                padding: "8px 0", overflow: "hidden", boxShadow: "0 24px 60px rgba(0,0,0,0.5)",
              }}>
                <div style={{ padding: "12px 20px", borderBottom: `1px solid ${mkt.onDarkBorder}`, display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#FF5F57" }} />
                  <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#FEBC2E" }} />
                  <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#28C840" }} />
                  <span style={{ marginLeft: 12, fontSize: 12, fontFamily: "monospace", color: mkt.onDarkFaint }}>tradeline.config.ts</span>
                </div>
                {cfg.highlights.map((h, i) => {
                  const [title, desc] = h.split(" — ");
                  return (
                    <div key={i} style={{ padding: "18px 24px", borderBottom: i < cfg.highlights.length - 1 ? `1px solid ${mkt.onDarkBorder}` : undefined, display: "flex", gap: 14, alignItems: "flex-start" }}>
                      <Check size={16} color={mkt.accent} style={{ marginTop: 3, flexShrink: 0 }} />
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 600, color: mkt.onDark, marginBottom: 4 }}>{title}</div>
                        <div style={{ fontSize: 13, lineHeight: 1.55, color: mkt.onDarkMuted }}>{desc}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        {/* HOW IT WORKS */}
        <section style={{ padding: "120px 24px", background: "rgba(255,255,255,0.02)", borderTop: `1px solid ${mkt.onDarkBorder}`, borderBottom: `1px solid ${mkt.onDarkBorder}` }}>
          <div style={{ maxWidth: 1180, margin: "0 auto" }}>
            <p style={{ textAlign: "center", fontSize: 12, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: mkt.accent, marginBottom: 16 }}>Three steps</p>
            <h2 style={{ textAlign: "center", fontSize: "clamp(36px, 4vw, 48px)", fontWeight: 700, lineHeight: 1.08, letterSpacing: "-0.03em", color: mkt.onDark, marginBottom: 64 }}>
              Live in minutes.
            </h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 24 }}>
              {cfg.howItWorks.map((s, i) => (
                <div key={s.title}>
                  <div style={{ fontSize: 64, fontWeight: 700, lineHeight: 1, color: mkt.accent, opacity: 0.25, marginBottom: 16 }}>0{i + 1}</div>
                  <h3 style={{ fontSize: 22, fontWeight: 600, color: mkt.onDark, marginBottom: 10, letterSpacing: "-0.02em" }}>{s.title}</h3>
                  <p style={{ fontSize: 15, lineHeight: 1.55, color: mkt.onDarkMuted }}>{s.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* FINAL CTA */}
        <section style={{ padding: "120px 24px" }}>
          <div style={{ maxWidth: 720, margin: "0 auto", textAlign: "center" }}>
            <h2 style={{ fontSize: "clamp(40px, 5vw, 60px)", fontWeight: 700, lineHeight: 1.05, letterSpacing: "-0.03em", color: mkt.onDark, marginBottom: 20 }}>
              Stop missing calls.<br />
              <span style={{ color: mkt.accent }}>Start booking jobs.</span>
            </h2>
            <p style={{ fontSize: 17, lineHeight: 1.55, color: mkt.onDarkMuted, marginBottom: 32 }}>
              Every missed call is a competitor's win. Get TradeLine answering tonight.
            </p>
            <Link href={cfg.primaryCTA.href} style={{
              display: "inline-flex", alignItems: "center", gap: 10,
              padding: "16px 32px", borderRadius: 12,
              background: mkt.accent, color: mkt.dark, fontSize: 16, fontWeight: 700, textDecoration: "none",
            }}>
              {cfg.primaryCTA.label} <ArrowRight size={18} />
            </Link>
          </div>
        </section>
      </div>
    </MarketingLayout>
  );
}

function ChatMockup() {
  return (
    <div style={{ position: "relative" }}>
      <div style={{
        position: "absolute", inset: -40,
        background: "radial-gradient(ellipse, rgba(13,60,252,0.12) 0%, transparent 60%)",
        pointerEvents: "none", filter: "blur(40px)",
      }} />
      <div style={{
        position: "relative",
        background: mkt.dark, borderRadius: 20, border: `1px solid ${mkt.onDarkBorder}`,
        padding: 0, overflow: "hidden", boxShadow: "0 32px 80px rgba(0,0,0,0.5)",
      }}>
        <div style={{ padding: "16px 20px", borderBottom: `1px solid ${mkt.onDarkBorder}`, display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 36, height: 36, borderRadius: "50%", background: `linear-gradient(135deg, ${mkt.accent}, ${mkt.accentDark})`, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Phone size={16} color={mkt.dark} />
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: mkt.onDark }}>TradeLine</div>
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
            background: mkt.accent, color: mkt.dark,
            fontSize: 13, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 8, alignSelf: "flex-start",
          }}>
            ✓ Booked — Tech ETA 41 min
          </div>
          <div style={{ marginTop: "auto", paddingTop: 12, borderTop: `1px solid ${mkt.onDarkBorder}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ fontSize: 11, color: mkt.onDarkFaint, fontFamily: "monospace" }}>2:47 AM • Auto-handled</div>
            <div style={{ fontSize: 11, color: mkt.accent, fontWeight: 600 }}>+$185 captured</div>
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
        background: isUs ? mkt.accent : "rgba(255,255,255,0.08)",
        display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
      }}>
        {isUs ? <Phone size={11} color={mkt.dark} /> : <MessageSquare size={11} color={mkt.onDarkMuted} />}
      </div>
      <div style={{
        maxWidth: "75%",
        padding: "10px 14px",
        borderRadius: 14,
        background: isUs ? "rgba(13,60,252,0.10)" : "rgba(255,255,255,0.04)",
        border: `1px solid ${isUs ? "rgba(13,60,252,0.18)" : mkt.onDarkBorder}`,
        fontSize: 13, lineHeight: 1.5, color: mkt.onDark,
      }}>
        {text}
      </div>
    </div>
  );
}
