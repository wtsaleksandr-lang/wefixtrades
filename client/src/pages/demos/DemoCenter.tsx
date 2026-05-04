import { Link } from "wouter";
import { ArrowRight, MessageSquare, Phone, Calculator, Workflow, Share2, Rocket, Shield } from "lucide-react";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { mkt } from "@/theme/tokens";
import { V7Hero, V7Section, V7Container, V7PageShell, V7SectionHeading, V7FinalCta } from "@/components/marketing/v7";
import { Reveal, MONO, TILE } from "@/components/effortel-blocks";

interface DemoCard {
  title: string;
  desc: string;
  href: string;
  icon: typeof MessageSquare;
  interactive?: boolean;
}

/**
 * /demos — demo center, V7-styled.
 *
 * Cards point at real working routes only. Three are fully interactive
 * (/demos/socialsync, rankflow, reputationshield); the rest link to the
 * relevant /products/<slug> page where the animated TradeLineChatDemo
 * (and friends) play in the hero.
 */
const DEMOS: DemoCard[] = [
  {
    title: "TradeLine — Chat & Voice",
    desc: "Watch the AI receptionist handle a 2 AM emergency call: pickup, quote, dispatch, confirm.",
    href: "/products/tradeline",
    icon: Phone,
  },
  {
    title: "QuoteQuick Pro",
    desc: "An interactive calculator that lets homeowners price their job in seconds — right on your site.",
    href: "/tools/quote-demo",
    icon: Calculator,
    interactive: true,
  },
  {
    title: "SocialSync — Post Generator",
    desc: "Enter your trade and city — AI generates 5 ready-to-post social-media posts you can publish today.",
    href: "/demos/socialsync",
    icon: Share2,
    interactive: true,
  },
  {
    title: "RankFlow — SEO Health Check",
    desc: "Drop your URL, get a Lighthouse-style SEO score with speed metrics + actionable fixes.",
    href: "/demos/rankflow",
    icon: Rocket,
    interactive: true,
  },
  {
    title: "ReputationShield Preview",
    desc: "Walk through an automated review request — from the SMS the customer sees to your dashboard.",
    href: "/demos/reputationshield",
    icon: Shield,
    interactive: true,
  },
  {
    title: "Inbox-everywhere",
    desc: "See how Phone + SMS + Web Chat + GBP messages all land in one inbox with AI triage.",
    href: "/products/tradeline",
    icon: Workflow,
  },
];

export default function DemoCenter() {
  return (
    <MarketingLayout>
      <V7PageShell>
        <V7Hero
          productName="Demo Center · No signup required"
          eyebrow="See it before you buy it."
          headline={<>Try every product live.<br/><span style={{ color: mkt.accent }}>Right now.</span></>}
          sub="Interactive demos for every WeFixTrades tool — no email, no signup, just play."
        />

        <V7Section padding="60px">
          <V7Container>
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
              gap: 16,
            }}>
              {DEMOS.map((d, i) => {
                const Icon = d.icon;
                // Rotate through pastel TILE colours per demo card
                const palette = ["cyanSoft", "lavender", "mint", "pink", "cyan", "white"] as const;
                const tile = TILE[palette[i % palette.length]];
                return (
                  <Reveal key={d.title} delay={i * 0.05}>
                    <Link href={d.href} style={{
                      display: "block", textDecoration: "none",
                      background: mkt.sectionLight,
                      border: `1px solid ${mkt.onDarkBorder}`,
                      borderRadius: 18, padding: 0,
                      height: "100%",
                      overflow: "hidden",
                    }}>
                      {/* Pastel header strip — icon + title + live badge inline */}
                      <div style={{
                        background: tile.bg, color: tile.ink,
                        padding: "16px 18px",
                        display: "flex", alignItems: "center", gap: 12,
                        position: "relative",
                      }}>
                        <div style={{
                          position: "absolute", inset: 0,
                          backgroundImage: `radial-gradient(circle, ${tile.ink}10 1px, transparent 1px)`,
                          backgroundSize: "14px 14px", opacity: 0.5, pointerEvents: "none",
                        }} />
                        {/* Icon block */}
                        <div style={{
                          position: "relative", flexShrink: 0,
                          width: 40, height: 40, borderRadius: 10,
                          background: "rgba(255,255,255,0.55)", color: tile.ink,
                          display: "flex", alignItems: "center", justifyContent: "center",
                        }}>
                          <Icon size={18} strokeWidth={1.7} />
                        </div>
                        {/* Title in mono caps — sits inline with the icon */}
                        <h3 style={{
                          position: "relative", flex: 1, minWidth: 0,
                          fontSize: 13, fontWeight: 700, color: tile.ink,
                          letterSpacing: "0.04em", textTransform: "uppercase",
                          fontFamily: MONO, lineHeight: 1.25,
                          margin: 0, overflow: "hidden", textOverflow: "ellipsis",
                        }}>
                          {d.title}
                        </h3>
                        {d.interactive && (
                          <span style={{
                            position: "relative", flexShrink: 0,
                            fontSize: 9, fontWeight: 700, padding: "3px 8px", borderRadius: 999,
                            background: "rgba(16,185,129,0.20)", color: "#059669",
                            letterSpacing: "0.06em", textTransform: "uppercase", fontFamily: MONO,
                          }}>● Live</span>
                        )}
                      </div>
                      {/* Body — description + CTA only */}
                      <div style={{ padding: "18px 22px 22px" }}>
                        <p style={{ fontSize: 13, color: mkt.onDarkMuted, margin: "0 0 16px", lineHeight: 1.55 }}>
                          {d.desc}
                        </p>
                        <span style={{
                          display: "inline-flex", alignItems: "center", gap: 6,
                          fontSize: 11, fontWeight: 600, color: mkt.accent,
                          fontFamily: MONO, letterSpacing: "0.08em", textTransform: "uppercase",
                          paddingBottom: 4, borderBottom: `1px solid ${mkt.accent}`,
                        }}>
                          Try it <ArrowRight size={12} />
                        </span>
                      </div>
                    </Link>
                  </Reveal>
                );
              })}
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
