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
            {priceLabel} — billed monthly. Cancel anytime.
          </p>
        )}

        <form onSubmit={submit} style={{ marginTop: 22, display: "flex", flexDirection: "column", gap: 12 }}>
          <Field label="Business name" autoFocus>
            <input
              type="text"
              required
              autoComplete="organization"
              value={form.business_name}
              onChange={(e) => setForm({ ...form, business_name: e.target.value })}
              style={inputStyle}
              data-testid="intake-business-name"
            />
          </Field>
          <Field label="Your name">
            <input
              type="text"
              required
              autoComplete="name"
              value={form.contact_name}
              onChange={(e) => setForm({ ...form, contact_name: e.target.value })}
              style={inputStyle}
              data-testid="intake-contact-name"
            />
          </Field>
          <Field label="Email">
            <input
              type="email"
              required
              autoComplete="email"
              value={form.contact_email}
              onChange={(e) => setForm({ ...form, contact_email: e.target.value })}
              style={inputStyle}
              data-testid="intake-contact-email"
            />
          </Field>
          <Field label="Phone (optional)">
            <input
              type="tel"
              autoComplete="tel"
              value={form.contact_phone}
              onChange={(e) => setForm({ ...form, contact_phone: e.target.value })}
              style={inputStyle}
              data-testid="intake-contact-phone"
            />
            <SmsConsentDisclosure variant="inline" />
          </Field>

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

function Field({ label, autoFocus, children }: { label: string; autoFocus?: boolean; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>{label}</span>
      <div data-autofocus={autoFocus ? "1" : undefined}>{children}</div>
    </label>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  fontSize: 14,
  borderRadius: 10,
  border: "1px solid #D1D5DB",
  background: "#fff",
  color: "#0F1418",
  outline: "none",
};
