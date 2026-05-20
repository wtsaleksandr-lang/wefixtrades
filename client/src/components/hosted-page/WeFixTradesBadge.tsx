// Wave P-H — WeFixTradesBadge.
//
// Two-variant brand badge shown on both the hosted page and embedded
// QuoteWidget so we get free advertising in exchange for the free tier.
//
// Naming: QuoteQuick is the FREE product (shows the badge);
// QuoteQuick Pro is the PAID product (hides the badge via
// appearance.show_powered_by = false). The badge text is therefore
// "QuoteQuick by WeFixTrades" — never "Pro".
//
// Variants:
//   - 'header'  → small "QuoteQuick by WeFixTrades" pill embedded at
//                 the top-left of the widget. Visible everywhere
//                 (embed + hosted) unless appearance.show_powered_by
//                 is explicitly false (Pro-plan toggle).
//   - 'footer'  → "Get your free quoting widget →" CTA. Visible only
//                 on the hosted page (rendered inside HostedPageFrame),
//                 because the embedded widget's host page may already
//                 have its own footer / we don't want to clash with it.
//
// Both link to wefixtrades.com with UTM attribution so we can measure
// click-through traffic from each. UTM medium = badge, source =
// quotequick, campaign tracks whether it fired on hosted vs embed.

import type { CSSProperties } from 'react';

interface Props {
  variant: 'header' | 'footer';
  /** When false (Pro plan toggle), the badge is suppressed. Defaults true. */
  show?: boolean;
  /** UTM context — `hosted` from HostedPageFrame, `embed` everywhere else. */
  context?: 'hosted' | 'embed';
  /** Optional slug carried into the UTM campaign for per-calculator reporting. */
  slug?: string | null;
  /** Optional override for the inline color (used when the host background
   *  is dark — keeps the text readable). */
  onDarkBackground?: boolean;
}

const HOMEPAGE = 'https://wefixtrades.com';

function buildUrl(context: 'hosted' | 'embed', slug?: string | null): string {
  const params = new URLSearchParams({
    utm_source: 'quotequick',
    utm_medium: 'badge',
    utm_campaign: context === 'hosted' ? 'hosted_widget' : 'embed_widget',
  });
  if (slug) params.set('utm_content', slug);
  return `${HOMEPAGE}/?${params.toString()}`;
}

export default function WeFixTradesBadge({
  variant, show = true, context = 'hosted', slug, onDarkBackground = false,
}: Props) {
  if (!show) return null;
  const url = buildUrl(context, slug ?? undefined);

  if (variant === 'header') {
    const style: CSSProperties = {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      padding: '4px 10px',
      borderRadius: 999,
      background: onDarkBackground ? 'rgba(255,255,255,0.10)' : 'rgba(13,60,252,0.08)',
      border: `1px solid ${onDarkBackground ? 'rgba(255,255,255,0.18)' : 'rgba(13,60,252,0.24)'}`,
      color: onDarkBackground ? '#e5e7eb' : '#0d3cfc',
      fontSize: 11,
      fontWeight: 700,
      letterSpacing: 0.1,
      textDecoration: 'none',
      lineHeight: 1.3,
      whiteSpace: 'nowrap',
      transition: 'opacity 0.12s ease',
    };
    return (
      <a
        href={url}
        target="_blank"
        rel="noreferrer noopener"
        style={style}
        data-testid="wefixtrades-badge-header"
        data-context={context}
        aria-label="QuoteQuick by WeFixTrades"
      >
        <span aria-hidden="true" style={{
          display: 'inline-block', width: 6, height: 6, borderRadius: 999,
          background: onDarkBackground ? '#7ab2ff' : '#0d3cfc',
        }} />
        QuoteQuick by WeFixTrades
      </a>
    );
  }

  // Footer variant — clickable banner under the hosted card.
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer noopener"
      data-testid="wefixtrades-badge-footer"
      data-context={context}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: '10px 16px',
        margin: '24px auto 0',
        borderRadius: 999,
        background: onDarkBackground ? 'rgba(255,255,255,0.10)' : '#fff',
        border: `1px solid ${onDarkBackground ? 'rgba(255,255,255,0.20)' : 'rgba(13,60,252,0.20)'}`,
        boxShadow: onDarkBackground ? 'none' : '0 6px 16px rgba(15,23,42,0.10)',
        color: onDarkBackground ? '#e5e7eb' : '#0d3cfc',
        fontSize: 13,
        fontWeight: 700,
        textDecoration: 'none',
        whiteSpace: 'nowrap',
      }}
    >
      <span aria-hidden="true" style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 18, height: 18, borderRadius: 999,
        background: onDarkBackground ? '#7ab2ff' : '#0d3cfc',
        color: '#fff', fontSize: 11, fontWeight: 800,
      }}>Q</span>
      Get your free quoting widget
      <span aria-hidden="true" style={{ fontWeight: 700, marginLeft: 4 }}>→</span>
    </a>
  );
}
