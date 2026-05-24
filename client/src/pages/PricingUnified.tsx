import { useState, useEffect, useCallback, useMemo, type CSSProperties } from "react";
import { Check, ChevronDown, Zap, Shield, Eye, Globe, Wrench, ArrowRight, Info, X, TrendingUp, Target } from "lucide-react";
import { Link } from "wouter";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { PageMeta } from "@/components/seo/PageMeta";
import { V7Hero, V7PageShell } from "@/components/marketing/v7";
import { mkt, shadows, typography } from "@/theme/tokens";
import {
  ALL_PRODUCTS, YEARLY_DISCOUNT_PCT,
  SITELAUNCH, WEBFIX,
  BUNDLE_STARTER, BUNDLE_GROWTH, BUNDLE_PRO,
  yearlyMonthlyEquiv, formatPrice, bundleSavings, lowestMonthly,
  mergeAllProductsWithDb, type DbProductOverride,
  type ProductDef, type BundleDef, type Tier,
} from "@/config/pricing";
import CheckoutModal, { type CheckoutItem } from "@/components/CheckoutModal";

/* ═══════════════════════════════════════════
   CONSTANTS
   ═══════════════════════════════════════════ */

const MAX_W: CSSProperties = { maxWidth: 1080, margin: "0 auto", padding: "0 24px" };
const FONT = typography.fontFamily;
const CARD_RADIUS = 16;

/* Mobile side padding — sections use class for responsive override */
const SECTION_PAD_X = 20; // desktop default, overridden to 6px on mobile via CSS
const CARD_BG = "rgba(255,255,255,0.03)";
const CARD_BORDER = "1px solid rgba(255,255,255,0.08)";
/* Pricing-card glows retired per brand direction (no glow halos on cards). */
const GLOW = "none";
const GLOW_STRONG = "none";

/* ── Shared card inner spacing tokens ── */
const CARD_PAD = "28px 26px 28px";
const TITLE_STYLE: CSSProperties = { fontSize: 17, fontWeight: 700, color: mkt.onDark, fontFamily: FONT, marginBottom: 4 };
const TAGLINE_STYLE: CSSProperties = { fontSize: 13, color: mkt.text, lineHeight: 1.5, marginBottom: 14 };
const PRICE_SIZE = 36;
const PRICE_MB = 14;
const FEATURES_STYLE: CSSProperties = { listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 7, flex: 1, marginBottom: 20 };
const EXPAND_MT = 12;

/* ── Warm accent palette (subtle enhancement) ── */
const WARM_AMBER = "#F5B942";
const WARM_GREEN = "#6FCF97";
const WARM_GRAY = "#CBBBA0";

/* ── Service info modal content ── */
interface ServiceInfo {
  name: string;
  headline: string;
  bullets: string[];
  href: string;
  trustLine: string;
  bestFor: string;
}

const SERVICE_INFO: Record<string, ServiceInfo> = {
  tradeline: {
    name: "TradeLine\u2122",
    headline: "Every call answered \u2014 even when you\u2019re on a job",
    bullets: ["AI answers calls and chats 24/7", "Missed call auto-text sent instantly", "Leads captured with full job details", "Follow-up messages sent automatically"],
    href: "/products/tradeline",
    trustLine: "Used by trades to never lose a lead to voicemail again",
    bestFor: "answering calls 24/7",
  },
  quotequick: {
    name: "QuoteQuick\u2122",
    headline: "Customers price their job on your website instantly",
    bullets: ["Visitors get a quote without calling", "Every quote captures name, email, phone", "Your pricing rules, your services", "Works on any website"],
    href: "/products/quickquotepro",
    trustLine: "Turns website visitors into real quote requests",
    bestFor: "instant website quotes",
  },
  mapguard: {
    name: "MapGuard\u2122",
    headline: "We manage your Google Maps visibility for you — monitoring, fixing, improving",
    bullets: ["Weekly visibility monitoring & issue detection", "Ongoing profile optimization work", "Review management & competitor tracking (Pro)", "Monthly performance reports"],
    href: "/products/mapguard",
    trustLine: "A fully managed service — not just a dashboard",
    bestFor: "ongoing Google Maps visibility management",
  },
  reputationshield: {
    name: "ReputationShield\u2122",
    headline: "More 5-star reviews without chasing customers",
    bullets: ["Automated review requests after every job", "Professional responses to all reviews", "Alerts for new reviews instantly", "Monthly review growth tracking"],
    href: "/products/reputationshield",
    trustLine: "Turns completed jobs into consistent 5-star reviews",
    bestFor: "getting more 5-star reviews",
  },
  socialsync: {
    name: "SocialSync\u2122",
    headline: "Your social media stays active \u2014 we do the posting",
    bullets: ["Content created and posted for you", "Real job photos and business updates", "Facebook, Instagram, and Google", "You stay visible without lifting a finger"],
    href: "/products/socialsync",
    trustLine: "Keeps your business visible without you posting anything",
    bestFor: "hands-off social media",
  },
  webcare: {
    name: "WebCare\u2122",
    headline: "Your website stays updated, secure, and working",
    bullets: ["Monthly software and security updates", "24/7 uptime monitoring", "Security & SSL health checks", "Small content changes handled for you"],
    href: "/products/webcare",
    trustLine: "Your website keeps running \u2014 you never have to worry about it",
    bestFor: "ongoing website maintenance",
  },
  sitelaunch: {
    name: "SiteLaunch\u2122",
    headline: "A website built to bring your trade business jobs",
    bullets: ["Custom designed for your trade", "Mobile-first, fast loading", "Lead capture and contact forms built in", "Live in 5 days \u2014 you own it"],
    href: "/products/sitelaunch",
    trustLine: "Built for trades who need a real website that works",
    bestFor: "brand new website",
  },
  rankflow: {
    name: "RankFlow\u2122",
    headline: "Done-for-you local SEO that improves your visibility every month",
    bullets: ["Keyword targeting for your services and area", "Page optimization and SEO page creation", "Local citation and directory building", "Monthly progress dashboard"],
    href: "/products/rankflow",
    trustLine: "Trades businesses improving local visibility month after month",
    bestFor: "ongoing local SEO",
  },
  webfix: {
    name: "WebFix\u2122",
    headline: "Fix what\u2019s broken on your website \u2014 one time, done",
    bullets: ["Page speed and loading fixes", "Broken links and error cleanup", "Mobile display fixes", "Contact form and CTA troubleshooting", "Image compression and performance tuning"],
    href: "/pricing",
    trustLine: "A fast way to fix what\u2019s slowing your site down",
    bestFor: "one-time website fixes",
  },
};

/* ── Info icon trigger ── */
function InfoIconTrigger({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      aria-label="Learn more about this service"
      className="info-icon-trigger"
      data-theme="dark"
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 20,
        height: 20,
        borderRadius: 999,
        border: "none",
        background: "rgba(255,255,255,0.06)",
        color: mkt.textFaint,
        cursor: "pointer",
        padding: 0,
        flexShrink: 0,
        transition: "all 0.15s ease",
      }}
    >
      <Info size={12} strokeWidth={2} />
    </button>
  );
}

/* ── Service info modal ── */
function ServiceInfoModal({ info, onClose }: { info: ServiceInfo; onClose: () => void }) {
  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  // Prevent body scroll while open
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        background: "rgba(0,0,0,0.5)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        animation: "infoModalOverlayIn 0.2s ease forwards",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={info.name}
        style={{
          background: "rgba(22,28,30,0.92)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: CARD_RADIUS,
          boxShadow: "0 24px 64px rgba(0,0,0,0.4), 0 0 1px rgba(255,255,255,0.1)",
          width: "100%",
          maxWidth: 440,
          padding: "28px 28px 24px",
          position: "relative",
          animation: "infoModalIn 0.22s cubic-bezier(0.22,1,0.36,1) forwards",
        }}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          aria-label="Close"
          style={{
            position: "absolute",
            top: 14,
            right: 14,
            width: 28,
            height: 28,
            borderRadius: 8,
            border: "none",
            background: "rgba(255,255,255,0.06)",
            color: mkt.textFaint,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "background 0.15s",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.12)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.06)"; }}
        >
          <X size={14} />
        </button>

        {/* Title */}
        <div style={{ fontSize: 18, fontWeight: 700, color: mkt.onDark, fontFamily: FONT, marginBottom: 2 }}>
          {info.name}
        </div>

        {/* Best for */}
        <div style={{ fontSize: 11, fontWeight: 600, color: WARM_GRAY, marginBottom: 12, opacity: 0.9 }}>
          Best for: {info.bestFor}
        </div>

        {/* Headline */}
        <div style={{ fontSize: 14, color: mkt.accent, fontWeight: 600, marginBottom: 16, lineHeight: 1.4 }}>
          {info.headline}
        </div>

        {/* Bullets */}
        <ul style={{ listStyle: "none", padding: 0, margin: "0 0 16px", display: "flex", flexDirection: "column", gap: 10 }}>
          {info.bullets.map((b) => (
            <li key={b} style={{ display: "flex", alignItems: "flex-start", gap: 10, fontSize: 14, color: TEXT_STRONG, lineHeight: 1.5 }}>
              <Check size={16} color={WARM_GREEN} strokeWidth={2.5} style={{ flexShrink: 0, marginTop: 2 }} />
              <span>{b}</span>
            </li>
          ))}
        </ul>

        {/* Trust line */}
        <div style={{ fontSize: 12, color: WARM_GRAY, lineHeight: 1.4, marginBottom: 18, opacity: 0.8 }}>
          {info.trustLine}
        </div>

        {/* CTA */}
        <Link
          href={info.href}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            padding: "11px 20px",
            borderRadius: 10,
            border: `1px solid rgba(255,255,255,0.1)`,
            background: "rgba(255,255,255,0.04)",
            color: mkt.accent,
            fontSize: 13,
            fontWeight: 600,
            fontFamily: FONT,
            textDecoration: "none",
            transition: "background 0.15s, border-color 0.15s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "rgba(255,255,255,0.08)";
            e.currentTarget.style.borderColor = "#FFFFFF";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "rgba(255,255,255,0.04)";
            e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)";
          }}
        >
          See it in action
          <ArrowRight size={14} />
        </Link>
      </div>
    </div>
  );
}

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
  "bundle-starter": "Get Visible",
  "bundle-growth": "Start Growing \u2014 Most Popular",
  "bundle-pro": "Dominate Your Area",
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
          borderRadius: 10,
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.08)",
          padding: 2,
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
                padding: "6px 14px",
                borderRadius: 8,
                border: "none",
                background: active ? mkt.accent : "transparent",
                color: active ? mkt.dark : mkt.textMuted,
                fontSize: 12,
                fontWeight: active ? 700 : 500,
                fontFamily: FONT,
                cursor: "pointer",
                transition: "all 0.25s ease",
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              {opt === "monthly" ? "Monthly" : "Yearly"}
              {opt === "yearly" && (
                <span
                  style={{
                    background: active ? "rgba(0,0,0,0.15)" : mkt.accentTint,
                    color: active ? mkt.dark : mkt.accent,
                    fontSize: 9,
                    fontWeight: 800,
                    padding: "2px 6px",
                    borderRadius: 6,
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
      <Check size={16} color={WARM_GREEN} strokeWidth={2.5} style={{ flexShrink: 0, marginTop: 3 }} />
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
        // White text on the blue (highlighted) CTA — the previous
        // mkt.dark near-black was unreadable on #0d3cfc.
        color: highlighted ? "#FFFFFF" : mkt.onDark,
        fontSize: 14,
        fontWeight: 700,
        fontFamily: FONT,
        cursor: "pointer",
        transition: "all 0.2s ease",
        transform: hover ? "translateY(-1px)" : "none",
        // Hover border: blue (highlighted) button → white inner border;
        // ghost (non-highlighted) → no border change.
        boxShadow: hover && highlighted ? "inset 0 0 0 1.5px #FFFFFF" : "none",
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

function BundleCard({ bundle, yearly, ctaLabel, onCheckout, onServiceInfo }: { bundle: BundleDef; yearly: boolean; ctaLabel: string; onCheckout: () => void; onServiceInfo?: (productId: string) => void }) {
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
            background: WARM_AMBER,
            color: "#1a1400",
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
          <li key={item.tierId} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14, color: TEXT_STRONG, lineHeight: 1.5 }}>
            <Check size={16} color={WARM_GREEN} strokeWidth={2.5} style={{ flexShrink: 0 }} />
            <span style={{ flex: 1 }}>{item.label}</span>
            {onServiceInfo && SERVICE_INFO[item.productId] && (
              <InfoIconTrigger onClick={() => onServiceInfo(item.productId)} />
            )}
          </li>
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
                        <Check size={12} color={WARM_GREEN} strokeWidth={2.5} />
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

function OneTimeCard({ product, onCheckout, onInfo, bestFor }: { product: ProductDef; yearly: boolean; onCheckout: () => void; onInfo?: () => void; bestFor?: string }) {
  const tier = product.tiers[0];
  const [hover, setHover] = useState(false);
  const isHighlighted = product.id === "sitelaunch";
  const isRecommended = bestFor === "Recommended for you";

  return (
    <div
      className="pricing-card"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: CARD_BG,
        border: isRecommended ? `1px solid rgba(13,60,252,0.25)` : isHighlighted ? `1px solid rgba(13,60,252,0.15)` : CARD_BORDER,
        borderRadius: CARD_RADIUS,
        padding: CARD_PAD,
        display: "flex",
        flexDirection: "column",
        position: "relative",
        transition: "all 0.3s ease",
        transform: hover ? "translateY(-3px)" : "none",
        boxShadow: isRecommended ? GLOW : hover ? shadows.lg : "none",
      }}
    >
      {/* Best for / Recommended badge */}
      {bestFor && (
        <div style={{
          position: "absolute", top: 12, right: 12,
          fontSize: 10, fontWeight: isRecommended ? 700 : 600,
          color: isRecommended ? mkt.accent : mkt.textMuted,
          background: isRecommended ? "rgba(13,60,252,0.1)" : "rgba(255,255,255,0.06)",
          border: isRecommended ? "1px solid rgba(13,60,252,0.25)" : "1px solid rgba(255,255,255,0.08)",
          borderRadius: 999, padding: "3px 10px", opacity: isRecommended ? 1 : 0.8,
        }}>
          {isRecommended ? bestFor : `Best for: ${bestFor}`}
        </div>
      )}

      {/* Name + info icon */}
      <div style={{ ...TITLE_STYLE, display: "flex", alignItems: "center", gap: 8 }}>
        <span>{product.name}</span>
        {onInfo && <InfoIconTrigger onClick={onInfo} />}
      </div>

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
        {tier.features.filter(f => !f.startsWith("BONUS")).slice(0, 6).map((f) => (
          <CheckItem key={f}>{f}</CheckItem>
        ))}
      </ul>

      {/* CTA — lighter emphasis for one-time */}
      <CTAButton label="Get Started" fullWidth onClick={onCheckout} />
    </div>
  );
}

/* ═══════════════════════════════════════════
   SERVICE CARD
   ═══════════════════════════════════════════ */

function ServiceCard({ product, yearly, onCheckout, onInfo, bestFor }: { product: ProductDef; yearly: boolean; onCheckout: (tier: Tier) => void; onInfo?: () => void; bestFor?: string }) {
  const isTradelineProduct = product.id === "tradeline";
  const isRecommended = bestFor === "Recommended for you";
  const monthlyTiers = product.tiers.filter(t => t.billingPeriod === "monthly");
  const setupTier = product.tiers.find(t => t.billingPeriod === "one-time");
  const displayTiers = monthlyTiers.length > 0 ? monthlyTiers : product.tiers;
  // Default to the highlighted ("Most Popular") tier if any, else fall back to first.
  // Without this, multi-tier products like TradeLine open on Starter even when Pro is
  // explicitly marked highlighted: true + badge: "Most Popular".
  const highlightedIndex = displayTiers.findIndex(t => t.highlighted);
  const [activeTier, setActiveTier] = useState(highlightedIndex >= 0 ? highlightedIndex : 0);
  const [hover, setHover] = useState(false);
  const currentTier = displayTiers[activeTier] || displayTiers[0];

  return (
    <div
      className="pricing-card"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: CARD_BG,
        border: isRecommended ? `1px solid rgba(13,60,252,0.25)` : CARD_BORDER,
        borderRadius: CARD_RADIUS,
        padding: CARD_PAD,
        display: "flex",
        flexDirection: "column",
        position: "relative",
        transition: "all 0.3s ease",
        transform: hover ? "translateY(-3px)" : "none",
        boxShadow: isRecommended ? GLOW : hover ? shadows.lg : "none",
      }}
    >
      {/* Best for / Recommended badge */}
      {bestFor && (
        <div style={{
          position: "absolute", top: 12, right: 12,
          fontSize: 10, fontWeight: isRecommended ? 700 : 600,
          color: isRecommended ? mkt.accent : mkt.textMuted,
          background: isRecommended ? "rgba(13,60,252,0.1)" : "rgba(255,255,255,0.06)",
          border: isRecommended ? "1px solid rgba(13,60,252,0.25)" : "1px solid rgba(255,255,255,0.08)",
          borderRadius: 999, padding: "3px 10px", opacity: isRecommended ? 1 : 0.8,
        }}>
          {isRecommended ? bestFor : `Best for: ${bestFor}`}
        </div>
      )}

      {/* Name + info icon */}
      <div style={{ ...TITLE_STYLE, display: "flex", alignItems: "center", gap: 8 }}>
        <span>{product.name}</span>
        {onInfo && <InfoIconTrigger onClick={onInfo} />}
      </div>

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
        <div style={{ marginBottom: 14, padding: "10px 14px", background: mkt.accentTint, borderRadius: 10, border: `1px solid rgba(13,60,252,0.08)` }}>
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
                        <Check size={12} color={WARM_GREEN} strokeWidth={2.5} />
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
                        <Check size={12} color={WARM_GREEN} strokeWidth={2.5} />
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
   MAIN PAGE
   ═══════════════════════════════════════════ */

/* ═══════════════════════════════════════════
   PLAN RECOMMENDER QUIZ
   ═══════════════════════════════════════════ */

interface QuizAnswers {
  challenge: string | null;
  volume: string | null;
  hasWebsite: string | null;
}

type RecommendedProduct = { id: string; reason: string };

function getRecommendations(answers: QuizAnswers): RecommendedProduct[] {
  const recs: RecommendedProduct[] = [];

  if (answers.challenge === "leads" || answers.challenge === "all") {
    recs.push({ id: "tradeline", reason: "Never miss a lead with 24/7 AI call answering" });
    recs.push({ id: "quotequick", reason: "Let website visitors get instant quotes" });
  }
  if (answers.challenge === "reputation" || answers.challenge === "all") {
    recs.push({ id: "reputationshield", reason: "Automate review collection after every job" });
  }
  if (answers.challenge === "website" || answers.challenge === "all") {
    if (answers.hasWebsite === "no") {
      recs.push({ id: "sitelaunch", reason: "Get a professional website built for your trade" });
    } else {
      recs.push({ id: "webfix", reason: "Fix speed, SEO, and mobile issues on your site" });
      recs.push({ id: "webcare", reason: "Keep your website updated and running smoothly" });
    }
  }

  if (answers.volume === "15+" && !recs.find(r => r.id === "tradeline")) {
    recs.push({ id: "tradeline", reason: "Handle high call volume automatically" });
  }
  if ((answers.volume === "5-15" || answers.volume === "15+") && !recs.find(r => r.id === "mapguard")) {
    recs.push({ id: "mapguard", reason: "Dominate local Google Maps results" });
  }

  if (answers.hasWebsite === "no" && !recs.find(r => r.id === "sitelaunch")) {
    recs.push({ id: "sitelaunch", reason: "You need a website to capture leads online" });
  }

  const seen = new Set<string>();
  return recs.filter(r => {
    if (seen.has(r.id)) return false;
    seen.add(r.id);
    return true;
  }).slice(0, 3);
}

function PlanRecommenderQuiz({ onRecommend }: { onRecommend: (productIds: string[]) => void }) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<QuizAnswers>({ challenge: null, volume: null, hasWebsite: null });
  const [recommendations, setRecommendations] = useState<RecommendedProduct[]>([]);
  const [isOpen, setIsOpen] = useState(false);

  const questions = [
    {
      question: "What's your biggest challenge?",
      key: "challenge" as const,
      options: [
        { value: "leads", label: "Getting more leads" },
        { value: "reputation", label: "Managing my online reputation" },
        { value: "website", label: "Keeping my website updated" },
        { value: "all", label: "All of the above" },
      ],
    },
    {
      question: "How many jobs do you do per week?",
      key: "volume" as const,
      options: [
        { value: "1-5", label: "1-5" },
        { value: "5-15", label: "5-15" },
        { value: "15+", label: "15+" },
      ],
    },
    {
      question: "Do you have a website?",
      key: "hasWebsite" as const,
      options: [
        { value: "yes", label: "Yes" },
        { value: "no", label: "No" },
      ],
    },
  ];

  const handleAnswer = (key: keyof QuizAnswers, value: string) => {
    const newAnswers = { ...answers, [key]: value };
    setAnswers(newAnswers);

    if (step < questions.length - 1) {
      setStep(step + 1);
    } else {
      const recs = getRecommendations(newAnswers);
      setRecommendations(recs);
      onRecommend(recs.map(r => r.id));
    }
  };

  const reset = () => {
    setStep(0);
    setAnswers({ challenge: null, volume: null, hasWebsite: null });
    setRecommendations([]);
    onRecommend([]);
  };

  if (!isOpen) {
    return (
      <div style={{
        background: "rgba(13,60,252,0.04)", border: "1px solid rgba(13,60,252,0.12)",
        borderRadius: CARD_RADIUS, padding: "16px 20px",
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
        flexWrap: "wrap", cursor: "pointer",
      }}
        onClick={() => setIsOpen(true)}
      >
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: mkt.onDark, fontFamily: FONT, marginBottom: 2 }}>
            Not sure where to start?
          </div>
          <div style={{ fontSize: 12, color: WARM_GRAY, opacity: 0.85 }}>
            Answer 3 quick questions and we'll recommend the right tools for your business.
          </div>
        </div>
        <div style={{
          display: "flex", alignItems: "center", gap: 6,
          padding: "8px 18px", borderRadius: 10, background: mkt.accent,
          color: "#FFFFFF", fontSize: 13, fontWeight: 700, fontFamily: FONT,
          whiteSpace: "nowrap", flexShrink: 0,
        }}>
          <Target size={14} /> Take the quiz
        </div>
      </div>
    );
  }

  if (recommendations.length > 0) {
    return (
      <div style={{
        background: "rgba(13,60,252,0.04)", border: "1px solid rgba(13,60,252,0.12)",
        borderRadius: CARD_RADIUS, padding: "20px 24px",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: mkt.onDark, fontFamily: FONT }}>
            Recommended for you
          </div>
          <button onClick={reset} style={{
            background: "none", border: "none", color: mkt.accent, fontSize: 12,
            fontWeight: 600, cursor: "pointer", fontFamily: FONT, padding: "4px 8px",
          }}>
            Retake quiz
          </button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {recommendations.map((rec) => {
            const info = SERVICE_INFO[rec.id];
            if (!info) return null;
            return (
              <div key={rec.id} style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: "12px 16px", borderRadius: 12,
                background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)",
              }}>
                <div style={{
                  width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                  background: "rgba(13,60,252,0.12)", display: "flex",
                  alignItems: "center", justifyContent: "center",
                }}>
                  <Check size={14} color={mkt.accent} strokeWidth={2.5} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: mkt.onDark, fontFamily: FONT }}>{info.name}</div>
                  <div style={{ fontSize: 12, color: WARM_GRAY, opacity: 0.85 }}>{rec.reason}</div>
                </div>
                <span style={{
                  fontSize: 9, fontWeight: 700, color: mkt.accent,
                  background: "rgba(13,60,252,0.1)", border: "1px solid rgba(13,60,252,0.2)",
                  padding: "3px 8px", borderRadius: 999, whiteSpace: "nowrap", flexShrink: 0,
                  textTransform: "uppercase" as const, letterSpacing: "0.04em",
                }}>
                  Recommended
                </span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  const current = questions[step];
  return (
    <div style={{
      background: "rgba(13,60,252,0.04)", border: "1px solid rgba(13,60,252,0.12)",
      borderRadius: CARD_RADIUS, padding: "20px 24px",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: WARM_GRAY, opacity: 0.7, textTransform: "uppercase" as const, letterSpacing: "0.06em" }}>
          Question {step + 1} of {questions.length}
        </div>
        <button onClick={() => { setIsOpen(false); reset(); }} style={{
          background: "none", border: "none", color: mkt.textFaint, fontSize: 12,
          cursor: "pointer", padding: "4px 8px",
        }}>
          Close
        </button>
      </div>
      <div style={{ fontSize: 16, fontWeight: 700, color: mkt.onDark, fontFamily: FONT, marginBottom: 14 }}>
        {current.question}
      </div>
      <div className="quiz-options-grid" style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8 }}>
        {current.options.map((opt) => (
          <button
            key={opt.value}
            onClick={() => handleAnswer(current.key, opt.value)}
            style={{
              padding: "12px 16px", borderRadius: 10, textAlign: "center",
              border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.03)",
              color: mkt.onDark, fontSize: 13, fontWeight: 600, fontFamily: FONT,
              cursor: "pointer", transition: "all 0.15s ease",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#FFFFFF"; e.currentTarget.style.background = "rgba(255,255,255,0.06)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)"; e.currentTarget.style.background = "rgba(255,255,255,0.03)"; }}
          >
            {opt.label}
          </button>
        ))}
      </div>
      <div style={{ display: "flex", gap: 6, justifyContent: "center", marginTop: 14 }}>
        {questions.map((_, i) => (
          <div key={i} style={{
            width: 8, height: 8, borderRadius: 999,
            background: i <= step ? mkt.accent : "rgba(255,255,255,0.1)",
            transition: "background 0.2s",
          }} />
        ))}
      </div>
    </div>
  );
}

export default function PricingUnified() {
  const [yearly, setYearly] = useState(false);
  const [activeCat, setActiveCat] = useState("leads");
  const [infoModal, setInfoModal] = useState<ServiceInfo | null>(null);
  const closeInfoModal = useCallback(() => setInfoModal(null), []);
  const [recommendedProducts, setRecommendedProducts] = useState<string[]>([]);

  /* ─── Checkout modal state ─── */
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [checkoutTitle, setCheckoutTitle] = useState("");
  const [checkoutItems, setCheckoutItems] = useState<CheckoutItem[]>([]);
  const [checkoutBundleId, setCheckoutBundleId] = useState<string | undefined>();
  const [checkoutBundlePrice, setCheckoutBundlePrice] = useState<number | undefined>();
  const [checkoutSystemBuilder, setCheckoutSystemBuilder] = useState(false);

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

  /* Q5c: hero-card checkout now resolves the live product from merged
   * data at click time. If DB overrides exist, the customer pays the
   * admin-published price; otherwise we fall through to the hardcoded
   * constant. Same pattern for both one-time hero products. */
  function openOneTimeCheckout(productId: string, fallback: ProductDef) {
    const product = mergedProducts.find((p) => p.id === productId) ?? fallback;
    const tier = product.tiers[0];
    setCheckoutTitle(product.name);
    setCheckoutItems([{
      serviceId: tier.id,
      label: product.name,
      price: tier.price,
      billingPeriod: "one-time",
    }]);
    setCheckoutBundleId(undefined);
    setCheckoutBundlePrice(undefined);
    setCheckoutOpen(true);
  }

  const openSiteLaunchCheckout = () => openOneTimeCheckout("sitelaunch", SITELAUNCH);
  const openFixOptimizeCheckout = () => openOneTimeCheckout("webfix", WEBFIX);

/* ── ROI anchor component ── */
function RoiAnchor({ text }: { text: string }) {
  return (
    <div style={{ textAlign: "center", fontSize: 12, color: WARM_GRAY, opacity: 0.7, marginTop: 16, lineHeight: 1.5, fontStyle: "italic" }}>
      {text}
    </div>
  );
}

/* ── Build your own system ── */
const CUSTOM_DISCOUNT = 0.07; // 7% discount when 3+ services selected

interface BuilderService {
  id: string;
  name: string;
  tagline: string;
  price: number; // lowest monthly
}

const BUILDER_SERVICES: BuilderService[] = ALL_PRODUCTS
  .filter(p => {
    const monthly = p.tiers.filter(t => t.billingPeriod === "monthly");
    return monthly.length > 0 && !["sitelaunch", "webfix"].includes(p.id);
  })
  .map(p => ({
    id: p.id,
    name: p.name,
    tagline: p.tagline,
    price: lowestMonthly(p)!,
  }));

function SystemBuilder({ yearly, onCheckout }: {
  yearly: boolean;
  onCheckout: (items: CheckoutItem[], title: string) => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState(false);

  const toggle = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const selectedServices = BUILDER_SERVICES.filter(s => selected.has(s.id));
  const subtotal = selectedServices.reduce((sum, s) => sum + s.price, 0);
  const hasDiscount = selectedServices.length >= 3;
  const discountAmount = hasDiscount ? Math.round(subtotal * CUSTOM_DISCOUNT) : 0;
  const total = subtotal - discountAmount;
  const displayTotal = yearly ? yearlyMonthlyEquiv(total) : total;

  const handleCheckout = () => {
    if (selectedServices.length === 0) return;
    const items: CheckoutItem[] = selectedServices.map(s => {
      const product = ALL_PRODUCTS.find(p => p.id === s.id)!;
      const tier = product.tiers.filter(t => t.billingPeriod === "monthly")[0];
      return { serviceId: tier.id, label: s.name, price: s.price, billingPeriod: "monthly" as const };
    });
    onCheckout(items, `Custom System (${selectedServices.length} services)`);
  };

  return (
    <div style={{
      background: "rgba(255,255,255,0.02)",
      border: "1px solid rgba(255,255,255,0.06)",
      borderRadius: CARD_RADIUS,
      overflow: "hidden",
    }}>
      {/* Header — always visible */}
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
          gap: 12, padding: "16px 20px", background: "none", border: "none",
          cursor: "pointer", textAlign: "left", fontFamily: FONT,
        }}
      >
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: mkt.onDark, marginBottom: 2 }}>
            Build your own system
          </div>
          <div style={{ fontSize: 12, color: WARM_GRAY, opacity: 0.8 }}>
            Pick the services you need — get 7% off when you choose 3+
          </div>
        </div>
        <ChevronDown size={16} color={mkt.textFaint} style={{
          flexShrink: 0,
          transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
          transition: "transform 0.2s ease",
        }} />
      </button>

      {/* Expanded content */}
      {expanded && (
        <div style={{ padding: "0 20px 20px" }}>
          {/* Service toggles */}
          <div className="builder-grid" style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8, marginBottom: 16 }}>
            {BUILDER_SERVICES.map(s => {
              const isSelected = selected.has(s.id);
              return (
                <button
                  key={s.id}
                  onClick={() => toggle(s.id)}
                  style={{
                    display: "flex", alignItems: "center", gap: 10,
                    padding: "12px 14px", borderRadius: 10, textAlign: "left",
                    border: `1px solid ${isSelected ? mkt.accent + "44" : "rgba(255,255,255,0.08)"}`,
                    background: isSelected ? mkt.accent + "0a" : "rgba(255,255,255,0.02)",
                    cursor: "pointer", transition: "all 0.15s ease", fontFamily: FONT,
                  }}
                >
                  {/* Checkbox */}
                  <div style={{
                    width: 18, height: 18, borderRadius: 5, flexShrink: 0,
                    border: `2px solid ${isSelected ? mkt.accent : "rgba(255,255,255,0.2)"}`,
                    background: isSelected ? mkt.accent : "transparent",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    transition: "all 0.15s ease",
                  }}>
                    {isSelected && <Check size={12} color={mkt.dark} strokeWidth={3} />}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: isSelected ? mkt.onDark : mkt.textMuted, lineHeight: 1.2 }}>
                      {s.name}
                    </div>
                    <div style={{ fontSize: 11, color: WARM_GRAY, opacity: 0.7, marginTop: 1 }}>
                      from {formatPrice(yearly ? yearlyMonthlyEquiv(s.price) : s.price)}/mo
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Summary */}
          {selectedServices.length > 0 && (
            <div style={{
              background: "rgba(255,255,255,0.03)", borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.06)", padding: "16px 18px",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: hasDiscount ? 4 : 12 }}>
                <span style={{ fontSize: 13, color: mkt.textMuted }}>
                  {selectedServices.length} service{selectedServices.length !== 1 ? "s" : ""} selected
                </span>
                {hasDiscount && (
                  <span style={{ fontSize: 11, fontWeight: 700, color: WARM_GREEN, letterSpacing: "0.02em" }}>
                    7% BUNDLE DISCOUNT
                  </span>
                )}
              </div>
              {hasDiscount && (
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: mkt.textFaint, marginBottom: 12 }}>
                  <span style={{ textDecoration: "line-through" }}>{formatPrice(yearly ? yearlyMonthlyEquiv(subtotal) : subtotal)}/mo</span>
                  <span style={{ color: WARM_GREEN }}>-{formatPrice(yearly ? yearlyMonthlyEquiv(discountAmount) : discountAmount)}/mo</span>
                </div>
              )}
              <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 14 }}>
                <span style={{ fontSize: 28, fontWeight: 800, color: mkt.onDark, fontFamily: FONT, letterSpacing: "-0.03em" }}>
                  {formatPrice(displayTotal)}
                </span>
                <span style={{ fontSize: 14, color: TEXT_STRONG }}>/mo</span>
                {yearly && <span style={{ fontSize: 11, color: WARM_GRAY }}>billed annually</span>}
              </div>
              <CTAButton label="Start Custom System" fullWidth onClick={handleCheckout} />
            </div>
          )}

          {selectedServices.length === 0 && (
            <div style={{ textAlign: "center", fontSize: 13, color: mkt.textFaint, padding: "8px 0" }}>
              Select services above to build your system
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Decision button (compact for grid) ── */
function DecisionButton({ label, targetId }: { label: string; targetId: string }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      onClick={() => document.getElementById(targetId)?.scrollIntoView({ behavior: "smooth", block: "start" })}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        padding: "12px 14px",
        borderRadius: 12,
        border: `1px solid ${hover ? "rgba(13,60,252,0.25)" : "rgba(255,255,255,0.1)"}`,
        background: hover ? "rgba(13,60,252,0.06)" : "rgba(255,255,255,0.03)",
        color: hover ? mkt.onDark : TEXT_STRONG,
        fontSize: 13,
        fontWeight: 600,
        fontFamily: FONT,
        cursor: "pointer",
        transition: "all 0.2s ease",
        textAlign: "center",
      }}
    >
      {label}
    </button>
  );
}

  /* Bundle ordering — Growth first on mobile */
  const bundlesDesktop = [BUNDLE_STARTER, BUNDLE_GROWTH, BUNDLE_PRO];
  const bundlesMobile = [BUNDLE_GROWTH, BUNDLE_STARTER, BUNDLE_PRO];

  /* Q5b: fetch admin-edited overrides from serviceCatalog. The merge
   * helper applies name/tagline at parent and per-tier price/features/
   * badge/highlighted swaps wherever the DB has a matching tier id.
   * Silent fallback to hardcoded ALL_PRODUCTS when the endpoint is
   * unreachable — /pricing never breaks on a backend hiccup.
   *
   * Q5c (cycle 25): hero cards now also resolve from mergedProducts at
   * render + click time, with the hardcoded SITELAUNCH / WEBFIX
   * constants as fallback if the product isn't in the merged array. */
  const [dbOverrides, setDbOverrides] = useState<DbProductOverride[] | null>(null);
  useEffect(() => {
    fetch("/api/public/pricing", { credentials: "omit" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${r.status}`))))
      .then((d) => setDbOverrides(d.products ?? []))
      .catch(() => { /* fall back silently to hardcoded ALL_PRODUCTS */ });
  }, []);
  const mergedProducts = useMemo(
    () => (dbOverrides ? mergeAllProductsWithDb(ALL_PRODUCTS, dbOverrides) : ALL_PRODUCTS),
    [dbOverrides],
  );

  /* Group products by category for individual services section */
  const productsByCategory = CATEGORY_ORDER.map(cat => ({
    cat,
    ...CATEGORY_MAP[cat],
    products: mergedProducts.filter(p => p.category === cat),
  })).filter(g => g.products.length > 0);

  // Title + meta tags handled by <PageMeta> below.

  return (
    <MarketingLayout>
      <PageMeta
        title="Pricing — simple, transparent, built for trades"
        description="Mix-and-match pricing for WeFixTrades calculators, AI, SEO, and reputation tools. No contracts. Cancel any month. You own everything you build with us."
        canonical="/pricing"
      />
      <V7PageShell>
        <V7Hero
          productName="Pricing"
          eyebrow="Pick what you need. Cancel any month."
          headline={<>One job pays for the system.<br/><span style={{ color: mkt.accent }}>Pick what you need — cancel any month.</span></>}
          sub="No contracts. No setup gotchas. You own everything you build with us."
        />
      <div style={{ paddingBottom: 80 }}>

        {/* ═══ 1b. RECOMMENDER QUIZ ═══ */}
        <section className="pricing-section" style={{ paddingTop: 16 }}>
          <div className="pricing-max-w" style={MAX_W}>
            <PlanRecommenderQuiz onRecommend={setRecommendedProducts} />
          </div>
        </section>

        {/* ═══ 2. DECISION FRAME ═══ */}
        <section className="pricing-section" style={{ paddingTop: 16 }}>
          <div className="pricing-max-w" style={MAX_W}>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: mkt.onDark, fontFamily: FONT, margin: "0 0 12px", textAlign: "center" }}>
              What do you want help with?
            </h2>
            <div className="pricing-decision-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
              <DecisionButton label="Get more jobs" targetId="pricing-bundles" />
              <DecisionButton label="Be found on Google" targetId="pricing-services" />
              <DecisionButton label="Handle calls automatically" targetId="pricing-bundles" />
              <DecisionButton label="Get more 5-star reviews" targetId="pricing-services" />
              <DecisionButton label="Fix my website" targetId="pricing-services" />
              <DecisionButton label="Build a new website" targetId="pricing-services" />
            </div>
          </div>
        </section>

        {/* ═══ 3. BUNDLES (PRIMARY) ═══ */}
        <section id="pricing-bundles" className="pricing-section" style={{ paddingTop: 24, scrollMarginTop: 80 }}>
          <div className="pricing-max-w" style={MAX_W}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 4 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <h2 style={{ fontSize: "clamp(18px, 3vw, 26px)", fontWeight: 700, color: mkt.onDark, fontFamily: FONT, letterSpacing: "-0.02em", margin: 0 }}>
                  Choose your system
                </h2>
                <span style={{ display: "inline-flex", background: `${WARM_AMBER}18`, color: WARM_AMBER, fontSize: 10, fontWeight: 700, padding: "3px 10px", borderRadius: 999, letterSpacing: "0.03em", textTransform: "uppercase" as const }}>
                  Most businesses start here
                </span>
              </div>
              <BillingToggle yearly={yearly} onChange={setYearly} />
            </div>
            <p style={{ fontSize: 13, color: WARM_GRAY, lineHeight: 1.45, margin: "0 0 12px", opacity: 0.85 }}>
              Everything working together — more jobs, less manual work.
            </p>

            {/* Desktop: 3-col */}
            <div className="pricing-plans-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20, alignItems: "stretch" }}>
              {bundlesDesktop.map((b) => (
                <BundleCard key={b.id} bundle={b} yearly={yearly} ctaLabel={BUNDLE_CTA[b.id] || "Get Started"} onCheckout={() => openBundleCheckout(b)} onServiceInfo={(pid) => SERVICE_INFO[pid] && setInfoModal(SERVICE_INFO[pid])} />
              ))}
            </div>
            {/* Mobile: Growth first */}
            <div className="pricing-plans-mobile" style={{ display: "none", flexDirection: "column", gap: 16, maxWidth: 480, margin: "0 auto" }}>
              {bundlesMobile.map((b) => (
                <BundleCard key={b.id} bundle={b} yearly={yearly} ctaLabel={BUNDLE_CTA[b.id] || "Get Started"} onCheckout={() => openBundleCheckout(b)} onServiceInfo={(pid) => SERVICE_INFO[pid] && setInfoModal(SERVICE_INFO[pid])} />
              ))}
            </div>

            <RoiAnchor text="One booked job can cover this entire system." />

            {/* Build your own — collapsible, below bundles */}
            <div style={{ marginTop: 28 }}>
              <SystemBuilder
                yearly={yearly}
                onCheckout={(items, title) => {
                  setCheckoutTitle(title);
                  setCheckoutItems(items);
                  setCheckoutBundleId(undefined);
                  setCheckoutBundlePrice(undefined);
                  // Backend applies the SystemBuilder 7% off as a Stripe Coupon
                  // when items.length >= 3 (same threshold the UI uses).
                  setCheckoutSystemBuilder(items.length >= 3);
                  setCheckoutOpen(true);
                }}
              />
            </div>
          </div>
        </section>

        {/* ═══ DIVIDER ═══ */}
        <div className="pricing-max-w" style={{ ...MAX_W, marginTop: 40 }}>
          <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }} />
        </div>

        {/* ═══ 4. INDIVIDUAL SERVICES (SECONDARY) ═══ */}
        <section id="pricing-services" className="pricing-section" style={{ paddingTop: 32, scrollMarginTop: 80 }}>
          <div className="pricing-max-w" style={MAX_W}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
              <div>
                <h2 style={{ fontSize: "clamp(16px, 2.5vw, 22px)", fontWeight: 700, color: mkt.onDark, fontFamily: FONT, letterSpacing: "-0.02em", margin: "0 0 2px" }}>
                  Add or fix specific parts
                </h2>
                <p style={{ fontSize: 13, color: WARM_GRAY, margin: 0, opacity: 0.8 }}>Only need one piece? Start here.</p>
              </div>
              <BillingToggle yearly={yearly} onChange={setYearly} />
            </div>

            {/* Category tabs */}
            <div className="pricing-cat-tabs-row" style={{
              display: "flex", gap: 4, marginBottom: 20, borderRadius: 12,
              background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)",
              padding: 4, overflowX: "auto",
              WebkitOverflowScrolling: "touch" as any, scrollbarWidth: "none" as any,
            }}>
              {productsByCategory.map((group) => {
                const isActive = activeCat === group.cat;
                const Icon = group.icon;
                return (
                  <button
                    key={group.cat}
                    onClick={() => setActiveCat(group.cat)}
                    style={{
                      flex: 1, minWidth: 0, display: "flex", alignItems: "center",
                      justifyContent: "center", gap: 4, padding: "8px 6px", borderRadius: 9,
                      border: "none", background: isActive ? "rgba(255,255,255,0.08)" : "transparent",
                      color: isActive ? mkt.onDark : mkt.textMuted, fontSize: 12,
                      fontWeight: isActive ? 650 : 500, cursor: "pointer",
                      transition: "all 0.18s ease", fontFamily: FONT,
                      textAlign: "center", lineHeight: 1.25,
                    }}
                  >
                    <Icon size={14} strokeWidth={isActive ? 2.2 : 1.8} className="pricing-tab-icon" style={{ flexShrink: 0 }} />
                    {group.label}
                  </button>
                );
              })}
            </div>

            {/* Active category cards */}
            {productsByCategory.filter(g => g.cat === activeCat).map((group) => {
              /* Filter out one-time-only products from the monthly grid — they appear in the one-time section below */
              const ONE_TIME_IDS = new Set(["sitelaunch", "webfix"]);
              const monthlyProducts = group.cat === "website" ? group.products.filter(p => !ONE_TIME_IDS.has(p.id)) : group.products;

              return (
              <div key={group.cat}>
                {monthlyProducts.length > 0 && (
                <div className="pricing-services-grid" style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 20, alignItems: "stretch" }}>
                  {monthlyProducts.map((product) => (
                    <ServiceCard key={product.id} product={product} yearly={yearly} onCheckout={(tier) => openProductCheckout(product, tier)} onInfo={SERVICE_INFO[product.id] ? () => setInfoModal(SERVICE_INFO[product.id]) : undefined} bestFor={recommendedProducts.includes(product.id) ? "Recommended for you" : SERVICE_INFO[product.id]?.bestFor} />
                  ))}
                </div>
                )}

                {group.cat === "website" && (
                  <>
                    <div style={{ marginTop: 32, marginBottom: 20 }}>
                      <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", marginBottom: 16 }} />
                      <h3 style={{ fontSize: 15, fontWeight: 700, color: mkt.onDark, fontFamily: FONT, margin: "0 0 3px" }}>
                        One-time payment options
                      </h3>
                      <p style={{ fontSize: 12, color: WARM_GRAY, lineHeight: 1.4, margin: 0, opacity: 0.75 }}>
                        Not ready for a monthly plan? Start with a one-time fix or a full website build.
                      </p>
                    </div>
                    <div className="pricing-services-grid" style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 20, alignItems: "stretch" }}>
                      {/* Q5c: hero cards render from merged data so admin-edited name/tagline/tier-price flows through. */}
                      <OneTimeCard product={mergedProducts.find(p => p.id === "webfix") ?? WEBFIX} yearly={yearly} onCheckout={openFixOptimizeCheckout} onInfo={() => setInfoModal(SERVICE_INFO["webfix"])} bestFor={recommendedProducts.includes("webfix") ? "Recommended for you" : SERVICE_INFO["webfix"]?.bestFor} />
                      <OneTimeCard product={mergedProducts.find(p => p.id === "sitelaunch") ?? SITELAUNCH} yearly={yearly} onCheckout={openSiteLaunchCheckout} onInfo={() => setInfoModal(SERVICE_INFO["sitelaunch"])} bestFor={recommendedProducts.includes("sitelaunch") ? "Recommended for you" : SERVICE_INFO["sitelaunch"]?.bestFor} />
                    </div>
                  </>
                )}
              </div>
              );
            })}
          </div>
        </section>

        {/* ═══ DIVIDER ═══ */}
        <div className="pricing-max-w" style={{ ...MAX_W, marginTop: 40 }}>
          <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }} />
        </div>

        {/* ═══ 5. FINAL CTA ═══ */}
        <section className="pricing-section" style={{ paddingTop: 24, paddingBottom: 8 }}>
          <div className="pricing-max-w" style={{ ...MAX_W, textAlign: "center" }}>
            <h2 style={{ fontSize: "clamp(15px, 2.5vw, 20px)", fontWeight: 700, color: mkt.onDark, fontFamily: FONT, letterSpacing: "-0.02em", margin: "0 0 4px" }}>
              Still not sure?
            </h2>
            <p style={{ fontSize: 13, color: WARM_GRAY, lineHeight: 1.4, margin: "0 auto 16px", maxWidth: 340, opacity: 0.85 }}>
              Start with one tool — or choose a system and see results faster.
            </p>
            <div className="pricing-final-cta-row" style={{ display: "flex", gap: 10, justifyContent: "center" }}>
              <button
                onClick={() => openBundleCheckout(BUNDLE_GROWTH)}
                style={{
                  flex: 1, maxWidth: 220, padding: "13px 20px", borderRadius: 12,
                  border: "none", background: mkt.accent, color: "#FFFFFF",
                  fontSize: 14, fontWeight: 700, fontFamily: FONT, cursor: "pointer",
                  transition: "all 0.2s ease",
                }}
              >
                Start with Growth
              </button>
              <button
                onClick={() => document.getElementById("pricing-services")?.scrollIntoView({ behavior: "smooth" })}
                style={{
                  flex: 1, maxWidth: 220, padding: "13px 20px", borderRadius: 12,
                  border: "1px solid rgba(255,255,255,0.12)", background: "transparent",
                  color: mkt.onDark, fontSize: 14, fontWeight: 700, fontFamily: FONT,
                  cursor: "pointer", transition: "all 0.2s ease",
                }}
              >
                Try one tool
              </button>
            </div>
          </div>
        </section>

      </div>

      {/* ═══ SERVICE INFO MODAL ═══ */}
      {infoModal && <ServiceInfoModal info={infoModal} onClose={closeInfoModal} />}

      {/* ═══ CHECKOUT MODAL ═══ */}
      <CheckoutModal
        open={checkoutOpen}
        onClose={() => { setCheckoutOpen(false); setCheckoutSystemBuilder(false); }}
        title={checkoutTitle}
        items={checkoutItems}
        bundleId={checkoutBundleId}
        bundlePrice={checkoutBundlePrice}
        systemBuilder={checkoutSystemBuilder}
        yearly={yearly}
      />

      {/* ═══ RESPONSIVE STYLES ═══ */}
      <style>{`
        /* Info icon hover */
        .info-icon-trigger:hover {
          background: rgba(13,60,252,0.12) !important;
          color: ${mkt.accent} !important;
        }
        /* Info modal animations */
        @keyframes infoModalOverlayIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes infoModalIn {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
        /* Section horizontal padding */
        .pricing-section { padding-left: ${SECTION_PAD_X}px; padding-right: ${SECTION_PAD_X}px; }
        /* Hide scrollbar on tabs row */
        .pricing-cat-tabs-row::-webkit-scrollbar { display: none; }
        @media (max-width: 640px) {
          .pricing-section { padding-left: 5px !important; padding-right: 5px !important; }
          .pricing-max-w { padding-left: 3px !important; padding-right: 3px !important; }
          .pricing-tab-icon { display: none !important; }
          .builder-grid {
            grid-template-columns: 1fr !important;
          }
          .quiz-options-grid {
            grid-template-columns: 1fr !important;
          }
          .pricing-decision-grid {
            grid-template-columns: repeat(2, 1fr) !important;
            gap: 6px !important;
          }
          .pricing-final-cta-row {
            flex-direction: column !important;
          }
          .pricing-final-cta-row button {
            max-width: 100% !important;
          }
        }
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
        }
        @media (min-width: 901px) {
          .pricing-plans-mobile {
            display: none !important;
          }
        }
      `}</style>
      </V7PageShell>
    </MarketingLayout>
  );
}
