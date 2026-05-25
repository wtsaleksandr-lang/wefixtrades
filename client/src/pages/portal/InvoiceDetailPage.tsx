/**
 * Invoice detail page — /portal/invoices/:id (Phase A).
 *
 * Layout: 2-column desktop, single-column mobile.
 *   Left  — editable invoice form (customer + line items + meta + actions)
 *   Right — live template preview (Classic Minimal / Modern Bold / Trade Service)
 *
 * Owns all Phase A items #2–#27 below the list-page level:
 *   • inline edit (items + meta)
 *   • invoice-level tax (percent | fixed)
 *   • currency picker (label-only, 5 codes)
 *   • template picker + live preview
 *   • per-invoice accent override
 *   • linked-contact autocomplete (auto-fills billing address)
 *   • mark-paid modal (manual payment method capture)
 *   • copy pay-link
 *   • send-invoice modal (subject/body/PDF attached)
 */

import { useEffect, useMemo, useState } from "react";
import { useRoute, Link, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, Save, Send, FileDown, CreditCard, Link2, Trash2, Plus, X,
  Calendar, DollarSign, ChevronDown, Loader2, User, Check,
} from "lucide-react";
import PortalLayout from "@/components/portal/PortalLayout";
import { useToast } from "@/hooks/use-toast";
import { useCopilotForm } from "@/context/CopilotFormContext";
import ClassicMinimalPreview from "./invoice-templates/ClassicMinimal";
import ModernBoldPreview from "./invoice-templates/ModernBold";
import TradeServicePreview from "./invoice-templates/TradeService";
import type { InvoicePreviewData } from "./invoice-templates/types";
import { formatMoney as previewFormatMoney } from "./invoice-templates/types";

/* ─── Types ─── */
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
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `li_${Math.random().toString(36).slice(2, 10)}`;
}

interface InvoiceRow {
  id: number;
  client_id: number;
  customer_name: string;
  customer_email: string | null;
  customer_phone: string | null;
  invoice_number: string | null;
  line_items: LineItem[];
  subtotal_cents: number;
  tax_cents: number;
  total_cents: number;
  status: string;
  issue_date: string | null;
  due_date: string | null;
  paid_at: string | null;
  notes: string | null;
  pay_link_token: string;
  currency: string;
  template_slug: string | null;
  contact_id: string | null;
  metadata: Record<string, any> | null;
  created_at: string;
}

interface ContactSearchResult {
  id: string;
  display_name: string;
  email: string | null;
  phone_e164: string;
  billing_street: string | null;
  billing_city: string | null;
  billing_region: string | null;
  billing_postal: string | null;
  billing_country: string | null;
}

interface InvoiceDetailResponse {
  invoice: InvoiceRow;
  contact: (ContactSearchResult & { id: string }) | null;
  client: {
    business_name: string;
    contact_email: string | null;
    contact_phone: string | null;
    website_url: string | null;
    logo_url: string | null;
    accent_color: string | null;
    default_template: string | null;
  };
}

type TemplateSlug = "classic-minimal" | "modern-bold" | "trade-service";
const TEMPLATE_OPTIONS: { slug: TemplateSlug; label: string; description: string }[] = [
  { slug: "classic-minimal", label: "Classic Minimal", description: "Monochrome, mature businesses" },
  { slug: "modern-bold", label: "Modern Bold", description: "Brand-color header, bold tables" },
  { slug: "trade-service", label: "Trade Service", description: "Warm, friendly, status pill" },
];

const CURRENCIES = ["USD", "CAD", "EUR", "GBP", "AUD"] as const;
type Currency = typeof CURRENCIES[number];

function toIsoDate(d: Date | string | null): string {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  if (isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
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

/* ─── Page ─── */

export default function InvoiceDetailPage() {
  const [match, params] = useRoute("/portal/invoices/:id");
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const invoiceId = match ? parseInt(params!.id) : NaN;

  const { data, isLoading, error } = useQuery<InvoiceDetailResponse>({
    queryKey: ["/api/portal/bookflow/invoices", invoiceId],
    queryFn: async () => {
      const res = await fetch(`/api/portal/bookflow/invoices/${invoiceId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load invoice");
      return res.json();
    },
    enabled: !isNaN(invoiceId),
  });

  return (
    <PortalLayout breadcrumb={<><Link href="/portal/invoices" className="text-brand-blue hover:underline">Invoices</Link><span className="mx-2 text-gray-400">›</span><span>{data?.invoice?.invoice_number || "Invoice"}</span></>}>
      <div data-theme="light">
        <div style={{ marginBottom: 16 }}>
          <Link href="/portal/invoices" className="text-gray-600 hover:text-gray-900" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, textDecoration: "none" }}>
            <ArrowLeft size={14} /> Back to invoices
          </Link>
        </div>

        {isLoading && (
          <div style={{ padding: 40, textAlign: "center", color: "#6b7280", fontSize: 14 }}>
            <Loader2 size={20} style={{ display: "inline-block", verticalAlign: "middle", marginRight: 8 }} className="animate-spin" />
            Loading…
          </div>
        )}

        {error && (
          <div style={{ padding: 20, background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, color: "#b91c1c", fontSize: 13 }}>
            Couldn't load this invoice. <button onClick={() => navigate("/portal/invoices")} style={{ background: "none", border: "none", color: "#b91c1c", textDecoration: "underline", cursor: "pointer" }}>Return to list</button>
          </div>
        )}

        {data && <InvoiceEditor data={data} invoiceId={invoiceId} onChanged={() => queryClient.invalidateQueries({ queryKey: ["/api/portal/bookflow/invoices", invoiceId] })} toast={toast} navigate={navigate} />}
      </div>
    </PortalLayout>
  );
}

/* ─── Editor (state + form) ─── */

function InvoiceEditor({
  data,
  invoiceId,
  onChanged,
  toast,
  navigate,
}: {
  data: InvoiceDetailResponse;
  invoiceId: number;
  onChanged: () => void;
  toast: ReturnType<typeof useToast>["toast"];
  navigate: (to: string) => void;
}) {
  const inv = data.invoice;
  const queryClient = useQueryClient();

  // Local editing state — initialised from server payload.
  const [customerName, setCustomerName] = useState(inv.customer_name);
  const [customerEmail, setCustomerEmail] = useState(inv.customer_email || "");
  const [customerPhone, setCustomerPhone] = useState(inv.customer_phone || "");
  const [invoiceNumber, setInvoiceNumber] = useState(inv.invoice_number || "");
  const [issueDate, setIssueDate] = useState(toIsoDate(inv.issue_date) || toIsoDate(inv.created_at));
  const [dueDate, setDueDate] = useState(toIsoDate(inv.due_date));
  const [notes, setNotes] = useState(inv.notes || "");
  const [lineItems, setLineItems] = useState<DraftLineItem[]>(
    Array.isArray(inv.line_items) && inv.line_items.length > 0
      ? inv.line_items.map((li) => ({ ...li, _uid: newLineItemUid() }))
      : [{ _uid: newLineItemUid(), description: "", quantity: 1, unit_price_cents: 0 }],
  );
  const [taxMode, setTaxMode] = useState<"fixed" | "percent">("fixed");
  const [taxPercent, setTaxPercent] = useState<number>(0);
  const [taxFixedCents, setTaxFixedCents] = useState<number>(inv.tax_cents || 0);
  const [currency, setCurrency] = useState<Currency>((inv.currency as Currency) || "USD");
  const [templateSlug, setTemplateSlug] = useState<TemplateSlug>(
    (inv.template_slug as TemplateSlug) || (data.client.default_template as TemplateSlug) || "classic-minimal",
  );
  const [accentColor, setAccentColor] = useState<string>(
    (inv.metadata?.accent_color as string) || data.client.accent_color || "#0d3cfc",
  );
  const [linkedContact, setLinkedContact] = useState<ContactSearchResult | null>(data.contact || null);
  const [billingStreet, setBillingStreet] = useState(data.contact?.billing_street || "");
  const [billingCity, setBillingCity] = useState(data.contact?.billing_city || "");
  const [billingRegion, setBillingRegion] = useState(data.contact?.billing_region || "");
  const [billingPostal, setBillingPostal] = useState(data.contact?.billing_postal || "");
  const [billingCountry, setBillingCountry] = useState(data.contact?.billing_country || "US");

  // Derived totals.
  const subtotal = useMemo(
    () => lineItems.reduce((s, li) => s + (Number(li.quantity) || 0) * (Number(li.unit_price_cents) || 0), 0),
    [lineItems],
  );
  const taxAmount = useMemo(() => {
    if (taxMode === "percent") return Math.round(subtotal * (taxPercent / 100));
    return taxFixedCents;
  }, [taxMode, taxPercent, taxFixedCents, subtotal]);
  const total = subtotal + taxAmount;

  // Modals
  const [showSend, setShowSend] = useState(false);
  const [showMarkPaid, setShowMarkPaid] = useState(false);

  // Register the editor with the AI Copilot.
  useCopilotForm({
    formLabel: "Invoice editor",
    fields: [
      { key: "customer_name", label: "Customer name", required: true },
      { key: "customer_email", label: "Customer email", required: false },
      { key: "customer_phone", label: "Customer phone", required: false },
      { key: "notes", label: "Notes", required: false },
    ],
    values: { customer_name: customerName, customer_email: customerEmail, customer_phone: customerPhone, notes },
    onApply: (fills) => {
      for (const f of fills) {
        if (f.field_key === "customer_name") setCustomerName(f.value);
        else if (f.field_key === "customer_email") setCustomerEmail(f.value);
        else if (f.field_key === "customer_phone") setCustomerPhone(f.value);
        else if (f.field_key === "notes") setNotes(f.value);
      }
    },
    enabled: true,
  });

  /* ─── Mutations ─── */
  const save = useMutation({
    mutationFn: async () => {
      const payload: Record<string, any> = {
        customer_name: customerName.trim(),
        customer_email: customerEmail.trim() || undefined,
        customer_phone: customerPhone.trim() || undefined,
        invoice_number: invoiceNumber.trim() || undefined,
        line_items: lineItems
          .filter((li) => li.description.trim().length > 0 || li.unit_price_cents > 0)
          .map((li) => ({
            description: li.description.trim(),
            quantity: Math.max(1, Number(li.quantity) || 1),
            unit_price_cents: Math.max(0, Number(li.unit_price_cents) || 0),
          })),
        tax_cents: taxAmount,
        notes: notes.trim() || undefined,
        currency,
        template_slug: templateSlug,
        contact_id: linkedContact?.id ?? null,
        issue_date: issueDate || undefined,
        due_date: dueDate || undefined,
        metadata: { ...(inv.metadata || {}), accent_color: accentColor },
      };
      const res = await fetch(`/api/portal/bookflow/invoices/${invoiceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to save");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Saved" });
      onChanged();
    },
    onError: (err: any) => {
      toast({ title: "Couldn't save", description: err.message, variant: "destructive" });
    },
  });

  const del = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/portal/bookflow/invoices/${invoiceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status: "cancelled" }),
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Invoice cancelled" });
      queryClient.invalidateQueries({ queryKey: ["/api/portal/bookflow/invoices"] });
      navigate("/portal/invoices");
    },
  });

  function copyPayLink() {
    const url = `${window.location.origin}/pay/${inv.pay_link_token}`;
    navigator.clipboard.writeText(url);
    toast({ title: "Pay link copied" });
  }

  /* ─── Preview data (always recompiled from local state) ─── */
  const previewData: InvoicePreviewData = {
    invoice_number: invoiceNumber || "INV-000",
    status: inv.status,
    issue_date: issueDate || null,
    due_date: dueDate || null,
    currency,
    line_items: lineItems,
    subtotal_cents: subtotal,
    tax_cents: taxAmount,
    total_cents: total,
    notes: notes || null,
    customer_name: customerName || "Customer",
    customer_email: customerEmail || null,
    customer_phone: customerPhone || null,
    billing_street: billingStreet || null,
    billing_city: billingCity || null,
    billing_region: billingRegion || null,
    billing_postal: billingPostal || null,
    billing_country: billingCountry || null,
    business_name: data.client.business_name,
    business_email: data.client.contact_email,
    business_phone: data.client.contact_phone,
    business_website: data.client.website_url,
    logo_url: data.client.logo_url,
    accent_color: accentColor,
  };

  const badge = statusBadge(inv.status);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 20, alignItems: "start" }} className="invoice-detail-grid">
      <style>{`
        @media (max-width: 1024px) {
          .invoice-detail-grid { grid-template-columns: minmax(0, 1fr) !important; }
        }
      `}</style>

      {/* ─── LEFT: Form ─── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Header card */}
        <Card>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <h2 style={{ fontSize: 18, fontWeight: 700, color: "#111", margin: 0 }}>{inv.invoice_number}</h2>
              <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: badge.text, background: badge.bg, padding: "2px 10px", borderRadius: 20 }}>{badge.label}</span>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={copyPayLink} style={ghostBtn}><Link2 size={14} /> Copy link</button>
              <button onClick={() => del.mutate()} style={{ ...ghostBtn, color: "#b91c1c" }} disabled={del.isPending}><Trash2 size={14} /> Cancel</button>
            </div>
          </div>
        </Card>

        {/* Customer card */}
        <Card title="Customer" help="Link a saved contact to auto-fill name + address">
          <ContactPicker
            current={linkedContact}
            onPick={(c) => {
              setLinkedContact(c);
              setCustomerName(c.display_name);
              if (c.email) setCustomerEmail(c.email);
              if (c.phone_e164) setCustomerPhone(c.phone_e164);
              setBillingStreet(c.billing_street || "");
              setBillingCity(c.billing_city || "");
              setBillingRegion(c.billing_region || "");
              setBillingPostal(c.billing_postal || "");
              setBillingCountry(c.billing_country || "US");
            }}
            onUnlink={() => setLinkedContact(null)}
          />
          <Field label="Customer name *" value={customerName} onChange={setCustomerName} placeholder="John Smith" />
          <Row>
            <Field label="Email" value={customerEmail} onChange={setCustomerEmail} type="email" placeholder="john@example.com" />
            <Field label="Phone" value={customerPhone} onChange={setCustomerPhone} placeholder="(555) 123-4567" />
          </Row>
          <Field label="Billing street" value={billingStreet} onChange={setBillingStreet} placeholder="123 Main St" />
          <Row>
            <Field label="City" value={billingCity} onChange={setBillingCity} />
            <Field label="Region" value={billingRegion} onChange={setBillingRegion} placeholder="State / Province" />
          </Row>
          <Row>
            <Field label="Postal" value={billingPostal} onChange={setBillingPostal} />
            <Field label="Country" value={billingCountry} onChange={setBillingCountry} />
          </Row>
        </Card>

        {/* Line items */}
        <Card title="Line items" help="Click any cell to edit; Add row to extend">
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {lineItems.map((li, idx) => (
              <div key={li._uid} style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 70px 90px 90px 28px", gap: 6, alignItems: "center" }}>
                <input
                  value={li.description}
                  onChange={(e) => {
                    const next = [...lineItems];
                    next[idx] = { ...next[idx], description: e.target.value };
                    setLineItems(next);
                  }}
                  placeholder="Service or item"
                  style={inputStyle}
                  aria-label={`Line ${idx + 1} description`}
                />
                <input
                  type="number"
                  min={1}
                  value={li.quantity}
                  onChange={(e) => {
                    const next = [...lineItems];
                    next[idx] = { ...next[idx], quantity: Math.max(1, parseInt(e.target.value) || 1) };
                    setLineItems(next);
                  }}
                  style={{ ...inputStyle, textAlign: "center" }}
                  aria-label={`Line ${idx + 1} quantity`}
                />
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={li.unit_price_cents ? (li.unit_price_cents / 100).toFixed(2) : ""}
                  onChange={(e) => {
                    const next = [...lineItems];
                    next[idx] = { ...next[idx], unit_price_cents: Math.round((parseFloat(e.target.value) || 0) * 100) };
                    setLineItems(next);
                  }}
                  placeholder="0.00"
                  style={{ ...inputStyle, textAlign: "right" }}
                  aria-label={`Line ${idx + 1} unit price`}
                />
                <div style={{ fontSize: 13, color: "#111", textAlign: "right", padding: "0 8px" }}>
                  {previewFormatMoney(li.quantity * li.unit_price_cents, currency)}
                </div>
                <button
                  onClick={() => {
                    if (lineItems.length <= 1) return;
                    setLineItems(lineItems.filter((_, i) => i !== idx));
                  }}
                  disabled={lineItems.length <= 1}
                  style={{ background: "none", border: "none", cursor: lineItems.length <= 1 ? "not-allowed" : "pointer", color: "#9ca3af", padding: 4 }}
                  aria-label={`Remove line ${idx + 1}`}
                >
                  <X size={14} />
                </button>
              </div>
            ))}
            <button
              onClick={() => setLineItems([...lineItems, { _uid: newLineItemUid(), description: "", quantity: 1, unit_price_cents: 0 }])}
              className="text-brand-blue hover:underline"
              style={{ alignSelf: "flex-start", background: "none", border: "none", cursor: "pointer", fontSize: 13, padding: "4px 0", display: "inline-flex", alignItems: "center", gap: 4 }}
            >
              <Plus size={14} /> Add row
            </button>
          </div>
        </Card>

        {/* Totals + tax */}
        <Card title="Totals" help="Tax is invoice-level: percent or fixed amount">
          <Row>
            <div>
              <label style={labelStyle}>Tax mode</label>
              <select value={taxMode} onChange={(e) => setTaxMode(e.target.value as any)} style={inputStyle} aria-label="Tax mode">
                <option value="fixed">Fixed amount</option>
                <option value="percent">Percent of subtotal</option>
              </select>
            </div>
            {taxMode === "percent" ? (
              <Field label="Tax %" type="number" value={String(taxPercent)} onChange={(v) => setTaxPercent(Math.max(0, parseFloat(v) || 0))} />
            ) : (
              <Field label="Tax (dollars)" type="number" value={taxFixedCents ? (taxFixedCents / 100).toFixed(2) : ""} onChange={(v) => setTaxFixedCents(Math.round((parseFloat(v) || 0) * 100))} />
            )}
          </Row>
          <div style={{ marginTop: 8, padding: "12px 0 0", borderTop: "1px solid #e5e7eb", display: "flex", flexDirection: "column", gap: 4 }}>
            <Totals label="Subtotal" value={previewFormatMoney(subtotal, currency)} />
            {taxAmount > 0 && <Totals label={`Tax${taxMode === "percent" ? ` (${taxPercent}%)` : ""}`} value={previewFormatMoney(taxAmount, currency)} />}
            <Totals label="Total" value={previewFormatMoney(total, currency)} bold accent={accentColor} />
          </div>
        </Card>

        {/* Meta */}
        <Card title="Invoice details">
          <Row>
            <Field label="Invoice number" value={invoiceNumber} onChange={setInvoiceNumber} />
            <div>
              <label style={labelStyle}>Currency (display only)</label>
              <select value={currency} onChange={(e) => setCurrency(e.target.value as Currency)} style={inputStyle} aria-label="Currency">
                {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </Row>
          <Row>
            <Field label="Issue date" type="date" value={issueDate} onChange={setIssueDate} icon={<Calendar size={12} />} />
            <Field label="Due date" type="date" value={dueDate} onChange={setDueDate} icon={<Calendar size={12} />} />
          </Row>
          <div>
            <label style={labelStyle}>Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              style={{ ...inputStyle, height: "auto", padding: "10px 12px", resize: "vertical" }}
              placeholder="Thank you for your business!"
              aria-label="Notes"
            />
          </div>
        </Card>

        {/* Actions */}
        <div className="invoice-actions" style={{ display: "flex", gap: 8, flexWrap: "wrap", position: "sticky", bottom: 0, background: "#F6F7F9", padding: "12px 0" }}>
          <button onClick={() => save.mutate()} disabled={save.isPending} className="btn-primary-premium bg-brand-blue text-white" style={primaryBtn}>
            {save.isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save
          </button>
          <button onClick={() => setShowSend(true)} className="btn-primary-premium bg-brand-blue text-white" style={primaryBtn}>
            <Send size={14} /> Send invoice
          </button>
          <button onClick={() => setShowMarkPaid(true)} style={{ ...ghostBtn, background: "#f0fdf4", borderColor: "#bbf7d0", color: "#16a34a" }}>
            <DollarSign size={14} /> Mark paid
          </button>
          <a
            href={`/pay/${inv.pay_link_token}`}
            target="_blank"
            rel="noopener noreferrer"
            style={ghostBtn}
          >
            <FileDown size={14} /> Open pay page
          </a>
        </div>
      </div>

      {/* ─── RIGHT: Template picker + live preview ─── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 16, position: "sticky", top: 16, alignSelf: "start" }}>
        <Card title="Template" help="Pick a layout; preview updates live">
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {TEMPLATE_OPTIONS.map((t) => {
              const selected = templateSlug === t.slug;
              return (
                <button
                  key={t.slug}
                  onClick={() => setTemplateSlug(t.slug)}
                  type="button"
                  style={{
                    textAlign: "left",
                    padding: "10px 12px",
                    borderRadius: 8,
                    background: "var(--field-bg-light)",
                    border: selected ? `2px solid ${accentColor}` : "1px solid #e5e7eb",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                  }}
                  aria-pressed={selected}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#111" }}>{t.label}</div>
                    <div style={{ fontSize: 11, color: "#6b7280" }}>{t.description}</div>
                  </div>
                  {selected && <Check size={14} style={{ color: accentColor, flexShrink: 0 }} />}
                </button>
              );
            })}
          </div>
          <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 10 }}>
            <label style={{ ...labelStyle, marginBottom: 0 }}>Accent color</label>
            <input type="color" value={accentColor} onChange={(e) => setAccentColor(e.target.value)} style={{ width: 36, height: 24, border: "1px solid #e5e7eb", borderRadius: 4, cursor: "pointer" }} aria-label="Accent color" />
            <span style={{ fontSize: 11, color: "#6b7280", fontFamily: "monospace" }}>{accentColor}</span>
          </div>
        </Card>

        <div style={{ maxHeight: "calc(100vh - 200px)", overflowY: "auto", borderRadius: 12, boxShadow: "0 1px 3px rgba(0,0,0,0.08), 0 4px 12px rgba(0,0,0,0.04)" }}>
          {templateSlug === "classic-minimal" && <ClassicMinimalPreview data={previewData} />}
          {templateSlug === "modern-bold" && <ModernBoldPreview data={previewData} />}
          {templateSlug === "trade-service" && <TradeServicePreview data={previewData} />}
        </div>
      </div>

      {/* Send modal */}
      {showSend && (
        <SendInvoiceModal
          defaultTo={customerEmail}
          defaultSubject={`Invoice ${invoiceNumber} from ${data.client.business_name}`}
          defaultBody={`Hi ${customerName || "there"}, please find your invoice attached. You can pay online using the secure link below.`}
          onClose={() => setShowSend(false)}
          onSend={async (payload) => {
            // Save first so the email reflects on-screen state.
            await save.mutateAsync();
            const res = await fetch(`/api/portal/bookflow/invoices/${invoiceId}/send`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              credentials: "include",
              body: JSON.stringify(payload),
            });
            if (!res.ok) {
              const err = await res.json().catch(() => ({}));
              throw new Error(err.error || "Failed to send");
            }
            toast({ title: "Invoice sent" });
            onChanged();
            setShowSend(false);
          }}
        />
      )}

      {/* Mark-paid modal */}
      {showMarkPaid && (
        <MarkPaidModal
          onClose={() => setShowMarkPaid(false)}
          onMark={async (payload) => {
            const res = await fetch(`/api/portal/bookflow/invoices/${invoiceId}/mark-paid`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              credentials: "include",
              body: JSON.stringify(payload),
            });
            if (!res.ok) {
              const err = await res.json().catch(() => ({}));
              throw new Error(err.error || "Failed");
            }
            toast({ title: "Marked paid" });
            onChanged();
            setShowMarkPaid(false);
          }}
        />
      )}
    </div>
  );
}

/* ─── Subcomponents ─── */

function Card({ title, help, children }: { title?: string; help?: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "var(--popover-bg-light)", border: "1px solid #e5e7eb", borderRadius: 12, padding: 16, boxShadow: "0 1px 2px rgba(0,0,0,0.04)" }}>
      {title && (
        <div style={{ marginBottom: 12 }}>
          {help && <div style={{ fontSize: 10, fontWeight: 700, color: "#9ca3af", letterSpacing: "0.05em", marginBottom: 2, textTransform: "uppercase" }}>{help}</div>}
          <h3 style={{ fontSize: 14, fontWeight: 600, color: "#111", margin: 0 }}>{title}</h3>
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>{children}</div>
    </div>
  );
}

function Field({
  label, value, onChange, type = "text", placeholder, icon,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div style={{ minWidth: 0 }}>
      <label style={labelStyle}>{icon}{icon && " "}{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={inputStyle}
        aria-label={label}
      />
    </div>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>{children}</div>;
}

function Totals({ label, value, bold, accent }: { label: string; value: string; bold?: boolean; accent?: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: bold ? 15 : 13, fontWeight: bold ? 700 : 400, color: bold ? (accent || "#111") : "#374151", padding: "4px 0", marginTop: bold ? 6 : 0, borderTop: bold ? "1px solid #e5e7eb" : "none" }}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

function ContactPicker({
  current,
  onPick,
  onUnlink,
}: {
  current: ContactSearchResult | null;
  onPick: (c: ContactSearchResult) => void;
  onUnlink: () => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const { data: results = [] } = useQuery<ContactSearchResult[]>({
    queryKey: ["/api/portal/contacts/search", query],
    queryFn: async () => {
      if (!query.trim()) return [];
      const res = await fetch(`/api/portal/contacts/search?q=${encodeURIComponent(query)}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: open && query.trim().length > 0,
  });

  if (current) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "8px 12px", background: "#eef3ff", borderRadius: 8, border: "1px solid #c7d8ff" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <User size={14} className="text-brand-blue" />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#111", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{current.display_name}</div>
            <div style={{ fontSize: 11, color: "#475569" }}>{current.email || current.phone_e164}</div>
          </div>
        </div>
        <button onClick={onUnlink} style={{ background: "none", border: "none", cursor: "pointer", color: "#6b7280", fontSize: 12, textDecoration: "underline" }}>Unlink</button>
      </div>
    );
  }

  return (
    <div style={{ position: "relative" }}>
      <input
        type="text"
        value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder="Search saved contacts…"
        style={inputStyle}
        aria-label="Search contacts"
      />
      {open && results.length > 0 && (
        <div style={{ position: "absolute", top: "100%", left: 0, right: 0, marginTop: 4, background: "var(--popover-bg-light)", border: "1px solid #e5e7eb", borderRadius: 8, boxShadow: "0 4px 14px rgba(0,0,0,0.08)", zIndex: 10, maxHeight: 220, overflowY: "auto" }}>
          {results.map((r) => (
            <button
              key={r.id}
              onClick={() => { onPick(r); setOpen(false); setQuery(""); }}
              type="button"
              style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 12px", background: "none", border: "none", cursor: "pointer", borderBottom: "1px solid #f3f4f6" }}
            >
              <div style={{ fontSize: 13, fontWeight: 500, color: "#111" }}>{r.display_name}</div>
              <div style={{ fontSize: 11, color: "#6b7280" }}>{r.email || r.phone_e164}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function SendInvoiceModal({
  defaultTo, defaultSubject, defaultBody, onClose, onSend,
}: {
  defaultTo: string;
  defaultSubject: string;
  defaultBody: string;
  onClose: () => void;
  onSend: (p: { to_email?: string; subject?: string; body?: string }) => Promise<void>;
}) {
  const [to, setTo] = useState(defaultTo);
  const [subject, setSubject] = useState(defaultSubject);
  const [body, setBody] = useState(defaultBody);
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState("");

  async function handleSend() {
    setSending(true);
    setErr("");
    try {
      await onSend({ to_email: to.trim() || undefined, subject: subject.trim() || undefined, body: body.trim() || undefined });
    } catch (e: any) {
      setErr(e.message || "Failed");
      setSending(false);
    }
  }

  return (
    <Modal title="Send invoice" onClose={onClose}>
      <Field label="To" value={to} onChange={setTo} type="email" />
      <Field label="Subject" value={subject} onChange={setSubject} />
      <div>
        <label style={labelStyle}>Message</label>
        <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={5} style={{ ...inputStyle, height: "auto", padding: 10, resize: "vertical" }} aria-label="Email body" />
      </div>
      <p style={{ fontSize: 11, color: "#6b7280", margin: "4px 0 0" }}>A PDF copy will be attached automatically.</p>
      {err && <p style={{ fontSize: 12, color: "#dc2626", margin: "8px 0 0" }}>{err}</p>}
      <div style={{ display: "flex", gap: 8, marginTop: 12, justifyContent: "flex-end" }}>
        <button onClick={onClose} style={ghostBtn}>Cancel</button>
        <button onClick={handleSend} disabled={sending || !to.trim()} className="btn-primary-premium bg-brand-blue text-white" style={primaryBtn}>
          {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Send
        </button>
      </div>
    </Modal>
  );
}

function MarkPaidModal({
  onClose, onMark,
}: {
  onClose: () => void;
  onMark: (p: { payment_method: string; paid_at?: string; reference?: string; notes?: string }) => Promise<void>;
}) {
  const [method, setMethod] = useState<"cash" | "check" | "etransfer" | "other">("cash");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [ref, setRef] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function handle() {
    setBusy(true);
    setErr("");
    try {
      await onMark({ payment_method: method, paid_at: date, reference: ref || undefined, notes: note || undefined });
    } catch (e: any) {
      setErr(e.message || "Failed");
      setBusy(false);
    }
  }

  return (
    <Modal title="Record payment" onClose={onClose}>
      <div>
        <label style={labelStyle}>Method</label>
        <select value={method} onChange={(e) => setMethod(e.target.value as any)} style={inputStyle}>
          <option value="cash">Cash</option>
          <option value="check">Check</option>
          <option value="etransfer">E-transfer</option>
          <option value="other">Other</option>
        </select>
      </div>
      <Field label="Payment date" value={date} onChange={setDate} type="date" />
      <Field label="Reference (check #, etc.)" value={ref} onChange={setRef} />
      <div>
        <label style={labelStyle}>Notes</label>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} style={{ ...inputStyle, height: "auto", padding: 10, resize: "vertical" }} aria-label="Payment notes" />
      </div>
      {err && <p style={{ fontSize: 12, color: "#dc2626", margin: "4px 0 0" }}>{err}</p>}
      <div style={{ display: "flex", gap: 8, marginTop: 12, justifyContent: "flex-end" }}>
        <button onClick={onClose} style={ghostBtn}>Cancel</button>
        <button onClick={handle} disabled={busy} className="btn-primary-premium bg-brand-blue text-white" style={primaryBtn}>
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Mark paid
        </button>
      </div>
    </Modal>
  );
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  // Trap Escape — small a11y win.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div data-theme="light" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "var(--popover-bg-light)", borderRadius: 14, padding: 20, maxWidth: 480, width: "100%", maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: "#111", margin: 0 }}>{title}</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#6b7280" }} aria-label="Close">
            <X size={20} />
          </button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>{children}</div>
      </div>
    </div>
  );
}

/* ─── Styles ─── */

const inputStyle: React.CSSProperties = {
  width: "100%",
  height: 36,
  borderRadius: 8,
  border: "1px solid #e5e7eb",
  padding: "0 12px",
  fontSize: 13,
  color: "#111",
  background: "var(--field-bg-light)",
  outline: "none",
  boxSizing: "border-box",
};

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: "#475569",
  marginBottom: 4,
  display: "block",
  letterSpacing: "0.02em",
};

const ghostBtn: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  fontSize: 13,
  fontWeight: 500,
  color: "#374151",
  background: "var(--field-bg-light)",
  border: "1px solid #e5e7eb",
  borderRadius: 8,
  padding: "7px 12px",
  cursor: "pointer",
  textDecoration: "none",
};

const primaryBtn: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  fontSize: 13,
  fontWeight: 600,
  border: "none",
  borderRadius: 8,
  padding: "9px 14px",
  cursor: "pointer",
};
