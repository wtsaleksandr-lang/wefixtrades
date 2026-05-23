/**
 * Classic Minimal — monochrome, thin rules, single column. Helvetica.
 * Live preview for the matching PDF renderer in
 * server/lib/invoiceTemplates/ClassicMinimal.ts.
 */

import { formatDate, formatMoney, statusLabel, type InvoicePreviewData } from "./types";

export default function ClassicMinimalPreview({ data }: { data: InvoicePreviewData }) {
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
        padding: "32px 36px",
        borderRadius: 8,
        border: "1px solid #E5E7EB",
        fontSize: 13,
        lineHeight: 1.5,
        minHeight: 600,
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 24, marginBottom: 24 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 18, fontWeight: 700 }}>{data.business_name}</div>
          {data.business_email && <div style={{ fontSize: 11, color: "#6B7280" }}>{data.business_email}</div>}
          {data.business_phone && <div style={{ fontSize: 11, color: "#6B7280" }}>{data.business_phone}</div>}
          {data.business_website && <div style={{ fontSize: 11, color: "#6B7280" }}>{data.business_website}</div>}
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.08em" }}>INVOICE</div>
          <div style={{ fontSize: 13, color: "#374151", marginTop: 2 }}>#{data.invoice_number}</div>
          <div style={{ fontSize: 11, color: "#6B7280", marginTop: 6 }}>Status: {statusLabel(data.status)}</div>
          <div style={{ fontSize: 11, color: "#6B7280" }}>Issued: {formatDate(data.issue_date)}</div>
          <div style={{ fontSize: 11, color: "#6B7280" }}>Due: {formatDate(data.due_date)}</div>
        </div>
      </div>

      <div style={{ borderTop: "1px solid #E5E7EB", margin: "12px 0 20px" }} />

      {/* Bill to */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: "#6B7280", letterSpacing: "0.08em", marginBottom: 6 }}>BILL TO</div>
        <div style={{ fontSize: 14, fontWeight: 700 }}>{data.customer_name}</div>
        {addr.map((l, i) => (
          <div key={i} style={{ fontSize: 12, color: "#374151" }}>{l}</div>
        ))}
      </div>

      {/* Line items */}
      <div style={{ borderTop: "1px solid #E5E7EB", paddingTop: 10, marginBottom: 4 }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #E5E7EB" }}>
              <th style={{ textAlign: "left", fontSize: 10, fontWeight: 700, color: "#6B7280", letterSpacing: "0.06em", padding: "8px 0" }}>DESCRIPTION</th>
              <th style={{ textAlign: "right", fontSize: 10, fontWeight: 700, color: "#6B7280", letterSpacing: "0.06em", padding: "8px 0", width: 50 }}>QTY</th>
              <th style={{ textAlign: "right", fontSize: 10, fontWeight: 700, color: "#6B7280", letterSpacing: "0.06em", padding: "8px 0", width: 90 }}>PRICE</th>
              <th style={{ textAlign: "right", fontSize: 10, fontWeight: 700, color: "#6B7280", letterSpacing: "0.06em", padding: "8px 0", width: 90 }}>TOTAL</th>
            </tr>
          </thead>
          <tbody>
            {data.line_items.map((li, i) => (
              <tr key={i}>
                <td style={{ padding: "10px 0", fontSize: 13 }}>{li.description || <span style={{ color: "#9CA3AF" }}>—</span>}</td>
                <td style={{ padding: "10px 0", fontSize: 13, textAlign: "right" }}>{li.quantity}</td>
                <td style={{ padding: "10px 0", fontSize: 13, textAlign: "right" }}>{formatMoney(li.unit_price_cents, data.currency)}</td>
                <td style={{ padding: "10px 0", fontSize: 13, textAlign: "right" }}>{formatMoney(li.quantity * li.unit_price_cents, data.currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Totals */}
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
        <div style={{ minWidth: 220 }}>
          <div style={{ borderTop: "1px solid #E5E7EB", paddingTop: 8 }} />
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
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, fontWeight: 700, color: data.accent_color, padding: "8px 0", borderTop: "1px solid #E5E7EB", marginTop: 4 }}>
            <span>Total</span>
            <span>{formatMoney(data.total_cents, data.currency)}</span>
          </div>
        </div>
      </div>

      {/* Notes */}
      {data.notes && (
        <div style={{ marginTop: 28 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#6B7280", letterSpacing: "0.08em", marginBottom: 6 }}>NOTES</div>
          <div style={{ fontSize: 12, color: "#374151", whiteSpace: "pre-wrap" }}>{data.notes}</div>
        </div>
      )}
    </div>
  );
}
