import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import {
  Phone, Calculator, Calendar, MapPin, Star, Share2, TrendingUp,
  PenTool, Megaphone, Globe, Shield, Gauge, Plus, ArrowRight, ImageIcon,
} from "lucide-react";
import { mkt, typography } from "@/theme/tokens";

/**
 * ToolShowcase — "Every tool you need" tabbed-accordion marketing section.
 *
 * Structure (adapted from a competitor teardown, rebuilt in the WeFixTrades
 * brand): a centered two-tone headline + subhead, a pill TAB bar of category
 * tabs, and under the active tab a vertical list of accordion cards. Each card
 * has an icon tile + title + one-line blurb + a circular +/× toggle; clicking a
 * card's header expands it IN PLACE into a two-column panel (product mockup on
 * the left, longer copy + "See details →" on the right). Multiple cards can be
 * open at once within a tab; switching tabs collapses everything.
 *
 * Brand/readability rules honored:
 *  - Dark premium shell, brand-blue accent (#0d3cfc family).
 *  - Glass is used ONLY on chrome (the tab pill). Card frames + their interiors
 *    that hold text are SOLID high-contrast surfaces — never thin glass behind
 *    body copy.
 *  - Active tab = accent outline + soft accent tint (NOT a bright fill).
 *  - Accent is used for fills/borders/icons only; body text stays white/near-white.
 *  - Fold animation uses grid-template-rows 0fr→1fr (the WFT-canonical fold),
 *    guarded by prefers-reduced-motion.
 *
 * Wiring: this file only EXPORTS the section — home.tsx is wired separately.
 * The left-hand mockups are intentionally styled PLACEHOLDER panels; real
 * product screenshots can be dropped straight into <MockupPanel> later.
 */

/* ── prefers-reduced-motion (drives whether the fold + toggle animate) ── */
function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    // addEventListener is the modern API; guard for older Safari.
    if (mq.addEventListener) mq.addEventListener("change", onChange);
    else mq.addListener(onChange);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener("change", onChange);
      else mq.removeListener(onChange);
    };
  }, []);
  return reduced;
}

/* ── content model ─────────────────────────────────────────────────────── */

interface Tool {
  id: string;
  name: string;
  slug: string; // → /products/<slug>
  icon: typeof Phone;
  blurb: string; // one-liner shown on the collapsed card
  desc: string; // longer copy shown when expanded
}

interface TabDef {
  key: string;
  label: string;
  tools: Tool[];
}

const TABS: TabDef[] = [
  {
    key: "answer",
    label: "Answer & Book",
    tools: [
      {
        id: "tradeline",
        name: "TradeLine",
        slug: "tradeline",
        icon: Phone,
        blurb: "A 24/7 AI receptionist that answers every call and chat.",
        desc: "TradeLine answers every call and website chat around the clock — even at 2 AM. It quotes the job, books the appointment, and texts missed callers back before they ring the next name on the list. Replaces a $240/month answering service for a fraction of the cost.",
      },
      {
        id: "quotequick",
        name: "QuoteQuick",
        slug: "quickquotepro",
        icon: Calculator,
        blurb: "Instant, accurate quotes on your website — and every quote is a lead.",
        desc: "An embeddable quote calculator that gives customers an accurate price in seconds and captures their name, email, and phone as a lead every time. Live on your site in about 5 minutes and works alongside Jobber, Housecall Pro, or whatever you already use.",
      },
      {
        id: "bookflow",
        name: "BookFlow",
        slug: "bookflow",
        icon: Calendar,
        blurb: "Customers book themselves straight onto your calendar.",
        desc: "Self-serve online booking wired to your real availability. Customers pick a slot, get an instant confirmation, and land on your calendar — no phone tag, no double-bookings, no back-and-forth.",
      },
    ],
  },
  {
    key: "reputation",
    label: "Reputation & Reviews",
    tools: [
      {
        id: "mapguard",
        name: "MapGuard",
        slug: "mapguard",
        icon: MapPin,
        blurb: "Own the Google Maps Top-3 pack where customers search.",
        desc: "We watch your Google Business Profile every week and fix issues before customers ever see them — wrong hours, broken photos, suspensions, all handled. You show up where the searches turn into calls.",
      },
      {
        id: "reputationshield",
        name: "ReputationShield",
        slug: "reputationshield",
        icon: Star,
        blurb: "Every review requested at the right moment, every review answered.",
        desc: "Automatically asks happy customers for a review right when they're most likely to leave one, then drafts on-brand AI responses to every rating that comes in — so your star average climbs and nothing sits ignored.",
      },
    ],
  },
  {
    key: "growth",
    label: "Marketing & Growth",
    tools: [
      {
        id: "socialsync",
        name: "SocialSync",
        slug: "socialsync",
        icon: Share2,
        blurb: "Done-for-you social posts that keep you visible on autopilot.",
        desc: "Stay top-of-mind without hiring a marketer. SocialSync plans, writes, and schedules on-brand posts across your channels every month — you just glance and approve.",
      },
      {
        id: "rankflow",
        name: "RankFlow",
        slug: "rankflow",
        icon: TrendingUp,
        blurb: "Local SEO that outranks competitors — without the agency retainer.",
        desc: "Done-for-you local SEO that gets your business onto page one for the searches that actually bring jobs, without a $2k-a-month agency contract or a year-long wait.",
      },
      {
        id: "contentflow",
        name: "ContentFlow",
        slug: "contentflow",
        icon: PenTool,
        blurb: "Build search authority without writing a single word.",
        desc: "AI-written, trade-specific articles published to your site every month — answering the questions your customers are Googling and building the authority that lifts your whole domain.",
      },
      {
        id: "adflow",
        name: "AdFlow",
        slug: "adflow",
        icon: Megaphone,
        blurb: "Managed ads with real ROI reported in plain English.",
        desc: "Google and social ad campaigns built, launched, and optimized for you — with plain-English reporting on exactly what every dollar brought back, so you're never guessing where the budget went.",
      },
    ],
  },
  {
    key: "website",
    label: "Website",
    tools: [
      {
        id: "sitelaunch",
        name: "SiteLaunch",
        slug: "sitelaunch",
        icon: Globe,
        blurb: "A site that converts — designed and launched in about a week.",
        desc: "A fast, modern, trade-ready website built to turn visitors into booked jobs. Launched in roughly seven days — none of the multi-month agency timeline.",
      },
      {
        id: "webcare",
        name: "WebCare",
        slug: "webcare",
        icon: Shield,
        blurb: "We watch your site 24/7 so you never have to think about it.",
        desc: "Round-the-clock monitoring, updates, backups, and fixes for your website — so it stays fast, secure, and online while you're on the tools.",
      },
      {
        id: "webfix",
        name: "WebFix",
        slug: "webfix",
        icon: Gauge,
        blurb: "Turn a slow, invisible site into a fast, ranked one.",
        desc: "We audit, fix, and monitor your existing site until Lighthouse climbs from the 40s into the 90s — and your Google ranking follows the speed. Audit, fix, monitor.",
      },
    ],
  },
];

/* ── scoped CSS: responsive expanded grid + hover polish that inline can't do ─
 * Kept minimal — motion is driven by JS state (usePrefersReducedMotion), not
 * this stylesheet. Only layout/media-query rules live here. */
const SCOPED_CSS = `
  .wft-ts-body-inner {
    display: grid;
    grid-template-columns: 1.1fr 1fr;
    gap: 32px;
    align-items: start;
    padding: 4px 26px 26px;
  }
  @media (max-width: 900px) {
    .wft-ts-body-inner {
      grid-template-columns: 1fr;
      gap: 20px;
      padding: 4px 18px 22px;
    }
  }
  @media (max-width: 600px) {
    .wft-ts-section { padding-left: 18px !important; padding-right: 18px !important; }
    .wft-ts-head { padding: 16px 16px !important; }
  }
`;

/* ── styled placeholder mockup (real screenshots drop in here later) ─────── */
function MockupPanel({ tool }: { tool: Tool }) {
  const Icon = tool.icon;
  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        aspectRatio: "16 / 10",
        borderRadius: 14,
        // SOLID surface — not glass. Card interior stays high-contrast.
        background: "linear-gradient(160deg, #141b1d 0%, #10171a 100%)",
        border: "1px dashed rgba(110,139,255,0.35)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        overflow: "hidden",
      }}
    >
      {/* faint dotted texture so the placeholder reads as a deliberate frame */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.05) 1px, transparent 1px)",
          backgroundSize: "16px 16px",
          opacity: 0.6,
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "relative",
          width: 56,
          height: 56,
          borderRadius: 14,
          background: "rgba(13,60,252,0.12)",
          border: "1px solid rgba(110,139,255,0.28)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: mkt.accentOnDark,
        }}
      >
        <Icon size={26} strokeWidth={1.8} />
      </div>
      <div style={{ position: "relative", textAlign: "center" }}>
        <div
          style={{
            fontSize: 14,
            fontWeight: 700,
            color: mkt.onDark,
            fontFamily: typography.fontFamily,
            letterSpacing: "-0.01em",
          }}
        >
          {tool.name} preview
        </div>
        <div
          style={{
            marginTop: 4,
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            color: mkt.onDarkFaint,
            fontFamily: typography.fontFamily,
          }}
        >
          <ImageIcon size={13} strokeWidth={2} />
          Product screenshot coming soon
        </div>
      </div>
    </div>
  );
}

/* ── one accordion card ─────────────────────────────────────────────────── */
function AccordionCard({
  tool,
  open,
  onToggle,
  reduced,
}: {
  tool: Tool;
  open: boolean;
  onToggle: () => void;
  reduced: boolean;
}) {
  const [hover, setHover] = useState(false);
  const Icon = tool.icon;

  const borderColor = open || hover ? "rgba(13,60,252,0.55)" : mkt.onDarkBorder;
  const boxShadow = open
    ? "0 12px 32px rgba(13,60,252,0.16)"
    : hover
    ? "0 8px 24px rgba(13,60,252,0.10)"
    : "0 0 0 rgba(0,0,0,0)";

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        // SOLID card surface — text sits on high-contrast, never on glass.
        background: mkt.sectionLight,
        border: `1.5px solid ${borderColor}`,
        borderRadius: 18,
        overflow: "hidden",
        boxShadow,
        transition: reduced ? "none" : "border-color 0.25s ease, box-shadow 0.25s ease",
      }}
    >
      {/* header (clickable) */}
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="wft-ts-head"
        style={{
          all: "unset",
          boxSizing: "border-box",
          display: "flex",
          alignItems: "center",
          gap: 18,
          width: "100%",
          padding: "22px 26px",
          cursor: "pointer",
        }}
      >
        {/* icon tile — accent tint + accent icon (fill/icon use only) */}
        <span
          aria-hidden="true"
          style={{
            flexShrink: 0,
            width: 48,
            height: 48,
            borderRadius: 12,
            background: "rgba(13,60,252,0.12)",
            border: "1px solid rgba(110,139,255,0.22)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: mkt.accentOnDark,
          }}
        >
          <Icon size={24} strokeWidth={1.8} />
        </span>

        <span style={{ flex: "1 1 auto", minWidth: 0 }}>
          <span
            style={{
              display: "block",
              fontSize: 17,
              fontWeight: 700,
              color: mkt.onDark,
              fontFamily: typography.fontFamily,
              letterSpacing: "-0.01em",
              marginBottom: 4,
            }}
          >
            {tool.name}
          </span>
          <span
            style={{
              display: "block",
              fontSize: 14,
              fontWeight: 400,
              lineHeight: 1.5,
              color: mkt.onDarkMuted,
              fontFamily: typography.fontFamily,
            }}
          >
            {tool.blurb}
          </span>
        </span>

        {/* circular +/× toggle — rotates 45° on open */}
        <span
          aria-hidden="true"
          style={{
            flexShrink: 0,
            width: 32,
            height: 32,
            borderRadius: 999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: open ? "rgba(13,60,252,0.16)" : "rgba(255,255,255,0.06)",
            border: `1px solid ${open ? "rgba(110,139,255,0.45)" : "rgba(255,255,255,0.10)"}`,
            color: open ? mkt.onDark : mkt.onDarkMuted,
            transform: open ? "rotate(45deg)" : "rotate(0deg)",
            transition: reduced ? "none" : "background 0.2s ease, transform 0.3s ease, border-color 0.2s ease",
          }}
        >
          <Plus size={16} strokeWidth={2.5} />
        </span>
      </button>

      {/* fold — grid-template-rows 0fr → 1fr (WFT-canonical, not max-height) */}
      <div
        style={{
          display: "grid",
          gridTemplateRows: open ? "1fr" : "0fr",
          transition: reduced ? "none" : "grid-template-rows 0.4s ease",
        }}
      >
        <div style={{ overflow: "hidden", minHeight: 0 }}>
          <div className="wft-ts-body-inner">
            {/* left — product mockup placeholder */}
            <MockupPanel tool={tool} />

            {/* right — longer copy + See details link */}
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <p
                style={{
                  margin: 0,
                  fontSize: 14.5,
                  lineHeight: 1.7,
                  color: mkt.onDarkMuted,
                  fontFamily: typography.fontFamily,
                }}
              >
                {tool.desc}
              </p>
              <Link
                href={`/products/${tool.slug}`}
                style={{
                  alignSelf: "flex-start",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: 14,
                  fontWeight: 700,
                  color: mkt.accentOnDark,
                  textDecoration: "none",
                  fontFamily: typography.fontFamily,
                }}
              >
                See details
                <ArrowRight size={15} strokeWidth={2.5} />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── the section ────────────────────────────────────────────────────────── */
export default function ToolShowcase() {
  const reduced = usePrefersReducedMotion();
  const [activeTab, setActiveTab] = useState<string>(TABS[0].key);
  // Multi-open within a tab; switching tabs collapses everything.
  const [openCards, setOpenCards] = useState<Set<string>>(() => new Set());

  const activeTools = useMemo(
    () => TABS.find((t) => t.key === activeTab)?.tools ?? [],
    [activeTab],
  );

  const selectTab = (key: string) => {
    if (key === activeTab) return;
    setActiveTab(key);
    setOpenCards(new Set()); // collapse all on tab switch
  };

  const toggleCard = (id: string) => {
    setOpenCards((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <section
      className="wft-ts-section"
      style={{
        background: mkt.darkBg,
        padding: "88px 28px",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <style>{SCOPED_CSS}</style>

      {/* soft brand-blue ambient glow (decor only, behind everything) */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          top: "-10%",
          left: "50%",
          transform: "translateX(-50%)",
          width: 900,
          height: 480,
          background:
            "radial-gradient(ellipse at center, rgba(13,60,252,0.10) 0%, rgba(13,60,252,0.03) 45%, transparent 72%)",
          pointerEvents: "none",
          zIndex: 0,
        }}
      />

      <div style={{ position: "relative", zIndex: 1, maxWidth: 1120, margin: "0 auto" }}>
        {/* eyebrow */}
        <div style={{ textAlign: "center" }}>
          <span
            style={{
              display: "inline-block",
              padding: "8px 16px",
              borderRadius: 999,
              background: "rgba(13,60,252,0.10)",
              border: "1px solid rgba(13,60,252,0.28)",
              color: mkt.accentOnDark,
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              fontFamily: typography.fontFamily,
              marginBottom: 20,
            }}
          >
            The whole suite
          </span>
        </div>

        {/* two-tone headline */}
        <h2
          style={{
            margin: "0 0 16px",
            textAlign: "center",
            fontSize: "clamp(28px, 4.6vw, 42px)",
            fontWeight: 800,
            lineHeight: 1.12,
            letterSpacing: "-0.02em",
            color: mkt.onDark,
            fontFamily: typography.fontFamily,
          }}
        >
          Every tool you need,{" "}
          <span style={{ color: mkt.accentOnDark }}>working while you work.</span>
        </h2>

        {/* subhead */}
        <p
          style={{
            margin: "0 auto 40px",
            maxWidth: 700,
            textAlign: "center",
            fontSize: 17,
            lineHeight: 1.6,
            color: mkt.onDarkMuted,
            fontFamily: typography.fontFamily,
          }}
        >
          One modular AI office for trades — answer every lead, price the job, climb Google,
          and protect your reputation. Turn on what you need. Skip the rest.
        </p>

        {/* tab pill bar — glass on chrome (allowed) */}
        <div
          className="wft-glass-regular"
          role="tablist"
          aria-label="Tool categories"
          style={{
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "center",
            gap: 6,
            padding: 6,
            borderRadius: 14,
            maxWidth: 720,
            margin: "0 auto 40px",
          }}
        >
          {TABS.map((tab) => {
            const active = tab.key === activeTab;
            return (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => selectTab(tab.key)}
                style={{
                  all: "unset",
                  boxSizing: "border-box",
                  flex: "1 1 auto",
                  textAlign: "center",
                  whiteSpace: "nowrap",
                  padding: "12px 16px",
                  borderRadius: 10,
                  cursor: "pointer",
                  fontSize: 13.5,
                  fontWeight: 600,
                  fontFamily: typography.fontFamily,
                  // Active = accent outline + soft tint (NOT a bright fill).
                  background: active ? "rgba(13,60,252,0.16)" : "transparent",
                  border: active
                    ? "1px solid rgba(110,139,255,0.55)"
                    : "1px solid transparent",
                  color: active ? mkt.onDark : mkt.onDarkMuted,
                  transition: reduced ? "none" : "background 0.2s ease, color 0.2s ease, border-color 0.2s ease",
                }}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* accordion list for the active tab */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 900, margin: "0 auto" }}>
          {activeTools.map((tool) => (
            <AccordionCard
              key={tool.id}
              tool={tool}
              open={openCards.has(tool.id)}
              onToggle={() => toggleCard(tool.id)}
              reduced={reduced}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
