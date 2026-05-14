/**
 * V7 — Effortel-style.
 *
 * Section pattern (matches effortel.com/products/ems):
 *   1. HERO              dark bg, big sans-serif, mono CTA "BOOK A DEMO"
 *   2. NUMBERED CARDS    each major idea in its own dotted-bg rounded card
 *                        with mockup-on-top, title-below, faded "01/02/03..." indicator
 *   3. CATEGORY PILLS    bottom-of-page navigation chips
 *   4. CTA               final closer
 *
 * The inner mockup tiles (StatTile, MiniChartTile, FlowCard, OrbitingLogos)
 * are imported from the shared effortel-blocks library so they can be reused
 * across all 12 product pages.
 */

import { Link } from "wouter";
import { ArrowRight, Phone, MessageSquare, Calendar, Star, Clock, Sparkles, Mic } from "lucide-react";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { mkt } from "@/theme/tokens";
import { getProductBySlug } from "@/config/products";
import {
  NumberedCard,
  StatTile,
  MiniChartTile,
  BadgePill,
  FlowCard,
  OrbitingLogos,
  TILE,
} from "@/components/effortel-blocks";
import TradelineAgentGrid from "@/components/marketing/TradelineAgentGrid";
import TradelineComparisonTable from "@/components/marketing/TradelineComparisonTable";

const cfg = getProductBySlug("tradeline")!;

const SANS = "'Satoshi', Inter, system-ui, sans-serif";
const MONO = "'Et Mono', 'DM Mono', monospace";

export default function TradeLineV7() {
  return (
    <MarketingLayout>
      <div style={{ background: mkt.bg, color: mkt.onDark, fontFamily: SANS }}>

        {/* ─────────────── HERO ─────────────── */}
        <section style={{ padding: "120px 24px 80px", position: "relative", overflow: "hidden" }}>
          {/* Soft gradient backdrop */}
          <div style={{
            position: "absolute", inset: 0, pointerEvents: "none",
            background: "radial-gradient(ellipse 60% 50% at 50% 0%, rgba(102,232,250,0.08) 0%, transparent 60%)",
          }} />
          <div style={{ maxWidth: 1180, margin: "0 auto", position: "relative", textAlign: "center" }}>
            <span style={{
              display: "inline-block",
              fontFamily: MONO, fontSize: 12, letterSpacing: "0.16em", textTransform: "uppercase",
              color: mkt.accent, marginBottom: 32,
            }}>
              24/7 TradeLine
            </span>
            <h1 style={{
              fontSize: "clamp(48px, 7vw, 88px)", fontWeight: 700, lineHeight: 0.98,
              letterSpacing: "-0.03em", color: mkt.onDark, marginBottom: 28,
              maxWidth: 920, margin: "0 auto 28px",
            }}>
              Never miss a lead.<br />
              <span style={{ color: mkt.onDarkMuted }}>Even at 2 AM.</span>
            </h1>
            <p style={{
              fontSize: 18, lineHeight: 1.55, color: mkt.onDarkMuted,
              maxWidth: 580, margin: "0 auto 48px",
            }}>
              TradeLine answers calls and chats 24/7, gives instant estimates, books jobs, and follows up automatically.
            </p>
            <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
              <Link href={cfg.primaryCTA.href} style={{
                display: "inline-flex", alignItems: "center", gap: 12,
                padding: "16px 28px", borderRadius: 10,
                background: mkt.accent, color: mkt.dark,
                fontFamily: MONO, fontSize: 14, fontWeight: 500,
                letterSpacing: "0.12em", textTransform: "uppercase",
                textDecoration: "none",
              }}>
                Book a demo <ArrowRight size={16} />
              </Link>
              <Link href={cfg.secondaryCTA!.href} style={{
                display: "inline-flex", alignItems: "center", gap: 12,
                padding: "16px 28px", borderRadius: 10,
                background: "transparent", color: mkt.onDark,
                fontFamily: MONO, fontSize: 14, fontWeight: 500,
                letterSpacing: "0.12em", textTransform: "uppercase",
                textDecoration: "none",
                border: `1px solid ${mkt.onDarkBorder}`,
              }}>
                See it in action
              </Link>
            </div>
          </div>
        </section>

        {/* ─────────────── NUMBERED CARD STACK ─────────────── */}
        <section style={{ padding: "60px 24px 80px" }}>
          <div style={{ maxWidth: 1180, margin: "0 auto", display: "flex", flexDirection: "column", gap: 24 }}>

            {/* Card 01 — Always-on */}
            <NumberedCard
              number="01"
              title="Always-On Lead Handling"
              description="Picks up at 2 AM the same way it picks up at 2 PM. Real-time AI handles inbound calls and chats around the clock — no voicemail, no missed revenue."
              cta={{ label: "Learn More", href: "/demo" }}
            >
              <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 16, maxWidth: 720, width: "100%" }} className="effortel-grid-2">
                <MiniChartTile value="100%" label="Calls answered" trend="24/7" color="cyanSoft" />
                <div style={{ display: "grid", gridTemplateRows: "1fr 1fr", gap: 16 }}>
                  <StatTile value="< 30s" label="Avg pick-up time" color="lavender" size="sm" />
                  <StatTile value="240+" label="Trades businesses" color="mint" size="sm" />
                </div>
              </div>
            </NumberedCard>

            {/* Card 02 — Instant Estimates */}
            <NumberedCard
              number="02"
              title="Instant Estimates"
              description="Configure your pricing once — flat, hourly, tiered, per-unit. TradeLine quotes every caller using your real numbers. No callbacks, no lost leads."
              cta={{ label: "See Pricing", href: "/pricing" }}
            >
              <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr 1fr", gap: 16, maxWidth: 760, width: "100%" }} className="effortel-grid-3">
                <StatTile
                  value="$185"
                  label="Drain unblock"
                  color="cyanSoft"
                  size="lg"
                  badge={<span style={{ fontSize: 10, fontFamily: MONO, padding: "3px 8px", borderRadius: 999, background: TILE.mint.bg, color: TILE.mint.ink, letterSpacing: "0.08em" }}>QUOTED</span>}
                  icon={<Mic size={16} />}
                />
                <StatTile value="$420" label="HVAC tune-up" color="lavender" size="lg" icon={<Mic size={16} />} />
                <StatTile value="$95" label="Service call" color="mint" size="lg" icon={<Mic size={16} />} />
              </div>
            </NumberedCard>

            {/* Card 03 — Automated Follow-ups */}
            <NumberedCard
              number="03"
              title="Automated Follow-ups"
              description="Confirmations, reminders, nurture sequences, review requests. Every lead gets the right message at the right time — without you remembering to send it."
              cta={{ label: "Learn More", href: "/demo" }}
            >
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gridTemplateRows: "auto auto", gap: 16, maxWidth: 720, width: "100%" }} className="effortel-grid-2">
                <StatTile
                  value="5467894"
                  label="Lead captured"
                  color="cyanSoft"
                  badge={<span style={{ fontSize: 10, fontFamily: MONO, padding: "3px 8px", borderRadius: 999, background: TILE.pink.bg, color: TILE.pink.ink, letterSpacing: "0.08em" }}>NEW</span>}
                />
                <StatTile value="$185.00" label="Estimated value" color="pink" />
                <FlowCard
                  title="Follow-up plan"
                  currentStep={{ label: "Sent", date: "2:47 AM", type: "check" }}
                  nextStep="Reminder…"
                  color="cyan"
                  style={{ gridColumn: "span 2" }}
                />
              </div>
            </NumberedCard>

            {/* Card 04 — Channel Hub (the orbit) */}
            <NumberedCard
              number="04"
              title="One Inbox. All Channels."
              description="Phone, SMS, web chat — every conversation transcribed, tagged, and ready for follow-up. Plug into the tools you already use."
              cta={{ label: "See Integrations", href: "/products/tradeline" }}
            >
              <OrbitingLogos
                center={
                  <div style={{
                    background: TILE.white.bg, color: TILE.white.ink,
                    borderRadius: 14, padding: "16px 18px",
                    minWidth: 200, fontFamily: SANS,
                    boxShadow: "0 16px 40px rgba(0,0,0,0.4)",
                  }}>
                    <div style={{ fontSize: 11, fontFamily: MONO, color: TILE.white.muted, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 10 }}>
                      Inbox
                    </div>
                    <Row icon={<Phone size={11} />} label="Sarah K." sub="Burst pipe" />
                    <Row icon={<MessageSquare size={11} />} label="Mike R." sub="AC quote" />
                    <Row icon={<Calendar size={11} />} label="Diana L." sub="Follow-up" />
                  </div>
                }
                logos={[
                  { label: "P", color: "#1E3A8A", angle: 200, ring: 2 },     // Phone
                  { label: "S", color: "#7C3AED", angle: 250, ring: 2 },     // SMS
                  { label: "W", color: "#059669", angle: 320, ring: 2 },     // Web chat
                  { label: "G", color: "#DC2626", angle: 30,  ring: 2 },     // GBP
                  { label: "C", color: "#2563EB", angle: 100, ring: 1, size: 40 }, // Cal.com
                  { label: "Z", color: "#EA580C", angle: 160, ring: 1, size: 40 }, // Zapier
                ]}
              />
            </NumberedCard>
          </div>
        </section>

        {/* ─────────────── CATEGORY PILLS ─────────────── */}
        <section style={{ padding: "40px 24px 100px" }}>
          <div style={{ maxWidth: 980, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
            <BadgePill label="24/7 Answering"   icon={<Phone size={18} />}        iconBg="cyan" />
            <BadgePill label="Instant Quotes"   icon={<Sparkles size={18} />}     iconBg="lavender" />
            <BadgePill label="Auto Follow-up"   icon={<Clock size={18} />}        iconBg="mint" />
            <BadgePill label="Review Requests"  icon={<Star size={18} />}         iconBg="pink" />
          </div>
        </section>

        {/* ─────────────── 40 NICHE AGENTS GRID ─────────────── */}
        <TradelineAgentGrid />

        {/* ─────────────── COMPETITIVE COMPARISON ─────────────── */}
        <TradelineComparisonTable />

        {/* ─────────────── FINAL CTA ─────────────── */}
        <section style={{ padding: "100px 24px 140px" }}>
          <div style={{
            maxWidth: 980, margin: "0 auto",
            background: mkt.sectionLight,
            borderRadius: 28, padding: "80px 32px",
            position: "relative", overflow: "hidden",
            textAlign: "center",
          }}>
            <div style={{
              position: "absolute", inset: 0, pointerEvents: "none",
              background: "radial-gradient(ellipse 50% 80% at 50% 50%, rgba(102,232,250,0.10) 0%, transparent 60%)",
            }} />
            <h2 style={{
              position: "relative",
              fontSize: "clamp(36px, 5vw, 56px)", fontWeight: 700, lineHeight: 1.05,
              letterSpacing: "-0.02em", color: mkt.onDark, marginBottom: 20,
            }}>
              Stop missing calls.<br />
              <span style={{ color: mkt.accent }}>Start booking jobs.</span>
            </h2>
            <p style={{
              position: "relative",
              fontSize: 17, lineHeight: 1.55, color: mkt.onDarkMuted, marginBottom: 40,
            }}>
              5-minute setup. No card required. Cancel anytime.
            </p>
            <Link href={cfg.primaryCTA.href} style={{
              position: "relative",
              display: "inline-flex", alignItems: "center", gap: 12,
              padding: "16px 32px", borderRadius: 10,
              background: mkt.accent, color: mkt.dark,
              fontFamily: MONO, fontSize: 14, fontWeight: 500,
              letterSpacing: "0.12em", textTransform: "uppercase",
              textDecoration: "none",
            }}>
              Book a demo <ArrowRight size={18} />
            </Link>
          </div>
        </section>
      </div>
    </MarketingLayout>
  );
}

function Row({ icon, label, sub }: { icon: React.ReactNode; label: string; sub: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderTop: `1px solid rgba(0,0,0,0.06)` }}>
      <div style={{ width: 22, height: 22, borderRadius: 6, background: "rgba(0,0,0,0.06)", display: "flex", alignItems: "center", justifyContent: "center", color: TILE.white.ink }}>
        {icon}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: TILE.white.ink }}>{label}</div>
        <div style={{ fontSize: 10, color: TILE.white.muted, fontFamily: MONO }}>{sub}</div>
      </div>
    </div>
  );
}
