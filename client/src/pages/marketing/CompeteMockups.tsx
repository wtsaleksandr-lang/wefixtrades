/**
 * CompeteMockups — internal share-link preview page.
 *
 * Renders all FOUR "Compete with the big chains" section mockups stacked, each
 * under a labelled band, so the founder can pick one. Read-only showcase: no
 * fillable form (listed in scripts/copilot-form-exempt.txt). Not in nav — it's
 * a share link (/mockups/compete).
 */

import { mkt } from "@/theme/tokens";
import {
  CompeteToggle,
  CompeteMatrix,
  CompeteRadar,
  CompeteCoverage,
} from "@/components/marketing/competeVariants";

function LabelBand({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        maxWidth: 1040,
        margin: "0 auto",
        padding: "28px clamp(16px, 5vw, 64px) 4px",
      }}
    >
      <div
        style={{
          fontFamily: "'DM Mono', ui-monospace, monospace",
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          color: mkt.accent,
        }}
      >
        {children}
      </div>
    </div>
  );
}

function Divider() {
  return (
    <div
      style={{
        maxWidth: 1040,
        margin: "0 auto",
        borderTop: `1px solid ${mkt.cardBorder}`,
      }}
    />
  );
}

export default function CompeteMockups() {
  const OPTIONS = [
    { label: "Option A — Toggle reveal", node: <CompeteToggle /> },
    { label: "Option B — Comparison matrix", node: <CompeteMatrix /> },
    { label: "Option C — Radar chart", node: <CompeteRadar /> },
    { label: "Option D — Coverage bars", node: <CompeteCoverage /> },
  ];

  return (
    <div style={{ minHeight: "100vh", background: mkt.bg }}>
      <header
        style={{
          maxWidth: 1040,
          margin: "0 auto",
          padding: "40px clamp(16px, 5vw, 64px) 8px",
        }}
      >
        <div
          style={{
            fontFamily: "'DM Mono', ui-monospace, monospace",
            fontSize: 11,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            color: mkt.textMuted,
            marginBottom: 8,
          }}
        >
          Internal preview · pick one
        </div>
        <h1
          style={{
            fontSize: "clamp(24px, 4vw, 36px)",
            fontWeight: 800,
            letterSpacing: "-0.03em",
            color: mkt.onDark,
            margin: 0,
          }}
        >
          "Compete with the big chains" — four mockups
        </h1>
      </header>

      {OPTIONS.map((opt, i) => (
        <div key={opt.label}>
          {i > 0 && <Divider />}
          <LabelBand>{opt.label}</LabelBand>
          {opt.node}
        </div>
      ))}
    </div>
  );
}
