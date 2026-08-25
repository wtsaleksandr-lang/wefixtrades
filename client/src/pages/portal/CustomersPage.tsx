/**
 * Portal CRM — Customers page (/portal/customers)
 *
 * The client-facing customer database. Hidden under the account menu (not a
 * primary sidebar item) to avoid overcluttering the portal — a trades
 * business that runs its whole operation on WeFixTrades keeps its real
 * customer records here.
 *
 * Searchable list → detail (contact info, editable notes, booking + invoice
 * history). Reuses the sibling BookFlow pages' patterns (PortalLayout,
 * data-theme="light" surface, the _shared title-in-field inputs).
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Users, Plus, Search, X, Mail, Phone, MapPin, Trash2, Save, Calendar, Receipt,
} from "lucide-react";
import PortalLayout from "@/components/portal/PortalLayout";
import { usePageTitle } from "@/hooks/usePageTitle";
import { useToast } from "@/hooks/use-toast";
import { TitleInField, TitleInFieldTextarea } from "./FreeTools/_shared";

interface Customer {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
  tags: string[] | null;
  created_at: string;
  updated_at: string;
}

interface CustomerAppointment {
  id: number;
  service_name: string | null;
  start_time: string;
  end_time: string;
  status: string;
  notes: string | null;
}

interface CustomerInvoice {
  id: number;
  invoice_number: string | null;
  total_cents: number;
  currency: string | null;
  status: string;
  due_date: string | null;
  paid_at: string | null;
  created_at: string;
}

interface CustomerDetail {
  customer: Customer;
  appointments: CustomerAppointment[];
  invoices: CustomerInvoice[];
}

function formatCents(cents: number, currency: string | null): string {
  const symbol = currency === "EUR" ? "€" : currency === "GBP" ? "£" : "$";
  return `${symbol}${(cents / 100).toFixed(2)}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/** Status → theme-palette badge classes (never white/black; theme-aware). */
function statusBadgeClass(status: string): string {
  switch (status) {
    case "paid":
    case "completed":
      return "bg-emerald-50 text-emerald-700";
    case "cancelled":
    case "no_show":
      return "bg-red-50 text-red-700";
    case "pending":
    case "overdue":
      return "bg-amber-50 text-amber-700";
    default:
      return "bg-blue-50 text-blue-700";
  }
}

const EMPTY_FORM = { name: "", email: "", phone: "", address: "", notes: "" };

export default function CustomersPage() {
  usePageTitle("Customers");
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [notesDraft, setNotesDraft] = useState<string | null>(null);

  /* ─── List ─── */
  const { data: customers = [], isLoading } = useQuery<Customer[]>({
    queryKey: ["/api/portal/customers", search],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search.trim()) params.set("q", search.trim());
      const res = await fetch(`/api/portal/customers?${params.toString()}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load customers");
      return res.json();
    },
  });

  /* ─── Detail ─── */
  const { data: detail, isLoading: detailLoading } = useQuery<CustomerDetail>({
    queryKey: ["/api/portal/customers", selectedId],
    enabled: selectedId != null,
    queryFn: async () => {
      const res = await fetch(`/api/portal/customers/${selectedId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load customer");
      return res.json();
    },
  });

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/portal/customers"] });
  };

  /* ─── Mutations ─── */
  const createCustomer = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/portal/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error("Failed to create customer");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Customer added" });
      setShowForm(false);
      setForm(EMPTY_FORM);
      invalidateAll();
    },
    onError: () => toast({ title: "Could not add customer", variant: "destructive" }),
  });

  const saveNotes = useMutation({
    mutationFn: async (notes: string) => {
      const res = await fetch(`/api/portal/customers/${selectedId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ notes }),
      });
      if (!res.ok) throw new Error("Failed to save notes");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Notes saved" });
      setNotesDraft(null);
      invalidateAll();
    },
    onError: () => toast({ title: "Could not save notes", variant: "destructive" }),
  });

  const deleteCustomer = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/portal/customers/${id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error("Failed to delete customer");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Customer deleted" });
      setSelectedId(null);
      invalidateAll();
    },
    onError: () => toast({ title: "Could not delete customer", variant: "destructive" }),
  });

  const canSubmit = form.name.trim().length > 0 && !createCustomer.isPending;

  return (
    <PortalLayout breadcrumb="Customers">
      <div data-theme="light" className="space-y-4">
        {/* Header — left-aligned title + add button */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <Users className="w-5 h-5 text-brand-blue" aria-hidden="true" />
              Customers
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Your customer database — contact details, notes, and job history in one place.
            </p>
          </div>
          <button
            type="button"
            onClick={() => { setShowForm(true); setForm(EMPTY_FORM); }}
            className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border border-gray-200 text-gray-700 bg-white hover:border-brand-blue/40 hover:text-brand-blue transition-colors"
            data-testid="customers-add-btn"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            <span className="hidden sm:inline">Add customer</span>
          </button>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden="true" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, email, or phone"
            aria-label="Search customers"
            className="w-full pl-9 pr-3 py-2.5 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-blue/20 focus:border-brand-blue transition-colors"
            data-testid="customers-search"
          />
        </div>

        {/* List */}
        {isLoading ? (
          <p className="text-sm text-gray-400 py-8 text-center">Loading customers…</p>
        ) : customers.length === 0 ? (
          <div className="text-center py-12 border border-dashed border-gray-200 rounded-xl bg-gray-50">
            <Users className="w-6 h-6 text-gray-300 mx-auto mb-2" aria-hidden="true" />
            <p className="text-sm font-medium text-gray-700">
              {search.trim() ? "No customers match your search." : "No customers yet."}
            </p>
            <p className="text-xs text-gray-400 mt-1">
              {search.trim() ? "Try a different name, email, or phone." : "Add your first customer to start building your database."}
            </p>
          </div>
        ) : (
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2.5" data-testid="customers-list">
            {customers.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => { setSelectedId(c.id); setNotesDraft(null); }}
                  className="w-full text-left p-3.5 rounded-xl border border-gray-200 bg-white hover:border-brand-blue/40 hover:shadow-sm transition-all"
                  data-testid={`customer-card-${c.id}`}
                >
                  <p className="text-sm font-semibold text-gray-900 truncate">{c.name}</p>
                  <div className="mt-1 space-y-0.5">
                    {c.email && (
                      <p className="text-xs text-gray-500 flex items-center gap-1.5 truncate">
                        <Mail className="w-3.5 h-3.5 shrink-0" aria-hidden="true" /> {c.email}
                      </p>
                    )}
                    {c.phone && (
                      <p className="text-xs text-gray-500 flex items-center gap-1.5 truncate">
                        <Phone className="w-3.5 h-3.5 shrink-0" aria-hidden="true" /> {c.phone}
                      </p>
                    )}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ─── Add-customer modal ─── */}
      {showForm && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-gray-900/40 p-0 sm:p-4"
          onClick={() => setShowForm(false)}
          data-theme="light"
        >
          <div
            className="w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label="Add customer"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-gray-900">Add customer</h2>
              <button type="button" onClick={() => setShowForm(false)} aria-label="Close" className="p-1 text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" aria-hidden="true" />
              </button>
            </div>
            <div className="p-4 space-y-0.5">
              <TitleInField id="cust-name" label="Name" required value={form.name} maxLength={200}
                onChange={(v) => setForm((f) => ({ ...f, name: v }))} testid="customer-form-name" />
              <TitleInField id="cust-email" label="Email" type="email" value={form.email} maxLength={200}
                onChange={(v) => setForm((f) => ({ ...f, email: v }))} testid="customer-form-email" />
              <TitleInField id="cust-phone" label="Phone" value={form.phone} maxLength={40}
                onChange={(v) => setForm((f) => ({ ...f, phone: v }))} testid="customer-form-phone" />
              <TitleInField id="cust-address" label="Address" value={form.address} maxLength={500}
                onChange={(v) => setForm((f) => ({ ...f, address: v }))} testid="customer-form-address" />
              <TitleInFieldTextarea id="cust-notes" label="Notes" value={form.notes} rows={3}
                onChange={(v) => setForm((f) => ({ ...f, notes: v }))} testid="customer-form-notes" />
            </div>
            <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-gray-100">
              <button type="button" onClick={() => setShowForm(false)}
                className="px-3 py-2 text-sm font-medium text-gray-600 hover:text-gray-900">
                Cancel
              </button>
              <button type="button" disabled={!canSubmit} onClick={() => createCustomer.mutate()}
                className="btn-primary-premium inline-flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg disabled:opacity-50"
                data-testid="customer-form-submit">
                <Plus className="w-4 h-4" aria-hidden="true" />
                {createCustomer.isPending ? "Adding…" : "Add customer"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Detail drawer ─── */}
      {selectedId != null && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-gray-900/40"
          onClick={() => setSelectedId(null)}
          data-theme="light"
        >
          <div
            className="w-full sm:max-w-md bg-white h-full overflow-y-auto shadow-xl"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label="Customer detail"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 sticky top-0 bg-white z-10">
              <h2 className="text-sm font-semibold text-gray-900 truncate">
                {detail?.customer.name || "Customer"}
              </h2>
              <button type="button" onClick={() => setSelectedId(null)} aria-label="Close" className="p-1 text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" aria-hidden="true" />
              </button>
            </div>

            {detailLoading || !detail ? (
              <p className="text-sm text-gray-400 py-8 text-center">Loading…</p>
            ) : (
              <div className="p-4 space-y-5">
                {/* Contact info */}
                <div className="space-y-1.5">
                  {detail.customer.email && (
                    <a href={`mailto:${detail.customer.email}`} className="text-sm text-gray-700 flex items-center gap-2 hover:text-brand-blue">
                      <Mail className="w-4 h-4 text-gray-400 shrink-0" aria-hidden="true" /> {detail.customer.email}
                    </a>
                  )}
                  {detail.customer.phone && (
                    <a href={`tel:${detail.customer.phone}`} className="text-sm text-gray-700 flex items-center gap-2 hover:text-brand-blue">
                      <Phone className="w-4 h-4 text-gray-400 shrink-0" aria-hidden="true" /> {detail.customer.phone}
                    </a>
                  )}
                  {detail.customer.address && (
                    <p className="text-sm text-gray-700 flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-gray-400 shrink-0" aria-hidden="true" /> {detail.customer.address}
                    </p>
                  )}
                </div>

                {/* Editable notes */}
                <div>
                  <TitleInFieldTextarea
                    id="detail-notes"
                    label="Notes"
                    rows={4}
                    value={notesDraft ?? detail.customer.notes ?? ""}
                    onChange={(v) => setNotesDraft(v)}
                    testid="customer-detail-notes"
                  />
                  {notesDraft != null && notesDraft !== (detail.customer.notes ?? "") && (
                    <div className="flex justify-end mt-1.5">
                      <button type="button" onClick={() => saveNotes.mutate(notesDraft)} disabled={saveNotes.isPending}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-brand-blue hover:bg-blue-50 rounded-lg disabled:opacity-50"
                        data-testid="customer-notes-save">
                        <Save className="w-3.5 h-3.5" aria-hidden="true" />
                        {saveNotes.isPending ? "Saving…" : "Save notes"}
                      </button>
                    </div>
                  )}
                </div>

                {/* Booking history */}
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2 flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5" aria-hidden="true" /> Bookings ({detail.appointments.length})
                  </h3>
                  {detail.appointments.length === 0 ? (
                    <p className="text-xs text-gray-400">No bookings linked yet.</p>
                  ) : (
                    <ul className="space-y-1.5">
                      {detail.appointments.map((a) => (
                        <li key={a.id} className="flex items-center justify-between gap-2 p-2.5 rounded-lg border border-gray-100 bg-gray-50">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">{a.service_name || "Appointment"}</p>
                            <p className="text-xs text-gray-500">{formatDate(a.start_time)}</p>
                          </div>
                          <span className={`text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded shrink-0 ${statusBadgeClass(a.status)}`}>
                            {a.status}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {/* Invoice history */}
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2 flex items-center gap-1.5">
                    <Receipt className="w-3.5 h-3.5" aria-hidden="true" /> Invoices ({detail.invoices.length})
                  </h3>
                  {detail.invoices.length === 0 ? (
                    <p className="text-xs text-gray-400">No invoices linked yet.</p>
                  ) : (
                    <ul className="space-y-1.5">
                      {detail.invoices.map((inv) => (
                        <li key={inv.id} className="flex items-center justify-between gap-2 p-2.5 rounded-lg border border-gray-100 bg-gray-50">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">{inv.invoice_number || `Invoice #${inv.id}`}</p>
                            <p className="text-xs text-gray-500">{formatDate(inv.created_at)}</p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-sm font-semibold text-gray-900">{formatCents(inv.total_cents, inv.currency)}</span>
                            <span className={`text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded ${statusBadgeClass(inv.status)}`}>
                              {inv.status}
                            </span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {/* Danger zone */}
                <div className="pt-3 border-t border-gray-100">
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm("Delete this customer? Their booking and invoice history will be kept but unlinked.")) {
                        deleteCustomer.mutate(selectedId);
                      }
                    }}
                    disabled={deleteCustomer.isPending}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg disabled:opacity-50"
                    data-testid="customer-delete"
                  >
                    <Trash2 className="w-4 h-4" aria-hidden="true" />
                    {deleteCustomer.isPending ? "Deleting…" : "Delete customer"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </PortalLayout>
  );
}
