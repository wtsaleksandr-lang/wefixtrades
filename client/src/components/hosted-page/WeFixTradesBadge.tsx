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
    // Wave Q-Hotfix — exact-match the EditorTopBar `qq-editor-brand` mark
    // (favicon 14-16px + "QuoteQuick" at 12-13px font-weight 800). No pill
    // background, no border, no dot, no "by WeFixTrades" — minimal so it
    // doesn't fight the widget for attention but stays visible enough for
    // the free-tier free-advertising signal. Per user feedback, the old
    // styling was "absolutely huge and ugly".
    const style: CSSProperties = {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      textDecoration: 'none',
      fontSize: 12,
      fontWeight: 800,
      color: onDarkBackground ? '#e5e7eb' : '#0f172a',
      lineHeight: 1.3,
      whiteSpace: 'nowrap',
      opacity: 0.78,
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
        data-theme="light"
        aria-label="QuoteQuick by WeFixTrades"
        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.opacity = '1'; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = '0.78'; }}
      >
        <img
          src="/favicon.svg"
          alt=""
          width={14}
          height={14}
          style={{ width: 14, height: 14, display: 'block' }}
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
        />
        <span>QuoteQuick</span>
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
