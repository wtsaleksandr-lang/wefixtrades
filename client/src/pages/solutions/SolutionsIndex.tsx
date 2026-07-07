import { useMemo, useState } from "react";
import { Link } from "wouter";
import { ArrowUpRight, Search } from "lucide-react";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { PageMeta } from "@/components/seo/PageMeta";
import { mkt } from "@/theme/tokens";
import { V7Hero, V7Section, V7Container, V7PageShell, V7SectionHeading, V7FinalCta } from "@/components/marketing/v7";
import { Reveal } from "@/components/effortel-blocks";
import { NavIcon } from "@/components/marketing/navigation/NavIcon";
import { TRADES } from "@/site/trades";
import type { Trade, TradeCategory } from "@/site/trades";

/**
 * /solutions — the canonical trade-solutions catalogue index.
 *
 * Lists every trade from the TRADES single-source-of-truth
 * (client/src/site/trades.ts), grouped into its category section, each
 * rendered as a card linking to its /solutions/{slug} SolutionPage.
 *
 * A live search input filters the whole grid by trade label so a visitor
 * can jump straight to their trade. Categories with no match after
 * filtering are hidden; an empty-state hint shows when nothing matches.
 *
 * Chrome + tokens mirror /products (ProductIndex.tsx): MarketingLayout →
 * PageMeta → V7PageShell → V7Hero → V7Section grid → V7FinalCta. Icons
 * reuse the shared NavIcon set; all colours come from mkt.* tokens.
 */

// Display order for the category sections. Every TradeCategory must appear
// here so no trade is silently dropped from the catalogue.
const CATEGORY_ORDER: { key: TradeCategory; eyebrow: string; title: string }[] = [
  { key: "Exterior",    eyebrow: "Exterior · roofs, siding & envelope", title: "Exterior trades" },
  { key: "Interior",    eyebrow: "Interior · finish & fit-out",         title: "Interior trades" },
  { key: "Mechanical",  eyebrow: "Mechanical · systems & repair",       title: "Mechanical trades" },
  { key: "Outdoor",     eyebrow: "Outdoor · yard, water & hardscape",   title: "Outdoor trades" },
  { key: "Restoration", eyebrow: "Restoration · water, mold & damage",  title: "Restoration trades" },
  { key: "Specialty",   eyebrow: "Specialty · everything else",         title: "Specialty trades" },
];

function TradeCard({ trade, i }: { trade: Trade; i: number }) {
  const [hover, setHover] = useState(false);

  return (
    <Reveal delay={Math.min(i, 6) * 0.04}>
      <Link
        href={`/solutions/${trade.slug}`}
        data-testid={`solution-card-${trade.slug}`}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 12,
          height: "100%",
          textDecoration: "none",
          background: mkt.sectionLight,
          border: `1px solid ${hover ? "rgba(13,60,252,0.45)" : mkt.onDarkBorder}`,
          borderRadius: 16,
          padding: "20px 20px 22px",
          position: "relative",
          overflow: "hidden",
          transform: hover ? "translateY(-3px)" : "translateY(0)",
          boxShadow: hover ? "0 18px 40px rgba(0,0,0,0.35)" : "0 0 0 rgba(0,0,0,0)",
          transition:
            "transform 320ms cubic-bezier(0.22,1,0.36,1), box-shadow 320ms cubic-bezier(0.22,1,0.36,1), border-color 320ms ease",
        }}
      >
        {/* Top-right corner arrow — appears on hover */}
        <div
          style={{
            position: "absolute",
            top: 14,
            right: 14,
            width: 28,
            height: 28,
            borderRadius: 8,
            background: "rgba(255,255,255,0.10)",
            color: mkt.onDark,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            opacity: hover ? 1 : 0,
            transform: hover ? "translate(0,0)" : "translate(6px,-6px)",
            transition: "opacity 260ms ease, transform 260ms cubic-bezier(0.22,1,0.36,1)",
            pointerEvents: "none",
          }}
        >
          <ArrowUpRight size={16} strokeWidth={2.2} />
        </div>

        {/* Icon badge */}
        <div
          style={{
            flexShrink: 0,
            width: 44,
            height: 44,
            borderRadius: 12,
            background: mkt.accentTint,
            color: mkt.accentOnDark,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <NavIcon icon={trade.icon} size={24} strokeWidth={1.7} />
        </div>

        <h3
          style={{
            fontSize: 16,
            fontWeight: 700,
            color: mkt.onDark,
            letterSpacing: "-0.01em",
            lineHeight: 1.25,
            margin: 0,
            paddingRight: 24,
          }}
        >
          {trade.label}
        </h3>

        <p
          style={{
            fontSize: 13.5,
            color: mkt.onDarkMuted,
            lineHeight: 1.55,
            margin: 0,
          }}
        >
          {trade.description}
        </p>
      </Link>
    </Reveal>
  );
}

export default function SolutionsIndex() {
  const [query, setQuery] = useState("");

  const normalized = query.trim().toLowerCase();

  // Group trades by category, applying the live label filter. Preserves the
  // declaration order within each category (TRADES order).
  const sections = useMemo(() => {
    return CATEGORY_ORDER.map((cat) => {
      const items = TRADES.filter(
        (t) =>
          t.category === cat.key &&
          (normalized === "" ||
            t.label.toLowerCase().includes(normalized) ||
            t.shortLabel.toLowerCase().includes(normalized)),
      );
      return { ...cat, items };
    }).filter((section) => section.items.length > 0);
  }, [normalized]);

  const totalMatches = sections.reduce((n, s) => n + s.items.length, 0);

  return (
    <MarketingLayout>
      <PageMeta
        title="Solutions by trade — WeFixTrades"
        description="Browse WeFixTrades solutions for every trade — plumbers, electricians, roofers, HVAC, landscapers, remediation, and 40+ more. Find your trade and see the tools built for it."
        canonical="/solutions"
        keywords={["wefixtrades solutions", "trade software by trade", "contractor software"]}
      />
      <V7PageShell>
        <V7Hero
          productName="Solutions"
          eyebrow="Built for your trade — not generic SaaS."
          headline={
            <>
              Solutions by trade.
              <br />
              <span style={{ color: mkt.accentOnDark }}>Find yours in seconds.</span>
            </>
          }
          sub="Every trade runs differently. Pick yours to see the exact stack — instant quotes, 24/7 AI answering, Google rankings, reviews — tuned to how your jobs actually book."
          ctas={[
            { label: "See Pricing", href: "/pricing" },
            { label: "Talk to Sales", href: "/contact" },
          ]}
        />

        {/* Search / filter bar */}
        <V7Section padding={0}>
          <V7Container maxWidth={720}>
            <div style={{ paddingTop: 8 }}>
              <label
                htmlFor="solutions-search"
                style={{
                  display: "block",
                  fontSize: 12,
                  fontWeight: 600,
                  color: mkt.onDarkMuted,
                  letterSpacing: "0.02em",
                  marginBottom: 8,
                }}
              >
                Search trades
              </label>
              <div style={{ position: "relative" }}>
                <span
                  style={{
                    position: "absolute",
                    left: 16,
                    top: "50%",
                    transform: "translateY(-50%)",
                    color: mkt.onDarkFaint,
                    display: "flex",
                    pointerEvents: "none",
                  }}
                >
                  <Search size={20} strokeWidth={1.8} />
                </span>
                <input
                  id="solutions-search"
                  type="text"
                  inputMode="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="e.g. plumbers, roofing, HVAC…"
                  data-testid="solutions-search-input"
                  aria-label="Search trades"
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    padding: "14px 16px 14px 46px",
                    fontSize: 15,
                    color: mkt.onDark,
                    background: mkt.sectionLight,
                    border: `1px solid ${mkt.onDarkBorder}`,
                    borderRadius: 12,
                    outline: "none",
                  }}
                />
              </div>
            </div>
          </V7Container>
        </V7Section>

        {/* Category sections */}
        {sections.length === 0 ? (
          <V7Section padding="64px">
            <V7Container maxWidth={720}>
              <div
                data-testid="solutions-empty"
                style={{
                  textAlign: "center",
                  padding: "48px 24px",
                  border: `1px dashed ${mkt.onDarkBorder}`,
                  borderRadius: 16,
                  color: mkt.onDarkMuted,
                }}
              >
                <p style={{ fontSize: 16, margin: 0 }}>
                  No trades match &ldquo;{query.trim()}&rdquo;.
                </p>
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  style={{
                    marginTop: 16,
                    padding: "10px 18px",
                    fontSize: 14,
                    fontWeight: 600,
                    color: mkt.onDark,
                    background: "transparent",
                    border: `1px solid ${mkt.ctaSecondaryBorder}`,
                    borderRadius: 10,
                    cursor: "pointer",
                  }}
                >
                  Clear search
                </button>
              </div>
            </V7Container>
          </V7Section>
        ) : (
          sections.map((section) => (
            <V7Section key={section.key} padding="64px">
              <V7Container>
                <V7SectionHeading
                  eyebrow={section.eyebrow}
                  title={section.title}
                  align="left"
                />
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
                    gap: 16,
                  }}
                >
                  {section.items.map((trade, i) => (
                    <TradeCard key={trade.slug} trade={trade} i={i} />
                  ))}
                </div>
              </V7Container>
            </V7Section>
          ))
        )}

        {normalized !== "" && sections.length > 0 && (
          <V7Section padding={0}>
            <V7Container>
              <p
                style={{
                  fontSize: 13,
                  color: mkt.onDarkFaint,
                  textAlign: "center",
                  margin: 0,
                }}
              >
                {totalMatches} {totalMatches === 1 ? "trade" : "trades"} match your search.
              </p>
            </V7Container>
          </V7Section>
        )}

        <V7FinalCta
          title={
            <>
              Don&rsquo;t see your exact trade?
              <br />
              <span style={{ color: mkt.accentOnDark }}>We still fix it.</span>
            </>
          }
          sub="The stack works for any home-service trade. Pick a plan and we tune it to how your jobs book — no card required."
          primaryCta={{ label: "See Pricing", href: "/pricing" }}
        />
      </V7PageShell>
    </MarketingLayout>
  );
}
