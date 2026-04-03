import { useState, useEffect, type CSSProperties } from "react";
import { Check, ChevronDown, Zap, Shield, Eye, Globe, Wrench } from "lucide-react";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { mkt, shadows, typography } from "@/theme/tokens";
import {
  ALL_PRODUCTS, YEARLY_DISCOUNT_PCT,
  SITELAUNCH, TRADELINE, FIX_OPTIMIZE,
  BUNDLE_STARTER, BUNDLE_GROWTH, BUNDLE_PRO, BUNDLE_FIX,
  yearlyMonthlyEquiv, formatPrice, bundleSavings, lowestMonthly,
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

const CATEGORY_MAP: Record<string, { label: string; icon: typeof Zap }> = {
  leads: { label: "Lead Generation", icon: Zap },
  visibility: { label: "Visibility & Growth", icon: Eye },
  reputation: { label: "Reputation", icon: Shield },
  website: { label: "Website", icon: Globe },
};

const CATEGORY_ORDER = ["leads", "visibility", "reputation", "website"];

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

/* ═══════════════════════════════════════════
   BILLING TOGGLE
   ═══════════════════════════════════════════ */

function BillingToggle({ yearly, onChange }: { yearly: boolean; onChange: (y: boolean) => void }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
      <div
        style={{
          display: "inline-flex",
          borderRadius: 999,
          background: "rgba(255,255,255,0.05)",
          border: "1px solid rgba(255,255,255,0.08)",
          padding: 3,
          position: "relative",
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
    <div style={{ display: "flex", justifyContent: "center", gap: 2 }}>
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
                letterSpacing: active ? "0" : "0",
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

function CheckItem({ children, muted }: { children: React.ReactNode; muted?: boolean }) {
  return (
    <li style={{ display: "flex", alignItems: "flex-start", gap: 10, fontSize: 14, color: muted ? mkt.textMuted : mkt.text, lineHeight: 1.55 }}>
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
        padding: "14px 32px",
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

function ExpandableDetails({ children }: { children: React.ReactNode }) {
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
          padding: "8px 0",
          transition: "opacity 0.2s",
          opacity: 0.85,
        }}
        onMouseEnter={(e) => { e.currentTarget.style.opacity = "1"; }}
        onMouseLeave={(e) => { e.currentTarget.style.opacity = "0.85"; }}
      >
        View details
        <ChevronDown
          size={14}
          style={{
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 0.25s ease",
          }}
        />
      </button>
      {open && (
        <div
          style={{
            marginTop: 8,
            paddingTop: 12,
            borderTop: "1px solid rgba(255,255,255,0.06)",
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════
   BUNDLE CARD (PLANS VIEW)
   ═══════════════════════════════════════════ */

function BundleCard({ bundle, yearly }: { bundle: BundleDef; yearly: boolean }) {
  const hl = !!bundle.highlighted;
  const savings = bundleSavings(bundle);
  const price = yearly ? yearlyMonthlyEquiv(bundle.price) : bundle.price;
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
        padding: "36px 28px 32px",
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
      <div style={{ fontSize: 18, fontWeight: 700, color: mkt.onDark, marginBottom: 4, fontFamily: FONT }}>
        {bundle.name}
      </div>

      {/* Tagline */}
      <div style={{ fontSize: 13, color: mkt.textMuted, marginBottom: 20, lineHeight: 1.5 }}>
        {bundle.tagline}
      </div>

      {/* Price */}
      <div style={{ marginBottom: 4 }}>
        <span style={{ fontSize: 42, fontWeight: 800, color: mkt.onDark, fontFamily: FONT, letterSpacing: "-0.03em", lineHeight: 1 }}>
          {formatPrice(price)}
        </span>
        <span style={{ fontSize: 15, fontWeight: 500, color: mkt.textMuted, marginLeft: 4 }}>/mo</span>
      </div>

      {/* Yearly note */}
      {yearly && (
        <div style={{ fontSize: 12, color: mkt.textMuted, marginBottom: 6 }}>
          billed annually
        </div>
      )}

      {/* Savings */}
      {savings > 0 && (
        <div
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: mkt.accent,
            background: mkt.accentTint,
            display: "inline-flex",
            alignSelf: "flex-start",
            padding: "4px 12px",
            borderRadius: 999,
            marginBottom: 20,
            marginTop: 4,
          }}
        >
          Save {formatPrice(savings)}+/mo vs individual
        </div>
      )}

      {/* Divider */}
      <div style={{ height: 1, background: "rgba(255,255,255,0.06)", margin: "4px 0 20px" }} />

      {/* Includes */}
      <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 10, flex: 1, marginBottom: 24 }}>
        {bundle.includes.map((item) => (
          <CheckItem key={item.tierId}>
            {item.label}
            <span style={{ color: mkt.textMuted, fontSize: 12, marginLeft: 4 }}>
              ({formatPrice(item.value)}/mo)
            </span>
          </CheckItem>
        ))}
      </ul>

      {/* CTA */}
      <CTAButton label="Get Started" highlighted={hl} fullWidth />

      {/* Expandable */}
      <div style={{ marginTop: 16 }}>
        <ExpandableDetails>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {bundle.includes.map((item) => {
              const product = ALL_PRODUCTS.find(p => p.id === item.productId);
              const tier = product?.tiers.find(t => t.id === item.tierId);
              if (!tier) return null;
              return (
                <div key={item.tierId}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: mkt.text, marginBottom: 4 }}>{item.label}</div>
                  <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 3 }}>
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
   SPECIAL: SITELAUNCH CARD
   ═══════════════════════════════════════════ */

function SiteLaunchCard() {
  const tier = SITELAUNCH.tiers[0];
  const [expanded, setExpanded] = useState(false);
  const [hover, setHover] = useState(false);

  return (
    <div
      className="pricing-card-wide"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: CARD_BG,
        border: CARD_BORDER,
        borderRadius: CARD_RADIUS,
        padding: "28px 28px 24px",
        display: "flex",
        flexDirection: "column",
        transition: "all 0.3s ease",
        transform: hover ? "translateY(-2px)" : "none",
        boxShadow: hover ? shadows.lg : "none",
        position: "relative",
      }}
    >
      {/* Trial badge */}
      <div
        style={{
          position: "absolute",
          top: 16,
          right: 16,
          background: mkt.accentTint,
          color: mkt.accent,
          fontSize: 11,
          fontWeight: 700,
          padding: "4px 12px",
          borderRadius: 999,
          letterSpacing: "0.02em",
        }}
      >
        Includes 14-day free trial
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 24, alignItems: "flex-start" }}>
        {/* Left: Info */}
        <div style={{ flex: "1 1 300px" }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: mkt.onDark, fontFamily: FONT }}>{SITELAUNCH.name}</div>
          <div style={{ fontSize: 13, color: mkt.textMuted, marginTop: 4, marginBottom: 16, lineHeight: 1.5 }}>
            {SITELAUNCH.tagline}
          </div>

          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 8 }}>
            {tier.features.filter(f => !f.startsWith("BONUS")).map((f) => (
              <CheckItem key={f}>{f}</CheckItem>
            ))}
          </ul>
        </div>

        {/* Right: Price + CTA */}
        <div style={{ flex: "0 0 auto", textAlign: "right", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 12 }}>
          <div>
            <span style={{ fontSize: 36, fontWeight: 800, color: mkt.onDark, fontFamily: FONT, letterSpacing: "-0.03em" }}>
              {formatPrice(tier.price)}
            </span>
            <span style={{ fontSize: 14, color: mkt.textMuted, marginLeft: 4 }}>one-time</span>
          </div>
          <CTAButton label="Get Started" highlighted />
        </div>
      </div>

      {/* Expandable trial details */}
      <div style={{ marginTop: 16 }}>
        <button
          onClick={() => setExpanded(!expanded)}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            background: "none", border: "none", color: mkt.accent,
            fontSize: 13, fontWeight: 600, fontFamily: FONT, cursor: "pointer",
            padding: "4px 0",
          }}
        >
          What's in the free trial?
          <ChevronDown size={14} style={{ transform: expanded ? "rotate(180deg)" : "none", transition: "transform 0.25s ease" }} />
        </button>
        {expanded && (
          <div style={{ marginTop: 10, padding: "14px 16px", background: "rgba(255,255,255,0.02)", borderRadius: 10, border: "1px solid rgba(255,255,255,0.05)" }}>
            <div style={{ fontSize: 12, color: mkt.textMuted, marginBottom: 10 }}>
              Auto-converts after 14 days unless cancelled
            </div>
            <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Check size={13} color={mkt.accent} strokeWidth={2.5} />
                <span style={{ fontSize: 13, color: mkt.text }}>TradeLine Starter</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Check size={13} color={mkt.accent} strokeWidth={2.5} />
                <span style={{ fontSize: 13, color: mkt.text }}>QuoteQuick Pro</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   SPECIAL: FIX & OPTIMIZE CARD
   ═══════════════════════════════════════════ */

function FixOptimizeCard() {
  const tier = FIX_OPTIMIZE.tiers[0];
  const [hover, setHover] = useState(false);

  return (
    <div
      className="pricing-card-wide"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: CARD_BG,
        border: CARD_BORDER,
        borderRadius: CARD_RADIUS,
        padding: "24px 28px",
        display: "flex",
        flexWrap: "wrap",
        gap: 20,
        alignItems: "center",
        justifyContent: "space-between",
        transition: "all 0.3s ease",
        transform: hover ? "translateY(-2px)" : "none",
        boxShadow: hover ? shadows.lg : "none",
      }}
    >
      <div style={{ flex: "1 1 280px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: mkt.onDark, fontFamily: FONT }}>{FIX_OPTIMIZE.name}</span>
          <span style={{ fontSize: 10, fontWeight: 700, color: mkt.textMuted, background: "rgba(255,255,255,0.06)", padding: "3px 10px", borderRadius: 999, letterSpacing: "0.05em", textTransform: "uppercase" }}>
            One-time
          </span>
        </div>
        <ul style={{ listStyle: "none", padding: 0, margin: "8px 0 0", display: "flex", gap: 16, flexWrap: "wrap" }}>
          {tier.features.map((f) => (
            <li key={f} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: mkt.textMuted }}>
              <Check size={13} color={mkt.accent} strokeWidth={2.5} />
              {f}
            </li>
          ))}
        </ul>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
        <span style={{ fontSize: 28, fontWeight: 800, color: mkt.onDark, fontFamily: FONT, letterSpacing: "-0.02em" }}>
          {formatPrice(tier.price)}
        </span>
        <CTAButton label="Get Started" />
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   SERVICE CARD (SERVICES VIEW)
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
        padding: "28px 24px 24px",
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
      <div style={{ fontSize: 13, color: mkt.textMuted, lineHeight: 1.5, marginBottom: 16 }}>
        {product.tagline}
      </div>

      {/* Setup fee */}
      {product.setup && (
        <div style={{ fontSize: 12, color: mkt.textMuted, marginBottom: 12, display: "flex", alignItems: "center", gap: 6 }}>
          <Wrench size={12} />
          Setup: {formatPrice(product.setup)} one-time
        </div>
      )}

      {/* Tier tabs */}
      {displayTiers.length > 1 && (
        <div style={{ display: "flex", gap: 2, marginBottom: 16, background: "rgba(255,255,255,0.03)", borderRadius: 10, padding: 3 }}>
          {displayTiers.map((tier, i) => {
            const active = activeTier === i;
            return (
              <button
                key={tier.id}
                onClick={() => setActiveTier(i)}
                style={{
                  flex: 1,
                  padding: "7px 12px",
                  borderRadius: 8,
                  border: "none",
                  background: active ? "rgba(255,255,255,0.08)" : "transparent",
                  color: active ? mkt.onDark : mkt.textMuted,
                  fontSize: 12,
                  fontWeight: active ? 700 : 500,
                  fontFamily: FONT,
                  cursor: "pointer",
                  transition: "all 0.2s ease",
                  position: "relative",
                }}
              >
                {tier.name}
                {tier.badge && active && (
                  <span style={{ display: "block", fontSize: 9, color: mkt.accent, fontWeight: 700, marginTop: 1 }}>{tier.badge}</span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Price display */}
      <div style={{ marginBottom: 16 }}>
        <span style={{ fontSize: 36, fontWeight: 800, color: mkt.onDark, fontFamily: FONT, letterSpacing: "-0.03em", lineHeight: 1 }}>
          {displayPrice(currentTier.price, yearly, currentTier.billingPeriod)}
        </span>
        <span style={{ fontSize: 14, color: mkt.textMuted, marginLeft: 4 }}>
          {currentTier.billingPeriod === "monthly" ? "/mo" : "one-time"}
        </span>
        {yearly && currentTier.billingPeriod === "monthly" && (
          <div style={{ fontSize: 12, color: mkt.textMuted, marginTop: 4 }}>billed annually</div>
        )}
      </div>

      {/* TradeLine special: usage callout */}
      {isTradelineProduct && currentTier.includedMins && (
        <div style={{ marginBottom: 16, padding: "10px 14px", background: mkt.accentTint, borderRadius: 10, border: `1px solid rgba(102,232,250,0.08)` }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: mkt.accent }}>
            Includes {currentTier.includedMins} mins (~{approxCalls(currentTier.includedMins)} calls)
          </div>
          <div style={{ fontSize: 11, color: mkt.textMuted, marginTop: 4 }}>
            Flexible usage — small per-minute cost after included usage
          </div>
        </div>
      )}

      {/* Features */}
      <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 8, flex: 1, marginBottom: 20 }}>
        {currentTier.features.filter(f => !f.includes("minutes included")).slice(0, 5).map((f) => (
          <CheckItem key={f}>{f}</CheckItem>
        ))}
      </ul>

      {/* CTA */}
      <CTAButton label="Start" highlighted={!!currentTier.highlighted} fullWidth />

      {/* Expandable: all tiers comparison */}
      {displayTiers.length > 1 && (
        <div style={{ marginTop: 14 }}>
          <ExpandableDetails>
            <div style={{ display: "grid", gridTemplateColumns: `repeat(${displayTiers.length}, 1fr)`, gap: 12 }}>
              {displayTiers.map((tier) => (
                <div key={tier.id}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: mkt.text, marginBottom: 3 }}>{tier.name}</div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: mkt.onDark, marginBottom: 8 }}>
                    {displayPrice(tier.price, yearly, tier.billingPeriod)}
                    <span style={{ fontSize: 11, fontWeight: 500, color: mkt.textMuted }}>/mo</span>
                  </div>
                  <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 4 }}>
                    {tier.features.map((f) => (
                      <li key={f} style={{ fontSize: 11, color: mkt.textMuted, display: "flex", alignItems: "flex-start", gap: 5 }}>
                        <Check size={10} color={mkt.accent} strokeWidth={2.5} style={{ flexShrink: 0, marginTop: 2 }} />
                        {f}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            {/* Setup tier details if exists */}
            {setupTier && (
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: mkt.text, marginBottom: 4 }}>
                  {setupTier.name} — {formatPrice(setupTier.price)} one-time
                </div>
                <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 3 }}>
                  {setupTier.features.map(f => (
                    <li key={f} style={{ fontSize: 11, color: mkt.textMuted, display: "flex", alignItems: "center", gap: 5 }}>
                      <Check size={10} color={mkt.accent} strokeWidth={2.5} />
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            )}
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
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 24 }}>
      <div style={{ width: 32, height: 32, borderRadius: 8, background: mkt.accentTint, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Icon size={16} color={mkt.accent} />
      </div>
      <span style={{ fontSize: 14, fontWeight: 700, color: mkt.onDark, letterSpacing: "-0.01em", fontFamily: FONT }}>
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

  const bundles = [BUNDLE_STARTER, BUNDLE_GROWTH, BUNDLE_PRO];
  const productsByCategory = CATEGORY_ORDER.map(cat => ({
    cat,
    ...CATEGORY_MAP[cat],
    products: ALL_PRODUCTS.filter(p => p.category === cat),
  })).filter(g => g.products.length > 0);

  return (
    <MarketingLayout>
      <div style={{ paddingBottom: 80 }}>
        {/* ═══ HERO ═══ */}
        <section style={{ textAlign: "center", padding: "72px 24px 0" }}>
          <div style={MAX_W}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: mkt.accent,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                marginBottom: 16,
              }}
            >
              Pricing
            </div>
            <h1
              style={{
                fontSize: "clamp(32px, 5vw, 52px)",
                fontWeight: 800,
                color: mkt.onDark,
                fontFamily: FONT,
                letterSpacing: "-0.03em",
                lineHeight: 1.1,
                margin: "0 0 16px",
              }}
            >
              Simple, transparent pricing
            </h1>
            <p
              style={{
                fontSize: "clamp(15px, 2vw, 18px)",
                color: mkt.textMuted,
                lineHeight: 1.6,
                maxWidth: 520,
                margin: "0 auto",
              }}
            >
              Everything you need to grow your trades business online.
              <br />
              No hidden fees. Cancel anytime.
            </p>
          </div>
        </section>

        {/* ═══ CONTROLS ═══ */}
        <section style={{ textAlign: "center", padding: "36px 24px 0" }}>
          <div style={{ ...MAX_W, display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
            <BillingToggle yearly={yearly} onChange={setYearly} />
            <ViewSwitch view={view} onChange={setView} />
          </div>
        </section>

        {/* ═══ PLANS VIEW ═══ */}
        {view === "plans" && (
          <section style={{ padding: "48px 24px 0" }}>
            <div style={MAX_W}>
              {/* Bundle cards */}
              <div
                className="pricing-plans-grid"
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3, 1fr)",
                  gap: 20,
                  alignItems: "start",
                }}
              >
                {bundles.map((b) => (
                  <BundleCard key={b.id} bundle={b} yearly={yearly} />
                ))}
              </div>

              {/* Separator */}
              <div style={{ height: 1, background: "rgba(255,255,255,0.05)", margin: "48px 0" }} />

              {/* SiteLaunch */}
              <div style={{ marginBottom: 20 }}>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: mkt.accent,
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                    marginBottom: 16,
                  }}
                >
                  Website Package
                </div>
                <SiteLaunchCard />
              </div>

              {/* Fix & Optimize */}
              <div>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: mkt.textMuted,
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                    marginBottom: 16,
                  }}
                >
                  One-time improvement package
                </div>
                <FixOptimizeCard />
              </div>
            </div>
          </section>
        )}

        {/* ═══ SERVICES VIEW ═══ */}
        {view === "services" && (
          <section style={{ padding: "48px 24px 0" }}>
            <div style={MAX_W}>
              {productsByCategory.map((group) => (
                <div key={group.cat} style={{ marginBottom: 56 }}>
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
            grid-template-columns: 1fr !important;
            max-width: 480px !important;
            margin: 0 auto !important;
          }
          .pricing-card {
            transform: none !important;
          }
        }
        @media (max-width: 768px) {
          .pricing-services-grid {
            grid-template-columns: 1fr !important;
          }
          .pricing-card-wide {
            flex-direction: column !important;
            align-items: stretch !important;
            text-align: center !important;
          }
          .pricing-card-wide > div:last-child {
            align-items: center !important;
            text-align: center !important;
          }
        }
      `}</style>
    </MarketingLayout>
  );
}
