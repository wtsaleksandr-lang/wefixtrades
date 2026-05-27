import { useRef, useState } from "react";
import { Link } from "wouter";
import {
  ArrowUpRight, MessageSquare, Phone, Calculator, Workflow,
  Share2, Rocket, Shield,
} from "lucide-react";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { PageMeta } from "@/components/seo/PageMeta";
import { mkt } from "@/theme/tokens";
import { V7Hero, V7Section, V7Container, V7PageShell, V7FinalCta } from "@/components/marketing/v7";
import { Reveal, MONO, TILE } from "@/components/effortel-blocks";

interface DemoCardData {
  title: string;
  desc: string;
  href: string;
  icon: typeof MessageSquare;
  interactive?: boolean;
  /** Short stat shown bottom-left on hover (e.g. "62%   FEWER MISSED CALLS"). */
  benefit: string;
  /** Cursor-follow tag shown on hover. */
  cursorTag: string;
}

/**
 * /demos — demo center, V7-styled.
 *
 * Cards point at real working routes only. Three are fully interactive
 * (/demos/socialsync, rankflow, reputationshield); the rest link to the
 * relevant /products/<slug> page where the animated TradeLineChatDemo
 * (and friends) play in the hero.
 */
const DEMOS: DemoCardData[] = [
  {
    title: "TradeLine — Chat & Voice",
    desc: "Watch the AI receptionist handle a 2 AM emergency call: pickup, quote, dispatch, confirm.",
    href: "/products/tradeline",
    icon: Phone,
    benefit: "62% fewer missed calls",
    cursorTag: "See Demo",
  },
  {
    title: "QuoteQuick",
    desc: "An interactive calculator that lets homeowners price their job in seconds — right on your site.",
    href: "/products/quickquotepro/demo",
    icon: Calculator,
    interactive: true,
    benefit: "3× more booked jobs",
    cursorTag: "Try Live",
  },
  {
    title: "SocialSync — Post Generator",
    desc: "Enter your trade and city — AI generates 5 ready-to-post social-media posts you can publish today.",
    href: "/demos/socialsync",
    icon: Share2,
    interactive: true,
    benefit: "5 posts in 30 seconds",
    cursorTag: "Try Live",
  },
  {
    title: "RankFlow — SEO Health Check",
    desc: "Drop your URL, get a Lighthouse-style SEO score with speed metrics + actionable fixes.",
    href: "/demos/rankflow",
    icon: Rocket,
    interactive: true,
    benefit: "Free site audit",
    cursorTag: "Try Live",
  },
  {
    title: "ReputationShield Preview",
    desc: "Walk through an automated review request — from the SMS the customer sees to your dashboard.",
    href: "/demos/reputationshield",
    icon: Shield,
    interactive: true,
    benefit: "4.9★ avg rating",
    cursorTag: "Try Live",
  },
  {
    title: "Inbox-everywhere",
    desc: "See how Phone + SMS + Web Chat + GBP messages all land in one inbox with AI triage.",
    href: "/products/tradeline",
    icon: Workflow,
    benefit: "1 inbox · 4 channels",
    cursorTag: "See Demo",
  },
];

const PALETTE = ["cyanSoft", "lavender", "mint", "pink", "cyan", "white"] as const;

function DemoCard({ d, i }: { d: DemoCardData; i: number }) {
  const [hover, setHover] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const ref = useRef<HTMLAnchorElement>(null);
  const tile = TILE[PALETTE[i % PALETTE.length]];
  const Icon = d.icon;

  const onMove = (e: React.MouseEvent) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    setPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  return (
    <Reveal delay={i * 0.05}>
      <Link
        href={d.href}
        ref={ref as any}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        onMouseMove={onMove}
        style={{
          display: "block", textDecoration: "none",
          background: mkt.sectionLight,
          border: `1px solid ${hover ? "rgba(13,60,252,0.45)" : mkt.onDarkBorder}`,
          borderRadius: 18, padding: 0,
          height: "100%",
          overflow: "hidden",
          position: "relative",
          transform: hover ? "translateY(-3px)" : "translateY(0)",
          boxShadow: hover ? "0 18px 40px rgba(0,0,0,0.35)" : "0 0 0 rgba(0,0,0,0)",
          transition: "transform 320ms cubic-bezier(0.22,1,0.36,1), box-shadow 320ms cubic-bezier(0.22,1,0.36,1), border-color 320ms ease",
        }}
      >
        {/* Top-right corner arrow — fades in on hover */}
        <div style={{
          position: "absolute", top: 12, right: 12, zIndex: 3,
          width: 30, height: 30, borderRadius: 9,
          background: "rgba(255,255,255,0.12)",
          color: mkt.onDark,
          display: "flex", alignItems: "center", justifyContent: "center",
          opacity: hover ? 1 : 0,
          transform: hover ? "translate(0,0)" : "translate(6px,-6px)",
          transition: "opacity 280ms ease, transform 280ms cubic-bezier(0.22,1,0.36,1)",
          pointerEvents: "none",
          backdropFilter: "blur(6px)",
        }}>
          <ArrowUpRight size={16} strokeWidth={2.2} />
        </div>

        {/* Outer pastel header zone — wraps the floating pill-shaped nav bar */}
        <div style={{
          background: tile.bg,
          padding: "14px 14px 16px",
          position: "relative",
        }}>
          <div style={{
            position: "absolute", inset: 0,
            backgroundImage: `radial-gradient(circle, ${tile.ink}10 1px, transparent 1px)`,
            backgroundSize: "14px 14px", opacity: 0.5, pointerEvents: "none",
          }} />

          {/* Tiny top header bar — three traffic-light dots + product slug pill */}
          <div style={{
            position: "relative",
            display: "flex", alignItems: "center", gap: 8,
            marginBottom: 12,
            padding: "0 4px",
          }}>
            <span style={{ width: 7, height: 7, borderRadius: 999, background: `${tile.ink}30` }} />
            <span style={{ width: 7, height: 7, borderRadius: 999, background: `${tile.ink}22` }} />
            <span style={{ width: 7, height: 7, borderRadius: 999, background: `${tile.ink}18` }} />
            <span style={{ flex: 1 }} />
            <span style={{
              fontFamily: MONO, fontSize: 9, fontWeight: 700,
              letterSpacing: "0.14em", textTransform: "uppercase",
              color: `${tile.ink}88`,
            }}>
              {String(i + 1).padStart(2, "0")} · DEMO
            </span>
          </div>

          {/* Floating nav bar — rounded-rect (matches the inner icon's rounding) */}
          <div style={{
            position: "relative",
            background: "rgba(255,255,255,0.45)",
            border: `1px solid ${tile.ink}14`,
            borderRadius: 18,
            padding: "8px 14px 8px 8px",
            display: "flex", alignItems: "center", gap: 12,
            backdropFilter: "blur(6px)",
            WebkitBackdropFilter: "blur(6px)",
          }}>
            {/* Square icon block — bigger + subtle border */}
            <div style={{
              flexShrink: 0,
              width: 52, height: 52, borderRadius: 14,
              background: "rgba(255,255,255,0.78)",
              border: `1px solid ${tile.ink}1f`,
              color: tile.ink,
              display: "flex", alignItems: "center", justifyContent: "center",
              transform: hover ? "scale(1.06)" : "scale(1)",
              opacity: hover ? 0.85 : 1,
              transition: "transform 320ms cubic-bezier(0.22,1,0.36,1), opacity 240ms ease",
              boxShadow: `inset 0 0 0 1px rgba(255,255,255,0.6)`,
            }}>
              <Icon size={24} strokeWidth={1.7} />
            </div>
            {/* Title — sharpens on hover */}
            <h3 style={{
              flex: 1, minWidth: 0,
              fontSize: 13, fontWeight: 700,
              color: hover ? "#0a1628" : tile.ink,
              letterSpacing: "0.04em", textTransform: "uppercase",
              fontFamily: MONO, lineHeight: 1.25,
              margin: 0, overflow: "hidden", textOverflow: "ellipsis",
              transition: "color 240ms ease",
              textShadow: hover ? `0 0 0.5px ${tile.ink}` : "none",
            }}>
              {d.title}
            </h3>
            {d.interactive && (
              <span style={{
                flexShrink: 0,
                fontSize: 9, fontWeight: 700, padding: "4px 10px", borderRadius: 999,
                background: "rgba(16,185,129,0.20)", color: "#059669",
                letterSpacing: "0.06em", textTransform: "uppercase", fontFamily: MONO,
                border: "1px solid rgba(16,185,129,0.30)",
              }}>● Live</span>
            )}
          </div>
        </div>

        {/* Body — benefit badge only (description removed) */}
        <div style={{ padding: "14px 22px 44px", position: "relative", minHeight: 36 }}>
          {/* Benefit badge — bottom-left, fades in on hover */}
          <div style={{
            position: "absolute", left: 22, bottom: 14,
            fontSize: 11, fontWeight: 700,
            color: mkt.accent,
            fontFamily: MONO, letterSpacing: "0.08em", textTransform: "uppercase",
            display: "flex", alignItems: "baseline", gap: 8,
            opacity: hover ? 1 : 0,
            transform: hover ? "translateX(0)" : "translateX(-6px)",
            transition: "opacity 280ms ease 60ms, transform 280ms cubic-bezier(0.22,1,0.36,1) 60ms",
            pointerEvents: "none",
          }}>
            <span style={{ color: mkt.accent }}>{d.benefit.split(" ")[0]}</span>
            <span style={{ color: mkt.onDarkMuted, fontSize: 10 }}>
              [{d.benefit.split(" ").slice(1).join(" ").toUpperCase()}]
            </span>
          </div>
        </div>

        {/* Cursor-follow tag */}
        <div style={{
          position: "absolute",
          left: pos.x + 18,
          top: pos.y + 14,
          background: mkt.onDark,
          color: mkt.bg,
          fontSize: 10, fontWeight: 700,
          padding: "5px 10px", borderRadius: 6,
          fontFamily: MONO, letterSpacing: "0.08em", textTransform: "uppercase",
          pointerEvents: "none",
          whiteSpace: "nowrap",
          zIndex: 10,
          opacity: hover ? 1 : 0,
          transform: hover ? "scale(1)" : "scale(0.85)",
          transformOrigin: "left top",
          transition: "opacity 160ms ease, transform 160ms ease",
          boxShadow: "0 6px 20px rgba(0,0,0,0.35)",
        }}>
          {d.cursorTag}
        </div>
      </Link>
    </Reveal>
  );
}

export default function DemoCenter() {
  return (
    <MarketingLayout>
      <PageMeta
        title="Interactive Demos — see every WeFixTrades product in action"
        description="Try interactive demos of WeFixTrades products: 24/7 TradeLine voice and chat, QuoteQuick instant calculators, SocialSync AI posts, RankFlow keyword tracking, and ReputationShield review automation."
        canonical="/demos"
      />
      <V7PageShell>
        <V7Hero
          productName="Demo Center · No signup required"
          eyebrow="See it before you buy it."
          headline={<>Try every product live.<br/><span style={{ color: mkt.accent }}>Right now.</span></>}
          sub="Interactive demos for every WeFixTrades tool — no email, no signup, just play."
        />

        <V7Section padding={60} style={{ paddingBottom: 24 }}>
          <V7Container>
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
              gap: 16,
            }}>
              {DEMOS.map((d, i) => (
                <DemoCard key={d.title} d={d} i={i} />
              ))}
            </div>
          </V7Container>
        </V7Section>

        <V7FinalCta
          title={<>Liked what you saw?<br/><span style={{ color: mkt.accent }}>Pick a tier.</span></>}
          sub="14-day free trial. No credit card required. Cancel anytime."
          primaryCta={{ label: "See Pricing", href: "/pricing" }}
        />
      </V7PageShell>
    </MarketingLayout>
  );
}
