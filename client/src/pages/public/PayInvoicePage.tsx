/**
 * Public invoice payment page — /pay/:token
 *
 * Clean, mobile-first page showing invoice details and ALL available
 * payment methods. The primary Stripe option is prominent at top;
 * alternative methods (PayPal, E-Transfer, bank, Venmo, Zelle, cash)
 * appear in a "More ways to pay" section below.
 *
 * No authentication required.
 */

import { useState, useEffect } from "react";
import { useParams } from "wouter";
import { eff, primaryButtonStyle } from "@/components/quote-widget/designTokens";

interface PaymentMethods {
  stripe?: boolean;
  paypal_email?: string;
  bank_details?: string;
  etransfer_email?: string;
  venmo_handle?: string;
  zelle_info?: string;
  cash_accepted?: boolean;
}

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
  payment_methods: PaymentMethods;
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

/** Copy text to clipboard with visual feedback */
function CopyButton({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <button data-theme="light" onClick={handleCopy} style={copyBtnStyle}>
      {copied ? "Copied!" : label || "Copy"}
    </button>
  );
}

export default function PayInvoicePage() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const isPaid = new URLSearchParams(window.location.search).get("paid") === "1";

  const [invoice, setInvoice] = useState<InvoiceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);
  const [showMore, setShowMore] = useState(false);

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
  const pm = invoice.payment_methods || {};
  const hasAltMethods = !!(
    pm.paypal_email ||
    pm.etransfer_email ||
    pm.bank_details ||
    pm.venmo_handle ||
    pm.zelle_info ||
    pm.cash_accepted
  );

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

        {/* ══════════ Payment Methods ══════════ */}
        {!showPaid && (
          <div>
            {/* Primary: Stripe Pay Online */}
            {invoice.stripe_enabled && (
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
                {paying ? "Redirecting..." : `Pay Online ${formatCents(invoice.total_cents)}`}
              </button>
            )}

            {invoice.stripe_enabled && (
              <p style={{
                fontSize: 11,
                color: eff.textBody,
                textAlign: "center",
                margin: "8px 0 0",
                opacity: 0.7,
              }}>
                Cards, Apple Pay, Google Pay, bank transfer, and more
              </p>
            )}

            {!invoice.stripe_enabled && !hasAltMethods && (
              <p style={{ fontSize: 13, color: eff.textBody, textAlign: "center", margin: "8px 0 0" }}>
                Contact {invoice.business_name} to arrange payment.
              </p>
            )}

            {/* More ways to pay */}
            {hasAltMethods && (
              <div style={{ marginTop: invoice.stripe_enabled ? 20 : 0 }}>
                <button
                  onClick={() => setShowMore(!showMore)}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    fontSize: 13,
                    fontWeight: 600,
                    color: eff.text,
                    padding: "10px 0",
                  }}
                >
                  <span>{showMore ? "Hide" : "More ways to pay"}</span>
                  <span style={{
                    display: "inline-block",
                    transform: showMore ? "rotate(180deg)" : "rotate(0)",
                    transition: "transform 0.2s ease",
                    fontSize: 10,
                  }}>
                    &#9660;
                  </span>
                </button>

                {showMore && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 4 }}>
                    {/* PayPal */}
                    {pm.paypal_email && (
                      <div style={methodCardStyle}>
                        <div style={methodHeaderStyle}>
                          <span style={methodIconStyle}>P</span>
                          <span style={methodTitleStyle}>PayPal</span>
                        </div>
                        <p style={methodBodyStyle}>
                          Send {formatCents(invoice.total_cents)} to <strong>{pm.paypal_email}</strong>
                        </p>
                        <p style={{ fontSize: 11, color: eff.textBody, margin: "4px 0 0", opacity: 0.7 }}>
                          Reference: {invoice.invoice_number}
                        </p>
                        <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                          <a
                            href={`https://paypal.me/${pm.paypal_email}/${(invoice.total_cents / 100).toFixed(2)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={altPayBtnStyle}
                          >
                            Pay with PayPal
                          </a>
                          <CopyButton text={pm.paypal_email} label="Copy email" />
                        </div>
                      </div>
                    )}

                    {/* E-Transfer / Interac */}
                    {pm.etransfer_email && (
                      <div style={methodCardStyle}>
                        <div style={methodHeaderStyle}>
                          <span style={methodIconStyle}>E</span>
                          <span style={methodTitleStyle}>E-Transfer / Interac</span>
                        </div>
                        <p style={methodBodyStyle}>
                          Send {formatCents(invoice.total_cents)} via e-transfer to:
                        </p>
                        <p style={{
                          fontSize: 15,
                          fontWeight: 700,
                          color: eff.text,
                          margin: "6px 0",
                          fontFamily: eff.fontMono,
                        }}>
                          {pm.etransfer_email}
                        </p>
                        <p style={{ fontSize: 11, color: eff.textBody, margin: "0 0 4px", opacity: 0.7 }}>
                          Reference: {invoice.invoice_number}
                        </p>
                        <CopyButton text={pm.etransfer_email} label="Copy email" />
                      </div>
                    )}

                    {/* Bank Transfer */}
                    {pm.bank_details && (
                      <div style={methodCardStyle}>
                        <div style={methodHeaderStyle}>
                          <span style={methodIconStyle}>B</span>
                          <span style={methodTitleStyle}>Bank Transfer</span>
                        </div>
                        <p style={methodBodyStyle}>
                          Send {formatCents(invoice.total_cents)} using these details:
                        </p>
                        <pre style={{
                          fontSize: 12,
                          color: eff.text,
                          background: "#f0f2f4",
                          padding: "10px 12px",
                          borderRadius: 8,
                          margin: "6px 0 4px",
                          whiteSpace: "pre-wrap",
                          fontFamily: eff.fontMono,
                          lineHeight: 1.5,
                          border: `1px solid ${eff.buttonBorder}`,
                        }}>
                          {pm.bank_details}
                        </pre>
                        <p style={{ fontSize: 11, color: eff.textBody, margin: "0 0 4px", opacity: 0.7 }}>
                          Reference: {invoice.invoice_number}
                        </p>
                        <CopyButton text={pm.bank_details} label="Copy details" />
                      </div>
                    )}

                    {/* Venmo */}
                    {pm.venmo_handle && (
                      <div style={methodCardStyle}>
                        <div style={methodHeaderStyle}>
                          <span style={methodIconStyle}>V</span>
                          <span style={methodTitleStyle}>Venmo</span>
                        </div>
                        <p style={methodBodyStyle}>
                          Send {formatCents(invoice.total_cents)} via Venmo to:
                        </p>
                        <p style={{
                          fontSize: 15,
                          fontWeight: 700,
                          color: eff.text,
                          margin: "6px 0",
                        }}>
                          @{pm.venmo_handle.replace(/^@/, "")}
                        </p>
                        <p style={{ fontSize: 11, color: eff.textBody, margin: "0 0 4px", opacity: 0.7 }}>
                          Reference: {invoice.invoice_number}
                        </p>
                        <CopyButton text={`@${pm.venmo_handle.replace(/^@/, "")}`} label="Copy handle" />
                      </div>
                    )}

                    {/* Zelle */}
                    {pm.zelle_info && (
                      <div style={methodCardStyle}>
                        <div style={methodHeaderStyle}>
                          <span style={methodIconStyle}>Z</span>
                          <span style={methodTitleStyle}>Zelle</span>
                        </div>
                        <p style={methodBodyStyle}>
                          Send {formatCents(invoice.total_cents)} via Zelle to:
                        </p>
                        <p style={{
                          fontSize: 15,
                          fontWeight: 700,
                          color: eff.text,
                          margin: "6px 0",
                        }}>
                          {pm.zelle_info}
                        </p>
                        <p style={{ fontSize: 11, color: eff.textBody, margin: "0 0 4px", opacity: 0.7 }}>
                          Reference: {invoice.invoice_number}
                        </p>
                        <CopyButton text={pm.zelle_info} label="Copy info" />
                      </div>
                    )}

                    {/* Cash / Check */}
                    {pm.cash_accepted && (
                      <div style={methodCardStyle}>
                        <div style={methodHeaderStyle}>
                          <span style={methodIconStyle}>$</span>
                          <span style={methodTitleStyle}>Cash / Check</span>
                        </div>
                        <p style={methodBodyStyle}>
                          Pay in person. Mention invoice <strong>#{invoice.invoice_number}</strong> and the amount of {formatCents(invoice.total_cents)}.
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
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

const methodCardStyle: React.CSSProperties = {
  background: "#f8fafb",
  border: `1px solid ${eff.buttonBorder}`,
  borderRadius: 10,
  padding: "14px 16px",
};

const methodHeaderStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  marginBottom: 8,
};

const methodIconStyle: React.CSSProperties = {
  width: 28,
  height: 28,
  borderRadius: 7,
  background: eff.text,
  color: "#fff",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 13,
  fontWeight: 700,
  flexShrink: 0,
};

const methodTitleStyle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 700,
  color: eff.text,
};

const methodBodyStyle: React.CSSProperties = {
  fontSize: 13,
  color: eff.textBody,
  margin: 0,
  lineHeight: 1.5,
};

const altPayBtnStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  fontSize: 12,
  fontWeight: 600,
  color: "#fff",
  background: "#111",
  border: "none",
  borderRadius: 7,
  padding: "7px 14px",
  cursor: "pointer",
  textDecoration: "none",
};

const copyBtnStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  fontSize: 11,
  fontWeight: 600,
  color: "#374151",
  background: "#fff",
  border: "1px solid #d1d5db",
  borderRadius: 6,
  padding: "5px 10px",
  cursor: "pointer",
};
