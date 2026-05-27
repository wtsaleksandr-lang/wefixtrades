/**
 * BookFlow Invoices page — /portal/invoices
 *
 * Simple invoice management for tradespeople.
 * Create invoices, send them to customers, track payment status.
 */

import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  Plus, Send, Eye, DollarSign, FileText,
  ChevronDown, X, Settings, Search,
} from "lucide-react";
import PortalLayout from "@/components/portal/PortalLayout";
import { useToast } from "@/hooks/use-toast";

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

// Local-only line item carries a stable client-side uid so React keys are
// stable across reorders/removals (avoids the `key={idx}` antipattern).
interface DraftLineItem extends LineItem {
  _uid: string;
}

function newLineItemUid(): string {
  // crypto.randomUUID is available in all evergreen browsers we support.
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `li_${Math.random().toString(36).slice(2, 10)}`;
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

type DateRange = "all" | "30d" | "90d";
type SortKey = "newest" | "oldest" | "amount_desc" | "amount_asc";

export default function InvoicesPage() {
  const [showCreate, setShowCreate] = useState(false);
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const [range, setRange] = useState<DateRange>("all");
  const [sort, setSort] = useState<SortKey>("newest");
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const queryString = useMemo(() => {
    const p = new URLSearchParams();
    if (statusFilter) p.set("status", statusFilter);
    if (search.trim()) p.set("q", search.trim());
    if (range !== "all") p.set("range", range);
    if (sort !== "newest") p.set("sort", sort);
    const qs = p.toString();
    return qs ? `?${qs}` : "";
  }, [statusFilter, search, range, sort]);

  // Wave 43 — the server returns an array of Invoice rows; coerce
  // defensively so a stray `{error: ...}` (or any non-array payload) can
  // never crash the subsequent `.filter` / `.map` / `.reduce` calls below.
  const { data: rawInvoicesData, isLoading, error: invoicesError } = useQuery<Invoice[] | unknown>({
    queryKey: ["/api/portal/bookflow/invoices", statusFilter, search, range, sort],
    queryFn: async () => {
      const res = await fetch(`/api/portal/bookflow/invoices${queryString}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load");
      return res.json();
    },
  });
  const invoices: Invoice[] = Array.isArray(rawInvoicesData) ? (rawInvoicesData as Invoice[]) : [];

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
    onError: (err: Error) => {
      toast({ title: "Failed to send invoice", description: err.message, variant: "destructive" });
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
    onError: (err: Error) => {
      toast({ title: "Failed to mark paid", description: err.message, variant: "destructive" });
    },
  });

  const totalOutstanding = invoices
    .filter((i) => i && !["paid", "cancelled"].includes(i.status))
    .reduce((sum, i) => sum + (typeof i.total_cents === "number" ? i.total_cents : 0), 0);

  return (
    <PortalLayout breadcrumb="Invoices">
    {/* Width + horizontal gutters are owned by PortalLayout (PR #600 canonical
        pattern). We only keep a small vertical rhythm here. */}
    <div data-theme="light">
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <h1 className="text-gray-900" style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Invoices</h1>
        <button
          onClick={() => setShowCreate(true)}
          className="bg-brand-blue text-white"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            fontSize: 13,
            fontWeight: 600,
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

      {/* Search + range + sort.
       *
       *  Search filters by customer name OR invoice number. Range collapses
       *  to a query param the server applies as a created_at cutoff. */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ position: "relative", flex: "1 1 220px", minWidth: 220 }}>
          <Search size={14} style={{ position: "absolute", left: 10, top: 12, color: "#9ca3af", pointerEvents: "none" }} />
          <input
            type="text"
            placeholder="Search customer or #"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: "100%",
              height: 36,
              borderRadius: 8,
              border: "1px solid #e5e7eb",
              padding: "0 12px 0 32px",
              fontSize: 13,
              color: "#111",
              outline: "none",
              boxSizing: "border-box",
              background: "var(--field-bg-light)",
            }}
            aria-label="Search invoices"
          />
        </div>
        <select
          value={range}
          onChange={(e) => setRange(e.target.value as DateRange)}
          aria-label="Filter by date range"
          style={{ height: 36, borderRadius: 8, border: "1px solid #e5e7eb", padding: "0 10px", fontSize: 13, background: "var(--field-bg-light)", color: "#111" }}
        >
          <option value="all">All time</option>
          <option value="30d">Last 30 days</option>
          <option value="90d">Last 90 days</option>
        </select>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          aria-label="Sort invoices"
          style={{ height: 36, borderRadius: 8, border: "1px solid #e5e7eb", padding: "0 10px", fontSize: 13, background: "var(--field-bg-light)", color: "#111" }}
        >
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="amount_desc">Amount: high → low</option>
          <option value="amount_asc">Amount: low → high</option>
        </select>
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

      {/* Error state — keeps the page rendered (header, filters, New
       *  Invoice button still work) so the user has a way back. */}
      {!isLoading && invoicesError && (
        <div
          data-testid="invoices-load-error"
          style={{
            textAlign: "center",
            padding: "32px 20px",
            background: "#fef2f2",
            borderRadius: 12,
            border: "1px solid #fecaca",
            color: "#991b1b",
            fontSize: 13,
          }}
        >
          Couldn't load your invoices. Refresh in a moment — your data is safe.
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !invoicesError && invoices.length === 0 && (
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
            className="bg-brand-blue text-white"
            style={{
              fontSize: 13,
              fontWeight: 600,
              border: "none",
              borderRadius: 8,
              padding: "8px 16px",
              cursor: "pointer",
            }}
          >
            Create Invoice
          </button>
          <div style={{ marginTop: 10 }}>
            <Link
              href="/portal/help"
              className="text-brand-blue hover:underline"
              style={{ fontSize: 12, fontWeight: 500, textDecoration: "none" }}
            >
              How invoices work →
            </Link>
          </div>
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
                  <Link
                    href={`/portal/invoices/${inv.id}`}
                    className="text-brand-blue hover:underline"
                    style={{ fontSize: 14, fontWeight: 600, textDecoration: "none" }}
                  >
                    {inv.invoice_number}
                  </Link>
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
                      toast({ title: "Pay link copied" });
                    }}
                    style={actionBtn}
                  >
                    <Eye size={12} />
                    Copy Link
                  </button>
                  <button
                    onClick={() => markPaid.mutate(inv.id)}
                    className="text-green-700 bg-green-50 border-green-200 dark:bg-green-950/40 dark:border-green-800/60 dark:text-green-300"
                    style={actionBtn}
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
    </PortalLayout>
  );
}

/* ─── Create Invoice Modal ─── */

function CreateInvoiceModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [lineItems, setLineItems] = useState<DraftLineItem[]>([
    { _uid: newLineItemUid(), description: "", quantity: 1, unit_price_cents: 0 },
  ]);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function addLineItem() {
    setLineItems([...lineItems, { _uid: newLineItemUid(), description: "", quantity: 1, unit_price_cents: 0 }]);
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

  const anyFieldDirty =
    !!customerName.trim() ||
    !!customerEmail.trim() ||
    !!customerPhone.trim() ||
    !!notes.trim() ||
    lineItems.some((li) => !!li.description.trim() || li.unit_price_cents > 0);

  function handleBackdropClick() {
    if (anyFieldDirty && !confirm("Discard unsaved changes?")) return;
    onClose();
  }

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
    <div data-theme="light" style={overlayStyle} onClick={handleBackdropClick}>
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
          <div key={li._uid} style={{ display: "flex", gap: 6, marginBottom: 6, alignItems: "center" }}>
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
          className="text-white"
          style={{
            width: "100%",
            fontSize: 14,
            fontWeight: 600,
            background: saving ? "#6b7280" : "#0d3cfc",
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
  background: "var(--popover-bg-light)",
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
  background: "var(--field-bg-light)",
  outline: "none",
  boxSizing: "border-box",
};
