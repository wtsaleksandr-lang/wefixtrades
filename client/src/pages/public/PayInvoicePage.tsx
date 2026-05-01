/**
 * Public invoice payment page — /pay/:token
 *
 * Clean, mobile-first page showing invoice details and a "Pay" button.
 * Uses QuoteQuick design tokens for visual consistency.
 * No authentication required.
 */

import { useState, useEffect } from "react";
import { useParams } from "wouter";
import { eff, primaryButtonStyle } from "@/components/quote-widget/designTokens";

interface InvoiceData {
  invoice_number: string;
  customer_name: string;
  line_items: Array<{ description: string; quantity: number; unit_price_cents: number }>;
  subtotal_cents: number;
  tax_cents: number;
  total_cents: number;
  due_date: string | null;
  status: string;
  paid_at: string | null;
  notes: string | null;
  business_name: string;
  stripe_enabled: boolean;
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatDate(d: string): string {
  return new Date(d).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export default function PayInvoicePage() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const isPaid = new URLSearchParams(window.location.search).get("paid") === "1";

  const [invoice, setInvoice] = useState<InvoiceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);

  useEffect(() => {
    if (!token) return;
    fetch(`/api/pay/${token}`)
      .then((r) => {
        if (!r.ok) throw new Error("Invoice not found");
        return r.json();
      })
      .then(setInvoice)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  async function handlePay() {
    if (!token) return;
    setPaying(true);
    try {
      const res = await fetch(`/api/pay/${token}/checkout`, { method: "POST" });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        setError(data.error || "Failed to start payment");
        setPaying(false);
      }
    } catch {
      setError("Failed to connect to payment service");
      setPaying(false);
    }
  }

  if (loading) {
    return (
      <div style={pageStyle}>
        <div style={cardStyle}>
          <p style={{ color: eff.textBody, textAlign: "center", fontSize: 14 }}>Loading invoice...</p>
        </div>
      </div>
    );
  }

  if (error || !invoice) {
    return (
      <div style={pageStyle}>
        <div style={cardStyle}>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: eff.text, margin: "0 0 8px", fontFamily: eff.font }}>
            Invoice Not Found
          </h1>
          <p style={{ color: eff.textBody, fontSize: 14, margin: 0 }}>
            This invoice link may be expired or invalid.
          </p>
        </div>
      </div>
    );
  }

  const showPaid = invoice.status === "paid" || isPaid;

  return (
    <div style={pageStyle}>
      <div style={cardStyle}>
        {/* Header */}
        <div style={{ marginBottom: 20 }}>
          <p style={{
            fontSize: 11,
            fontWeight: 700,
            color: eff.textBody,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            margin: "0 0 4px",
            fontFamily: eff.font,
          }}>
            {invoice.business_name}
          </p>
          <h1 style={{
            fontSize: 22,
            fontWeight: 700,
            color: eff.text,
            margin: "0 0 4px",
            fontFamily: eff.font,
          }}>
            Invoice {invoice.invoice_number}
          </h1>
          <p style={{ fontSize: 13, color: eff.textBody, margin: 0 }}>
            For {invoice.customer_name}
          </p>
        </div>

        {/* Status pill */}
        {showPaid && (
          <div style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            background: eff.successBg,
            color: eff.success,
            fontSize: 13,
            fontWeight: 700,
            padding: "6px 14px",
            borderRadius: eff.radiusMd,
            marginBottom: 16,
          }}>
            Paid
          </div>
        )}

        {/* Line items */}
        <div style={{
          background: "#f8fafb",
          border: `1px solid ${eff.buttonBorder}`,
          borderRadius: eff.radiusMd,
          padding: "12px 14px",
          marginBottom: 16,
        }}>
          {invoice.line_items.map((li, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                padding: "8px 0",
                borderBottom: i < invoice.line_items.length - 1 ? `1px solid ${eff.buttonBorder}` : "none",
              }}
            >
              <div>
                <span style={{ fontSize: 14, color: eff.text, fontWeight: 500 }}>{li.description}</span>
                {li.quantity > 1 && (
                  <span style={{ fontSize: 12, color: eff.textBody, marginLeft: 6 }}>x{li.quantity}</span>
                )}
              </div>
              <span style={{ fontSize: 14, fontWeight: 600, color: eff.text, fontFamily: eff.fontMono }}>
                {formatCents(li.quantity * li.unit_price_cents)}
              </span>
            </div>
          ))}
        </div>

        {/* Totals */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: eff.textBody, marginBottom: 4 }}>
            <span>Subtotal</span>
            <span>{formatCents(invoice.subtotal_cents)}</span>
          </div>
          {(invoice.tax_cents ?? 0) > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: eff.textBody, marginBottom: 4 }}>
              <span>Tax</span>
              <span>{formatCents(invoice.tax_cents)}</span>
            </div>
          )}
          <div style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: 18,
            fontWeight: 700,
            color: eff.text,
            paddingTop: 8,
            borderTop: `1px solid ${eff.buttonBorder}`,
            fontFamily: eff.fontMono,
          }}>
            <span>Total</span>
            <span>{formatCents(invoice.total_cents)}</span>
          </div>
        </div>

        {/* Due date */}
        {invoice.due_date && !showPaid && (
          <p style={{ fontSize: 13, color: eff.textBody, margin: "0 0 16px" }}>
            Due by <strong style={{ color: eff.text }}>{formatDate(invoice.due_date)}</strong>
          </p>
        )}

        {/* Notes */}
        {invoice.notes && (
          <p style={{ fontSize: 13, color: eff.textBody, lineHeight: 1.5, margin: "0 0 16px" }}>
            {invoice.notes}
          </p>
        )}

        {/* Pay button */}
        {!showPaid && invoice.stripe_enabled && (
          <button
            onClick={handlePay}
            disabled={paying}
            style={{
              ...primaryButtonStyle,
              opacity: paying ? 0.6 : 1,
              pointerEvents: paying ? "none" : "auto",
            }}
            onMouseOver={(e) => (e.currentTarget.style.background = eff.buttonBgHover)}
            onMouseOut={(e) => (e.currentTarget.style.background = eff.buttonBg)}
          >
            {paying ? "Redirecting..." : `Pay ${formatCents(invoice.total_cents)}`}
          </button>
        )}

        {!showPaid && !invoice.stripe_enabled && (
          <p style={{ fontSize: 13, color: eff.textBody, textAlign: "center", margin: "8px 0 0" }}>
            Contact {invoice.business_name} to arrange payment.
          </p>
        )}

        {/* Paid confirmation */}
        {showPaid && (
          <div style={{
            textAlign: "center",
            padding: "16px 0 0",
          }}>
            <p style={{ fontSize: 15, fontWeight: 600, color: eff.success, margin: 0 }}>
              Payment received — thank you!
            </p>
          </div>
        )}
      </div>

      {/* Footer */}
      <p style={{
        fontSize: 11,
        color: eff.textBody,
        textAlign: "center",
        marginTop: 16,
        opacity: 0.7,
      }}>
        Powered by WeFixTrades
      </p>
    </div>
  );
}

/* ─── Styles ─── */

const pageStyle: React.CSSProperties = {
  minHeight: "100vh",
  background: eff.bg,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  padding: "24px 16px",
  fontFamily: eff.font,
};

const cardStyle: React.CSSProperties = {
  background: "#fff",
  borderRadius: eff.radiusXl,
  border: `1px solid ${eff.buttonBorder}`,
  padding: "28px 24px",
  maxWidth: 440,
  width: "100%",
};
