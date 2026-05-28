/**
 * IntegrationsTrustStrip — silent-trust logos + a competitive comparison
 * block that lands the WeFixTrades positioning: "compete with the big
 * chains without the big-chain overhead."
 *
 * Wave 102 — rebuilt per Alex's psychology insight: brand NAMES mean
 * nothing to a plumber who doesn't know what Anthropic is; brand LOGOS
 * create recognition through "I've seen that somewhere" memory. So:
 *
 *   - Tagline "Powered by the rails you already trust" REMOVED. Naming
 *     the rails out loud was the part that read as jargon.
 *   - The 5 logos stay as silent visual trust signals (no caption).
 *   - Twilio + Anthropic logos upgraded to versions that look closer to
 *     the real marks (the prior hand-drawn Twilio dots-circle and the
 *     orange "A" for Anthropic were inventions, not the official marks).
 *   - A "us vs them" comparison table is added BELOW the logos. Tradies
 *     don't read paragraphs — the table scans in 5 seconds and tells the
 *     whole positioning story without prose.
 *
 * The SOC 2 / GDPR row Alex earlier debated lives in the footer already,
 * so it's intentionally not duplicated here.
 *
 * Wordmarks remain inline SVG (no external assets, no copyright risk).
 */

import { mkt } from "@/theme/tokens";

const LABEL_COLOR = "rgba(255,255,255,0.55)";
const HOVER_COLOR = "rgba(255,255,255,0.85)";

interface IntegrationLogo {
  name: string;
  svg: React.ReactNode;
}

const INTEGRATIONS: IntegrationLogo[] = [
  {
    // Stripe — official wordmark, accurate.
    name: "Stripe",
    svg: (
      <svg width="56" height="20" viewBox="0 0 56 20" fill="currentColor" aria-label="Stripe">
        <path d="M3.61 7.4c0-.55.46-.77 1.21-.77 1.08 0 2.45.33 3.53.91V4.18A9.34 9.34 0 0 0 4.82 3.5C2.04 3.5 0 5 0 7.51c0 3.93 5.4 3.3 5.4 5 0 .64-.56.85-1.36.85-1.18 0-2.7-.49-3.9-1.14v3.39c1.33.57 2.68.82 3.9.82 2.85 0 5.02-1.41 5.02-3.96-.02-4.25-5.45-3.49-5.45-5.07Zm9.06-5.05L9.05 3.12v11.94c0 2.21 1.66 3.84 3.87 3.84 1.22 0 2.12-.22 2.61-.49v-2.95c-.48.2-2.83.88-2.83-1.33V7.04h2.83V3.85h-2.83V2.35Zm7.6 2.84-.24-1.34h-3.07v11.27h3.55V8.5c.84-1.1 2.27-.89 2.71-.74V4.7c-.46-.17-2.14-.49-2.95.49Zm3.39-1.34h3.57v11.27h-3.57V3.85ZM27.23 2.55l3.57-.76V0L27.23.76v1.79Zm6.92 1.31c-1.39 0-2.28.65-2.78 1.1l-.18-.87h-3.13v15.05L31.61 19l.02-3.65c.51.37 1.27.9 2.51.9 2.52 0 4.82-2.03 4.82-6.13-.01-3.75-2.34-5.9-4.83-5.9Zm-.86 9.06c-.83 0-1.32-.3-1.66-.66l-.02-5.26c.37-.4.87-.69 1.68-.69 1.28 0 2.17 1.43 2.17 3.3 0 1.91-.87 3.3-2.17 3.3Zm15.13-3.27c0-3.3-1.6-5.9-4.65-5.9-3.07 0-4.93 2.6-4.93 5.87 0 3.87 2.19 5.83 5.33 5.83 1.53 0 2.69-.35 3.57-.83v-2.85c-.88.44-1.89.71-3.16.71-1.25 0-2.36-.44-2.5-1.96h6.31c.01-.17.03-.85.03-1.16v.29Zm-6.38-1.22c0-1.46.89-2.07 1.71-2.07.79 0 1.63.61 1.63 2.07h-3.34Z"/>
      </svg>
    ),
  },
  {
    // Twilio — official mark is the lowercase "twilio" wordmark in their
    // signature red (#F22F46). The prior 4-dots-in-a-circle was a custom
    // invention that didn't match any real Twilio asset.
    name: "Twilio",
    svg: (
      <svg width="52" height="20" viewBox="0 0 52 20" aria-label="Twilio">
        <text
          x="0"
          y="15"
          fontFamily="-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif"
          fontSize="14"
          fontWeight="800"
          fill="#F22F46"
          letterSpacing="-0.4"
        >
          twilio
        </text>
      </svg>
    ),
  },
  {
    // Google — multicolor wordmark. "Business" callout dropped; the
    // strip is logos-only now, and "Google" alone covers Maps / Search /
    // Business Profile equally well.
    name: "Google",
    svg: (
      <svg width="58" height="20" viewBox="0 0 58 20" aria-label="Google">
        <text x="0" y="15" fontFamily="-apple-system, system-ui, sans-serif" fontSize="14" fontWeight="700" letterSpacing="-0.3">
          <tspan fill="#4285F4">G</tspan>
          <tspan fill="#EA4335">o</tspan>
          <tspan fill="#FBBC04">o</tspan>
          <tspan fill="#4285F4">g</tspan>
          <tspan fill="#34A853">l</tspan>
          <tspan fill="#EA4335">e</tspan>
        </text>
      </svg>
    ),
  },
  {
    // Anthropic Claude — the real Anthropic mark is a stylized burst /
    // 8-point asterisk in their sienna orange (#CC785C). Approximated
    // here as 8 tapered petals around a center. Plus "Claude" wordmark.
    name: "Anthropic Claude",
    svg: (
      <svg width="76" height="20" viewBox="0 0 76 20" aria-label="Anthropic Claude">
        {/* Asterisk burst — 4 long axes (N/S/E/W) + 4 short diagonals.
            Approximates the official Anthropic mark without copying it. */}
        <g transform="translate(10 10)" fill="#CC785C">
          {/* Long vertical + horizontal */}
          <rect x="-1" y="-7" width="2" height="14" rx="1" />
          <rect x="-7" y="-1" width="14" height="2" rx="1" />
          {/* Short diagonals */}
          <g transform="rotate(45)">
            <rect x="-0.8" y="-5" width="1.6" height="10" rx="0.8" />
            <rect x="-5" y="-0.8" width="10" height="1.6" rx="0.8" />
          </g>
        </g>
        <text x="22" y="15" fontFamily="-apple-system, system-ui, sans-serif" fontSize="13" fontWeight="700" letterSpacing="-0.3" fill="currentColor">Claude</text>
      </svg>
    ),
  },
  {
    // Vapi — voice AI platform. Stylized "V" mark + wordmark. Their real
    // logo uses a similar geometric V; the simplified one here reads as
    // a clean wordmark in muted neutral.
    name: "Vapi",
    svg: (
      <svg width="50" height="20" viewBox="0 0 50 20" aria-label="Vapi" fill="currentColor">
        <path d="M2 5 L6 15 L10 5 L7.6 5 L6 9.5 L4.4 5 Z"/>
        <text x="13" y="15" fontFamily="-apple-system, system-ui, sans-serif" fontSize="13" fontWeight="700" letterSpacing="-0.3">Vapi</text>
      </svg>
    ),
  },
];

/**
 * Capability comparison rows — what a competitor pays for vs what one
 * WeFixTrades subscription delivers. Keep this list to ≤7 rows: tradies
 * don't scroll long tables. Numbers are directional industry ranges,
 * not exact quotes.
 */
const COMPARISON_ROWS: { capability: string; them: string; us: string }[] = [
  {
    capability: "Marketing leadership",
    them: "In-house CMO or agency, $80k+/yr",
    us: "Built in",
  },
  {
    capability: "Software stack",
    them: "6+ tools, $30k+/yr in licenses",
    us: "One platform",
  },
  {
    capability: "Quote response time",
    them: "Hours, sometimes next-day",
    us: "60 seconds",
  },
  {
    capability: "After-hours calls",
    them: "Voicemail · lost to competitor",
    us: "24/7 AI line",
  },
  {
    capability: "Google rankings",
    them: "SEO agency, $3–10k/mo",
    us: "Built in",
  },
  {
    capability: "Review collection",
    them: "Manual chasing",
    us: "Automatic",
  },
  {
    capability: "Setup time",
    them: "3–6 months + IT contractor",
    us: "48 hours",
  },
];

export default function IntegrationsTrustStrip() {
  return (
    <div data-testid="integrations-trust-strip">
      {/* ── Logo row — silent visual trust, no tagline ────────────────── */}
      <div
        style={{
          display: "flex",
          flexDirection: "row",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "center",
          gap: 36,
          padding: "20px 24px 12px",
          color: LABEL_COLOR,
        }}
      >
        {INTEGRATIONS.map((logo) => (
          <span
            key={logo.name}
            title={logo.name}
            style={{
              display: "inline-flex",
              alignItems: "center",
              transition: "color 0.2s, transform 0.2s",
              cursor: "default",
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = HOVER_COLOR; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = ""; }}
          >
            {logo.svg}
          </span>
        ))}
      </div>

      {/* ── Comparison block — "compete with the chains" ─────────────── */}
      <div style={{ padding: "32px 24px 44px" }}>
        <div style={{ maxWidth: 880, margin: "0 auto" }}>
          {/* Single-line eyebrow hands context to the table that follows.
              Intentionally short — the table tells the story; copy doesn't
              need to compete with it. */}
          <p
            style={{
              fontSize: 13,
              fontWeight: 600,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "rgba(255,255,255,0.55)",
              textAlign: "center",
              margin: "0 0 22px",
              fontFamily: "'DM Mono', monospace",
            }}
          >
            Compete with the big chains — without the big-chain overhead
          </p>

          {/* Desktop / tablet table. On phones (≤ 600px) the
              .integrations-compare class flips to a stacked card layout
              via the CSS at the bottom of this component. */}
          <div className="integrations-compare">
            <table
              role="table"
              aria-label="Capability comparison: big chains vs WeFixTrades"
              style={{
                width: "100%",
                borderCollapse: "collapse",
                tableLayout: "fixed",
              }}
            >
              <thead>
                <tr>
                  <th
                    scope="col"
                    style={{
                      textAlign: "left",
                      padding: "10px 16px",
                      fontSize: 12,
                      fontWeight: 600,
                      letterSpacing: "0.04em",
                      textTransform: "uppercase",
                      color: "rgba(255,255,255,0.45)",
                      borderBottom: "1px solid rgba(255,255,255,0.10)",
                      width: "32%",
                    }}
                  >
                    &nbsp;
                  </th>
                  <th
                    scope="col"
                    style={{
                      textAlign: "left",
                      padding: "10px 16px",
                      fontSize: 12,
                      fontWeight: 700,
                      letterSpacing: "0.04em",
                      textTransform: "uppercase",
                      color: "rgba(255,255,255,0.55)",
                      borderBottom: "1px solid rgba(255,255,255,0.10)",
                    }}
                  >
                    Big chains / franchises
                  </th>
                  <th
                    scope="col"
                    style={{
                      textAlign: "left",
                      padding: "10px 16px",
                      fontSize: 12,
                      fontWeight: 700,
                      letterSpacing: "0.04em",
                      textTransform: "uppercase",
                      color: mkt.accent,
                      borderBottom: `1px solid ${mkt.accent}55`,
                    }}
                  >
                    WeFixTrades
                  </th>
                </tr>
              </thead>
              <tbody>
                {COMPARISON_ROWS.map((row) => (
                  <tr key={row.capability} className="integrations-compare-row">
                    <th
                      scope="row"
                      style={{
                        textAlign: "left",
                        padding: "14px 16px",
                        fontSize: 14,
                        fontWeight: 600,
                        color: "rgba(255,255,255,0.85)",
                        borderBottom: "1px solid rgba(255,255,255,0.06)",
                        verticalAlign: "top",
                      }}
                    >
                      {row.capability}
                    </th>
                    <td
                      style={{
                        padding: "14px 16px",
                        fontSize: 14,
                        color: "rgba(255,255,255,0.55)",
                        borderBottom: "1px solid rgba(255,255,255,0.06)",
                        verticalAlign: "top",
                        lineHeight: 1.45,
                      }}
                    >
                      {row.them}
                    </td>
                    <td
                      style={{
                        padding: "14px 16px",
                        fontSize: 14,
                        fontWeight: 600,
                        color: "#e8efee",
                        borderBottom: "1px solid rgba(255,255,255,0.06)",
                        verticalAlign: "top",
                        lineHeight: 1.45,
                      }}
                    >
                      {row.us}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ── Responsive: flip table to stacked cards under 600px ────────
          On phones the 3-column table compresses each cell into ~80px
          of width, which truncates the "$30k+/yr in licenses" copy. The
          stacked card layout below puts the capability label as a header
          and the two contrast lines underneath, each labeled. */}
      <style>{`
        @media (max-width: 600px) {
          .integrations-compare table,
          .integrations-compare thead,
          .integrations-compare tbody,
          .integrations-compare tr,
          .integrations-compare th,
          .integrations-compare td {
            display: block;
            width: 100%;
          }
          .integrations-compare thead {
            position: absolute;
            left: -9999px;
            top: -9999px;
          }
          .integrations-compare-row {
            border: 1px solid rgba(255,255,255,0.10);
            border-radius: 12px;
            margin-bottom: 12px;
            padding: 14px 16px;
            background: rgba(255,255,255,0.02);
          }
          .integrations-compare-row > th,
          .integrations-compare-row > td {
            border: none !important;
            padding: 0 0 8px !important;
          }
          .integrations-compare-row > td:last-child {
            padding-bottom: 0 !important;
          }
          /* Pseudo-label each cell so the contrast still reads */
          .integrations-compare-row > td:nth-of-type(1)::before {
            content: "Big chains: ";
            color: rgba(255,255,255,0.40);
            font-size: 11px;
            font-weight: 700;
            letter-spacing: 0.06em;
            text-transform: uppercase;
            display: inline-block;
            margin-right: 6px;
          }
          .integrations-compare-row > td:nth-of-type(2)::before {
            content: "WeFixTrades: ";
            color: rgba(13,60,252,0.85);
            font-size: 11px;
            font-weight: 700;
            letter-spacing: 0.06em;
            text-transform: uppercase;
            display: inline-block;
            margin-right: 6px;
          }
        }
      `}</style>
    </div>
  );
}
