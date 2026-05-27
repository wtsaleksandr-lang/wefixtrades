import QuoteWidget from '@/components/quote-widget/QuoteWidget';
import AIChatBubble from '@/components/ai/AIChatBubble';
import HostedPageFrame from '@/components/hosted-page/HostedPageFrame';
import { PageMeta } from '@/components/seo/PageMeta';
import { Loader2, SearchX } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import { hostedSlugFromHost } from '@shared/slugUtils';
import { useWidgetFonts } from '@/hooks/useWidgetFonts';

/**
 * Best-effort detection of the embedding parent's origin so we never
 * leak resize messages with `'*'`. Falls back to our own origin (safer
 * than wildcard — if it doesn't match, the browser drops the message
 * silently instead of broadcasting payload to any window).
 *
 * Order of preference:
 *   1. `window.location.ancestorOrigins[0]` — exact ancestor origin
 *      (Chromium/Safari only, not exposed in Firefox).
 *   2. `document.referrer` origin — present on first navigation into
 *      the iframe; survives same-document SPA pushes too.
 *   3. `window.location.origin` — non-leaking fallback.
 */
function resolveParentOrigin(): string {
  if (typeof window === 'undefined') return '';
  try {
    const ancestors = (window.location as any).ancestorOrigins as
      | DOMStringList
      | undefined;
    if (ancestors && ancestors.length > 0) {
      const first = ancestors[0];
      if (first && first !== 'null') return first;
    }
  } catch {
    /* ancestorOrigins not available — fall through */
  }
  try {
    if (document.referrer) {
      const refOrigin = new URL(document.referrer).origin;
      if (refOrigin && refOrigin !== 'null') return refOrigin;
    }
  } catch {
    /* referrer not parseable — fall through */
  }
  return window.location.origin;
}

// Legacy CalculatorWidget is no longer rendered. QuoteWidget (v2) is the
// sole implementation. The legacy file remains in the repo untouched for
// reference but is not imported here.

// Widget fonts now loaded via the shared useWidgetFonts hook (Wave 45).

export default function Calculator() {
  const params = new URLSearchParams(window.location.search);
  // Slug comes from `?slug=` (embeds, app domain) or, failing that, from the
  // hosting subdomain ({slug}.your-quote.net).
  const slug = params.get('slug') || hostedSlugFromHost();
  const isEmbed = params.get('embed') === 'true';
  const previewToken = params.get('preview');

  // Load the QuoteWidget curated font set on mount. Was previously
  // baked into index.html (render-blocking on every marketing page);
  // Wave 45 scoped it here.
  useWidgetFonts();

  // Memoised so the ResizeObserver effect doesn't re-resolve on every
  // render. Origin is captured once at mount — the embedding parent
  // can't change without re-loading the iframe.
  const parentOrigin = useMemo(
    () => (isEmbed ? resolveParentOrigin() : ''),
    [isEmbed]
  );

  // Auto-resize: post height to parent for iframe embeds. Targets the
  // resolved parent origin (NOT `'*'`) so the payload never leaks to a
  // window that re-parented the iframe mid-session.
  useEffect(() => {
    if (!isEmbed || !slug) return;
    const targetOrigin = parentOrigin || window.location.origin;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const height = Math.ceil(entry.contentRect.height);
        try {
          window.parent.postMessage(
            { type: 'quotequick-resize', slug, height },
            targetOrigin
          );
        } catch {
          /* Cross-origin throw shouldn't happen with a string target,
             but swallow defensively so a single bad post doesn't kill
             the observer. */
        }
      }
    });
    observer.observe(document.body);
    return () => observer.disconnect();
  }, [isEmbed, slug, parentOrigin]);

  const { data: calculator, isLoading, error } = useQuery<any>({
    queryKey: ['/api/calculators/lookup', { slug, preview: previewToken }],
    queryFn: async () => {
      if (!slug) throw new Error('No slug');
      const lookupParams = new URLSearchParams({ slug });
      if (previewToken) lookupParams.set('preview', previewToken);
      const res = await fetch(`/api/calculators/lookup?${lookupParams}`);
      const data = await res.json();
      if (!res.ok || !data.calculator) throw new Error(data.error || 'Calculator not found.');
      if (!data.calculator.is_preview) {
        fetch('/api/calculators/track-view', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ calculator_id: data.calculator.id }),
        });
      }
      return data.calculator;
    },
    enabled: !!slug,
  });

  // SEO: when rendered inside a host page iframe (`?embed=true`),
  // tell crawlers to skip this URL — the host page is the canonical
  // surface, and indexing the bare /calculator iframe URL splits
  // ranking signals and surfaces an unbranded result in SERPs.
  const embedNoIndexMeta = isEmbed ? (
    <PageMeta
      title="Quote calculator"
      description="Embedded quote calculator."
      noIndex
    />
  ) : null;

  if (!slug) {
    if (!isEmbed) window.location.href = '/wizard';
    return embedNoIndexMeta;
  }

  if (isLoading) {
    return (
      <>
        {embedNoIndexMeta}
        <div data-theme="light" className={isEmbed ? 'flex items-center justify-center py-16' : 'min-h-screen flex items-center justify-center bg-slate-50'}>
          <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
        </div>
      </>
    );
  }

  if (error) {
    return (
      <>
        {embedNoIndexMeta}
        <div className={isEmbed ? 'flex items-center justify-center px-4 py-12' : 'min-h-screen flex items-center justify-center px-4 bg-slate-50'}>
          <div className="text-center">
            <SearchX className="w-10 h-10 text-slate-400 mx-auto mb-3" />
            <p className="text-slate-500 text-sm" data-testid="text-error-message">{(error as Error).message}</p>
            {!isEmbed && (
              <a
                href="/wizard"
                className="inline-block mt-4 px-5 py-2.5 rounded-xl text-sm font-semibold text-white"
                style={{ background: 'linear-gradient(135deg, #0284c7 0%, #0ea5e9 100%)' }}
                data-testid="link-create-calculator"
              >
                Create a Calculator
              </a>
            )}
          </div>
        </div>
      </>
    );
  }

  const aiEmployee = calculator?.calculator_settings?.ai_employee;
  // BD-2c-fix — previously `!isEmbed` excluded the bubble from the embedded
  // calculator widget (the most common customer-facing path), so the AI chat
  // was completely missing from QuickQuote embeds. Removed that gate. The
  // bubble uses `position: fixed`, so on iframe embeds it anchors to the
  // iframe viewport; the rescue-mode pill (see AIChatBubble.tsx) keeps it
  // out of the way until the user asks for help.
  const showChatBubble =
    aiEmployee?.enabled === true &&
    (aiEmployee?.subscription_status === 'trial' || aiEmployee?.subscription_status === 'active');

  // BD-2c — AI chat visibility mode. Free tier ALWAYS uses `'rescue'` (the
  // new BD-0 stuck-customer-rescue default). Pro/Business can opt back to
  // `'always'` via the Style tab toggle. Stored at `style.aiChatVisibility`.
  const chatVisibilityRaw =
    calculator?.calculator_settings?.advanced?.style?.aiChatVisibility;
  const planTier = calculator?.plan_tier || 'free';
  const isPaidTier =
    planTier === 'pro' || planTier === 'business' || planTier === 'starter';
  const chatVisibility: 'rescue' | 'always' =
    isPaidTier && chatVisibilityRaw === 'always' ? 'always' : 'rescue';

  const accentColor =
    calculator?.calculator_settings?.appearance?.accent_color ||
    calculator?.primary_color ||
    '#6366f1';

  const isPreview = calculator?.is_preview === true;

  // Wave P — hosted-page chrome on the public viewer.
  //   shell_settings.hostedPage carries the wizard's hosted-page choices
  //   (background, headline, card layout). Embedded widgets bypass the
  //   frame entirely — they're rendered inside the host site's own page,
  //   where adding our background would clash.
  const hostedPageSettings = calculator?.calculator_settings?.shell_settings?.hostedPage;
  const hostedLogoUrl = calculator?.logo_url ?? null;
  const hostedBusinessName: string | undefined = calculator?.business_name;
  // Wave P-H — appearance.show_powered_by drives both the header pill on
  // QuoteWidget AND the footer CTA on HostedPageFrame. Defaults true
  // (free tier); Pro plan toggles it off.
  const showBrandFooter =
    calculator?.calculator_settings?.appearance?.show_powered_by !== false;

  const widget = (
    <>
      <QuoteWidget calculator={calculator} isEmbed={isEmbed} />
      {showChatBubble && (
        <AIChatBubble
          calculatorId={calculator.id}
          accentColor={accentColor}
          businessName={calculator.business_name}
          theme={calculator.theme_overrides}
          visibility={chatVisibility}
        />
      )}
    </>
  );

  if (isEmbed) {
    return (
      <div>
        {embedNoIndexMeta}
        {widget}
      </div>
    );
  }

  return (
    <HostedPageFrame
      settings={hostedPageSettings}
      logoUrl={hostedLogoUrl}
      businessName={hostedBusinessName}
      slug={calculator?.slug ?? null}
      showBrandFooter={showBrandFooter}
    >
      {isPreview && (
        <div style={{
          maxWidth: '576px',
          margin: '0 auto 12px',
          padding: '10px 16px',
          borderRadius: '10px',
          background: '#fefce8',
          border: '1px solid #fde68a',
          fontSize: '13px',
          color: '#92400e',
          fontWeight: 500,
          textAlign: 'center',
        }}>
          Preview mode — this calculator is not live yet. Only you can see this.
        </div>
      )}
      {widget}
    </HostedPageFrame>
  );
}
