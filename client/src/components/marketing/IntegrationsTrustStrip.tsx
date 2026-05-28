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

/**
 * Wave 103 — official brand marks from simple-icons (MIT-licensed,
 * https://simpleicons.org). Each is the canonical single-path icon the
 * brand uses for compact contexts (app icons, social, favicons). The
 * monochrome marks are coloured here with each brand's published primary
 * colour, so a tradie scanning the strip sees marks they recognise
 * visually — even if they couldn't name the company.
 *
 * Vapi was swapped for Cloudflare in this wave (Alex's call). Cloudflare
 * is the rail under the WeFixTrades domain + edge cache, and the orange
 * cloud is far more recognisable to a non-technical buyer than Vapi.
 */
const INTEGRATIONS: IntegrationLogo[] = [
  {
    name: "Stripe",
    svg: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="#635BFF" aria-label="Stripe">
        <path d="M13.976 9.15c-2.172-.806-3.356-1.426-3.356-2.409 0-.831.683-1.305 1.901-1.305 2.227 0 4.515.858 6.09 1.631l.89-5.494C18.252.975 15.697 0 12.165 0 9.667 0 7.589.654 6.104 1.872 4.56 3.147 3.757 4.992 3.757 7.218c0 4.039 2.467 5.76 6.476 7.219 2.585.92 3.445 1.574 3.445 2.583 0 .98-.84 1.545-2.354 1.545-1.875 0-4.965-.921-6.99-2.109l-.9 5.555C5.175 22.99 8.385 24 11.714 24c2.641 0 4.843-.624 6.328-1.813 1.664-1.305 2.525-3.236 2.525-5.732 0-4.128-2.524-5.851-6.594-7.305h.003z"/>
      </svg>
    ),
  },
  {
    name: "Twilio",
    svg: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="#F22F46" aria-label="Twilio">
        <path d="M12 0C5.381-.008.008 5.352 0 11.971V12c0 6.64 5.359 12 12 12 6.64 0 12-5.36 12-12 0-6.641-5.36-12-12-12zm0 20.801c-4.846.015-8.786-3.904-8.801-8.75V12c-.014-4.846 3.904-8.786 8.75-8.801H12c4.847-.014 8.786 3.904 8.801 8.75V12c.015 4.847-3.904 8.786-8.75 8.801H12zm5.44-11.76c0 1.359-1.12 2.479-2.481 2.479-1.366-.007-2.472-1.113-2.479-2.479 0-1.361 1.12-2.481 2.479-2.481 1.361 0 2.481 1.12 2.481 2.481zm0 5.919c0 1.36-1.12 2.48-2.481 2.48-1.367-.008-2.473-1.114-2.479-2.48 0-1.359 1.12-2.479 2.479-2.479 1.361-.001 2.481 1.12 2.481 2.479zm-5.919 0c0 1.36-1.12 2.48-2.479 2.48-1.368-.007-2.475-1.113-2.481-2.48 0-1.359 1.12-2.479 2.481-2.479 1.358-.001 2.479 1.12 2.479 2.479zm0-5.919c0 1.359-1.12 2.479-2.479 2.479-1.367-.007-2.475-1.112-2.481-2.479 0-1.361 1.12-2.481 2.481-2.481 1.358 0 2.479 1.12 2.479 2.481z"/>
      </svg>
    ),
  },
  {
    name: "Google",
    svg: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="#4285F4" aria-label="Google">
        <path d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z"/>
      </svg>
    ),
  },
  {
    // Anthropic — angular "A" mark from the official brand assets.
    // Single path, sienna orange #D97757 (Anthropic's current primary).
    name: "Anthropic",
    svg: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="#D97757" aria-label="Anthropic">
        <path d="M17.3041 3.541h-3.6718l6.696 16.918H24Zm-10.6082 0L0 20.459h3.7442l1.3693-3.5527h7.0052l1.3693 3.5528h3.7442L10.5363 3.5409Zm-.3712 10.2232 2.2914-5.9456 2.2914 5.9456Z"/>
      </svg>
    ),
  },
  {
    // Cloudflare — replaces Vapi (Alex's call). Cloudflare runs the
    // domain edge for wefixtrades.com and is far more visually familiar
    // to a non-technical buyer than Vapi.
    name: "Cloudflare",
    svg: (
      <svg width="26" height="22" viewBox="0 0 24 24" fill="#F38020" aria-label="Cloudflare">
        <path d="M16.5088 16.8447c.1475-.5068.0908-.9707-.1553-1.3154-.2246-.3164-.6045-.499-1.0615-.5205l-8.6592-.1123a.1559.1559 0 0 1-.1333-.0713c-.0283-.042-.0351-.0986-.021-.1553.0278-.084.1123-.1484.2036-.1562l8.7359-.1123c1.0351-.0489 2.1601-.8868 2.5537-1.9136l.499-1.3013c.0215-.0561.0293-.1128.0147-.168-.5625-2.5463-2.835-4.4453-5.5499-4.4453-2.5039 0-4.6284 1.6177-5.3876 3.8614-.4927-.3658-1.1187-.5625-1.794-.499-1.2026.119-2.1665 1.083-2.2861 2.2856-.0283.31-.0069.6128.0635.894C1.5683 13.171 0 14.7754 0 16.752c0 .1748.0142.3515.0352.5273.0141.083.0844.1475.1689.1475h15.9814c.0909 0 .1758-.0645.2032-.1553l.12-.4268zm2.7568-5.5634c-.0771 0-.1611 0-.2383.0112-.0566 0-.1054.0415-.127.0976l-.3378 1.1744c-.1475.5068-.0918.9707.1543 1.3164.2256.3164.6055.498 1.0625.5195l1.8437.1133c.0557 0 .1055.0263.1329.0703.0283.043.0351.1074.0214.1562-.0283.084-.1132.1485-.204.1553l-1.921.1123c-1.041.0488-2.1582.8867-2.5527 1.914l-.1406.3585c-.0283.0713.0215.1416.0986.1416h6.5977c.0771 0 .1474-.0489.169-.126.1122-.4082.1757-.837.1757-1.2803 0-2.6025-2.125-4.727-4.7344-4.727"/>
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
