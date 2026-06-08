/**
 * Public-checkout intake modal.
 *
 * Pops up from the "Get Started" buttons on /plans (bundle pricing
 * page) and from any other public surface that needs to start a
 * Stripe Checkout. Collects the four fields the
 * `/api/public/checkout` endpoint requires (business name, contact
 * name, email, optional phone), then POSTs and redirects the visitor
 * to the returned `checkout_url`.
 *
 * Endpoint contract (server/routes/publicCheckoutRoutes.ts):
 *   POST /api/public/checkout
 *   { business_name, contact_name, contact_email, contact_phone?,
 *     items: string[],   // service_catalog tier IDs
 *     bundle_id?: string,
 *     billing_period?: "monthly" | "yearly" }
 *   → 200 { checkout_url }
 *   → 503 if Stripe isn't configured (pre-launch)
 */

import { useEffect, useState } from "react";
import { Loader2, X } from "lucide-react";
import { SmsConsentDisclosure } from "@/components/forms/SmsConsentDisclosure";
import { FreeToolFormField, FreeToolFormFieldStyles } from "@/components/marketing/FreeToolFormField";

export interface CheckoutIntakeModalProps {
  open: boolean;
  onClose: () => void;
  /** Service-catalog tier IDs to add as line items, e.g. ["mapguard-basic", "reputationshield-basic"]. */
  items: string[];
  /** Optional metadata so the CRM can attribute which marketing bundle a customer came from. */
  bundleId?: string;
  /** What to call this purchase in the modal headline. */
  bundleName?: string;
  /** Headline price (display-only). */
  priceLabel?: string;
  /** Billing descriptor shown after the price. Defaults to monthly-subscription
   *  language. Pass a one-time note (e.g. "One-time payment · No subscription")
   *  for one-time SKUs so the copy never contradicts the price. */
  billingNote?: string;
}

interface FormState {
  business_name: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
}

const INITIAL: FormState = {
  business_name: "",
  contact_name: "",
  contact_email: "",
  contact_phone: "",
};

export default function CheckoutIntakeModal({
  open,
  onClose,
  items,
  bundleId,
  bundleName,
  priceLabel,
  billingNote = "billed monthly. Cancel anytime.",
}: CheckoutIntakeModalProps) {
  const [form, setForm] = useState<FormState>(INITIAL);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* Reset state whenever the modal closes so reopening is fresh */
  useEffect(() => {
    if (!open) {
      setForm(INITIAL);
      setError(null);
      setSubmitting(false);
    }
  }, [open]);

  /* Body scroll lock + ESC to close while open */
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  /* Autofocus the first field (Business name) on open. FreeToolFormField
     doesn't forward an `autoFocus` prop, so we focus by id — same pattern
     the sibling CheckoutModal uses. */
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => document.getElementById("intake-business-name")?.focus(), 100);
    return () => clearTimeout(t);
  }, [open]);

  if (!open) return null;

  const valid =
    form.business_name.trim().length >= 2 &&
    form.contact_name.trim().length >= 2 &&
    /^\S+@\S+\.\S+$/.test(form.contact_email);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/public/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          business_name: form.business_name.trim(),
          contact_name: form.contact_name.trim(),
          contact_email: form.contact_email.trim(),
          contact_phone: form.contact_phone.trim() || undefined,
          items,
          bundle_id: bundleId,
          billing_period: "monthly",
        }),
      });
      if (res.status === 503) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Checkout isn't configured yet — please contact us directly.");
        setSubmitting(false);
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? `Couldn't start checkout (${res.status}). Please try again.`);
        setSubmitting(false);
        return;
      }
      const body = await res.json();
      if (typeof body.checkout_url !== "string") {
        setError("Checkout response was malformed — please contact us.");
        setSubmitting(false);
        return;
      }
      window.location.assign(body.checkout_url);
    } catch (err) {
      setError("Network error. Check your connection and try again.");
      setSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Start checkout"
      data-theme="light"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10000,
        background: "rgba(0,0,0,0.55)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 480,
          background: "#fff",
          borderRadius: 18,
          padding: 28,
          boxShadow: "0 24px 60px rgba(0,0,0,0.35)",
          position: "relative",
        }}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          style={{
            position: "absolute",
            top: 14,
            right: 14,
            width: 32,
            height: 32,
            borderRadius: 8,
            border: "none",
            background: "transparent",
            color: "#6B7280",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <X size={20} />
        </button>

        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#0F1418", letterSpacing: "-0.01em" }}>
          {bundleName ? `Start ${bundleName}` : "Start checkout"}
        </h2>
        {priceLabel && (
          <p style={{ margin: "4px 0 0", fontSize: 14, color: "#6B7280" }}>
            {priceLabel} — {billingNote}
          </p>
        )}

        {/* Intake form — title-in-field (floating-label) per DESIGN-SYSTEM
            input rules, via the shared FreeToolFormField primitive. This is
            a light-surface modal (#fff), so theme="light". The 2px gap
            between stacked fields is the design-system spacing. */}
        <FreeToolFormFieldStyles />
        <form onSubmit={submit} style={{ marginTop: 22, display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <FreeToolFormField
              id="intake-business-name"
              testId="intake-business-name"
              theme="light"
              label="Business name"
              helpText="The trading name we'll put on your account and invoices."
              value={form.business_name}
              onChange={(v) => setForm({ ...form, business_name: v })}
              autoComplete="organization"
              required
            />
            <FreeToolFormField
              id="intake-contact-name"
              testId="intake-contact-name"
              theme="light"
              label="Your name"
              helpText="Who we should address account and billing emails to."
              value={form.contact_name}
              onChange={(v) => setForm({ ...form, contact_name: v })}
              autoComplete="name"
              required
            />
            <FreeToolFormField
              id="intake-contact-email"
              testId="intake-contact-email"
              theme="light"
              label="Email"
              type="email"
              helpText="Where we'll send your receipt and account access."
              value={form.contact_email}
              onChange={(v) => setForm({ ...form, contact_email: v })}
              inputMode="email"
              autoComplete="email"
              required
            />
            <FreeToolFormField
              id="intake-contact-phone"
              testId="intake-contact-phone"
              theme="light"
              label="Phone (optional)"
              type="tel"
              helpText="Optional — only used if we need to reach you about your order."
              value={form.contact_phone}
              onChange={(v) => setForm({ ...form, contact_phone: v })}
              inputMode="tel"
              autoComplete="tel"
            />
          </div>
          <SmsConsentDisclosure variant="inline" />

          {error && (
            <p
              role="alert"
              style={{
                margin: 0,
                padding: "10px 12px",
                background: "#FEF2F2",
                border: "1px solid #FECACA",
                color: "#991B1B",
                fontSize: 13,
                borderRadius: 10,
              }}
            >
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={!valid || submitting}
            data-testid="intake-submit"
            style={{
              marginTop: 6,
              padding: "12px 18px",
              borderRadius: 12,
              border: "none",
              background: !valid || submitting ? "#9CA3AF" : "#0B1F3A",
              color: "#fff",
              fontSize: 15,
              fontWeight: 700,
              cursor: !valid || submitting ? "default" : "pointer",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              transition: "background 180ms ease",
            }}
          >
            {submitting ? (
              <>
                <Loader2 size={16} className="animate-spin" /> Starting checkout…
              </>
            ) : (
              "Continue to secure checkout"
            )}
          </button>

          <p style={{ margin: 0, fontSize: 11, color: "#9CA3AF", textAlign: "center" }}>
            You'll be redirected to Stripe to complete payment.
          </p>
        </form>
      </div>
    </div>
  );
}

