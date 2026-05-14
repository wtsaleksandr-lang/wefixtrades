/**
 * "How TradeLine compares" section for /products/tradeline/v7.
 *
 * Renders the verified 11-provider feature matrix from
 * shared/marketing/tradelineComparisonTable.ts. Highlights our row,
 * cites sources, shows the "as of" date.
 */

import { Check, Minus, Plus, Sparkles, ExternalLink } from "lucide-react";
import { mkt } from "@/theme/tokens";
import {
  COMPARISON_AS_OF,
  COMPARISON_FEATURES,
  COMPARISON_ROWS,
  type FeatureStatus,
} from "@shared/marketing/tradelineComparisonTable";

function StatusCell({ status }: { status: FeatureStatus }) {
  const common = "inline-flex items-center justify-center";
  switch (status) {
    case "yes":
      return (
        <span className={common} style={{ color: mkt.accent }} title="Included">
          <Check className="w-4 h-4" strokeWidth={2.5} />
        </span>
      );
    case "no":
      return (
        <span className={common} style={{ color: mkt.textFaint }} title="Not offered at this tier">
          <Minus className="w-4 h-4" />
        </span>
      );
    case "limited":
      return (
        <span className={common} style={{ color: "#FDBA74", fontSize: 11, fontWeight: 600 }} title="Included with limits">
          Limited
        </span>
      );
    case "addon":
      return (
        <span className={common} style={{ color: "#FDBA74", fontSize: 11, fontWeight: 600 }} title="Paid add-on at this tier">
          Add-on
        </span>
      );
    case "future":
      return (
        <span className={common} style={{ color: "#A7F3D0", fontSize: 11, fontWeight: 600 }} title="Coming soon (Pro tier, on Meta API approval)">
          Soon
        </span>
      );
    case "na":
      return (
        <span className={common} style={{ color: mkt.textFaint, fontSize: 11 }} title="Not applicable">
          —
        </span>
      );
  }
}

export default function TradelineComparisonTable() {
  return (
    <section
      className="py-20 px-6 sm:px-10"
      style={{ backgroundColor: mkt.sectionLight, color: mkt.text }}
      data-testid="tradeline-comparison-section"
    >
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-10">
          <div
            className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold mb-4 uppercase tracking-wider"
            style={{ backgroundColor: "rgba(102, 232, 250, 0.10)", color: mkt.accent, border: `1px solid rgba(102, 232, 250, 0.25)` }}
          >
            <Sparkles className="w-3 h-3" /> How we compare
          </div>
          <h2 className="text-3xl sm:text-5xl font-bold tracking-tight mb-4">
            One product, every channel.
          </h2>
          <p className="text-base sm:text-lg max-w-2xl mx-auto" style={{ color: mkt.textMuted }}>
            Voice-focused competitors give you a phone receptionist. Chat-widget specialists handle
            DMs and ignore your phone. HighLevel does everything but costs 3-5× more. TradeLine is
            the only one bundling voice + chat + social DMs at a single tradesperson-friendly price.
          </p>
        </div>

        <div className="overflow-x-auto rounded-2xl" style={{ border: `1px solid ${mkt.border}` }}>
          <table className="w-full text-sm border-collapse" style={{ backgroundColor: mkt.surface }}>
            <thead>
              <tr style={{ backgroundColor: mkt.sectionLight }}>
                <th
                  className="sticky left-0 z-10 text-left px-4 py-3 font-semibold text-xs uppercase tracking-wider"
                  style={{ backgroundColor: mkt.sectionLight, color: mkt.textMuted, minWidth: 200 }}
                >
                  Provider
                </th>
                {COMPARISON_FEATURES.map((f) => (
                  <th
                    key={f.key}
                    className="text-center px-3 py-3 font-semibold text-xs uppercase tracking-wider whitespace-nowrap"
                    style={{ color: mkt.textMuted, minWidth: 80 }}
                    title={f.hint || f.label}
                  >
                    {f.shortLabel}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {COMPARISON_ROWS.map((row, i) => (
                <tr
                  key={row.provider}
                  style={{
                    backgroundColor: row.isUs ? "rgba(102, 232, 250, 0.06)" : "transparent",
                    borderTop: i === 0 ? "none" : `1px solid ${mkt.border}`,
                  }}
                >
                  <td
                    className="sticky left-0 z-10 px-4 py-3"
                    style={{
                      backgroundColor: row.isUs ? "rgba(43, 56, 60, 1)" : mkt.surface,
                      borderRight: `1px solid ${mkt.border}`,
                      minWidth: 200,
                    }}
                  >
                    <div className="flex items-start gap-2">
                      {row.isUs && (
                        <span style={{ color: mkt.accent, marginTop: 2 }} title="WeFixTrades">
                          <Sparkles className="w-3.5 h-3.5" />
                        </span>
                      )}
                      <div>
                        <div className="font-semibold" style={{ color: row.isUs ? mkt.accent : mkt.text }}>
                          {row.provider}
                        </div>
                        <div className="text-[11px] mt-0.5" style={{ color: mkt.textMuted }}>
                          {row.tierName} · {row.pricePerMonth}/mo
                        </div>
                      </div>
                    </div>
                  </td>
                  {COMPARISON_FEATURES.map((f) => (
                    <td key={f.key} className="text-center px-3 py-3">
                      <StatusCell status={row.features[f.key]} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Caveats / footnotes per row */}
        <details className="mt-6">
          <summary
            className="cursor-pointer text-sm font-semibold"
            style={{ color: mkt.textMuted }}
          >
            Caveats &amp; sources
          </summary>
          <ul className="mt-4 space-y-2 text-xs" style={{ color: mkt.textMuted }}>
            {COMPARISON_ROWS.map((row) => (
              <li key={row.provider} className="leading-relaxed">
                <span className="font-semibold" style={{ color: mkt.text }}>{row.provider}</span>
                {row.caveat ? <> — {row.caveat}</> : null}{" "}
                <a
                  href={row.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-0.5"
                  style={{ color: mkt.accent }}
                >
                  source <ExternalLink className="w-2.5 h-2.5" />
                </a>
              </li>
            ))}
          </ul>
        </details>

        <p className="text-[11px] text-center mt-6" style={{ color: mkt.textFaint }}>
          Lowest paid tier shown for each provider. Pricing verified {COMPARISON_AS_OF}.
          Competitor pages change frequently — see source links for current pricing.
        </p>
      </div>
    </section>
  );
}
