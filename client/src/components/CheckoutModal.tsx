/**
 * CheckoutModal — slide-out intake form that collects business details
 * and initiates a Stripe Checkout Session via POST /api/public/checkout.
 *
 * All pricing data comes from shared/pricing.ts. No hardcoded values.
 */

import { useState, useEffect, useRef } from "react";
import { X, Check, ArrowRight, Loader2 } from "lucide-react";
import { mkt, shadows, typography } from "@/theme/tokens";
import { formatPrice, yearlyMonthlyEquiv, bundleSavings, type BundleDef, type Tier, type ProductDef } from "@/config/pricing";
import { SmsConsentDisclosure } from "@/components/forms/SmsConsentDisclosure";

const FONT = typography.fontFamily;

/* ─── Types ─── */

export interface CheckoutItem {
  serviceId: string;   // service_catalog row ID
  label: string;       // display name
  price: number;       // monthly or one-time price
  billingPeriod: "monthly" | "one-time";
}

export interface CheckoutModalProps {
  open: boolean;
  onClose: () => void;
  title: string;             // e.g. "Growth System" or "TradeLine™ Pro"
  items: CheckoutItem[];     // service IDs to checkout
  bundleId?: string;         // optional bundle ID — backend applies bundle-savings coupon
  bundlePrice?: number;      // if bundle, the discounted monthly total
  systemBuilder?: boolean;   // true when triggered from /pricing SystemBuilder — backend applies 7% coupon
  yearly: boolean;           // current billing toggle state
}

/* ─── Component ─── */

export default function CheckoutModal({ open, onClose, title, items, bundleId, bundlePrice, systemBuilder, yearly }: CheckoutModalProps) {
  const [businessName, setBusinessName] = useState("");
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const nameRef = useRef<HTMLInputElement>(null);

  // Focus first field on open
  useEffect(() => {
    if (open) {
      setError("");
      setTimeout(() => nameRef.current?.focus(), 100);
    }
  }, [open]);

  // Prevent body scroll when open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!businessName.trim()) { setError("Business name is required"); return; }
    if (!contactName.trim()) { setError("Your name is required"); return; }
    if (!email.trim() || !email.includes("@")) { setError("A valid email is required"); return; }

    setLoading(true);

    try {
      const res = await fetch("/api/public/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          business_name: businessName.trim(),
          contact_name: contactName.trim(),
          contact_email: email.trim(),
          contact_phone: phone.trim() || undefined,
          items: items.map(i => i.serviceId),
          bundle_id: bundleId,
          system_builder: systemBuilder || undefined,
          billing_period: yearly ? "yearly" : "monthly",
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Something went wrong. Please try again.");
        setLoading(false);
        return;
      }

      if (data.checkout_url) {
        // Redirect to Stripe Checkout
        window.location.href = data.checkout_url;
      } else {
        setError("Could not create checkout session. Please contact us.");
        setLoading(false);
      }
    } catch {
      setError("Connection error. Please try again.");
      setLoading(false);
    }
  };

  // Price summary
  const isBundle = !!bundlePrice;
  const totalMonthly = items.filter(i => i.billingPeriod === "monthly").reduce((s, i) => s + i.price, 0);
  const totalOneTime = items.filter(i => i.billingPeriod === "one-time").reduce((s, i) => s + i.price, 0);
  const displayMonthly = isBundle
    ? (yearly ? yearlyMonthlyEquiv(bundlePrice) : bundlePrice)
    : (yearly ? yearlyMonthlyEquiv(totalMonthly) : totalMonthly);

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.6)",
          backdropFilter: "blur(4px)",
          WebkitBackdropFilter: "blur(4px)",
          zIndex: 10000,
          transition: "opacity 0.2s ease",
        }}
      />

      {/* Panel */}
      <div
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          width: "min(440px, 100vw)",
          background: mkt.bg,
          zIndex: 10001,
          display: "flex",
          flexDirection: "column",
          boxShadow: "-8px 0 40px rgba(0,0,0,0.3)",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div style={{
          padding: "20px 24px",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexShrink: 0,
        }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: mkt.onDark, fontFamily: FONT }}>Get Started</div>
            <div style={{ fontSize: 13, color: mkt.text, marginTop: 2 }}>{title}</div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "rgba(255,255,255,0.06)",
              border: "none",
              borderRadius: 8,
              width: 36,
              height: 36,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              color: mkt.textMuted,
              transition: "all 0.15s",
            }}
            onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.1)"; e.currentTarget.style.color = mkt.onDark; }}
            onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.06)"; e.currentTarget.style.color = mkt.textMuted; }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Scrollable content */}
        <div style={{ flex: 1, overflowY: "auto", padding: "24px" }}>

          {/* Order summary */}
          <div style={{
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.06)",
            borderRadius: 12,
            padding: "16px 18px",
            marginBottom: 24,
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: mkt.accent, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 10 }}>
              Order Summary
            </div>
            {items.map(item => (
              <div key={item.serviceId} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: mkt.text }}>
                  <Check size={12} color={mkt.accent} strokeWidth={2.5} />
                  {item.label}
                </div>
                <span style={{ fontSize: 12, color: mkt.textMuted }}>
                  {item.billingPeriod === "monthly" ? `${formatPrice(item.price)}/mo` : `${formatPrice(item.price)}`}
                </span>
              </div>
            ))}

            {/* Total */}
            <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", marginTop: 10, paddingTop: 10, display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: mkt.onDark }}>Total</span>
              <div style={{ textAlign: "right" }}>
                {displayMonthly > 0 && (
                  <div style={{ fontSize: 18, fontWeight: 800, color: mkt.onDark }}>
                    {formatPrice(displayMonthly)}<span style={{ fontSize: 12, fontWeight: 500, color: mkt.textMuted }}>/mo</span>
                  </div>
                )}
                {totalOneTime > 0 && (
                  <div style={{ fontSize: displayMonthly > 0 ? 13 : 18, fontWeight: displayMonthly > 0 ? 500 : 800, color: displayMonthly > 0 ? mkt.textMuted : mkt.onDark }}>
                    + {formatPrice(totalOneTime)} one-time
                  </div>
                )}
                {yearly && displayMonthly > 0 && (
                  <div style={{ fontSize: 11, color: mkt.accent, marginTop: 2 }}>billed annually (10% off)</div>
                )}
              </div>
            </div>
          </div>

          {/* Intake form */}
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: mkt.accent, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: -4 }}>
              Your Details
            </div>

            <FormField
              ref={nameRef}
              label="Business Name"
              placeholder="e.g. Smith Plumbing"
              value={businessName}
              onChange={setBusinessName}
              required
            />

            <FormField
              label="Your Name"
              placeholder="e.g. John Smith"
              value={contactName}
              onChange={setContactName}
              required
            />

            <FormField
              label="Email"
              placeholder="john@smithplumbing.com"
              type="email"
              value={email}
              onChange={setEmail}
              required
            />

            <FormField
              label="Phone"
              placeholder="(555) 123-4567"
              type="tel"
              value={phone}
              onChange={setPhone}
            />
            <SmsConsentDisclosure variant="inline" />

            {error && (
              <div style={{
                padding: "10px 14px",
                borderRadius: 8,
                background: "rgba(239,68,68,0.1)",
                border: "1px solid rgba(239,68,68,0.2)",
                color: "#EF4444",
                fontSize: 13,
              }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{
                width: "100%",
                padding: "16px 24px",
                borderRadius: 12,
                border: "none",
                background: loading ? mkt.accentDark : mkt.accent,
                // Was mkt.dark (near-black) — unreadable on the blue accent
                // button. Light text for contrast (matches PricingUnified CTA).
                color: mkt.onDark,
                fontSize: 15,
                fontWeight: 700,
                fontFamily: FONT,
                cursor: loading ? "not-allowed" : "pointer",
                transition: "all 0.2s ease",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                marginTop: 4,
              }}
            >
              {loading ? (
                <>
                  <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} />
                  Preparing checkout...
                </>
              ) : (
                <>
                  Proceed to Payment
                  <ArrowRight size={16} />
                </>
              )}
            </button>

            <div style={{ fontSize: 11, color: mkt.textMuted, textAlign: "center", lineHeight: 1.5 }}>
              You'll be redirected to our secure payment page powered by Stripe.
              <br />
              No payment is taken until you complete checkout.
            </div>
          </form>
        </div>
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </>
  );
}

/* ─── Form Field ─── */

import { forwardRef } from "react";

const FormField = forwardRef<HTMLInputElement, {
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
}>(function FormField({ label, placeholder, value, onChange, type = "text", required }, ref) {
  const [focused, setFocused] = useState(false);
  return (
    <div>
      <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: mkt.text, marginBottom: 6 }}>
        {label}{required && <span style={{ color: mkt.accent, marginLeft: 2 }}>*</span>}
      </label>
      <input
        ref={ref}
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={e => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          width: "100%",
          padding: "12px 14px",
          borderRadius: 10,
          border: `1px solid ${focused ? mkt.accent : "rgba(255,255,255,0.10)"}`,
          background: "rgba(255,255,255,0.04)",
          color: mkt.onDark,
          fontSize: 14,
          fontFamily: FONT,
          outline: "none",
          transition: "border-color 0.15s ease",
          boxSizing: "border-box",
        }}
      />
    </div>
  );
});
