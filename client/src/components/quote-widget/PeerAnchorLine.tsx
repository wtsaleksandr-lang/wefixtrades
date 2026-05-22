/**
 * BD-2c — Peer-anchor ZIP line.
 *
 * Research (BD-0 punch list):
 *  - "Most homeowners in [ZIP] pay $X" peer-anchor line below the range or
 *    single-price ([personyze.com](https://www.personyze.com/blog/personalization-blog/)).
 *
 * Renders directly below the result-panel headline. Data priority:
 *
 *   1. If the business has >= 5 prior quotes for this calculator in the
 *      customer's ZIP, render with the computed median + "in <ZIP>" suffix.
 *   2. If sample size < 5, drop the "in <ZIP>" suffix but still anchor on
 *      the template's base price ("Most homeowners pay around $X").
 *   3. If `zip` is null OR `calculatorId` is missing, render `null`.
 *
 * Endpoint: `GET /api/calculator/peer-median?calculator_id=X&zip=Y` →
 *           `{ median?: number, sampleSize: number }`.
 *
 * Brand-blue accent (`#0d3cfc`) on the dollar number, per BD-2c spec.
 */
import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import type { WidgetTheme } from './widgetThemes';

interface Props {
  /** Numeric calculator id. When absent, the line renders `null`. */
  calculatorId?: number;
  /** ZIP / postal code captured from address autocomplete or a ZIP field. */
  zip?: string | null;
  /** Template's base (non-tier-adjusted) quote — fallback anchor for low-sample ZIPs. */
  baseQuote?: number;
  /** Resolved widget theme. */
  theme: WidgetTheme;
  /** Style-tab font stack. */
  fontFamily?: string;
  /** Override the brand-blue accent (defaults to the BD-2c brand blue). */
  brandBlue?: string;
}

interface PeerMedianResponse {
  median?: number;
  sampleSize: number;
}

/** Quick currency format — `$X,XXX`. */
function formatMoney(n: number): string {
  const rounded = Math.round(n / 25) * 25;
  return '$' + rounded.toLocaleString('en-US');
}

export default function PeerAnchorLine({
  calculatorId, zip, baseQuote,
  theme, fontFamily, brandBlue = '#0d3cfc',
}: Props) {
  const [data, setData] = useState<PeerMedianResponse | null>(null);

  useEffect(() => {
    // Hide when we have neither ZIP nor a calculator id — without ZIP the
    // line has no peer-group context, and without calculatorId the endpoint
    // returns the wrong template's data.
    if (!zip || typeof calculatorId !== 'number') {
      setData(null);
      return;
    }
    let cancelled = false;
    fetch(
      `/api/calculator/peer-median?calculator_id=${encodeURIComponent(String(calculatorId))}&zip=${encodeURIComponent(zip)}`,
    )
      .then((res) => (res.ok ? res.json() : Promise.reject(res.status)))
      .then((json: PeerMedianResponse) => {
        if (cancelled) return;
        if (json && typeof json.sampleSize === 'number') {
          setData(json);
        }
      })
      .catch(() => {
        // Silent — fall through to the base-quote anchor below.
      });
    return () => { cancelled = true; };
  }, [calculatorId, zip]);

  // No ZIP = hide entirely (per BD-2c spec).
  if (!zip) return null;

  let anchor: number | null = null;
  let includeZip = false;
  if (data && typeof data.median === 'number' && data.sampleSize >= 5) {
    anchor = data.median;
    includeZip = true;
  } else if (typeof baseQuote === 'number' && Number.isFinite(baseQuote) && baseQuote > 0) {
    anchor = baseQuote;
    includeZip = false;
  }
  if (anchor === null) return null;

  const containerStyle: CSSProperties = {
    margin: '6px 0 0 0',
    fontSize: 12,
    color: theme.resultMuted ?? theme.textMuted,
    fontFamily,
    lineHeight: 1.5,
  };
  const moneyStyle: CSSProperties = {
    color: brandBlue, fontWeight: 800,
  };

  return (
    <p
      data-testid="peer-anchor-line"
      data-zip={includeZip ? zip : undefined}
      style={containerStyle}
    >
      Most homeowners
      {includeZip ? ` in ${zip}` : ''}
      {' '}pay around{' '}
      <span style={moneyStyle}>{formatMoney(anchor)}</span>
    </p>
  );
}
