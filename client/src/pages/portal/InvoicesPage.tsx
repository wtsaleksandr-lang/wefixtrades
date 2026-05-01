/**
 * BookFlow Invoices page — /portal/invoices
 *
 * Simple invoice management for tradespeople.
 * Create invoices, send them to customers, track payment status.
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  Plus, Send, Eye, DollarSign, FileText,
  ChevronDown, X, Settings,
} from "lucide-react";

interface Invoice {
  id: number;
  customer_name: string;
  customer_email: string | null;
  customer_phone: string | null;
  invoice_number: string;
  line_items: Array<{ description: string; quantity: number; unit_price_cents: number }>;
  subtotal_cents: number;
  tax_cents: number;
  total_cents: number;
  status: string;
  due_date: string | null;
  paid_at: string | null;
  pay_link_token: string;
  notes: string | null;
  created_at: string;
}

interface LineItem {
  description: string;
  quantity: number;
  unit_price_cents: number;
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatDate(d: string): string {
  return new Date(d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function statusBadge(status: string): { bg: string; text: string; label: string } {
  switch (status) {
    case "paid": return { bg: "#f0fdf4", text: "#16a34a", label: "Paid" };
    case "sent": return { bg: "#eff6ff", text: "#2563eb", label: "Sent" };
    case "viewed": return { bg: "#faf5ff", text: "#9333ea", label: "Viewed" };
    case "overdue": return { bg: "#fef2f2", text: "#dc2626", label: "Overdue" };
    case "cancelled": return { bg: "#f3f4f6", text: "#6b7280", label: "Cancelled" };
    default: return { bg: "#f9fafb", text: "#374151", label: "Draft" };
  }
}

export default function InvoicesPage() {
  const [showCreate, setShowCreate] = useState(false);
  const [statusFilter, setStatusFilter] = useState("");
  const queryClient = useQueryClient();

  const { data: invoices = [], isLoading } = useQuery<Invoice[]>({
    queryKey: ["/api/portal/bookflow/invoices", statusFilter],
    queryFn: async () => {
      const url = statusFilter
        ? `/api/portal/bookflow/invoices?status=${statusFilter}`
        : `/api/portal/bookflow/invoices`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load");
      return res.json();
    },
  });

  const sendInvoice = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/portal/bookflow/invoices/${id}/send`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Failed to send");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/portal/bookflow/invoices"] });
    },
  });

  const markPaid = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/portal/bookflow/invoices/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status: "paid", payment_method: "other" }),
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/portal/bookflow/invoices"] });
    },
  });

  const totalOutstanding = invoices
    .filter((i) => !["paid", "cancelled"].includes(i.status))
    .reduce((sum, i) => sum + i.total_cents, 0);

  return (
    <div style={{ maxWidth: 640, margin: "0 auto", padding: "16px" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "#111", margin: 0 }}>Invoices</h1>
        <button
          onClick={() => setShowCreate(true)}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            fontSize: 13,
            fontWeight: 600,
            color: "#fff",
            background: "#111",
            border: "none",
            borderRadius: 8,
            padding: "8px 14px",
            cursor: "pointer",
          }}
        >
          <Plus size={14} />
          New Invoice
        </button>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: totalOutstanding > 0 ? 0 : 16 }}>
        {totalOutstanding > 0 && (
          <p style={{ fontSize: 13, color: "#6b7280", margin: "0 0 16px" }}>
            {formatCents(totalOutstanding)} outstanding
          </p>
        )}
        <Link
          href="/portal/payment-methods"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            fontSize: 12,
            fontWeight: 500,
            color: "#6b7280",
            textDecoration: "none",
            marginBottom: 16,
            marginLeft: "auto",
          }}
        >
          <Settings size={12} />
          Payment Methods
        </Link>
      </div>

      {/* Status filter */}
      <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
        {["", "draft", "sent", "viewed", "paid", "overdue"].map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            style={{
              fontSize: 12,
              fontWeight: statusFilter === s ? 700 : 500,
              color: statusFilter === s ? "#111" : "#6b7280",
              background: statusFilter === s ? "#e5e7eb" : "#f9fafb",
              border: "1px solid #e5e7eb",
              borderRadius: 20,
              padding: "4px 12px",
              cursor: "pointer",
            }}
          >
            {s || "All"}
          </button>
        ))}
      </div>

      {/* Loading */}
      {isLoading && (
        <p style={{ textAlign: "center", color: "#6b7280", fontSize: 14, padding: "40px 0" }}>
          Loading...
        </p>
      )}

      {/* Empty state */}
      {!isLoading && invoices.length === 0 && (
        <div style={{
          textAlign: "center",
          padding: "48px 20px",
          background: "#f9fafb",
          borderRadius: 12,
          border: "1px solid #e5e7eb",
        }}>
          <FileText size={32} style={{ color: "#d1d5db", marginBottom: 12 }} />
          <p style={{ fontSize: 15, fontWeight: 600, color: "#374151", margin: "0 0 4px" }}>
            No invoices yet
          </p>
          <p style={{ fontSize: 13, color: "#6b7280", margin: "0 0 16px" }}>
            Create your first invoice to get paid faster.
          </p>
          <button
            onClick={() => setShowCreate(true)}
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: "#fff",
              background: "#111",
              border: "none",
              borderRadius: 8,
              padding: "8px 16px",
              cursor: "pointer",
            }}
          >
            Create Invoice
          </button>
        </div>
      )}

      {/* Invoice list */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {invoices.map((inv) => {
          const badge = statusBadge(inv.status);
          return (
            <div
              key={inv.id}
              style={{
                background: "#fff",
                borderRadius: 12,
                border: "1px solid #e5e7eb",
                padding: "14px 16px",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <div>
                  <span style={{ fontSize: 14, fontWeight: 600, color: "#111" }}>
                    {inv.invoice_number}
                  </span>
                  <span style={{ fontSize: 13, color: "#6b7280", marginLeft: 8 }}>
                    {inv.customer_name}
                  </span>
                </div>
                <span style={{
                  fontSize: 11,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                  color: badge.text,
                  background: badge.bg,
                  padding: "2px 8px",
                  borderRadius: 20,
                }}>
                  {badge.label}
                </span>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 18, fontWeight: 700, color: "#111" }}>
                  {formatCents(inv.total_cents)}
                </span>
                <span style={{ fontSize: 12, color: "#9ca3af" }}>
                  {formatDate(inv.created_at)}
                </span>
              </div>

              {/* Actions */}
              {inv.status !== "paid" && inv.status !== "cancelled" && (
                <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
                  {inv.customer_email && inv.status === "draft" && (
                    <button
                      onClick={() => sendInvoice.mutate(inv.id)}
                      disabled={sendInvoice.isPending}
                      style={actionBtn}
                    >
                      <Send size={12} />
                      Send
                    </button>
                  )}
                  <button
                    onClick={() => {
                      const url = `${window.location.origin}/pay/${inv.pay_link_token}`;
                      navigator.clipboard.writeText(url);
                      alert("Pay link copied!");
                    }}
                    style={actionBtn}
                  >
                    <Eye size={12} />
                    Copy Link
                  </button>
                  <button
                    onClick={() => markPaid.mutate(inv.id)}
                    style={{ ...actionBtn, background: "#f0fdf4", borderColor: "#bbf7d0", color: "#16a34a" }}
                  >
                    <DollarSign size={12} />
                    Mark Paid
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Create Invoice Modal */}
      {showCreate && (
        <CreateInvoiceModal
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            queryClient.invalidateQueries({ queryKey: ["/api/portal/bookflow/invoices"] });
          }}
        />
      )}
    </div>
  );
}

/* ─── Create Invoice Modal ─── */

function CreateInvoiceModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [lineItems, setLineItems] = useState<LineItem[]>([
    { description: "", quantity: 1, unit_price_cents: 0 },
  ]);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function addLineItem() {
    setLineItems([...lineItems, { description: "", quantity: 1, unit_price_cents: 0 }]);
  }

  function updateLineItem(idx: number, field: keyof LineItem, value: string | number) {
    const updated = [...lineItems];
    if (field === "description") {
      updated[idx].description = value as string;
    } else if (field === "quantity") {
      updated[idx].quantity = Math.max(1, parseInt(String(value)) || 1);
    } else {
      // Convert dollar input to cents
      updated[idx].unit_price_cents = Math.round(parseFloat(String(value)) * 100) || 0;
    }
    setLineItems(updated);
  }

  function removeLineItem(idx: number) {
    if (lineItems.length <= 1) return;
    setLineItems(lineItems.filter((_, i) => i !== idx));
  }

  const subtotal = lineItems.reduce((s, li) => s + li.quantity * li.unit_price_cents, 0);

  async function handleCreate() {
    if (!customerName.trim()) return setError("Customer name required");
    if (lineItems.some((li) => !li.description.trim())) return setError("All items need a description");
    if (subtotal <= 0) return setError("Total must be greater than zero");

    setSaving(true);
    setError("");

    try {
      const res = await fetch("/api/portal/bookflow/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          customer_name: customerName.trim(),
          customer_email: customerEmail.trim() || undefined,
          customer_phone: customerPhone.trim() || undefined,
          line_items: lineItems.map((li) => ({
            description: li.description.trim(),
            quantity: li.quantity,
            unit_price_cents: li.unit_price_cents,
          })),
          notes: notes.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create invoice");
      }

      onCreated();
    } catch (err: any) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: "#111", margin: 0 }}>New Invoice</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#6b7280" }}>
            <X size={20} />
          </button>
        </div>

        {/* Customer */}
        <div style={{ marginBottom: 12 }}>
          <label style={labelStyle}>Customer Name *</label>
          <input
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            placeholder="John Smith"
            style={inputStyle}
          />
        </div>
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Email</label>
            <input
              type="email"
              value={customerEmail}
              onChange={(e) => setCustomerEmail(e.target.value)}
              placeholder="john@example.com"
              style={inputStyle}
            />
          </div>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Phone</label>
            <input
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              placeholder="(555) 123-4567"
              style={inputStyle}
            />
          </div>
        </div>

        {/* Line items */}
        <label style={{ ...labelStyle, marginBottom: 8, display: "block" }}>Line Items</label>
        {lineItems.map((li, idx) => (
          <div key={idx} style={{ display: "flex", gap: 6, marginBottom: 6, alignItems: "center" }}>
            <input
              value={li.description}
              onChange={(e) => updateLineItem(idx, "description", e.target.value)}
              placeholder="Service or item"
              style={{ ...inputStyle, flex: 3 }}
            />
            <input
              type="number"
              value={li.quantity}
              onChange={(e) => updateLineItem(idx, "quantity", e.target.value)}
              min={1}
              style={{ ...inputStyle, flex: 0.7, textAlign: "center" }}
            />
            <input
              type="number"
              value={li.unit_price_cents ? (li.unit_price_cents / 100).toFixed(2) : ""}
              onChange={(e) => updateLineItem(idx, "unit_price_cents", e.target.value)}
              placeholder="0.00"
              min={0}
              step="0.01"
              style={{ ...inputStyle, flex: 1, textAlign: "right" }}
            />
            {lineItems.length > 1 && (
              <button
                onClick={() => removeLineItem(idx)}
                style={{ background: "none", border: "none", cursor: "pointer", color: "#9ca3af", padding: 4 }}
              >
                <X size={14} />
              </button>
            )}
          </div>
        ))}

        <button
          onClick={addLineItem}
          style={{
            fontSize: 12,
            fontWeight: 500,
            color: "#3b82f6",
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: "4px 0",
            marginBottom: 12,
          }}
        >
          + Add item
        </button>

        {/* Total */}
        <div style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: 16,
          fontWeight: 700,
          color: "#111",
          padding: "10px 0",
          borderTop: "1px solid #e5e7eb",
          marginBottom: 12,
        }}>
          <span>Total</span>
          <span>${(subtotal / 100).toFixed(2)}</span>
        </div>

        {/* Notes */}
        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Notes (optional)</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Thank you for your business!"
            rows={2}
            style={{ ...inputStyle, height: "auto", padding: "10px 14px", resize: "vertical" }}
          />
        </div>

        {error && (
          <p style={{ fontSize: 13, color: "#dc2626", margin: "0 0 12px" }}>{error}</p>
        )}

        <button
          onClick={handleCreate}
          disabled={saving}
          style={{
            width: "100%",
            fontSize: 14,
            fontWeight: 600,
            color: "#fff",
            background: saving ? "#6b7280" : "#111",
            border: "none",
            borderRadius: 8,
            padding: "12px",
            cursor: saving ? "default" : "pointer",
          }}
        >
          {saving ? "Creating..." : "Create Invoice"}
        </button>
      </div>
    </div>
  );
}

/* ─── Styles ─── */

const actionBtn: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  fontSize: 12,
  fontWeight: 500,
  color: "#374151",
  background: "#f9fafb",
  border: "1px solid #e5e7eb",
  borderRadius: 6,
  padding: "5px 10px",
  cursor: "pointer",
};

const overlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.4)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 1000,
  padding: 16,
};

const modalStyle: React.CSSProperties = {
  background: "#fff",
  borderRadius: 14,
  padding: "20px",
  maxWidth: 500,
  width: "100%",
  maxHeight: "90vh",
  overflowY: "auto",
};

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: "#374151",
  marginBottom: 4,
  display: "block",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  height: 38,
  borderRadius: 8,
  border: "1px solid #e5e7eb",
  padding: "0 12px",
  fontSize: 14,
  color: "#111",
  background: "#fff",
  outline: "none",
  boxSizing: "border-box",
};
