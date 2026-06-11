/**
 * Payment Methods settings page — /portal/payment-methods
 *
 * Lets tradespeople configure which payment methods their customers
 * see on the public invoice pay page. Stripe Connect is toggled
 * elsewhere (requires Connect onboarding); this page manages the
 * non-Stripe options.
 */

import { useState, useEffect } from "react";
import { Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronLeft, Loader2 } from "lucide-react";
import PortalLayout from "@/components/portal/PortalLayout";
import { useCopilotForm } from "@/context/CopilotFormContext";
import { usePageTitle } from "@/hooks/usePageTitle";
import { FieldHelpCue, TitleInField, TitleInFieldTextarea } from "./FreeTools/_shared";

interface PaymentMethodsData {
  stripe?: boolean;
  paypal_email?: string;
  bank_details?: string;
  etransfer_email?: string;
  venmo_handle?: string;
  zelle_info?: string;
  cash_accepted?: boolean;
}

interface BookflowSettings {
  payment_methods?: PaymentMethodsData;
  [key: string]: unknown;
}

export default function PaymentMethodsPage() {
  usePageTitle("Payment Methods");
  const queryClient = useQueryClient();
  const [saved, setSaved] = useState(false);

  const { data: settings, isLoading } = useQuery<BookflowSettings>({
    queryKey: ["/api/portal/bookflow/settings"],
    queryFn: async () => {
      const res = await fetch("/api/portal/bookflow/settings", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load settings");
      return res.json();
    },
  });

  const [form, setForm] = useState<PaymentMethodsData>({
    stripe: true,
    paypal_email: "",
    bank_details: "",
    etransfer_email: "",
    venmo_handle: "",
    zelle_info: "",
    cash_accepted: false,
  });

  useEffect(() => {
    if (settings?.payment_methods) {
      const pm = settings.payment_methods;
      setForm({
        stripe: pm.stripe ?? true,
        paypal_email: pm.paypal_email || "",
        bank_details: pm.bank_details || "",
        etransfer_email: pm.etransfer_email || "",
        venmo_handle: pm.venmo_handle || "",
        zelle_info: pm.zelle_info || "",
        cash_accepted: pm.cash_accepted ?? false,
      });
    }
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: async (data: PaymentMethodsData) => {
      // Strip empty strings to keep the DB clean
      const cleaned: Record<string, unknown> = {};
      if (data.stripe !== undefined) cleaned.stripe = data.stripe;
      if (data.paypal_email?.trim()) cleaned.paypal_email = data.paypal_email.trim();
      if (data.bank_details?.trim()) cleaned.bank_details = data.bank_details.trim();
      if (data.etransfer_email?.trim()) cleaned.etransfer_email = data.etransfer_email.trim();
      if (data.venmo_handle?.trim()) cleaned.venmo_handle = data.venmo_handle.trim();
      if (data.zelle_info?.trim()) cleaned.zelle_info = data.zelle_info.trim();
      if (data.cash_accepted) cleaned.cash_accepted = true;

      const res = await fetch("/api/portal/bookflow/payment-methods", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(cleaned),
      });
      if (!res.ok) throw new Error("Failed to save");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/portal/bookflow/settings"] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    },
  });

  // Q23c: chat→form pre-fill for payment-method fields. AI proposes; user confirms; we patch.
  // Booleans accept "true"/"false" strings since FORM_FILL values are always strings.
  useCopilotForm({
    formLabel: "Payment methods",
    fields: [
      { key: "stripe", label: "Stripe Connect enabled", required: false },
      { key: "paypal_email", label: "PayPal Email", required: false },
      { key: "bank_details", label: "Bank Details (description)", required: false },
      { key: "etransfer_email", label: "E-Transfer Email", required: false },
      { key: "venmo_handle", label: "Venmo Handle", required: false },
      { key: "zelle_info", label: "Zelle Info (phone/email)", required: false },
      { key: "cash_accepted", label: "Accept Cash", required: false },
    ],
    values: form as unknown as Record<string, unknown>,
    onApply: (fills) => {
      const boolKeys = new Set(["stripe", "cash_accepted"]);
      const allowed = new Set(["stripe", "paypal_email", "bank_details", "etransfer_email", "venmo_handle", "zelle_info", "cash_accepted"]);
      const patch: Partial<PaymentMethodsData> = {};
      for (const f of fills) {
        if (!allowed.has(f.field_key)) continue;
        if (boolKeys.has(f.field_key)) {
          (patch as any)[f.field_key] = /^(true|yes|y|1|on)$/i.test(f.value.trim());
        } else {
          (patch as any)[f.field_key] = f.value;
        }
      }
      if (Object.keys(patch).length > 0) {
        setForm((prev) => ({ ...prev, ...patch }));
      }
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    saveMutation.mutate(form);
  };

  return (
    <PortalLayout breadcrumb="Payment Methods">
      <div data-theme="light" className="max-w-2xl space-y-6">
        <div>
          <Link href="/portal/billing" className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-brand-blue transition-colors mb-2" data-testid="link-back-to-billing">
            <ChevronLeft className="w-3.5 h-3.5" />
            Back to Billing
          </Link>
          <h2 className="text-xl font-semibold text-foreground">Payment Methods</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Configure which payment options your customers see on invoice pages.
          </p>
        </div>

        {isLoading && (
          <div className="flex items-center justify-center h-48">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        )}

        {!isLoading && (
          <form onSubmit={handleSubmit}>
            {/* Online payments (Stripe) */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-gray-900">Online Payments (Stripe)</h2>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Cards, Apple Pay, Google Pay, bank transfer, Cash App, Klarna, Afterpay
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.stripe ?? true}
                    onChange={(e) => setForm({ ...form, stripe: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-gray-200 peer-focus:ring-2 peer-focus:ring-brand-blue/20 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-brand-blue"></div>
                </label>
              </div>
              <p className="text-[10px] text-gray-400 mt-2">
                Requires Stripe Connect to be set up. Stripe handles all card types, wallets, and buy-now-pay-later automatically.
              </p>
            </div>

            {/* Alternative methods — title-in-field per the locked input rules
                (labels float inside the fields, hints live in the top-left
                help cues, 2px stack gap). */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="text-sm font-semibold text-gray-900">Alternative Payment Methods</h2>
              <p className="text-xs text-gray-500 mt-0.5 mb-2">
                These appear as "More ways to pay" on your invoice pages. Leave blank to hide.
              </p>

              <div className="space-y-0.5">
                <TitleInField
                  id="pm-paypal-email"
                  label="PayPal Email"
                  type="email"
                  value={form.paypal_email || ""}
                  onChange={(v) => setForm({ ...form, paypal_email: v })}
                  placeholder="you@example.com"
                  help={'Customers see a "Pay with PayPal" button linking to your paypal.me.'}
                />
                <TitleInField
                  id="pm-etransfer-email"
                  label="E-Transfer / Interac Email"
                  type="email"
                  value={form.etransfer_email || ""}
                  onChange={(v) => setForm({ ...form, etransfer_email: v })}
                  placeholder="you@example.com"
                  help="Popular in Canada. Customers see this email plus the invoice reference to send an e-transfer."
                />
                <TitleInFieldTextarea
                  id="pm-bank-details"
                  label="Bank Transfer Details"
                  value={form.bank_details || ""}
                  onChange={(v) => setForm({ ...form, bank_details: v })}
                  rows={4}
                  help="Shown as-is on the invoice page — include bank name, account number, routing/transit."
                />
                <div className="relative pl-5">
                  <span className="absolute top-1 left-0">
                    <FieldHelpCue label="Venmo Handle" help="Your @handle without the @ — customers get a venmo.me link." />
                  </span>
                  <div className="flex items-stretch">
                    <span className="px-3 text-sm text-gray-500 bg-gray-50 border border-r-0 border-gray-200 rounded-l-lg flex items-center">@</span>
                    <TitleInField
                      id="pm-venmo-handle"
                      label="Venmo Handle"
                      className="flex-1 pl-0"
                      inputClassName="rounded-l-none"
                      value={(form.venmo_handle || "").replace(/^@/, "")}
                      onChange={(v) => setForm({ ...form, venmo_handle: v.replace(/^@/, "") })}
                      placeholder="yourhandle"
                    />
                  </div>
                </div>
                <TitleInField
                  id="pm-zelle-info"
                  label="Zelle Info"
                  value={form.zelle_info || ""}
                  onChange={(v) => setForm({ ...form, zelle_info: v })}
                  placeholder="Email or phone registered with Zelle"
                  help="The email or phone number your Zelle account is registered under."
                />
              </div>

              {/* Cash / Check */}
              <div className="flex items-center justify-between pt-2 mt-2 border-t border-gray-100">
                <div>
                  <p className="text-xs font-medium text-gray-600">Accept Cash / Check</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">
                    Shows "Pay in person" with the invoice number
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.cash_accepted ?? false}
                    onChange={(e) => setForm({ ...form, cash_accepted: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-gray-200 peer-focus:ring-2 peer-focus:ring-brand-blue/20 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-brand-blue"></div>
                </label>
              </div>
            </div>

            {/* Save */}
            <div className="flex items-center gap-3 pt-4">
              <button
                type="submit"
                disabled={saveMutation.isPending}
                className="px-5 py-2.5 text-sm font-medium text-white bg-brand-blue rounded-lg hover:bg-brand-blue-600 transition-colors disabled:opacity-60"
              >
                {saveMutation.isPending ? "Saving..." : "Save Payment Methods"}
              </button>
              {saved && (
                <span className="flex items-center gap-1 text-xs text-emerald-600">
                  <Check className="w-3.5 h-3.5" /> Saved
                </span>
              )}
              {saveMutation.error && (
                <span className="text-xs text-red-600">Failed to save. Try again.</span>
              )}
            </div>
          </form>
        )}
      </div>
    </PortalLayout>
  );
}
