/**
 * Shared types for invoice React preview components. Mirrors the server-side
 * InvoicePdfData shape (server/lib/invoiceTemplates/base.ts) so the on-screen
 * preview and the emailed PDF stay in lockstep.
 */

export interface PreviewLineItem {
  description: string;
  quantity: number;
  unit_price_cents: number;
}

export interface InvoicePreviewData {
  invoice_number: string;
  status: string;
  issue_date: string | null;
  due_date: string | null;
  currency: string;
  line_items: PreviewLineItem[];
  subtotal_cents: number;
  tax_cents: number;
  total_cents: number;
  notes: string | null;

  customer_name: string;
  customer_email: string | null;
  customer_phone: string | null;
  billing_street: string | null;
  billing_city: string | null;
  billing_region: string | null;
  billing_postal: string | null;
  billing_country: string | null;

  business_name: string;
  business_email: string | null;
  business_phone: string | null;
  business_website: string | null;
  logo_url: string | null;

  accent_color: string;
}

export function currencySymbol(currency: string): string {
  switch (currency) {
    case "USD":
    case "CAD":
    case "AUD":
      return "$";
    case "EUR":
      return "€";
    case "GBP":
      return "£";
    default:
      return `${currency} `;
  }
}

export function formatMoney(cents: number, currency: string): string {
  return `${currencySymbol(currency)}${(cents / 100).toFixed(2)}`;
}

export function formatDate(d: string | null): string {
  if (!d) return "—";
  const date = new Date(d);
  if (isNaN(date.getTime())) return d;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function statusLabel(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
