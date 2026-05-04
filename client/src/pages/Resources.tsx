import { useEffect } from "react";
import { Link } from "wouter";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { mkt } from "@/theme/tokens";
import { BookOpen, FileText, Video, Headphones, ArrowRight } from "lucide-react";
import { V7Hero, V7Section, V7Container, V7PageShell, V7FinalCta } from "@/components/marketing/v7";
import { Reveal, MONO, TILE } from "@/components/effortel-blocks";

const RESOURCE_CATEGORIES = [
  {
    title: "Documentation",
    description: "Step-by-step setup guides, API references, and integration walkthroughs for every product.",
    icon: FileText,
    href: "/docs",
    cta: "Browse Docs",
  },
  {
    title: "Video Tutorials",
    description: "Short, focused videos showing you how to configure calculators, embed widgets, and optimize workflows.",
    icon: Video,
    href: "/docs",
    cta: "Watch Now",
  },
  {
    title: "Knowledge Base",
    description: "Answers to common questions about billing, integrations, customization, and best practices.",
    icon: BookOpen,
    href: "/docs/troubleshooting",
    cta: "Search Articles",
  },
  {
    title: "Webinars & Events",
    description: "Live sessions and recordings covering digital marketing strategy for trades businesses.",
    icon: Headphones,
    href: "/contact",
    cta: "Register",
  },
];

export default function ResourcesPage() {
  useEffect(() => { document.title = "Resources — WeFixTrades"; }, []);

  return (
    <MarketingLayout>
      <V7PageShell>
        <V7Hero
          productName="Resources"
          eyebrow="Stuck on something? You're not the first."
          headline={<>Guides, tutorials,<br/><span style={{ color: mkt.accent }}>and answers.</span></>}
          sub="Built for trades operators who learn faster than they read."
        />
        <V7Section padding="60px">
          <V7Container maxWidth={1080}>
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
              gap: 16,
            }}>
              {RESOURCE_CATEGORIES.map((cat, i) => {
                const Icon = cat.icon;
                // Rotate through V7 pastel TILE colours so each card has its
                // own identity rather than four cyan icons in a row.
                const palette = ["cyanSoft", "lavender", "mint", "pink"] as const;
                const tile = TILE[palette[i % palette.length]];
                return (
                  <Reveal key={cat.title} delay={i * 0.05}>
                    <div style={{
                      background: mkt.sectionLight,
                      borderRadius: 18,
                      padding: 0,
                      border: `1px solid ${mkt.onDarkBorder}`,
                      display: "flex", flexDirection: "column",
                      height: "100%",
                      overflow: "hidden",
                    }}>
                      {/* Pastel banner with category icon */}
                      <div style={{
                        background: tile.bg,
                        color: tile.ink,
                        padding: "20px 24px",
                        position: "relative",
                      }}>
                        <div style={{
                          position: "absolute", inset: 0,
                          backgroundImage: `radial-gradient(circle, ${tile.ink}10 1px, transparent 1px)`,
                          backgroundSize: "14px 14px", opacity: 0.5, pointerEvents: "none",
                        }} />
                        <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                          <div style={{
                            width: 44, height: 44, borderRadius: 12,
                            background: "rgba(255,255,255,0.5)", color: tile.ink,
                            display: "flex", alignItems: "center", justifyContent: "center",
                          }}>
                            <Icon size={22} strokeWidth={1.6} />
                          </div>
                          <span style={{
                            fontSize: 10, fontWeight: 600, color: tile.muted,
                            fontFamily: MONO, letterSpacing: "0.1em", textTransform: "uppercase",
                          }}>
                            0{i + 1}
                          </span>
                        </div>
                      </div>
                      <div style={{ padding: "20px 24px 24px", display: "flex", flexDirection: "column", gap: 12, flex: 1 }}>
                      <h3 style={{ fontSize: 17, fontWeight: 600, color: mkt.onDark, margin: 0, letterSpacing: "-0.01em" }}>{cat.title}</h3>
                      <p style={{ fontSize: 13, color: mkt.onDarkMuted, margin: 0, lineHeight: 1.55, flex: 1 }}>
                        {cat.description}
                      </p>
                      <Link href={cat.href} style={{
                        display: "inline-flex", alignItems: "center", gap: 6,
                        fontSize: 11, fontWeight: 600,
                        color: mkt.accent, textDecoration: "none",
                        fontFamily: MONO, letterSpacing: "0.08em", textTransform: "uppercase",
                        paddingBottom: 4, borderBottom: `1px solid ${mkt.accent}`,
                        alignSelf: "flex-start",
                      }}>
                        {cat.cta} <ArrowRight size={12} />
                      </Link>
                      </div>
                    </div>
                  </Reveal>
                );
              })}
            </div>
          </V7Container>
        </V7Section>
        <V7FinalCta
          title={<>Can't find what you need?<br/><span style={{ color: mkt.accent }}>We'll get you sorted.</span></>}
          sub="Real human, fast response. Email or text — your pick."
          primaryCta={{ label: "Contact Support", href: "/contact" }}
        />
      </V7PageShell>
    </MarketingLayout>
  );
}
