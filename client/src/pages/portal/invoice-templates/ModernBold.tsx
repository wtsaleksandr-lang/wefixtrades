/**
 * Modern Bold — large brand-colored header block, bold table headers,
 * alternating row stripes, accent strip down the left edge.
 */

import { formatDate, formatMoney, statusLabel, type InvoicePreviewData } from "./types";

export default function ModernBoldPreview({ data }: { data: InvoicePreviewData }) {
  const addr = [
    data.customer_email,
    data.customer_phone,
    data.billing_street,
    [data.billing_city, data.billing_region, data.billing_postal].filter(Boolean).join(", "),
    data.billing_country,
  ].filter((s) => s && s.length > 0) as string[];

  return (
    <div
      data-theme="light"
      style={{
        background: "#FFFFFF",
        color: "#111111",
        fontFamily: "Helvetica, Arial, sans-serif",
        borderRadius: 8,
        border: "1px solid #E5E7EB",
        overflow: "hidden",
        position: "relative",
        minHeight: 600,
      }}
    >
      {/* Accent strip down the left edge */}
      <div style={{ position: "absolute", top: 0, bottom: 0, left: 0, width: 6, background: data.accent_color }} />

      {/* Bold header band */}
      <div style={{ background: data.accent_color, color: "#FFFFFF", padding: "24px 32px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>{data.business_name}</div>
            {data.business_email && <div style={{ fontSize: 11, opacity: 0.85 }}>{data.business_email}</div>}
            {data.business_phone && <div style={{ fontSize: 11, opacity: 0.85 }}>{data.business_phone}</div>}
            {data.business_website && <div style={{ fontSize: 11, opacity: 0.85 }}>{data.business_website}</div>}
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: "0.04em" }}>INVOICE #{data.invoice_number}</div>
            <div style={{ fontSize: 11, opacity: 0.85, marginTop: 6 }}>Status: {statusLabel(data.status)}</div>
            <div style={{ fontSize: 11, opacity: 0.85 }}>Issued: {formatDate(data.issue_date)}</div>
            <div style={{ fontSize: 11, opacity: 0.85 }}>Due: {formatDate(data.due_date)}</div>
          </div>
        </div>
      </div>

      <div style={{ padding: "24px 32px" }}>
        {/* Bill to */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: data.accent_color, letterSpacing: "0.08em", marginBottom: 6 }}>BILL TO</div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>{data.customer_name}</div>
          {addr.map((l, i) => (
            <div key={i} style={{ fontSize: 12, color: "#374151" }}>{l}</div>
          ))}
        </div>

        {/* Bold accent table */}
        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 16 }}>
          <thead>
            <tr style={{ background: data.accent_color, color: "#FFFFFF" }}>
              <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", padding: "10px 12px" }}>DESCRIPTION</th>
              <th style={{ textAlign: "right", fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", padding: "10px 12px", width: 50 }}>QTY</th>
              <th style={{ textAlign: "right", fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", padding: "10px 12px", width: 90 }}>PRICE</th>
              <th style={{ textAlign: "right", fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", padding: "10px 12px", width: 90 }}>TOTAL</th>
            </tr>
          </thead>
          <tbody>
            {data.line_items.map((li, i) => (
              <tr key={i} style={{ background: i % 2 === 0 ? "#F9FAFB" : "#FFFFFF" }}>
                <td style={{ padding: "10px 12px", fontSize: 13 }}>{li.description || <span style={{ color: "#9CA3AF" }}>—</span>}</td>
                <td style={{ padding: "10px 12px", fontSize: 13, textAlign: "right" }}>{li.quantity}</td>
                <td style={{ padding: "10px 12px", fontSize: 13, textAlign: "right" }}>{formatMoney(li.unit_price_cents, data.currency)}</td>
                <td style={{ padding: "10px 12px", fontSize: 13, textAlign: "right", fontWeight: 600 }}>{formatMoney(li.quantity * li.unit_price_cents, data.currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totals */}
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
          <div style={{ minWidth: 240 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#374151", padding: "4px 0" }}>
              <span>Subtotal</span>
              <span>{formatMoney(data.subtotal_cents, data.currency)}</span>
            </div>
            {data.tax_cents > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#374151", padding: "4px 0" }}>
                <span>Tax</span>
                <span>{formatMoney(data.tax_cents, data.currency)}</span>
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, fontWeight: 700, color: "#FFFFFF", background: data.accent_color, padding: "10px 14px", borderRadius: 6, marginTop: 8 }}>
              <span>Total</span>
              <span>{formatMoney(data.total_cents, data.currency)}</span>
            </div>
          </div>
        </div>

        {data.notes && (
          <div style={{ marginTop: 28 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: data.accent_color, letterSpacing: "0.08em", marginBottom: 6 }}>NOTES</div>
            <div style={{ fontSize: 12, color: "#374151", whiteSpace: "pre-wrap" }}>{data.notes}</div>
          </div>
        )}
      </div>
    </div>
  );
}
