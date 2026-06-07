import { useMemo, useState } from "react";
import { Link } from "wouter";
import { Percent, RotateCcw, Info, TrendingUp } from "lucide-react";
import PortalLayout from "@/components/portal/PortalLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { usePageTitle } from "@/hooks/usePageTitle";
import {
  FieldGroupHeader,
  TitleInField,
  TitleInFieldSelect,
} from "./_shared";

/**
 * Margin & Markup Calculator — interactive Free Tool.
 *
 * Pure client-side, $0, no backend. Solves the #1 trade pricing pain
 * (under-pricing) by letting a tradesperson enter their costs and EITHER a
 * target margin % OR a markup %, then computing the price to charge plus the
 * full breakdown. Educational: the margin↔markup conversion + plain formulas
 * are shown so it teaches as it calculates.
 *
 * Math (all guarded against NaN / divide-by-zero):
 *   cost   = labour + materials + overhead
 *   margin% = (price - cost) / price * 100      (profit over PRICE)
 *   markup% = (price - cost) / cost  * 100      (profit over COST)
 *   price from margin = cost / (1 - margin/100)  (invalid when margin >= 100)
 *   price from markup = cost * (1 + markup/100)
 *
 * DS compliance: title-in-field + top-left help cue + 2px input-cluster gaps +
 * single .btn-primary-premium per page (Reset). No bare #fff/#000 literals;
 * icon sizes drawn from {12,14,16,20,24,32}.
 */

type DriveBy = "margin" | "markup";
type OverheadMode = "fixed" | "percent";

const CURRENCIES = [
  { code: "USD", symbol: "$", label: "USD ($)" },
  { code: "CAD", symbol: "$", label: "CAD ($)" },
  { code: "GBP", symbol: "£", label: "GBP (£)" },
  { code: "EUR", symbol: "€", label: "EUR (€)" },
  { code: "AUD", symbol: "$", label: "AUD ($)" },
] as const;

const DEFAULTS = {
  labour: "400",
  materials: "250",
  overhead: "10",
  overheadMode: "percent" as OverheadMode,
  driveBy: "margin" as DriveBy,
  rate: "30",
  currency: "USD",
};

/** Parse a user string to a finite, non-negative number; NaN/blank/garbage → null. */
function parseNum(raw: string): number | null {
  if (raw == null) return null;
  const cleaned = raw.replace(/[^0-9.\-]/g, "").trim();
  if (cleaned === "" || cleaned === "-" || cleaned === ".") return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  return n;
}

interface Computed {
  cost: number | null;
  price: number | null;
  profit: number | null;
  marginPct: number | null;
  markupPct: number | null;
  /** True when the chosen target produces an impossible/undefined price. */
  invalid: boolean;
  invalidReason?: string;
}

function compute(opts: {
  labour: number | null;
  materials: number | null;
  overhead: number | null;
  overheadMode: OverheadMode;
  driveBy: DriveBy;
  rate: number | null;
}): Computed {
  const labour = opts.labour ?? 0;
  const materials = opts.materials ?? 0;
  const base = labour + materials;

  // Overhead can be a fixed cash amount or a % of (labour + materials).
  let overheadAmt = 0;
  if (opts.overheadMode === "percent") {
    overheadAmt = base * ((opts.overhead ?? 0) / 100);
  } else {
    overheadAmt = opts.overhead ?? 0;
  }

  const cost = base + overheadAmt;

  // Nothing to price yet.
  if (cost <= 0) {
    return {
      cost: cost > 0 ? cost : 0,
      price: null,
      profit: null,
      marginPct: null,
      markupPct: null,
      invalid: false,
    };
  }

  const rate = opts.rate;
  if (rate == null) {
    return {
      cost,
      price: null,
      profit: null,
      marginPct: null,
      markupPct: null,
      invalid: false,
    };
  }

  let price: number;
  if (opts.driveBy === "margin") {
    // Margin must be < 100%; at 100% price → infinity, above is nonsense.
    if (rate >= 100) {
      return {
        cost,
        price: null,
        profit: null,
        marginPct: null,
        markupPct: null,
        invalid: true,
        invalidReason:
          "Margin must be under 100%. At 100% the price is infinite — there's no cost left in the price. Use a markup if you need a big multiple.",
      };
    }
    if (rate <= -100) {
      return {
        cost,
        price: null,
        profit: null,
        marginPct: null,
        markupPct: null,
        invalid: true,
        invalidReason: "Margin that negative isn't a real price.",
      };
    }
    price = cost / (1 - rate / 100);
  } else {
    // Markup of -100% means selling for free; below that is negative price.
    if (rate <= -100) {
      return {
        cost,
        price: null,
        profit: null,
        marginPct: null,
        markupPct: null,
        invalid: true,
        invalidReason: "A markup at or below -100% gives a zero/negative price.",
      };
    }
    price = cost * (1 + rate / 100);
  }

  if (!Number.isFinite(price) || price <= 0) {
    return {
      cost,
      price: null,
      profit: null,
      marginPct: null,
      markupPct: null,
      invalid: true,
      invalidReason: "Those inputs don't produce a valid price.",
    };
  }

  const profit = price - cost;
  const marginPct = (profit / price) * 100; // price > 0 guaranteed above
  const markupPct = (profit / cost) * 100; // cost > 0 guaranteed above

  return { cost, price, profit, marginPct, markupPct, invalid: false };
}

export default function MarginCalculator() {
  usePageTitle("Margin & Markup Calculator");

  const [labour, setLabour] = useState(DEFAULTS.labour);
  const [materials, setMaterials] = useState(DEFAULTS.materials);
  const [overhead, setOverhead] = useState(DEFAULTS.overhead);
  const [overheadMode, setOverheadMode] = useState<OverheadMode>(
    DEFAULTS.overheadMode,
  );
  const [driveBy, setDriveBy] = useState<DriveBy>(DEFAULTS.driveBy);
  const [rate, setRate] = useState(DEFAULTS.rate);
  const [currency, setCurrency] = useState(DEFAULTS.currency);

  const sym =
    CURRENCIES.find((c) => c.code === currency)?.symbol ?? "$";

  // Inputs are local state already — React re-renders on each keystroke, so
  // useMemo gives us "live, recompute-as-you-type" results for free without a
  // debounce timer fighting the controlled inputs.
  const result = useMemo(
    () =>
      compute({
        labour: parseNum(labour),
        materials: parseNum(materials),
        overhead: parseNum(overhead),
        overheadMode,
        driveBy,
        rate: parseNum(rate),
      }),
    [labour, materials, overhead, overheadMode, driveBy, rate],
  );

  const fmtMoney = (n: number | null): string => {
    if (n == null || !Number.isFinite(n)) return "—";
    // Sign before the symbol: -$83.33, never $-83.33.
    return `${n < 0 ? "-" : ""}${sym}${Math.abs(n).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  const fmtPct = (n: number | null): string => {
    if (n == null || !Number.isFinite(n)) return "—";
    return `${n.toLocaleString(undefined, {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    })}%`;
  };

  const reset = () => {
    setLabour(DEFAULTS.labour);
    setMaterials(DEFAULTS.materials);
    setOverhead(DEFAULTS.overhead);
    setOverheadMode(DEFAULTS.overheadMode);
    setDriveBy(DEFAULTS.driveBy);
    setRate(DEFAULTS.rate);
    setCurrency(DEFAULTS.currency);
  };

  // Breakdown bar — share of price that's cost vs profit (only when valid).
  const showBar =
    result.price != null &&
    result.cost != null &&
    result.profit != null &&
    result.price > 0;
  const costShare = showBar
    ? Math.max(0, Math.min(100, (result.cost! / result.price!) * 100))
    : 0;
  const profitShare = showBar ? Math.max(0, 100 - costShare) : 0;

  return (
    <PortalLayout
      breadcrumb={
        <span className="flex items-center gap-1.5">
          <Link href="/portal/free-tools" className="hover:text-brand-blue">
            Free Tools
          </Link>
          <span className="text-gray-400">/</span>
          <span>Margin &amp; Markup Calculator</span>
        </span>
      }
    >
      <div data-theme="light" className="qq-paper-surface space-y-6">
        <header>
          <div className="flex items-center gap-2 mb-1">
            <Percent
              className="w-5 h-5 text-brand-blue"
              aria-hidden="true"
            />
            <h1 className="text-2xl font-bold text-gray-900">
              Margin &amp; Markup Calculator
            </h1>
          </div>
          <p className="text-sm text-gray-600 max-w-3xl">
            The fastest way to stop under-charging. Enter your costs, pick a
            target <strong>margin</strong> or <strong>markup</strong>, and see
            exactly what to quote — plus the profit you'll actually keep.
            Everything runs in your browser; nothing is saved or sent anywhere.
          </p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* ── Inputs column ── */}
          <div className="lg:col-span-1 space-y-3">
            <Card>
              <CardContent className="p-5 space-y-3">
                <FieldGroupHeader
                  title="Your costs"
                  help="Enter what this job costs you before profit. Labour + materials + overhead = your total cost."
                  right={
                    <Button
                      type="button"
                      onClick={reset}
                      className="btn-primary-premium"
                      size="sm"
                      data-testid="margin-reset"
                    >
                      <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
                      Reset
                    </Button>
                  }
                />
                {/* DS rule 4 — 2px gap between stacked inputs. */}
                <div className="space-y-0.5">
                  <TitleInField
                    id="margin-labour"
                    label={`Labour cost (${sym})`}
                    value={labour}
                    onChange={setLabour}
                    type="text"
                    placeholder="400"
                    help="Your own time plus any sub-contractors / crew for this job."
                    testid="margin-input-labour"
                  />
                  <TitleInField
                    id="margin-materials"
                    label={`Materials cost (${sym})`}
                    value={materials}
                    onChange={setMaterials}
                    type="text"
                    placeholder="250"
                    help="Parts, supplies, consumables, equipment hire — everything you buy for the job."
                    testid="margin-input-materials"
                  />
                  <div className="grid grid-cols-2 gap-0.5">
                    <TitleInField
                      id="margin-overhead"
                      label={
                        overheadMode === "percent"
                          ? "Overhead (%)"
                          : `Overhead (${sym})`
                      }
                      value={overhead}
                      onChange={setOverhead}
                      type="text"
                      placeholder={overheadMode === "percent" ? "10" : "65"}
                      help="Insurance, fuel, tools, admin — the running cost of the business. Set it as a flat amount or a % of labour + materials."
                      testid="margin-input-overhead"
                    />
                    <TitleInFieldSelect
                      id="margin-overhead-mode"
                      label="Overhead as"
                      value={overheadMode}
                      onChange={(v) =>
                        setOverheadMode(v as OverheadMode)
                      }
                      help="Fixed = a flat cash figure. Percent = a share of labour + materials."
                      testid="margin-input-overhead-mode"
                    >
                      <option value="percent">% of base</option>
                      <option value="fixed">Fixed {sym}</option>
                    </TitleInFieldSelect>
                  </div>
                  <TitleInFieldSelect
                    id="margin-currency"
                    label="Currency"
                    value={currency}
                    onChange={setCurrency}
                    help="Used only for the display symbol — the maths is identical for any currency."
                    testid="margin-input-currency"
                  >
                    {CURRENCIES.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.label}
                      </option>
                    ))}
                  </TitleInFieldSelect>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5 space-y-3">
                <FieldGroupHeader
                  title="Set your target"
                  help="Drive your price from a margin % (profit as a share of the price) OR a markup % (profit added on top of cost). Pick whichever your trade quotes in."
                />
                {/* Segmented control — selected = outline, not bright fill
                    (DS hard rule). */}
                <div
                  role="tablist"
                  aria-label="Set price by"
                  className="grid grid-cols-2 gap-1 p-1 rounded-lg bg-gray-100"
                >
                  {(
                    [
                      { id: "margin", label: "Margin %" },
                      { id: "markup", label: "Markup %" },
                    ] as { id: DriveBy; label: string }[]
                  ).map((opt) => {
                    const active = driveBy === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        onClick={() => setDriveBy(opt.id)}
                        data-testid={`margin-driveby-${opt.id}`}
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
                    id="margin-rate"
                    label={
                      driveBy === "margin"
                        ? "Target margin (%)"
                        : "Target markup (%)"
                    }
                    value={rate}
                    onChange={setRate}
                    type="text"
                    placeholder={driveBy === "margin" ? "30" : "50"}
                    help={
                      driveBy === "margin"
                        ? "Share of the final price that is profit. Must be under 100%."
                        : "Percent added on top of your cost to reach the price."
                    }
                    testid="margin-input-rate"
                  />
                </div>
                <p className="text-xs text-gray-500 leading-relaxed">
                  {driveBy === "margin" ? (
                    <>
                      <strong>Margin</strong> is profit as a share of the{" "}
                      <strong>price</strong>. A 30% margin means 30¢ of every
                      dollar you charge is profit.
                    </>
                  ) : (
                    <>
                      <strong>Markup</strong> is profit added on top of your{" "}
                      <strong>cost</strong>. A 50% markup means you charge
                      1.5× what the job cost you.
                    </>
                  )}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* ── Results column ── */}
          <div className="lg:col-span-2 space-y-3">
            <Card>
              <CardContent className="p-5 space-y-4">
                <FieldGroupHeader
                  title="What to charge"
                  help="Live results. The big number is the price to quote; the rest shows exactly how it breaks down."
                />

                {result.invalid ? (
                  <div
                    className="flex items-start gap-3 p-3 rounded-lg border border-amber-200 bg-amber-50 text-sm text-amber-900"
                    data-testid="margin-invalid"
                  >
                    <Info
                      className="w-4 h-4 shrink-0 mt-0.5"
                      aria-hidden="true"
                    />
                    <p>{result.invalidReason}</p>
                  </div>
                ) : (
                  <>
                    {/* Headline price */}
                    <div className="rounded-xl border border-brand-blue/20 bg-brand-blue/5 p-5">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-brand-blue/80 mb-1">
                        Price to charge
                      </p>
                      <p
                        className="text-4xl font-bold text-gray-900 tabular-nums"
                        data-testid="margin-out-price"
                      >
                        {fmtMoney(result.price)}
                      </p>
                      <p className="text-sm text-gray-600 mt-1">
                        Profit:{" "}
                        <span
                          className="font-semibold text-emerald-600 tabular-nums"
                          data-testid="margin-out-profit"
                        >
                          {fmtMoney(result.profit)}
                        </span>
                      </p>
                    </div>

                    {/* Cost vs profit breakdown bar */}
                    {showBar && (
                      <div>
                        <div
                          className="flex h-3 w-full overflow-hidden rounded-full bg-gray-100"
                          role="img"
                          aria-label={`Cost ${costShare.toFixed(
                            0,
                          )} percent, profit ${profitShare.toFixed(
                            0,
                          )} percent of price`}
                          data-testid="margin-bar"
                        >
                          <div
                            className="h-full bg-slate-400"
                            style={{ width: `${costShare}%` }}
                          />
                          <div
                            className="h-full bg-emerald-500"
                            style={{ width: `${profitShare}%` }}
                          />
                        </div>
                        <div className="mt-1.5 flex items-center justify-between text-xs text-gray-500">
                          <span className="flex items-center gap-1.5">
                            <span style={{ width: 10, height: 10 }} className="inline-block rounded-sm bg-slate-400" />
                            Cost {costShare.toFixed(0)}%
                          </span>
                          <span className="flex items-center gap-1.5">
                            <span style={{ width: 10, height: 10 }} className="inline-block rounded-sm bg-emerald-500" />
                            Profit {profitShare.toFixed(0)}%
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Stat grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-px rounded-lg overflow-hidden border border-gray-200 bg-gray-200">
                      <Stat
                        label="Total cost"
                        value={fmtMoney(result.cost)}
                        testid="margin-out-cost"
                      />
                      <Stat
                        label="Profit"
                        value={fmtMoney(result.profit)}
                        testid="margin-out-profit-stat"
                      />
                      <Stat
                        label="Margin"
                        value={fmtPct(result.marginPct)}
                        emphasis={driveBy === "margin"}
                        testid="margin-out-margin"
                      />
                      <Stat
                        label="Markup"
                        value={fmtPct(result.markupPct)}
                        emphasis={driveBy === "markup"}
                        testid="margin-out-markup"
                      />
                    </div>

                    {/* Margin ↔ markup conversion line */}
                    {result.marginPct != null &&
                      result.markupPct != null && (
                        <div className="flex items-center gap-2 text-xs text-gray-600">
                          <TrendingUp
                            className="w-3.5 h-3.5 text-brand-blue shrink-0"
                            aria-hidden="true"
                          />
                          <p data-testid="margin-conversion">
                            A{" "}
                            <strong>{fmtPct(result.markupPct)}</strong> markup
                            is the same as a{" "}
                            <strong>{fmtPct(result.marginPct)}</strong> margin.
                          </p>
                        </div>
                      )}
                  </>
                )}
              </CardContent>
            </Card>

            {/* Formulas / educational card */}
            <Card>
              <CardContent className="p-5">
                <h2 className="text-sm font-semibold text-gray-900 mb-3">
                  The formulas (so you can check the maths)
                </h2>
                <dl className="space-y-2.5 text-xs text-gray-700">
                  <Formula
                    term="Total cost"
                    formula="labour + materials + overhead"
                  />
                  <Formula
                    term="Margin %"
                    formula="(price − cost) ÷ price × 100"
                  />
                  <Formula
                    term="Markup %"
                    formula="(price − cost) ÷ cost × 100"
                  />
                  <Formula
                    term="Price from margin"
                    formula="cost ÷ (1 − margin ÷ 100)"
                  />
                  <Formula
                    term="Price from markup"
                    formula="cost × (1 + markup ÷ 100)"
                  />
                </dl>
                <div className="mt-4 flex items-start gap-2 p-3 rounded-lg bg-slate-50 text-xs text-gray-600">
                  <Info
                    className="w-3.5 h-3.5 shrink-0 mt-0.5 text-brand-blue"
                    aria-hidden="true"
                  />
                  <p>
                    <strong>Why it matters:</strong> margin and markup are{" "}
                    <em>not</em> the same. A 50% markup is only a 33.3% margin —
                    quote on markup thinking it's margin and you'll quietly lose
                    a chunk of every job. This tool keeps them straight.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </PortalLayout>
  );
}

function Stat({
  label,
  value,
  emphasis,
  testid,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
  testid?: string;
}) {
  return (
    <div className="bg-card p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
        {label}
      </p>
      <p
        className={cn(
          "text-lg font-bold tabular-nums mt-0.5",
          emphasis ? "text-brand-blue" : "text-gray-900",
        )}
        data-testid={testid}
      >
        {value}
      </p>
    </div>
  );
}

function Formula({ term, formula }: { term: string; formula: string }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-baseline sm:gap-2">
      <dt className="font-semibold text-gray-900 sm:w-40 shrink-0">{term}</dt>
      <dd className="font-mono text-gray-600">{formula}</dd>
    </div>
  );
}
