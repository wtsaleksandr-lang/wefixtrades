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
import CheckoutModal, { type CheckoutItem } from "@/components/CheckoutModal";

/* ═══════════════════════════════════════════
   CONSTANTS
   ═══════════════════════════════════════════ */

const MAX_W: CSSProperties = { maxWidth: 1080, margin: "0 auto", padding: "0 24px" };
const FONT = typography.fontFamily;
const CARD_RADIUS = 16;
const CARD_BG = "rgba(255,255,255,0.03)";
const CARD_BORDER = "1px solid rgba(255,255,255,0.08)";
const GLOW = `0 0 60px rgba(102,232,250,0.12), 0 0 20px rgba(102,232,250,0.06)`;
const GLOW_STRONG = `0 0 60px rgba(102,232,250,0.18), 0 0 30px rgba(102,232,250,0.10)`;

/* ── Shared card inner spacing tokens ── */
const CARD_PAD = "28px 26px 28px";
const TITLE_STYLE: CSSProperties = { fontSize: 17, fontWeight: 700, color: mkt.onDark, fontFamily: FONT, marginBottom: 4 };
const TAGLINE_STYLE: CSSProperties = { fontSize: 13, color: mkt.text, lineHeight: 1.5, marginBottom: 14 };
const PRICE_SIZE = 36;
const PRICE_MB = 14;
const FEATURES_STYLE: CSSProperties = { listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 7, flex: 1, marginBottom: 20 };
const EXPAND_MT = 12;

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
              className="billing-btn"
              style={{
                position: "relative",
                zIndex: 1,
                padding: "8px 20px",
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

function CTAButton({ label, highlighted, fullWidth, onClick }: { label: string; highlighted?: boolean; fullWidth?: boolean; onClick?: () => void }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      onClick={onClick}
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

function BundleCard({ bundle, yearly, ctaLabel, onCheckout }: { bundle: BundleDef; yearly: boolean; ctaLabel: string; onCheckout: () => void }) {
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
        padding: CARD_PAD,
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
      <div style={TITLE_STYLE}>{bundle.name}</div>

      {/* Tagline */}
      <div style={TAGLINE_STYLE}>{bundle.tagline}</div>

      {/* Value anchor */}
      <div style={{ fontSize: 13, color: mkt.textMuted, marginBottom: 4 }}>
        <span style={{ textDecoration: "line-through" }}>{formatPrice(totalValue)}/mo value</span>
      </div>

      {/* Price */}
      <div style={{ marginBottom: PRICE_MB }}>
        <span style={{ fontSize: PRICE_SIZE, fontWeight: 800, color: mkt.onDark, fontFamily: FONT, letterSpacing: "-0.03em", lineHeight: 1 }}>
          {formatPrice(price)}
        </span>
        <span style={{ fontSize: 14, fontWeight: 500, color: TEXT_STRONG, marginLeft: 4 }}>/mo</span>
        {yearly && (
          <div style={{ fontSize: 12, color: TEXT_STRONG, marginTop: 3 }}>billed annually</div>
        )}
        {!yearly && <div style={{ height: 17 }} />}
      </div>

      {/* Includes */}
      <ul style={FEATURES_STYLE}>
        {bundle.includes.map((item) => (
          <CheckItem key={item.tierId}>{item.label}</CheckItem>
        ))}
      </ul>

      {/* CTA */}
      <CTAButton label={ctaLabel} highlighted={hl} fullWidth onClick={onCheckout} />

      {/* Expandable */}
      <div style={{ marginTop: EXPAND_MT }}>
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
   ONE-TIME CARD (standardized format)
   ═══════════════════════════════════════════ */

function OneTimeCard({ product, onCheckout }: { product: ProductDef; yearly: boolean; onCheckout: () => void }) {
  const tier = product.tiers[0];
  const [hover, setHover] = useState(false);
  const isHighlighted = product.id === "sitelaunch";

  return (
    <div
      className="pricing-card"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: CARD_BG,
        border: isHighlighted ? `1px solid rgba(102,232,250,0.15)` : CARD_BORDER,
        borderRadius: CARD_RADIUS,
        padding: CARD_PAD,
        display: "flex",
        flexDirection: "column",
        transition: "all 0.3s ease",
        transform: hover ? "translateY(-3px)" : "none",
        boxShadow: hover ? shadows.lg : "none",
      }}
    >
      {/* Name */}
      <div style={TITLE_STYLE}>{product.name}</div>

      {/* Tagline */}
      <div style={TAGLINE_STYLE}>{product.tagline}</div>

      {/* Price */}
      <div style={{ marginBottom: PRICE_MB }}>
        <span style={{ fontSize: PRICE_SIZE, fontWeight: 800, color: mkt.onDark, fontFamily: FONT, letterSpacing: "-0.03em", lineHeight: 1 }}>
          {formatPrice(tier.price)}
        </span>
        <span style={{ fontSize: 14, color: TEXT_STRONG, marginLeft: 4 }}>one-time</span>
      </div>

      {/* Features */}
      <ul style={FEATURES_STYLE}>
        {tier.features.filter(f => !f.startsWith("BONUS")).slice(0, 5).map((f) => (
          <CheckItem key={f}>{f}</CheckItem>
        ))}
      </ul>

      {/* CTA — lighter emphasis for one-time */}
      <CTAButton label="Get Started" fullWidth onClick={onCheckout} />
    </div>
  );
}

/* ═══════════════════════════════════════════
   SECTION HEADING
   ═══════════════════════════════════════════ */

function PricingSectionHeading({ title, subtitle, badge }: { title: string; subtitle: string; badge?: string }) {
  return (
    <div className="pricing-section-heading" style={{ textAlign: "center", marginBottom: 28 }}>
      {badge && (
        <span style={{
          display: "inline-flex",
          background: mkt.accentTint,
          color: mkt.accent,
          fontSize: 10,
          fontWeight: 700,
          padding: "4px 12px",
          borderRadius: 999,
          letterSpacing: "0.04em",
          textTransform: "uppercase" as const,
          marginBottom: 8,
        }}>
          {badge}
        </span>
      )}
      <h2 style={{
        fontSize: "clamp(18px, 3vw, 28px)",
        fontWeight: 700,
        color: mkt.onDark,
        fontFamily: FONT,
        letterSpacing: "-0.02em",
        lineHeight: 1.15,
        margin: "0 0 4px",
      }}>
        {title}
      </h2>
      <p style={{
        fontSize: 13,
        color: TEXT_STRONG,
        lineHeight: 1.45,
        margin: 0,
        maxWidth: 380,
        marginLeft: "auto",
        marginRight: "auto",
      }}>
        {subtitle}
      </p>
    </div>
  );
}

/* ═══════════════════════════════════════════
   SERVICE CARD
   ═══════════════════════════════════════════ */

function ServiceCard({ product, yearly, onCheckout }: { product: ProductDef; yearly: boolean; onCheckout: (tier: Tier) => void }) {
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
        padding: CARD_PAD,
        display: "flex",
        flexDirection: "column",
        transition: "all 0.3s ease",
        transform: hover ? "translateY(-3px)" : "none",
        boxShadow: hover ? shadows.lg : "none",
      }}
    >
      {/* Name */}
      <div style={TITLE_STYLE}>{product.name}</div>

      {/* Tagline */}
      <div style={TAGLINE_STYLE}>{product.tagline}</div>

      {/* Setup fee */}
      {product.setup && (
        <div style={{ fontSize: 12, color: mkt.textMuted, marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
          <Wrench size={12} />
          Setup: {formatPrice(product.setup)} one-time
        </div>
      )}

      {/* Tier tabs */}
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
      <div style={{ marginBottom: PRICE_MB }}>
        <span style={{ fontSize: PRICE_SIZE, fontWeight: 800, color: mkt.onDark, fontFamily: FONT, letterSpacing: "-0.03em", lineHeight: 1 }}>
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

      {/* Features */}
      <ul style={FEATURES_STYLE}>
        {currentTier.features.filter(f => !f.includes("minutes included")).slice(0, 5).map((f) => (
          <CheckItem key={f}>{f}</CheckItem>
        ))}
      </ul>

      {/* CTA */}
      <CTAButton label="Start This Service" highlighted={!!currentTier.highlighted} fullWidth onClick={() => onCheckout(currentTier)} />

      {/* Compare tiers expandable */}
      {(displayTiers.length > 1 || setupTier) && (
        <div style={{ marginTop: EXPAND_MT }}>
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
  const [activeCat, setActiveCat] = useState("leads");

  /* ─── Checkout modal state ─── */
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [checkoutTitle, setCheckoutTitle] = useState("");
  const [checkoutItems, setCheckoutItems] = useState<CheckoutItem[]>([]);
  const [checkoutBundleId, setCheckoutBundleId] = useState<string | undefined>();
  const [checkoutBundlePrice, setCheckoutBundlePrice] = useState<number | undefined>();

  function openBundleCheckout(bundle: BundleDef) {
    setCheckoutTitle(bundle.name);
    setCheckoutItems(bundle.includes.map(i => ({
      serviceId: i.tierId,
      label: i.label,
      price: i.value,
      billingPeriod: "monthly" as const,
    })));
    setCheckoutBundleId(bundle.id);
    setCheckoutBundlePrice(bundle.price);
    setCheckoutOpen(true);
  }

  function openProductCheckout(product: ProductDef, tier: Tier) {
    const items: CheckoutItem[] = [{
      serviceId: tier.id,
      label: `${product.name} ${product.tiers.length > 1 ? tier.name : ""}`.trim(),
      price: tier.price,
      billingPeriod: tier.billingPeriod,
    }];
    // If product has a setup fee and this is a monthly tier, also add the setup tier
    if (product.setup && tier.billingPeriod === "monthly") {
      const setupTier = product.tiers.find(t => t.billingPeriod === "one-time");
      if (setupTier) {
        items.push({
          serviceId: setupTier.id,
          label: `${product.name} Setup`,
          price: setupTier.price,
          billingPeriod: "one-time",
        });
      }
    }
    setCheckoutTitle(`${product.name} ${product.tiers.length > 1 ? tier.name : ""}`.trim());
    setCheckoutItems(items);
    setCheckoutBundleId(undefined);
    setCheckoutBundlePrice(undefined);
    setCheckoutOpen(true);
  }

  function openSiteLaunchCheckout() {
    const tier = SITELAUNCH.tiers[0];
    setCheckoutTitle(SITELAUNCH.name);
    setCheckoutItems([{
      serviceId: tier.id,
      label: SITELAUNCH.name,
      price: tier.price,
      billingPeriod: "one-time",
    }]);
    setCheckoutBundleId(undefined);
    setCheckoutBundlePrice(undefined);
    setCheckoutOpen(true);
  }

  function openFixOptimizeCheckout() {
    const tier = FIX_OPTIMIZE.tiers[0];
    setCheckoutTitle(FIX_OPTIMIZE.name);
    setCheckoutItems([{
      serviceId: tier.id,
      label: FIX_OPTIMIZE.name,
      price: tier.price,
      billingPeriod: "one-time",
    }]);
    setCheckoutBundleId(undefined);
    setCheckoutBundlePrice(undefined);
    setCheckoutOpen(true);
  }

  useEffect(() => {
    document.title = "Pricing — WeFixTrades";
  }, []);

  /* Bundle ordering — Growth first on mobile */
  const bundlesDesktop = [BUNDLE_STARTER, BUNDLE_GROWTH, BUNDLE_PRO];
  const bundlesMobile = [BUNDLE_GROWTH, BUNDLE_STARTER, BUNDLE_PRO];

  /* Group products by category for individual services section */
  const productsByCategory = CATEGORY_ORDER.map(cat => ({
    cat,
    ...CATEGORY_MAP[cat],
    products: ALL_PRODUCTS.filter(p => p.category === cat),
  })).filter(g => g.products.length > 0);

  return (
    <MarketingLayout>
      <div style={{ paddingBottom: 80 }}>

        {/* ═══ HERO ═══ */}
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
                lineHeight: 1.5,
                maxWidth: 400,
                margin: "0 auto",
              }}
            >
              Everything you need to grow your trades business. No hidden fees. Cancel anytime.
            </p>
          </div>
        </section>

        {/* ═══ BILLING TOGGLE ═══ */}
        <section style={{ textAlign: "center", padding: "28px 24px 0" }}>
          <div style={MAX_W}>
            <BillingToggle yearly={yearly} onChange={setYearly} />
          </div>
        </section>

        {/* ═══ BLOCK 1: BUNDLES / SYSTEMS (primary offer) ═══ */}
        <section style={{ padding: "36px 24px 0" }}>
          <div style={MAX_W}>
            <PricingSectionHeading
              title="Choose your system"
              subtitle="Bundled plans designed for trades businesses. Best value — everything works together."
              badge="Recommended"
            />

            {/* Desktop: 3-col */}
            <div className="pricing-plans-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20, alignItems: "stretch" }}>
              {bundlesDesktop.map((b) => (
                <BundleCard key={b.id} bundle={b} yearly={yearly} ctaLabel={BUNDLE_CTA[b.id] || "Get Started"} onCheckout={() => openBundleCheckout(b)} />
              ))}
            </div>
            {/* Mobile: Growth first */}
            <div className="pricing-plans-mobile" style={{ display: "none", flexDirection: "column", gap: 20, maxWidth: 480, margin: "0 auto" }}>
              {bundlesMobile.map((b) => (
                <BundleCard key={b.id} bundle={b} yearly={yearly} ctaLabel={BUNDLE_CTA[b.id] || "Get Started"} onCheckout={() => openBundleCheckout(b)} />
              ))}
            </div>
          </div>
        </section>

        {/* ═══ SECTION DIVIDER ═══ */}
        <div className="pricing-divider" style={{ ...MAX_W, marginTop: 48 }}>
          <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }} />
        </div>

        {/* ═══ BLOCK 2: INDIVIDUAL SERVICES (secondary) ═══ */}
        <section style={{ padding: "40px 24px 0" }}>
          <div style={MAX_W}>
            <PricingSectionHeading
              title="Individual services"
              subtitle="Need just one tool? Pick what fits your business."
            />

            {/* Category tabs — visible on mobile, hidden on desktop */}
            <div className="pricing-cat-tabs" style={{ display: "none", justifyContent: "center", gap: 6, flexWrap: "wrap", marginBottom: 20 }}>
              {productsByCategory.map((group) => {
                const isActive = activeCat === group.cat;
                return (
                  <button
                    key={group.cat}
                    onClick={() => setActiveCat(group.cat)}
                    style={{
                      padding: "7px 14px",
                      borderRadius: 9999,
                      border: `1px solid ${isActive ? "rgba(102,232,250,0.3)" : "rgba(255,255,255,0.08)"}`,
                      background: isActive ? "rgba(102,232,250,0.08)" : "transparent",
                      color: isActive ? mkt.accent : mkt.textMuted,
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: "pointer",
                      transition: "all 0.15s ease",
                      fontFamily: FONT,
                    }}
                  >
                    {group.label}
                  </button>
                );
              })}
            </div>

            {/* Desktop: all categories stacked */}
            <div className="pricing-services-all">
              {productsByCategory.map((group) => (
                <div key={group.cat} style={{ marginBottom: 40 }}>
                  <SectionLabel icon={group.icon} label={group.label} />
                  <div
                    className="pricing-services-grid"
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(2, 1fr)",
                      gap: 20,
                      alignItems: "stretch",
                    }}
                  >
                    {group.products.map((product) => (
                      <ServiceCard key={product.id} product={product} yearly={yearly} onCheckout={(tier) => openProductCheckout(product, tier)} />
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Mobile: only active category */}
            <div className="pricing-services-tabbed" style={{ display: "none" }}>
              {productsByCategory.filter(g => g.cat === activeCat).map((group) => (
                <div key={group.cat}>
                  <div
                    className="pricing-services-grid"
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr",
                      gap: 16,
                      maxWidth: 480,
                      margin: "0 auto",
                    }}
                  >
                    {group.products.map((product) => (
                      <ServiceCard key={product.id} product={product} yearly={yearly} onCheckout={(tier) => openProductCheckout(product, tier)} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ═══ SECTION DIVIDER ═══ */}
        <div className="pricing-divider" style={{ ...MAX_W, marginTop: 8 }}>
          <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }} />
        </div>

        {/* ═══ BLOCK 3: ONE-TIME OPTIONS (entry point) ═══ */}
        <section style={{ padding: "40px 24px 0" }}>
          <div style={MAX_W}>
            <PricingSectionHeading
              title="One-time options"
              subtitle="Not ready for a monthly plan? Start with a one-time fix or a full website build."
            />

            <div
              className="pricing-services-grid"
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(2, 1fr)",
                gap: 20,
                alignItems: "start",
              }}
            >
              <OneTimeCard product={FIX_OPTIMIZE} yearly={yearly} onCheckout={openFixOptimizeCheckout} />
              <OneTimeCard product={SITELAUNCH} yearly={yearly} onCheckout={openSiteLaunchCheckout} />
            </div>
          </div>
        </section>

      </div>

      {/* ═══ CHECKOUT MODAL ═══ */}
      <CheckoutModal
        open={checkoutOpen}
        onClose={() => setCheckoutOpen(false)}
        title={checkoutTitle}
        items={checkoutItems}
        bundleId={checkoutBundleId}
        bundlePrice={checkoutBundlePrice}
        yearly={yearly}
      />

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
          .pricing-services-grid {
            grid-template-columns: 1fr !important;
            max-width: 480px;
            margin-left: auto;
            margin-right: auto;
          }
          .pricing-hero {
            padding-top: 24px !important;
          }
          /* Services: show tabs, hide all-categories, show tabbed */
          .pricing-cat-tabs {
            display: flex !important;
          }
          .pricing-services-all {
            display: none !important;
          }
          .pricing-services-tabbed {
            display: block !important;
          }
          .pricing-section-heading {
            margin-bottom: 20px !important;
          }
        }
        @media (min-width: 901px) {
          .pricing-plans-mobile {
            display: none !important;
          }
          .pricing-cat-tabs {
            display: none !important;
          }
          .pricing-services-tabbed {
            display: none !important;
          }
        }
      `}</style>
    </MarketingLayout>
  );
}
