import { useState, useEffect, type CSSProperties } from "react";
import { Check, ChevronDown, Zap, Shield, Eye, Globe, Wrench, ArrowRight } from "lucide-react";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { mkt, shadows, typography } from "@/theme/tokens";
import {
  ALL_PRODUCTS, YEARLY_DISCOUNT_PCT,
  SITELAUNCH, TRADELINE, FIX_OPTIMIZE,
  BUNDLE_STARTER, BUNDLE_GROWTH, BUNDLE_PRO,
  yearlyMonthlyEquiv, formatPrice, bundleSavings,
  type ProductDef, type BundleDef, type Tier,
} from "@/config/pricing";

/* ═══════════════════════════════════════════
   CONSTANTS
   ═══════════════════════════════════════════ */

const MAX_W: CSSProperties = { maxWidth: 1200, margin: "0 auto", padding: "0 24px" };
const FONT = typography.fontFamily;
const CARD_RADIUS = 16;
const CARD_BG = "rgba(255,255,255,0.03)";
const CARD_BORDER = "1px solid rgba(255,255,255,0.08)";
const GLOW = `0 0 60px rgba(102,232,250,0.12), 0 0 20px rgba(102,232,250,0.06)`;
const GLOW_STRONG = `0 0 60px rgba(102,232,250,0.18), 0 0 30px rgba(102,232,250,0.10)`;

/* F: stronger contrast color for important secondary text */
const TEXT_STRONG = mkt.text; // #D5E1E7 instead of mkt.textMuted (#B1C5CE)

const CATEGORY_MAP: Record<string, { label: string; icon: typeof Zap }> = {
  leads: { label: "Lead Generation", icon: Zap },
  visibility: { label: "Visibility & Growth", icon: Eye },
  reputation: { label: "Reputation", icon: Shield },
  website: { label: "Website", icon: Globe },
};

const CATEGORY_ORDER = ["leads", "visibility", "reputation", "website"];

/* B: bundle CTA labels */
const BUNDLE_CTA: Record<string, string> = {
  "bundle-starter": "Start with Starter",
  "bundle-growth": "Choose Growth \u2014 Most Popular",
  "bundle-pro": "Go Pro",
};

/* ═══════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════ */

function displayPrice(price: number, yearly: boolean, billingPeriod: "monthly" | "one-time"): string {
  if (billingPeriod === "one-time") return formatPrice(price);
  return formatPrice(yearly ? yearlyMonthlyEquiv(price) : price);
}

function approxCalls(mins: number): number {
  return Math.round(mins * 1.5);
}

/** A: total value of a bundle's included services */
function bundleValue(bundle: BundleDef): number {
  return bundle.includes.reduce((sum, item) => sum + item.value, 0);
}

/* ═══════════════════════════════════════════
   BILLING TOGGLE
   ═══════════════════════════════════════════ */

function BillingToggle({ yearly, onChange }: { yearly: boolean; onChange: (y: boolean) => void }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div
        style={{
          display: "inline-flex",
          borderRadius: 999,
          background: "rgba(255,255,255,0.05)",
          border: "1px solid rgba(255,255,255,0.08)",
          padding: 3,
        }}
      >
        {(["monthly", "yearly"] as const).map((opt) => {
          const active = opt === "yearly" ? yearly : !yearly;
          return (
            <button
              key={opt}
              onClick={() => onChange(opt === "yearly")}
              style={{
                position: "relative",
                zIndex: 1,
                padding: "10px 24px",
                borderRadius: 999,
                border: "none",
                background: active ? mkt.accent : "transparent",
                color: active ? mkt.dark : mkt.textMuted,
                fontSize: 14,
                fontWeight: active ? 700 : 500,
                fontFamily: FONT,
                cursor: "pointer",
                transition: "all 0.25s ease",
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              {opt === "monthly" ? "Monthly" : "Yearly"}
              {opt === "yearly" && (
                <span
                  style={{
                    background: active ? "rgba(0,0,0,0.15)" : mkt.accentTint,
                    color: active ? mkt.dark : mkt.accent,
                    fontSize: 10,
                    fontWeight: 800,
                    padding: "3px 8px",
                    borderRadius: 999,
                    letterSpacing: "0.04em",
                  }}
                >
                  -{Math.round(YEARLY_DISCOUNT_PCT * 100)}%
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   VIEW SWITCH
   ═══════════════════════════════════════════ */

function ViewSwitch({ view, onChange }: { view: "plans" | "services"; onChange: (v: "plans" | "services") => void }) {
  return (
    <div style={{ display: "flex", justifyContent: "center" }}>
      <div
        style={{
          display: "inline-flex",
          borderRadius: 12,
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.06)",
          padding: 3,
        }}
      >
        {([
          { key: "plans" as const, label: "Plans" },
          { key: "services" as const, label: "Individual Services" },
        ]).map(({ key, label }) => {
          const active = view === key;
          return (
            <button
              key={key}
              onClick={() => onChange(key)}
              style={{
                padding: "9px 22px",
                borderRadius: 10,
                border: "none",
                background: active ? "rgba(255,255,255,0.08)" : "transparent",
                color: active ? mkt.onDark : mkt.textMuted,
                fontSize: 13,
                fontWeight: active ? 600 : 500,
                fontFamily: FONT,
                cursor: "pointer",
                transition: "all 0.2s ease",
              }}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   CHECK ITEM
   ═══════════════════════════════════════════ */

function CheckItem({ children }: { children: React.ReactNode }) {
  return (
    <li style={{ display: "flex", alignItems: "flex-start", gap: 10, fontSize: 14, color: TEXT_STRONG, lineHeight: 1.5 }}>
      <Check size={15} color={mkt.accent} strokeWidth={2.5} style={{ flexShrink: 0, marginTop: 3 }} />
      <span>{children}</span>
    </li>
  );
}

/* ═══════════════════════════════════════════
   CTA BUTTON
   ═══════════════════════════════════════════ */

function CTAButton({ label, highlighted, fullWidth }: { label: string; highlighted?: boolean; fullWidth?: boolean }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        width: fullWidth ? "100%" : "auto",
        padding: "14px 28px",
        borderRadius: 12,
        border: highlighted ? "none" : `1px solid rgba(255,255,255,0.12)`,
        background: highlighted
          ? hover ? mkt.accentHover : mkt.accent
          : hover ? "rgba(255,255,255,0.08)" : "transparent",
        color: highlighted ? mkt.dark : mkt.onDark,
        fontSize: 14,
        fontWeight: 700,
        fontFamily: FONT,
        cursor: "pointer",
        transition: "all 0.2s ease",
        transform: hover ? "translateY(-1px)" : "none",
        boxShadow: hover && highlighted ? shadows.focus : "none",
        letterSpacing: "0.01em",
      }}
    >
      {label}
    </button>
  );
}

/* ═══════════════════════════════════════════
   EXPANDABLE DETAILS
   ═══════════════════════════════════════════ */

function ExpandableDetails({ label, children }: { label?: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          background: "none",
          border: "none",
          color: mkt.accent,
          fontSize: 13,
          fontWeight: 600,
          fontFamily: FONT,
          cursor: "pointer",
          padding: "6px 0",
          transition: "opacity 0.2s",
          opacity: 0.85,
        }}
        onMouseEnter={(e) => { e.currentTarget.style.opacity = "1"; }}
        onMouseLeave={(e) => { e.currentTarget.style.opacity = "0.85"; }}
      >
        {label || "View details"}
        <ChevronDown
          size={14}
          style={{
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 0.25s ease",
          }}
        />
      </button>
      {open && (
        <div style={{ marginTop: 8, paddingTop: 10, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          {children}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════
   BUNDLE CARD (PLANS VIEW)
   A: simplified — value anchor, no per-item prices, no divider
   G: reduced density
   ═══════════════════════════════════════════ */

function BundleCard({ bundle, yearly, ctaLabel }: { bundle: BundleDef; yearly: boolean; ctaLabel: string }) {
  const hl = !!bundle.highlighted;
  const price = yearly ? yearlyMonthlyEquiv(bundle.price) : bundle.price;
  const totalValue = bundleValue(bundle);
  const [hover, setHover] = useState(false);

  return (
    <div
      className="pricing-card"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: CARD_BG,
        border: hl ? `2px solid ${mkt.accent}` : CARD_BORDER,
        borderRadius: CARD_RADIUS,
        padding: hl ? "32px 26px 28px" : "28px 26px 28px",
        display: "flex",
        flexDirection: "column",
        position: "relative",
        transition: "all 0.3s ease",
        transform: hover ? "translateY(-4px)" : hl ? "translateY(-4px)" : "none",
        boxShadow: hl ? (hover ? GLOW_STRONG : GLOW) : hover ? shadows.lg : "none",
      }}
    >
      {/* Badge */}
      {bundle.badge && (
        <div
          style={{
            position: "absolute",
            top: -13,
            left: "50%",
            transform: "translateX(-50%)",
            background: mkt.accent,
            color: mkt.dark,
            fontSize: 11,
            fontWeight: 800,
            padding: "5px 18px",
            borderRadius: 999,
            letterSpacing: "0.04em",
            whiteSpace: "nowrap",
          }}
        >
          {bundle.badge}
        </div>
      )}

      {/* Name */}
      <div style={{ fontSize: 18, fontWeight: 700, color: mkt.onDark, marginBottom: 2, fontFamily: FONT }}>
        {bundle.name}
      </div>

      {/* Tagline — F: stronger contrast */}
      <div style={{ fontSize: 13, color: TEXT_STRONG, marginBottom: 16, lineHeight: 1.5 }}>
        {bundle.tagline}
      </div>

      {/* A: Value anchor — struck-through total value */}
      <div style={{ fontSize: 13, color: mkt.textMuted, marginBottom: 4 }}>
        <span style={{ textDecoration: "line-through" }}>{formatPrice(totalValue)}/mo value</span>
      </div>

      {/* Price */}
      <div style={{ marginBottom: 2 }}>
        <span style={{ fontSize: 42, fontWeight: 800, color: mkt.onDark, fontFamily: FONT, letterSpacing: "-0.03em", lineHeight: 1 }}>
          {formatPrice(price)}
        </span>
        <span style={{ fontSize: 15, fontWeight: 500, color: TEXT_STRONG, marginLeft: 4 }}>/mo</span>
      </div>

      {/* Yearly note — F: stronger contrast */}
      {yearly && (
        <div style={{ fontSize: 12, color: TEXT_STRONG, marginBottom: 14 }}>billed annually</div>
      )}
      {!yearly && <div style={{ height: 14 }} />}

      {/* A: Includes — service names only, no per-item prices */}
      <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 8, flex: 1, marginBottom: 20 }}>
        {bundle.includes.map((item) => (
          <CheckItem key={item.tierId}>{item.label}</CheckItem>
        ))}
      </ul>

      {/* C: specific CTA */}
      <CTAButton label={ctaLabel} highlighted={hl} fullWidth />

      {/* A: expandable shows per-item breakdown + features (non-duplicate content) */}
      <div style={{ marginTop: 12 }}>
        <ExpandableDetails label="What's included">
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {bundle.includes.map((item) => {
              const product = ALL_PRODUCTS.find(p => p.id === item.productId);
              const tier = product?.tiers.find(t => t.id === item.tierId);
              if (!tier) return null;
              return (
                <div key={item.tierId}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: mkt.onDark, marginBottom: 3 }}>
                    {item.label} <span style={{ fontWeight: 400, color: mkt.textMuted }}>({formatPrice(item.value)}/mo)</span>
                  </div>
                  <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 2 }}>
                    {tier.features.map((f) => (
                      <li key={f} style={{ fontSize: 12, color: mkt.textMuted, display: "flex", alignItems: "center", gap: 6 }}>
                        <Check size={11} color={mkt.accent} strokeWidth={2.5} />
                        {f}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </ExpandableDetails>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   FIX & OPTIMIZE CALLOUT (D: repositioned above bundles)
   ═══════════════════════════════════════════ */

function FixOptimizeCallout() {
  return (
    <div
      style={{
        background: "rgba(255,255,255,0.02)",
        border: "1px solid rgba(255,255,255,0.06)",
        borderRadius: 12,
        padding: "16px 24px",
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 16,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12, flex: "1 1 300px" }}>
        <Wrench size={18} color={mkt.accent} style={{ flexShrink: 0 }} />
        <div>
          <span style={{ fontSize: 14, fontWeight: 600, color: TEXT_STRONG }}>
            Not ready for a monthly plan?
          </span>
          <span style={{ fontSize: 14, color: mkt.textMuted, marginLeft: 6 }}>
            Start with a one-time optimization.
          </span>
        </div>
      </div>
      <CTAButton label={`Get Fix & Optimize \u2014 ${formatPrice(FIX_OPTIMIZE.tiers[0].price)}`} />
    </div>
  );
}

/* ═══════════════════════════════════════════
   SITELAUNCH CARD (E: improved positioning, left-aligned)
   ═══════════════════════════════════════════ */

function SiteLaunchCard() {
  const tier = SITELAUNCH.tiers[0];
  const [expanded, setExpanded] = useState(false);
  const [hover, setHover] = useState(false);

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: CARD_BG,
        border: `1px solid rgba(102,232,250,0.15)`,
        borderRadius: CARD_RADIUS,
        padding: "28px 28px 24px",
        transition: "all 0.3s ease",
        transform: hover ? "translateY(-2px)" : "none",
        boxShadow: hover ? GLOW : "none",
        position: "relative",
      }}
    >
      {/* Trial badge */}
      <div
        style={{
          display: "inline-flex",
          background: mkt.accentTint,
          color: mkt.accent,
          fontSize: 11,
          fontWeight: 700,
          padding: "4px 12px",
          borderRadius: 999,
          letterSpacing: "0.02em",
          marginBottom: 12,
        }}
      >
        Includes 14-day free trial
      </div>

      {/* E: Left-aligned layout throughout */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 24, alignItems: "flex-start" }}>
        <div style={{ flex: "1 1 320px" }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: mkt.onDark, fontFamily: FONT }}>{SITELAUNCH.name}</div>
          <div style={{ fontSize: 14, color: TEXT_STRONG, marginTop: 4, marginBottom: 16, lineHeight: 1.5 }}>
            {SITELAUNCH.tagline}
          </div>

          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 6 }}>
            {tier.features.filter(f => !f.startsWith("BONUS")).slice(0, 5).map((f) => (
              <CheckItem key={f}>{f}</CheckItem>
            ))}
          </ul>
        </div>

        {/* E: Price + CTA left-aligned on mobile, right on desktop */}
        <div className="sitelaunch-price-col" style={{ flex: "0 0 auto", display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <span style={{ fontSize: 36, fontWeight: 800, color: mkt.onDark, fontFamily: FONT, letterSpacing: "-0.03em" }}>
              {formatPrice(tier.price)}
            </span>
            <span style={{ fontSize: 14, color: TEXT_STRONG, marginLeft: 4 }}>one-time</span>
          </div>
          <CTAButton label="Get Started" highlighted />
        </div>
      </div>

      {/* Expandable trial details */}
      <div style={{ marginTop: 14 }}>
        <ExpandableDetails label="What\u2019s in the free trial?">
          <div style={{ padding: "10px 14px", background: "rgba(255,255,255,0.02)", borderRadius: 10, border: "1px solid rgba(255,255,255,0.05)" }}>
            <div style={{ fontSize: 12, color: TEXT_STRONG, marginBottom: 8 }}>
              Auto-converts after 14 days unless cancelled
            </div>
            <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Check size={13} color={mkt.accent} strokeWidth={2.5} />
                <span style={{ fontSize: 13, color: mkt.onDark }}>TradeLine Starter</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Check size={13} color={mkt.accent} strokeWidth={2.5} />
                <span style={{ fontSize: 13, color: mkt.onDark }}>QuoteQuick Pro</span>
              </div>
            </div>
          </div>
        </ExpandableDetails>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   SERVICE CARD (H: simplified)
   ═══════════════════════════════════════════ */

function ServiceCard({ product, yearly }: { product: ProductDef; yearly: boolean }) {
  const [activeTier, setActiveTier] = useState(0);
  const [hover, setHover] = useState(false);
  const isTradelineProduct = product.id === "tradeline";
  const monthlyTiers = product.tiers.filter(t => t.billingPeriod === "monthly");
  const setupTier = product.tiers.find(t => t.billingPeriod === "one-time");
  const displayTiers = monthlyTiers.length > 0 ? monthlyTiers : product.tiers;
  const currentTier = displayTiers[activeTier] || displayTiers[0];

  return (
    <div
      className="pricing-card"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: CARD_BG,
        border: CARD_BORDER,
        borderRadius: CARD_RADIUS,
        padding: "24px 22px 22px",
        display: "flex",
        flexDirection: "column",
        transition: "all 0.3s ease",
        transform: hover ? "translateY(-3px)" : "none",
        boxShadow: hover ? shadows.lg : "none",
      }}
    >
      {/* Header */}
      <div style={{ fontSize: 17, fontWeight: 700, color: mkt.onDark, fontFamily: FONT, marginBottom: 4 }}>
        {product.name}
      </div>
      <div style={{ fontSize: 13, color: TEXT_STRONG, lineHeight: 1.5, marginBottom: 14 }}>
        {product.tagline}
      </div>

      {/* Setup fee */}
      {product.setup && (
        <div style={{ fontSize: 12, color: mkt.textMuted, marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
          <Wrench size={12} />
          Setup: {formatPrice(product.setup)} one-time
        </div>
      )}

      {/* H1: Tier tabs — bigger tap targets */}
      {displayTiers.length > 1 && (
        <div style={{ display: "flex", gap: 2, marginBottom: 14, background: "rgba(255,255,255,0.03)", borderRadius: 10, padding: 3 }}>
          {displayTiers.map((tier, i) => {
            const active = activeTier === i;
            return (
              <button
                key={tier.id}
                onClick={() => setActiveTier(i)}
                style={{
                  flex: 1,
                  padding: "10px 12px",
                  minHeight: 40,
                  borderRadius: 8,
                  border: "none",
                  background: active ? "rgba(255,255,255,0.08)" : "transparent",
                  color: active ? mkt.onDark : mkt.textMuted,
                  fontSize: 13,
                  fontWeight: active ? 700 : 500,
                  fontFamily: FONT,
                  cursor: "pointer",
                  transition: "all 0.2s ease",
                }}
              >
                {tier.name}
                {tier.badge && active && (
                  <span style={{ display: "block", fontSize: 10, color: mkt.accent, fontWeight: 700, marginTop: 1 }}>{tier.badge}</span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Price */}
      <div style={{ marginBottom: 14 }}>
        <span style={{ fontSize: 34, fontWeight: 800, color: mkt.onDark, fontFamily: FONT, letterSpacing: "-0.03em", lineHeight: 1 }}>
          {displayPrice(currentTier.price, yearly, currentTier.billingPeriod)}
        </span>
        <span style={{ fontSize: 14, color: TEXT_STRONG, marginLeft: 4 }}>
          {currentTier.billingPeriod === "monthly" ? "/mo" : "one-time"}
        </span>
        {yearly && currentTier.billingPeriod === "monthly" && (
          <div style={{ fontSize: 12, color: TEXT_STRONG, marginTop: 3 }}>billed annually</div>
        )}
      </div>

      {/* TradeLine: usage callout */}
      {isTradelineProduct && currentTier.includedMins && (
        <div style={{ marginBottom: 14, padding: "10px 14px", background: mkt.accentTint, borderRadius: 10, border: `1px solid rgba(102,232,250,0.08)` }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: mkt.accent }}>
            Includes {currentTier.includedMins} mins (~{approxCalls(currentTier.includedMins)} calls)
          </div>
          <div style={{ fontSize: 11, color: TEXT_STRONG, marginTop: 3 }}>
            Flexible usage — small per-minute cost after included usage
          </div>
        </div>
      )}

      {/* H3: only 3-5 key features */}
      <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 6, flex: 1, marginBottom: 18 }}>
        {currentTier.features.filter(f => !f.includes("minutes included")).slice(0, 5).map((f) => (
          <CheckItem key={f}>{f}</CheckItem>
        ))}
      </ul>

      {/* C: specific CTA */}
      <CTAButton label="Start This Service" highlighted={!!currentTier.highlighted} fullWidth />

      {/* H2: simple expandable — list only, no multi-column grid */}
      {(displayTiers.length > 1 || setupTier) && (
        <div style={{ marginTop: 12 }}>
          <ExpandableDetails label="Compare tiers">
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {displayTiers.map((tier) => (
                <div key={tier.id} style={{ paddingBottom: 10, borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: mkt.onDark }}>{tier.name}</span>
                    <span style={{ fontSize: 14, fontWeight: 700, color: mkt.onDark }}>
                      {displayPrice(tier.price, yearly, tier.billingPeriod)}
                      <span style={{ fontSize: 11, fontWeight: 500, color: mkt.textMuted }}>/mo</span>
                    </span>
                  </div>
                  <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 3 }}>
                    {tier.features.map((f) => (
                      <li key={f} style={{ fontSize: 12, color: mkt.textMuted, display: "flex", alignItems: "center", gap: 6 }}>
                        <Check size={11} color={mkt.accent} strokeWidth={2.5} />
                        {f}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              {setupTier && (
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: mkt.onDark }}>{setupTier.name}</span>
                    <span style={{ fontSize: 14, fontWeight: 700, color: mkt.onDark }}>
                      {formatPrice(setupTier.price)}
                      <span style={{ fontSize: 11, fontWeight: 500, color: mkt.textMuted }}> one-time</span>
                    </span>
                  </div>
                  <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 3 }}>
                    {setupTier.features.map(f => (
                      <li key={f} style={{ fontSize: 12, color: mkt.textMuted, display: "flex", alignItems: "center", gap: 6 }}>
                        <Check size={11} color={mkt.accent} strokeWidth={2.5} />
                        {f}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </ExpandableDetails>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════
   SECTION LABEL
   ═══════════════════════════════════════════ */

function SectionLabel({ icon: Icon, label }: { icon: typeof Zap; label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
      <div style={{ width: 32, height: 32, borderRadius: 8, background: mkt.accentTint, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Icon size={16} color={mkt.accent} />
      </div>
      <span style={{ fontSize: 14, fontWeight: 700, color: mkt.onDark, fontFamily: FONT }}>
        {label}
      </span>
    </div>
  );
}

/* ═══════════════════════════════════════════
   MAIN PAGE
   ═══════════════════════════════════════════ */

export default function PricingUnified() {
  const [yearly, setYearly] = useState(false);
  const [view, setView] = useState<"plans" | "services">("plans");

  useEffect(() => {
    document.title = "Pricing — WeFixTrades";
  }, []);

  /* B: mobile reorder — Growth first */
  const bundlesDesktop = [BUNDLE_STARTER, BUNDLE_GROWTH, BUNDLE_PRO];
  const bundlesMobile = [BUNDLE_GROWTH, BUNDLE_STARTER, BUNDLE_PRO];

  const productsByCategory = CATEGORY_ORDER.map(cat => ({
    cat,
    ...CATEGORY_MAP[cat],
    products: ALL_PRODUCTS.filter(p => p.category === cat),
  })).filter(g => g.products.length > 0);

  return (
    <MarketingLayout>
      <div style={{ paddingBottom: 80 }}>
        {/* ═══ HERO — I: reduced top padding ═══ */}
        <section className="pricing-hero" style={{ textAlign: "center", padding: "48px 24px 0" }}>
          <div style={MAX_W}>
            <h1
              style={{
                fontSize: "clamp(28px, 5vw, 48px)",
                fontWeight: 800,
                color: mkt.onDark,
                fontFamily: FONT,
                letterSpacing: "-0.03em",
                lineHeight: 1.1,
                margin: "0 0 12px",
              }}
            >
              Simple, transparent pricing
            </h1>
            <p
              style={{
                fontSize: "clamp(14px, 2vw, 17px)",
                color: TEXT_STRONG,
                lineHeight: 1.6,
                maxWidth: 480,
                margin: "0 auto",
              }}
            >
              Everything you need to grow your trades business online.
              No hidden fees. Cancel anytime.
            </p>
          </div>
        </section>

        {/* ═══ CONTROLS — I: tighter spacing ═══ */}
        <section style={{ textAlign: "center", padding: "24px 24px 0" }}>
          <div style={{ ...MAX_W, display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
            <BillingToggle yearly={yearly} onChange={setYearly} />
            <ViewSwitch view={view} onChange={setView} />
          </div>
        </section>

        {/* ═══ PLANS VIEW ═══ */}
        {view === "plans" && (
          <section style={{ padding: "32px 24px 0" }}>
            <div style={MAX_W}>

              {/* D: Fix & Optimize callout — ABOVE bundles */}
              <div style={{ marginBottom: 28 }}>
                <FixOptimizeCallout />
              </div>

              {/* E: SiteLaunch — above bundles as full-width highlighted section */}
              <div style={{ marginBottom: 32 }}>
                <SiteLaunchCard />
              </div>

              {/* Bundle cards — B: desktop order stays, mobile reorders via CSS */}
              <div className="pricing-plans-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20, alignItems: "start" }}>
                {bundlesDesktop.map((b) => (
                  <BundleCard key={b.id} bundle={b} yearly={yearly} ctaLabel={BUNDLE_CTA[b.id] || "Get Started"} />
                ))}
              </div>
              {/* Mobile-only order: Growth first */}
              <div className="pricing-plans-mobile" style={{ display: "none", flexDirection: "column", gap: 20, maxWidth: 480, margin: "0 auto" }}>
                {bundlesMobile.map((b) => (
                  <BundleCard key={b.id} bundle={b} yearly={yearly} ctaLabel={BUNDLE_CTA[b.id] || "Get Started"} />
                ))}
              </div>

            </div>
          </section>
        )}

        {/* ═══ SERVICES VIEW ═══ */}
        {view === "services" && (
          <section style={{ padding: "32px 24px 0" }}>
            <div style={MAX_W}>
              {productsByCategory.map((group) => (
                <div key={group.cat} style={{ marginBottom: 48 }}>
                  <SectionLabel icon={group.icon} label={group.label} />
                  <div
                    className="pricing-services-grid"
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))",
                      gap: 20,
                      alignItems: "start",
                    }}
                  >
                    {group.products.map((product) => (
                      <ServiceCard key={product.id} product={product} yearly={yearly} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      {/* ═══ RESPONSIVE STYLES ═══ */}
      <style>{`
        @media (max-width: 900px) {
          .pricing-plans-grid {
            display: none !important;
          }
          .pricing-plans-mobile {
            display: flex !important;
          }
          .pricing-card {
            transform: none !important;
          }
        }
        @media (min-width: 901px) {
          .pricing-plans-mobile {
            display: none !important;
          }
        }
        @media (max-width: 768px) {
          .pricing-services-grid {
            grid-template-columns: 1fr !important;
          }
          .pricing-hero {
            padding-top: 32px !important;
          }
          .sitelaunch-price-col {
            align-items: flex-start !important;
          }
        }
      `}</style>
    </MarketingLayout>
  );
}
