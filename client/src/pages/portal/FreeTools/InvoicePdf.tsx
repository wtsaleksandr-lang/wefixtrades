import { useMemo, useState } from "react";
import { Link } from "wouter";
import { FileText, Plus, Trash2, Printer, RotateCcw } from "lucide-react";
import PortalLayout from "@/components/portal/PortalLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { usePageTitle } from "@/hooks/usePageTitle";
import {
  FieldGroupHeader,
  TitleInField,
  TitleInFieldTextarea,
  TitleInFieldSelect,
} from "./_shared";

/**
 * Invoice / Quote PDF generator — interactive Free Tool.
 *
 * Pure client-side, $0, NO new dependency. A tradesperson fills in their
 * business details, the customer, line items, tax + notes, and gets a clean,
 * professional invoice/quote document preview. "Print / Save PDF" calls the
 * browser's native window.print(); a scoped @media print block hides ALL the
 * editor chrome (nav, breadcrumb, config column, action buttons) and prints
 * ONLY the .inv-doc invoice on white paper. The user picks "Save as PDF" in
 * the browser dialog — a genuine PDF, no jsPDF, no html2canvas.
 *
 * Print scoping: every printable node lives inside `.inv-print-root`; the
 * @media print rule (injected once via <style>) sets `body * { visibility:
 * hidden }` then re-shows `.inv-print-root *` and pins it to the page top-left
 * at full width. This guarantees nothing but the document bleeds into the PDF
 * regardless of surrounding layout.
 *
 * Totals math (all NaN-guarded):
 *   lineTotal = qty * unitPrice
 *   subtotal  = Σ lineTotal
 *   tax       = subtotal * (taxRate / 100)
 *   total     = subtotal + tax
 *
 * DS compliance: title-in-field + top-left help cue + 2px input-cluster gaps +
 * single .btn-primary-premium per page (Print / Save PDF). The whole tree is
 * wrapped in data-theme="light" so the print document may legitimately use a
 * white paper / dark ink without tripping the hardcoded-color guard.
 * Icon sizes drawn from {12,14,16,20,24,32}.
 */

type DocType = "invoice" | "quote";

interface LineItem {
  id: string;
  description: string;
  qty: string;
  unitPrice: string;
}

const CURRENCIES = [
  { code: "USD", symbol: "$", label: "USD ($)" },
  { code: "CAD", symbol: "$", label: "CAD ($)" },
  { code: "GBP", symbol: "£", label: "GBP (£)" },
  { code: "EUR", symbol: "€", label: "EUR (€)" },
  { code: "AUD", symbol: "$", label: "AUD ($)" },
] as const;

/** Parse a user string to a finite, non-negative number; NaN/blank → 0. */
function parseNum(raw: string): number {
  if (raw == null) return 0;
  const cleaned = String(raw).replace(/[^0-9.\-]/g, "").trim();
  if (cleaned === "" || cleaned === "-" || cleaned === ".") return 0;
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return 0;
  return n;
}

let _idSeq = 0;
const newId = () => `li-${Date.now().toString(36)}-${(_idSeq++).toString(36)}`;

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

const makeLine = (description = "", qty = "1", unitPrice = ""): LineItem => ({
  id: newId(),
  description,
  qty,
  unitPrice,
});

const INITIAL_LINES = (): LineItem[] => [
  makeLine("Labour — call-out + first hour", "1", "120"),
  makeLine("Materials", "1", "85"),
];

export default function InvoicePdf() {
  usePageTitle("Invoice / Quote PDF Generator");

  const [docType, setDocType] = useState<DocType>("invoice");

  // Business (the tradesperson)
  const [bizName, setBizName] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [bizPhone, setBizPhone] = useState("");
  const [bizEmail, setBizEmail] = useState("");
  const [bizAddress, setBizAddress] = useState("");

  // Customer
  const [custName, setCustName] = useState("");
  const [custAddress, setCustAddress] = useState("");

  // Document meta
  const [docNumber, setDocNumber] = useState("0001");
  const [issueDate, setIssueDate] = useState(todayISO());
  const [dueDate, setDueDate] = useState("");

  // Line items
  const [lines, setLines] = useState<LineItem[]>(INITIAL_LINES);

  // Money config
  const [taxRate, setTaxRate] = useState("0");
  const [currency, setCurrency] = useState("USD");
  const [notes, setNotes] = useState("");

  const sym = CURRENCIES.find((c) => c.code === currency)?.symbol ?? "$";

  const fmtMoney = (n: number): string => {
    const v = Number.isFinite(n) ? n : 0;
    return `${sym}${v.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  const computed = useMemo(() => {
    const rows = lines.map((li) => {
      const qty = parseNum(li.qty);
      const unit = parseNum(li.unitPrice);
      return { ...li, qtyNum: qty, unitNum: unit, lineTotal: qty * unit };
    });
    const subtotal = rows.reduce((a, r) => a + r.lineTotal, 0);
    const rate = parseNum(taxRate);
    const tax = subtotal * (rate / 100);
    const total = subtotal + tax;
    return { rows, subtotal, rate, tax, total };
  }, [lines, taxRate]);

  const addLine = () => setLines((ls) => [...ls, makeLine()]);
  const removeLine = (id: string) =>
    setLines((ls) => (ls.length <= 1 ? ls : ls.filter((l) => l.id !== id)));
  const updateLine = (id: string, patch: Partial<LineItem>) =>
    setLines((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)));

  const reset = () => {
    setDocType("invoice");
    setBizName("");
    setLogoUrl("");
    setBizPhone("");
    setBizEmail("");
    setBizAddress("");
    setCustName("");
    setCustAddress("");
    setDocNumber("0001");
    setIssueDate(todayISO());
    setDueDate("");
    setLines(INITIAL_LINES());
    setTaxRate("0");
    setCurrency("USD");
    setNotes("");
  };

  const handlePrint = () => {
    // Native print → user chooses "Save as PDF". The @media print block below
    // hides everything except .inv-print-root, so the PDF is the clean doc.
    window.print();
  };

  const docLabel = docType === "invoice" ? "Invoice" : "Quote";
  const numberLabel = docType === "invoice" ? "Invoice no." : "Quote no.";
  const fmtDate = (iso: string) => {
    if (!iso) return "—";
    const d = new Date(`${iso}T00:00:00`);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  return (
    <PortalLayout
      breadcrumb={
        <span className="flex items-center gap-1.5">
          <Link href="/portal/free-tools" className="hover:text-brand-blue">
            Free Tools
          </Link>
          <span className="text-gray-400">/</span>
          <span>Invoice / Quote PDF</span>
        </span>
      }
    >
      {/* Scoped print stylesheet — hides ALL chrome, prints only .inv-print-root.
          Lives in-component so the rule ships with the page and nothing else on
          the route is affected at runtime (only matters during print). */}
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          .inv-print-root, .inv-print-root * { visibility: visible !important; }
          .inv-print-root {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            box-shadow: none !important;
            border: 0 !important;
          }
          .inv-no-print { display: none !important; }
          .inv-doc {
            box-shadow: none !important;
            border: 0 !important;
            border-radius: 0 !important;
            max-width: 100% !important;
            margin: 0 !important;
            padding: 32px !important;
          }
          .inv-doc table { page-break-inside: auto; }
          .inv-doc tr { page-break-inside: avoid; }
          @page { margin: 14mm; }
        }
      `}</style>

      <div data-theme="light" className="space-y-6">
        <header className="inv-no-print">
          <div className="flex items-center gap-2 mb-1">
            <FileText className="w-5 h-5 text-brand-blue" aria-hidden="true" />
            <h1 className="text-2xl font-bold text-gray-900">
              Invoice / Quote PDF Generator
            </h1>
          </div>
          <p className="text-sm text-gray-600 max-w-3xl">
            Turn a job into a clean, branded{" "}
            <strong>invoice</strong> or <strong>quote</strong> — then{" "}
            <strong>Save as PDF</strong> straight from your browser. Everything
            runs locally; nothing is saved or sent anywhere.
          </p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* ── Config column ── */}
          <div className="lg:col-span-1 space-y-3 inv-no-print">
            {/* Document type + meta */}
            <Card>
              <CardContent className="p-5 space-y-3">
                <FieldGroupHeader
                  title="Document"
                  help="Pick whether this is an invoice (a bill to be paid) or a quote (a price estimate). Set its number and dates."
                  right={
                    <Button
                      type="button"
                      onClick={reset}
                      variant="outline"
                      size="sm"
                      data-testid="invoice-reset"
                    >
                      <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
                      Reset
                    </Button>
                  }
                />
                {/* Segmented control — selected = outline, not bright fill. */}
                <div
                  role="tablist"
                  aria-label="Document type"
                  className="grid grid-cols-2 gap-1 p-1 rounded-lg bg-gray-100"
                >
                  {(
                    [
                      { id: "invoice", label: "Invoice" },
                      { id: "quote", label: "Quote" },
                    ] as { id: DocType; label: string }[]
                  ).map((opt) => {
                    const active = docType === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        onClick={() => setDocType(opt.id)}
                        data-testid={`invoice-doctype-${opt.id}`}
                        className={cn(
                          "px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
                          "focus:outline-none focus:ring-2 focus:ring-brand-blue/20",
                          active
                            ? "bg-card text-brand-blue ring-1 ring-brand-blue/40 shadow-sm"
                            : "text-gray-600 hover:text-gray-900",
                        )}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
                <div className="space-y-0.5">
                  <TitleInField
                    id="invoice-number"
                    label={numberLabel}
                    value={docNumber}
                    onChange={setDocNumber}
                    placeholder="0001"
                    help="Your own reference number for this document."
                    testid="invoice-input-number"
                  />
                  <div className="grid grid-cols-2 gap-0.5">
                    <TitleInField
                      id="invoice-issue-date"
                      label="Date"
                      value={issueDate}
                      onChange={setIssueDate}
                      type="date"
                      help="The date this document is issued."
                      testid="invoice-input-issue-date"
                    />
                    <TitleInField
                      id="invoice-due-date"
                      label={docType === "invoice" ? "Due date" : "Valid until"}
                      value={dueDate}
                      onChange={setDueDate}
                      type="date"
                      help={
                        docType === "invoice"
                          ? "When payment is due. Leave blank to omit."
                          : "How long the quote is valid. Leave blank to omit."
                      }
                      testid="invoice-input-due-date"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Business (from / your details) */}
            <Card>
              <CardContent className="p-5 space-y-3">
                <FieldGroupHeader
                  title="Your business"
                  help="Your details — these appear in the document header. Add a logo URL to brand it."
                />
                <div className="space-y-0.5">
                  <TitleInField
                    id="invoice-biz-name"
                    label="Business name"
                    value={bizName}
                    onChange={setBizName}
                    placeholder="Acme Plumbing Co."
                    help="Shown large at the top of the document."
                    testid="invoice-input-biz-name"
                  />
                  <TitleInField
                    id="invoice-logo-url"
                    label="Logo URL (optional)"
                    value={logoUrl}
                    onChange={setLogoUrl}
                    type="url"
                    placeholder="https://…/logo.png"
                    help="A direct link to your logo image. Leave blank to skip."
                    testid="invoice-input-logo-url"
                  />
                  <div className="grid grid-cols-2 gap-0.5">
                    <TitleInField
                      id="invoice-biz-phone"
                      label="Phone"
                      value={bizPhone}
                      onChange={setBizPhone}
                      type="tel"
                      placeholder="(555) 010-2030"
                      testid="invoice-input-biz-phone"
                    />
                    <TitleInField
                      id="invoice-biz-email"
                      label="Email"
                      value={bizEmail}
                      onChange={setBizEmail}
                      type="email"
                      placeholder="hello@acme.co"
                      testid="invoice-input-biz-email"
                    />
                  </div>
                  <TitleInFieldTextarea
                    id="invoice-biz-address"
                    label="Business address"
                    value={bizAddress}
                    onChange={setBizAddress}
                    rows={2}
                    placeholder="12 Trade St, Toronto, ON"
                    help="Your address — appears under your business name."
                    testid="invoice-input-biz-address"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Customer (bill to) */}
            <Card>
              <CardContent className="p-5 space-y-3">
                <FieldGroupHeader
                  title="Bill to"
                  help="Who this document is for. Appears in the 'Bill to' block."
                />
                <div className="space-y-0.5">
                  <TitleInField
                    id="invoice-cust-name"
                    label="Customer name"
                    value={custName}
                    onChange={setCustName}
                    placeholder="Jane Homeowner"
                    testid="invoice-input-cust-name"
                  />
                  <TitleInFieldTextarea
                    id="invoice-cust-address"
                    label="Customer address"
                    value={custAddress}
                    onChange={setCustAddress}
                    rows={2}
                    placeholder="48 Maple Ave, Toronto, ON"
                    testid="invoice-input-cust-address"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Money */}
            <Card>
              <CardContent className="p-5 space-y-3">
                <FieldGroupHeader
                  title="Totals & notes"
                  help="Tax rate, currency, and any notes or payment terms shown at the foot of the document."
                />
                <div className="space-y-0.5">
                  <div className="grid grid-cols-2 gap-0.5">
                    <TitleInField
                      id="invoice-tax-rate"
                      label="Tax rate (%)"
                      value={taxRate}
                      onChange={setTaxRate}
                      type="text"
                      placeholder="0"
                      help="Sales tax / VAT / GST percentage applied to the subtotal. Use 0 for none."
                      testid="invoice-input-tax-rate"
                    />
                    <TitleInFieldSelect
                      id="invoice-currency"
                      label="Currency"
                      value={currency}
                      onChange={setCurrency}
                      help="Sets the currency symbol used throughout the document."
                      testid="invoice-input-currency"
                    >
                      {CURRENCIES.map((c) => (
                        <option key={c.code} value={c.code}>
                          {c.label}
                        </option>
                      ))}
                    </TitleInFieldSelect>
                  </div>
                  <TitleInFieldTextarea
                    id="invoice-notes"
                    label="Notes / terms (optional)"
                    value={notes}
                    onChange={setNotes}
                    rows={3}
                    placeholder="Payment due within 14 days. Bank: …"
                    help="Payment terms, bank details, a thank-you — anything you want at the bottom."
                    testid="invoice-input-notes"
                  />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* ── Preview column ── */}
          <div className="lg:col-span-2 space-y-3">
            {/* Action bar — single primary CTA. Hidden on print. */}
            <div className="inv-no-print flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-1.5 min-w-0">
                <FileText
                  className="w-4 h-4 text-brand-blue shrink-0"
                  aria-hidden="true"
                />
                <p className="text-sm text-gray-600 truncate">
                  Live preview — print or save as PDF when it looks right.
                </p>
              </div>
              <Button
                type="button"
                onClick={handlePrint}
                className="btn-primary-premium"
                data-testid="invoice-print"
              >
                <Printer className="w-4 h-4 mr-1.5" />
                Print / Save PDF
              </Button>
            </div>

            {/* Line-item editor — lives in the config flow but kept beside the
                preview because it's wide. Hidden on print. */}
            <Card className="inv-no-print">
              <CardContent className="p-5 space-y-3">
                <FieldGroupHeader
                  title="Line items"
                  help="One row per item of work or material. Line total = quantity × unit price, computed automatically."
                  right={
                    <Button
                      type="button"
                      onClick={addLine}
                      variant="outline"
                      size="sm"
                      data-testid="invoice-add-line"
                    >
                      <Plus className="w-4 h-4 mr-1.5" />
                      Add line
                    </Button>
                  }
                />
                <div className="space-y-0.5">
                  {computed.rows.map((row, idx) => (
                    <div
                      key={row.id}
                      className="grid grid-cols-12 gap-1 items-start"
                      data-testid={`invoice-line-${idx}`}
                    >
                      <div className="col-span-6">
                        <TitleInField
                          id={`invoice-line-desc-${row.id}`}
                          label="Description"
                          value={row.description}
                          onChange={(v) => updateLine(row.id, { description: v })}
                          placeholder="What was done"
                          testid={`invoice-line-desc-input-${idx}`}
                        />
                      </div>
                      <div className="col-span-2">
                        <TitleInField
                          id={`invoice-line-qty-${row.id}`}
                          label="Qty"
                          value={row.qty}
                          onChange={(v) => updateLine(row.id, { qty: v })}
                          type="text"
                          placeholder="1"
                          testid={`invoice-line-qty-input-${idx}`}
                        />
                      </div>
                      <div className="col-span-3">
                        <TitleInField
                          id={`invoice-line-price-${row.id}`}
                          label={`Unit (${sym})`}
                          value={row.unitPrice}
                          onChange={(v) => updateLine(row.id, { unitPrice: v })}
                          type="text"
                          placeholder="0.00"
                          testid={`invoice-line-price-input-${idx}`}
                        />
                      </div>
                      <div className="col-span-1 flex items-center justify-center pt-2">
                        <button
                          type="button"
                          onClick={() => removeLine(row.id)}
                          disabled={computed.rows.length <= 1}
                          aria-label={`Remove line ${idx + 1}`}
                          data-testid={`invoice-remove-line-${idx}`}
                          className="p-1.5 rounded-md text-gray-400 hover:text-red-600 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-brand-blue/20"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="col-span-12 -mt-0.5 pl-1 text-right text-[11px] text-gray-500 tabular-nums">
                        Line total:{" "}
                        <span className="font-semibold text-gray-700">
                          {fmtMoney(row.lineTotal)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* The printable document. Everything under .inv-print-root is what
                the PDF captures. .inv-doc is the white "paper". */}
            <div className="inv-print-root">
              <div
                className="inv-doc bg-card text-gray-900 rounded-xl border border-gray-200 shadow-sm p-8 sm:p-10"
                data-testid="invoice-doc"
              >
                {/* Header: business + logo on the left, doc title on the right */}
                <div className="flex items-start justify-between gap-6">
                  <div className="min-w-0">
                    {logoUrl ? (
                      <img
                        src={logoUrl}
                        alt={bizName ? `${bizName} logo` : "Business logo"}
                        className="max-h-16 max-w-[200px] object-contain mb-3"
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).style.display =
                            "none";
                        }}
                      />
                    ) : null}
                    <h2 className="text-xl font-bold text-gray-900 leading-tight">
                      {bizName || "Your Business Name"}
                    </h2>
                    <div className="mt-1 text-xs text-gray-600 space-y-0.5">
                      {bizAddress
                        ? bizAddress.split("\n").map((l, i) => (
                            <p key={i} className="whitespace-pre-wrap">
                              {l}
                            </p>
                          ))
                        : null}
                      {(bizPhone || bizEmail) && (
                        <p>
                          {[bizPhone, bizEmail].filter(Boolean).join("  ·  ")}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-2xl font-bold uppercase tracking-wide text-brand-blue">
                      {docLabel}
                    </p>
                    <dl className="mt-2 text-xs text-gray-600 space-y-0.5">
                      <div className="flex justify-end gap-2">
                        <dt className="text-gray-400">{numberLabel}</dt>
                        <dd
                          className="font-semibold text-gray-700 tabular-nums"
                          data-testid="invoice-doc-number"
                        >
                          {docNumber || "—"}
                        </dd>
                      </div>
                      <div className="flex justify-end gap-2">
                        <dt className="text-gray-400">Date</dt>
                        <dd className="font-semibold text-gray-700">
                          {fmtDate(issueDate)}
                        </dd>
                      </div>
                      {dueDate && (
                        <div className="flex justify-end gap-2">
                          <dt className="text-gray-400">
                            {docType === "invoice" ? "Due" : "Valid until"}
                          </dt>
                          <dd className="font-semibold text-gray-700">
                            {fmtDate(dueDate)}
                          </dd>
                        </div>
                      )}
                    </dl>
                  </div>
                </div>

                {/* Bill to */}
                <div className="mt-8 pt-6 border-t border-gray-200">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">
                    Bill to
                  </p>
                  <p className="text-sm font-semibold text-gray-900">
                    {custName || "Customer name"}
                  </p>
                  {custAddress && (
                    <p className="mt-0.5 text-xs text-gray-600 whitespace-pre-wrap">
                      {custAddress}
                    </p>
                  )}
                </div>

                {/* Line-item table */}
                <div className="mt-6 overflow-x-auto">
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="border-b border-gray-300 text-[10px] uppercase tracking-wider text-gray-500">
                        <th className="text-left font-semibold py-2 pr-2">
                          Description
                        </th>
                        <th className="text-right font-semibold py-2 px-2 w-16">
                          Qty
                        </th>
                        <th className="text-right font-semibold py-2 px-2 w-28">
                          Unit price
                        </th>
                        <th className="text-right font-semibold py-2 pl-2 w-28">
                          Amount
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {computed.rows.map((row, idx) => (
                        <tr
                          key={row.id}
                          className="border-b border-gray-100 align-top"
                        >
                          <td className="py-2 pr-2 text-gray-800">
                            {row.description || (
                              <span className="text-gray-300">—</span>
                            )}
                          </td>
                          <td className="py-2 px-2 text-right text-gray-700 tabular-nums">
                            {row.qtyNum.toLocaleString(undefined, {
                              maximumFractionDigits: 2,
                            })}
                          </td>
                          <td className="py-2 px-2 text-right text-gray-700 tabular-nums">
                            {fmtMoney(row.unitNum)}
                          </td>
                          <td
                            className="py-2 pl-2 text-right font-medium text-gray-900 tabular-nums"
                            data-testid={`invoice-doc-line-amount-${idx}`}
                          >
                            {fmtMoney(row.lineTotal)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Totals */}
                <div className="mt-4 flex justify-end">
                  <dl className="w-full max-w-xs text-sm space-y-1.5">
                    <div className="flex justify-between">
                      <dt className="text-gray-500">Subtotal</dt>
                      <dd
                        className="text-gray-800 tabular-nums"
                        data-testid="invoice-doc-subtotal"
                      >
                        {fmtMoney(computed.subtotal)}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-gray-500">
                        Tax
                        {computed.rate
                          ? ` (${computed.rate.toLocaleString(undefined, {
                              maximumFractionDigits: 2,
                            })}%)`
                          : ""}
                      </dt>
                      <dd
                        className="text-gray-800 tabular-nums"
                        data-testid="invoice-doc-tax"
                      >
                        {fmtMoney(computed.tax)}
                      </dd>
                    </div>
                    <div className="flex justify-between pt-2 mt-1 border-t border-gray-300">
                      <dt className="text-base font-bold text-gray-900">
                        {docType === "invoice" ? "Total due" : "Total"}
                      </dt>
                      <dd
                        className="text-base font-bold text-brand-blue tabular-nums"
                        data-testid="invoice-doc-total"
                      >
                        {fmtMoney(computed.total)}
                      </dd>
                    </div>
                  </dl>
                </div>

                {/* Notes / terms */}
                {notes.trim() && (
                  <div className="mt-8 pt-6 border-t border-gray-200">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">
                      Notes &amp; terms
                    </p>
                    <p className="text-xs text-gray-600 whitespace-pre-wrap leading-relaxed">
                      {notes}
                    </p>
                  </div>
                )}

                {/* Footer line */}
                <p className="mt-8 pt-4 border-t border-gray-100 text-center text-[10px] text-gray-400">
                  {docType === "invoice"
                    ? "Thank you for your business."
                    : "This quote is an estimate and may be subject to change."}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </PortalLayout>
  );
}
