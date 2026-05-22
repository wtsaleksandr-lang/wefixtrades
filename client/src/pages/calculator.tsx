import QuoteWidget from '@/components/quote-widget/QuoteWidget';
import AIChatBubble from '@/components/ai/AIChatBubble';
import HostedPageFrame from '@/components/hosted-page/HostedPageFrame';
import { Loader2, SearchX } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { hostedSlugFromHost } from '@shared/slugUtils';

// Legacy CalculatorWidget is no longer rendered. QuoteWidget (v2) is the
// sole implementation. The legacy file remains in the repo untouched for
// reference but is not imported here.

/** Inject widget fonts if not already present (needed for iframe embeds on external sites) */
function useEmbedFonts(isEmbed: boolean) {
  useEffect(() => {
    if (!isEmbed) return;
    if (document.querySelector('link[data-quotequick-fonts]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.dataset.quotequickFonts = '1';
    link.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap';
    document.head.appendChild(link);
  }, [isEmbed]);
}

export default function Calculator() {
  const params = new URLSearchParams(window.location.search);
  // Slug comes from `?slug=` (embeds, app domain) or, failing that, from the
  // hosting subdomain ({slug}.your-quote.net).
  const slug = params.get('slug') || hostedSlugFromHost();
  const isEmbed = params.get('embed') === 'true';
  const previewToken = params.get('preview');

  useEmbedFonts(isEmbed);

  // Auto-resize: post height to parent for iframe embeds
  useEffect(() => {
    if (!isEmbed || !slug) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const height = Math.ceil(entry.contentRect.height);
        window.parent.postMessage({ type: 'quotequick-resize', slug, height }, '*');
      }
    });
    observer.observe(document.body);
    return () => observer.disconnect();
  }, [isEmbed, slug]);

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

  if (!slug) {
    if (!isEmbed) window.location.href = '/Wizard';
    return null;
  }

  if (isLoading) {
    return (
      <div className={isEmbed ? 'flex items-center justify-center py-16' : 'min-h-screen flex items-center justify-center bg-slate-50'}>
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className={isEmbed ? 'flex items-center justify-center px-4 py-12' : 'min-h-screen flex items-center justify-center px-4 bg-slate-50'}>
        <div className="text-center">
          <SearchX className="w-10 h-10 text-slate-400 mx-auto mb-3" />
          <p className="text-slate-500 text-sm" data-testid="text-error-message">{(error as Error).message}</p>
          {!isEmbed && (
            <a
              href="/Wizard"
              className="inline-block mt-4 px-5 py-2.5 rounded-xl text-sm font-semibold text-white"
              style={{ background: 'linear-gradient(135deg, #0284c7 0%, #0ea5e9 100%)' }}
              data-testid="link-create-calculator"
            >
              Create a Calculator
            </a>
          )}
        </div>
      </div>
    );
  }

  const aiEmployee = calculator?.calculator_settings?.ai_employee;
  const showChatBubble =
    !isEmbed &&
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
