/**
 * Trade Service — warm tinted header card, pill status badge, friendly
 * spacing. Pairs with brand-blue accent.
 */

import { formatDate, formatMoney, statusLabel, type InvoicePreviewData } from "./types";

function tintHex(hex: string): string {
  const c = hex.replace("#", "");
  if (c.length !== 6) return "#EFF4FF";
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  const mix = (v: number) => Math.round(v + (255 - v) * 0.88);
  const toHex = (n: number) => n.toString(16).padStart(2, "0");
  return `#${toHex(mix(r))}${toHex(mix(g))}${toHex(mix(b))}`;
}

export default function TradeServicePreview({ data }: { data: InvoicePreviewData }) {
  const tint = tintHex(data.accent_color);
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
        color: "#0F172A",
        fontFamily: "Helvetica, Arial, sans-serif",
        padding: "24px",
        borderRadius: 8,
        border: "1px solid #E2E8F0",
        minHeight: 600,
      }}
    >
      {/* Soft tinted header card */}
      <div style={{ background: tint, borderRadius: 10, padding: "20px 24px", marginBottom: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: "#0F172A" }}>{data.business_name}</div>
            {data.business_email && <div style={{ fontSize: 11, color: "#475569", marginTop: 4 }}>{data.business_email}</div>}
            {data.business_phone && <div style={{ fontSize: 11, color: "#475569" }}>{data.business_phone}</div>}
            {data.business_website && <div style={{ fontSize: 11, color: "#475569" }}>{data.business_website}</div>}
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#475569" }}>Invoice #{data.invoice_number}</div>
            <div style={{ marginTop: 8 }}>
              <span style={{ display: "inline-block", border: `1px solid ${data.accent_color}`, color: data.accent_color, padding: "2px 12px", borderRadius: 999, fontSize: 10, fontWeight: 700, letterSpacing: "0.06em" }}>
                {statusLabel(data.status).toUpperCase()}
              </span>
            </div>
            <div style={{ fontSize: 11, color: "#64748B", marginTop: 8 }}>Issued {formatDate(data.issue_date)}</div>
            <div style={{ fontSize: 11, color: "#64748B" }}>Due {formatDate(data.due_date)}</div>
          </div>
        </div>
      </div>

      {/* Bill to */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: "#64748B", letterSpacing: "0.08em", marginBottom: 6 }}>BILLED TO</div>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#0F172A" }}>{data.customer_name}</div>
        {addr.map((l, i) => (
          <div key={i} style={{ fontSize: 12, color: "#475569" }}>{l}</div>
        ))}
      </div>

      {/* Grouped line items */}
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ background: "#F1F5F9" }}>
            <th style={{ textAlign: "left", fontSize: 10, fontWeight: 700, color: "#475569", letterSpacing: "0.06em", padding: "10px 12px", borderRadius: "4px 0 0 4px" }}>SERVICE</th>
            <th style={{ textAlign: "right", fontSize: 10, fontWeight: 700, color: "#475569", letterSpacing: "0.06em", padding: "10px 12px", width: 50 }}>QTY</th>
            <th style={{ textAlign: "right", fontSize: 10, fontWeight: 700, color: "#475569", letterSpacing: "0.06em", padding: "10px 12px", width: 90 }}>PRICE</th>
            <th style={{ textAlign: "right", fontSize: 10, fontWeight: 700, color: "#475569", letterSpacing: "0.06em", padding: "10px 12px", width: 90, borderRadius: "0 4px 4px 0" }}>AMOUNT</th>
          </tr>
        </thead>
        <tbody>
          {data.line_items.map((li, i) => (
            <tr key={i} style={{ borderBottom: "1px solid #E2E8F0" }}>
              <td style={{ padding: "12px", fontSize: 13 }}>{li.description || <span style={{ color: "#94A3B8" }}>—</span>}</td>
              <td style={{ padding: "12px", fontSize: 13, textAlign: "right" }}>{li.quantity}</td>
              <td style={{ padding: "12px", fontSize: 13, textAlign: "right" }}>{formatMoney(li.unit_price_cents, data.currency)}</td>
              <td style={{ padding: "12px", fontSize: 13, textAlign: "right", fontWeight: 600 }}>{formatMoney(li.quantity * li.unit_price_cents, data.currency)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Totals */}
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
        <div style={{ minWidth: 240 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#475569", padding: "4px 0" }}>
            <span>Subtotal</span>
            <span>{formatMoney(data.subtotal_cents, data.currency)}</span>
          </div>
          {data.tax_cents > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#475569", padding: "4px 0" }}>
              <span>Tax</span>
              <span>{formatMoney(data.tax_cents, data.currency)}</span>
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, fontWeight: 700, color: data.accent_color, background: tint, padding: "10px 14px", borderRadius: 6, marginTop: 8 }}>
            <span>Total Due</span>
            <span>{formatMoney(data.total_cents, data.currency)}</span>
          </div>
        </div>
      </div>

      {data.notes && (
        <div style={{ marginTop: 24 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#64748B", letterSpacing: "0.08em", marginBottom: 6 }}>NOTES</div>
          <div style={{ fontSize: 12, color: "#475569", whiteSpace: "pre-wrap" }}>{data.notes}</div>
        </div>
      )}

      <div style={{ marginTop: 24, fontSize: 10, color: "#94A3B8", textAlign: "center" }}>
        Thanks for your business
      </div>
    </div>
  );
}
