import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { mkt } from "@/theme/tokens";
import { BookOpen, FileText, Video, Headphones, ArrowUpRight } from "lucide-react";
import { V7Hero, V7Section, V7Container, V7PageShell, V7FinalCta } from "@/components/marketing/v7";
import { Reveal, MONO, TILE } from "@/components/effortel-blocks";

interface ResourceCategory {
  title: string;
  description: string;
  icon: typeof FileText;
  href: string;
  cta: string;
  /** Stat shown bottom-left on hover. */
  stat: string;
}

const RESOURCE_CATEGORIES: ResourceCategory[] = [
  {
    title: "Documentation",
    description: "Step-by-step setup guides, API references, and integration walkthroughs for every product.",
    icon: FileText,
    href: "/docs",
    cta: "Browse Docs",
    stat: "120+ articles",
  },
  {
    title: "Video Tutorials",
    description: "Short, focused videos showing you how to configure calculators, embed widgets, and optimize workflows.",
    icon: Video,
    href: "/docs",
    cta: "Watch Now",
    stat: "40+ walkthroughs",
  },
  {
    title: "Knowledge Base",
    description: "Answers to common questions about billing, integrations, customization, and best practices.",
    icon: BookOpen,
    href: "/docs/troubleshooting",
    cta: "Search Articles",
    stat: "Searchable FAQ",
  },
  {
    title: "Webinars & Events",
    description: "Live sessions and recordings covering digital marketing strategy for trades businesses.",
    icon: Headphones,
    href: "/contact",
    cta: "Register",
    stat: "Monthly sessions",
  },
];

const PALETTE = ["cyanSoft", "lavender", "mint", "pink"] as const;

function ResourceCard({ cat, i }: { cat: ResourceCategory; i: number }) {
  const [hover, setHover] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const ref = useRef<HTMLAnchorElement>(null);
  const tile = TILE[PALETTE[i % PALETTE.length]];
  const Icon = cat.icon;

  const onMove = (e: React.MouseEvent) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    setPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  return (
    <Reveal delay={i * 0.05}>
      <Link
        href={cat.href}
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
        {/* Top-right corner arrow */}
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

        {/* Pastel header */}
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
          <div style={{
            position: "relative", flexShrink: 0,
            width: 40, height: 40, borderRadius: 10,
            background: "rgba(255,255,255,0.55)", color: tile.ink,
            display: "flex", alignItems: "center", justifyContent: "center",
            transform: hover ? "scale(1.08)" : "scale(1)",
            opacity: hover ? 0.78 : 1,
            transition: "transform 320ms cubic-bezier(0.22,1,0.36,1), opacity 240ms ease",
          }}>
            <Icon size={20} strokeWidth={1.7} />
          </div>
          <h3 style={{
            position: "relative", flex: 1, minWidth: 0,
            fontSize: 13, fontWeight: 700,
            color: hover ? "#0a1628" : tile.ink,
            letterSpacing: "0.04em", textTransform: "uppercase",
            fontFamily: MONO, lineHeight: 1.25,
            margin: 0, overflow: "hidden", textOverflow: "ellipsis",
            transition: "color 240ms ease",
          }}>
            {cat.title}
          </h3>
          <span style={{
            position: "relative", flexShrink: 0,
            fontSize: 10, fontWeight: 600, color: tile.muted,
            fontFamily: MONO, letterSpacing: "0.1em",
          }}>
            0{i + 1}
          </span>
        </div>

        {/* Body — stat only (description removed) */}
        <div style={{ padding: "14px 24px 48px", position: "relative", minHeight: 36 }}>
          {/* Stat — bottom-left, fades in on hover */}
          <div style={{
            position: "absolute", left: 24, bottom: 16,
            fontSize: 11, fontWeight: 700,
            fontFamily: MONO, letterSpacing: "0.08em", textTransform: "uppercase",
            display: "flex", alignItems: "baseline", gap: 8,
            opacity: hover ? 1 : 0,
            transform: hover ? "translateX(0)" : "translateX(-6px)",
            transition: "opacity 280ms ease 60ms, transform 280ms cubic-bezier(0.22,1,0.36,1) 60ms",
            pointerEvents: "none",
          }}>
            <span style={{ color: mkt.accent }}>{cat.stat.split(" ")[0]}</span>
            <span style={{ color: mkt.onDarkMuted, fontSize: 10 }}>
              [{cat.stat.split(" ").slice(1).join(" ").toUpperCase()}]
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
          {cat.cta}
        </div>
      </Link>
    </Reveal>
  );
}

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
        <V7Section padding={60} style={{ paddingBottom: 24 }}>
          <V7Container maxWidth={1080}>
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
              gap: 16,
            }}>
              {RESOURCE_CATEGORIES.map((cat, i) => (
                <ResourceCard key={cat.title} cat={cat} i={i} />
              ))}
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
