/**
 * V3 — Bento grid hero, dark.
 * Aesthetic: dark with cyan accent (matches homepage). Asymmetric bento as the core layout.
 * Hero is replaced by a full-screen bento that shows the product story in cells.
 */

import { Link } from "wouter";
import { ArrowRight, Phone, MessageSquare, Mic, Clock, Calendar, BellRing, Star } from "lucide-react";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { mkt } from "@/theme/tokens";
import { getProductBySlug } from "@/config/products";

const cfg = getProductBySlug("tradeline")!;

const CARD: React.CSSProperties = {
  background: "rgba(255,255,255,0.03)",
  border: `1px solid ${mkt.onDarkBorder}`,
  borderRadius: 20,
  padding: 28,
  position: "relative",
  overflow: "hidden",
};

export default function TradeLineV3() {
  return (
    <MarketingLayout>
      <div style={{ background: mkt.bg, color: mkt.onDark, minHeight: "100vh" }}>

        {/* OPENING HEADER */}
        <section style={{ padding: "100px 24px 0" }}>
          <div style={{ maxWidth: 1280, margin: "0 auto", textAlign: "center" }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 14px", borderRadius: 999, background: "rgba(102,232,250,0.10)", border: `1px solid rgba(102,232,250,0.24)`, fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: mkt.accent, marginBottom: 28 }}>
              <Phone size={12} /> 24/7 Lead Handling
            </div>
            <h1 style={{ fontSize: "clamp(48px, 7vw, 88px)", fontWeight: 700, lineHeight: 1.0, letterSpacing: "-0.04em", maxWidth: 980, margin: "0 auto 24px" }}>
              Every missed call is<br />
              <span style={{ background: `linear-gradient(135deg, ${mkt.accent}, #6366f1)`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>a competitor's win.</span>
            </h1>
            <p style={{ fontSize: 19, lineHeight: 1.55, color: mkt.onDarkMuted, maxWidth: 620, margin: "0 auto 40px" }}>
              TradeLine answers, quotes, books, and follows up — automatically. Live in minutes. Less than a coffee a day.
            </p>
            <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
              <Link href={cfg.primaryCTA.href} style={primaryCta}>{cfg.primaryCTA.label} <ArrowRight size={16} /></Link>
              <Link href={cfg.secondaryCTA!.href} style={ghostCta}>{cfg.secondaryCTA!.label}</Link>
            </div>
          </div>
        </section>

        {/* BENTO GRID — 3 columns x 4 rows of mixed-size cards */}
        <section style={{ padding: "80px 24px 120px" }}>
          <div style={{ maxWidth: 1280, margin: "0 auto" }}>
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(6, 1fr)",
              gridAutoRows: "180px",
              gap: 16,
            }}>
              {/* Wide hero cell — 24/7 */}
              <div style={{ ...CARD, gridColumn: "span 4", gridRow: "span 2", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 36 }}>
                <div>
                  <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "4px 10px", borderRadius: 999, background: "rgba(102,232,250,0.12)", color: mkt.accent, fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 20 }}>
                    Always on
                  </div>
                  <h3 style={{ fontSize: 36, fontWeight: 700, letterSpacing: "-0.03em", lineHeight: 1.05, marginBottom: 14 }}>
                    Picks up at 2 AM the same way it picks up at 2 PM.
                  </h3>
                  <p style={{ fontSize: 15, lineHeight: 1.55, color: mkt.onDarkMuted, maxWidth: 520 }}>
                    Real-time AI handles inbound calls and chats around the clock. Quotes, books, transfers, and texts back when you're unavailable.
                  </p>
                </div>
                <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 24 }}>
                  <div style={{ display: "flex", gap: 6 }}>
                    {["8a", "12p", "5p", "9p", "1a", "5a"].map((t, i) => (
                      <div key={t} style={{ padding: "6px 10px", borderRadius: 8, background: i === 4 ? mkt.accent : "rgba(255,255,255,0.04)", color: i === 4 ? mkt.dark : mkt.onDarkMuted, fontSize: 11, fontWeight: 600, fontFamily: "monospace" }}>{t}</div>
                    ))}
                  </div>
                  <div style={{ marginLeft: "auto", fontSize: 12, color: mkt.success, display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ width: 6, height: 6, background: mkt.success, borderRadius: "50%" }} /> Active now
                  </div>
                </div>
              </div>

              {/* Tall cell — instant estimates */}
              <div style={{ ...CARD, gridColumn: "span 2", gridRow: "span 2", padding: 28 }}>
                <Mic size={22} color={mkt.accent} style={{ marginBottom: 28 }} />
                <h3 style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em", marginBottom: 10, lineHeight: 1.15 }}>Instant estimates</h3>
                <p style={{ fontSize: 13, lineHeight: 1.55, color: mkt.onDarkMuted, marginBottom: 24 }}>
                  Quotes callers using your pricing formulas — flat, hourly, tiered, or per-unit.
                </p>
                <div style={{ padding: 14, borderRadius: 12, background: mkt.dark, border: `1px solid ${mkt.onDarkBorder}` }}>
                  <div style={{ fontSize: 11, color: mkt.onDarkFaint, marginBottom: 4 }}>Drain unblock</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: mkt.accent, fontFamily: "monospace" }}>$185–$240</div>
                </div>
              </div>

              {/* Wide row — review requests */}
              <div style={{ ...CARD, gridColumn: "span 3", gridRow: "span 1", display: "flex", alignItems: "center", gap: 20 }}>
                <div style={{ width: 56, height: 56, borderRadius: 14, background: "rgba(102,232,250,0.1)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Star size={24} color={mkt.accent} fill={mkt.accent} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4, letterSpacing: "-0.01em" }}>Review requests, automatic</h3>
                  <p style={{ fontSize: 13, color: mkt.onDarkMuted, lineHeight: 1.5 }}>Sends a Google review link the day after each completed job.</p>
                </div>
              </div>

              {/* Square cell — missed-call text-back */}
              <div style={{ ...CARD, gridColumn: "span 3", gridRow: "span 1", display: "flex", alignItems: "center", gap: 20 }}>
                <div style={{ width: 56, height: 56, borderRadius: 14, background: "rgba(102,232,250,0.1)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <BellRing size={24} color={mkt.accent} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4, letterSpacing: "-0.01em" }}>Missed-call text-back</h3>
                  <p style={{ fontSize: 13, color: mkt.onDarkMuted, lineHeight: 1.5 }}>If a call goes to voicemail, TradeLine texts the caller back in seconds.</p>
                </div>
              </div>

              {/* Wide cell — channels */}
              <div style={{ ...CARD, gridColumn: "span 4", gridRow: "span 2", padding: 36, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                <div>
                  <h3 style={{ fontSize: 28, fontWeight: 700, letterSpacing: "-0.02em", marginBottom: 14, lineHeight: 1.1 }}>One inbox. All channels.</h3>
                  <p style={{ fontSize: 14, lineHeight: 1.55, color: mkt.onDarkMuted, maxWidth: 460 }}>
                    Phone, SMS, and website chat unified. Every conversation transcribed, tagged, and ready for follow-up.
                  </p>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
                  {[{ icon: Phone, label: "Phone", count: "147" }, { icon: MessageSquare, label: "Web chat", count: "89" }, { icon: Calendar, label: "SMS", count: "43" }].map((ch) => (
                    <div key={ch.label} style={{ padding: 14, borderRadius: 12, background: "rgba(255,255,255,0.03)", border: `1px solid ${mkt.onDarkBorder}` }}>
                      <ch.icon size={16} color={mkt.accent} style={{ marginBottom: 8 }} />
                      <div style={{ fontSize: 11, color: mkt.onDarkFaint, marginBottom: 2 }}>{ch.label}</div>
                      <div style={{ fontSize: 18, fontWeight: 700, fontFamily: "monospace" }}>{ch.count}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Square cell — setup time */}
              <div style={{ ...CARD, gridColumn: "span 2", gridRow: "span 2", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", padding: 28 }}>
                <Clock size={28} color={mkt.accent} style={{ marginBottom: 16 }} />
                <div style={{ fontSize: 60, fontWeight: 700, letterSpacing: "-0.04em", lineHeight: 1, color: mkt.onDark, marginBottom: 8, fontFamily: "Inter" }}>5min</div>
                <div style={{ fontSize: 13, color: mkt.onDarkMuted, lineHeight: 1.5 }}>Average setup time<br />from signup to live</div>
              </div>
            </div>
          </div>
        </section>

        {/* TRUST */}
        <section style={{ padding: "60px 24px", borderTop: `1px solid ${mkt.onDarkBorder}`, borderBottom: `1px solid ${mkt.onDarkBorder}` }}>
          <div style={{ maxWidth: 1180, margin: "0 auto" }}>
            <p style={{ textAlign: "center", fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: mkt.onDarkFaint, marginBottom: 24 }}>
              Trusted by trades teams running
            </p>
            <div style={{ display: "flex", justifyContent: "space-around", flexWrap: "wrap", gap: 24, alignItems: "center" }}>
              {cfg.bestFor.map(t => (
                <span key={t} style={{ fontSize: 14, fontWeight: 500, color: mkt.onDarkMuted }}>{t}</span>
              ))}
            </div>
          </div>
        </section>

        {/* HOW IT WORKS */}
        <section style={{ padding: "120px 24px" }}>
          <div style={{ maxWidth: 1180, margin: "0 auto" }}>
            <div style={{ textAlign: "center", marginBottom: 64 }}>
              <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: mkt.accent, marginBottom: 16 }}>How it works</p>
              <h2 style={{ fontSize: "clamp(36px, 5vw, 56px)", fontWeight: 700, lineHeight: 1.05, letterSpacing: "-0.03em" }}>
                From "missed it" to "booked it" in minutes.
              </h2>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
              {cfg.howItWorks.map((s, i) => (
                <div key={s.title} style={{ ...CARD, padding: 32 }}>
                  <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 24 }}>
                    <div style={{ fontSize: 48, fontWeight: 700, color: mkt.accent, opacity: 0.3, lineHeight: 1, letterSpacing: "-0.04em" }}>0{i + 1}</div>
                    <ArrowRight size={18} color={mkt.onDarkFaint} />
                  </div>
                  <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 10, letterSpacing: "-0.01em" }}>{s.title}</h3>
                  <p style={{ fontSize: 14, lineHeight: 1.55, color: mkt.onDarkMuted }}>{s.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section style={{ padding: "60px 24px 120px" }}>
          <div style={{ ...CARD, maxWidth: 1180, margin: "0 auto", padding: "80px 40px", textAlign: "center", background: `linear-gradient(135deg, rgba(102,232,250,0.08), rgba(102,232,250,0.02))` }}>
            <h2 style={{ fontSize: "clamp(36px, 5vw, 56px)", fontWeight: 700, lineHeight: 1.05, letterSpacing: "-0.03em", marginBottom: 20 }}>
              Tonight, every call gets answered.
            </h2>
            <p style={{ fontSize: 17, color: mkt.onDarkMuted, marginBottom: 32 }}>Setup is 5 minutes. Cancel anytime.</p>
            <Link href={cfg.primaryCTA.href} style={{ ...primaryCta, fontSize: 16, padding: "16px 32px" }}>
              {cfg.primaryCTA.label} <ArrowRight size={18} />
            </Link>
          </div>
        </section>
      </div>
    </MarketingLayout>
  );
}

const primaryCta: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 8,
  padding: "14px 24px", borderRadius: 10,
  background: mkt.accent, color: mkt.dark, fontSize: 15, fontWeight: 700,
  textDecoration: "none",
};

const ghostCta: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 8,
  padding: "14px 24px", borderRadius: 10,
  background: "rgba(255,255,255,0.05)", color: mkt.onDark, fontSize: 15, fontWeight: 600,
  border: `1px solid ${mkt.onDarkBorder}`, textDecoration: "none",
};
