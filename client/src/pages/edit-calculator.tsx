// Edit calculator page — manages business details, branding, pricing, lead form, and deployment.
import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, AlertTriangle, Check, Copy, ExternalLink, RefreshCw, Lock, Building2, Palette, MessageSquare, Save, Clock, ChevronDown, Calculator, Eye, Globe, Link2, CheckCircle2, XCircle } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { trackEvent } from '@/lib/trackEvent';
import { isValidSlug, HOSTING_DOMAIN } from '@shared/slugUtils';
import { validatePricingConfig, type PricingConfigV1 } from '@shared/pricingConfig';
import PricingConfigEditor from '@/components/calculator/PricingConfigEditor';

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); trackEvent('calculator_link_copied'); };
  return (
    <button onClick={copy} className="p-1.5 rounded-md hover:bg-slate-100 flex-shrink-0 transition-colors" data-testid="button-copy" data-theme="light">
      {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4 text-slate-400" />}
    </button>
  );
}

function UrlRow({ url }: { url: string }) {
  return (
    <div className="flex items-center gap-2 bg-slate-50 rounded-lg px-3 py-2.5 border border-slate-200">
      <span className="text-sm text-slate-600 flex-1 truncate font-mono text-xs">{url}</span>
      <CopyButton text={url} />
    </div>
  );
}

function SectionHeader({ icon: Icon, title, iconBg, iconColor }: { icon: any; title: string; iconBg?: string; iconColor?: string }) {
  return (
    <div className="flex items-center gap-2.5 mb-4">
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${iconBg || 'bg-emerald-50'}`}>
        <Icon className={`w-4 h-4 ${iconColor || 'text-emerald-700'}`} />
      </div>
      <h3 className="font-semibold text-slate-800 text-sm">{title}</h3>
    </div>
  );
}

function SkeletonLoader() {
  return (
    <div className="min-h-screen bg-slate-50 px-4 py-8">
      <div className="max-w-2xl mx-auto">
        <div className="skeleton-shimmer h-8 w-48 rounded-lg mb-2" />
        <div className="skeleton-shimmer h-4 w-72 rounded mb-6" />
        <div className="flex gap-2 mb-6">
          <div className="skeleton-shimmer h-9 w-32 rounded-md" />
          <div className="skeleton-shimmer h-9 w-24 rounded-md" />
        </div>
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-white rounded-xl border border-slate-200 p-5">
              <div className="skeleton-shimmer h-5 w-36 rounded mb-4" />
              <div className="skeleton-shimmer h-10 w-full rounded-md mb-3" />
              <div className="skeleton-shimmer h-10 w-full rounded-md" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const PRESET_COLORS = ['#0284C7', '#0ea5e9', '#2563EB', '#059669', '#f59e0b', '#ef4444', '#7C3AED', '#ec4899'];

/* ─── Deploy Section ─── */

function DeployCopyRow({ label, code, testId }: { label: string; code: string; testId: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => { navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 2000); trackEvent('calculator_embed_copied', { type: label }); };
  return (
    <div className="mt-2">
      <div className="flex items-center justify-between bg-slate-900 rounded-lg px-3 py-2.5">
        <pre className="text-xs text-slate-300 font-mono flex-1 truncate mr-3 whitespace-pre-wrap" style={{ margin: 0 }}>{code}</pre>
        <button onClick={copy} className="flex-shrink-0 flex items-center gap-1 text-xs font-medium text-slate-400 hover:text-white transition-colors px-2 py-1 rounded" data-testid={testId}>
          {copied ? <><Check className="w-3 h-3" /> Copied</> : <><Copy className="w-3 h-3" /> Copy</>}
        </button>
      </div>
    </div>
  );
}

function ChangeUrlSection({ calculatorId, currentSlug, token, onSlugChanged }: {
  calculatorId: number;
  currentSlug: string;
  token: string;
  onSlugChanged: (newSlug: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [newSlug, setNewSlug] = useState(currentSlug);
  const [availability, setAvailability] = useState<{ checking: boolean; available: boolean | null; error?: string }>({
    checking: false, available: null,
  });
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  // Sync local slug state when currentSlug changes (after save)
  useEffect(() => {
    setNewSlug(currentSlug);
  }, [currentSlug]);

  const handleInput = (raw: string) => {
    const cleaned = raw.toLowerCase().replace(/[^a-z0-9-]/g, '').replace(/--+/g, '-').slice(0, 30);
    setNewSlug(cleaned);
    setSaveStatus('idle');
  };

  // Debounced availability check
  useEffect(() => {
    if (newSlug === currentSlug || newSlug.length < 3) {
      setAvailability({ checking: false, available: null });
      return;
    }

    const validation = isValidSlug(newSlug);
    if (!validation.valid) {
      setAvailability({ checking: false, available: false, error: validation.reason });
      return;
    }

    setAvailability({ checking: true, available: null });
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/calculators/check-slug?slug=${encodeURIComponent(newSlug)}`);
        const data = await res.json();
        setAvailability({ checking: false, available: data.available, error: data.error });
      } catch {
        setAvailability({ checking: false, available: null, error: 'Could not check availability' });
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [newSlug, currentSlug]);

  const handleSave = async () => {
    if (newSlug === currentSlug || !availability.available) return;
    setSaveStatus('saving');
    try {
      const res = await apiRequest('PATCH', `/api/calculators/${calculatorId}/slug`, {
        token,
        new_slug: newSlug,
      });
      const data = await res.json();
      if (data.success) {
        setSaveStatus('saved');
        onSlugChanged(newSlug);
        trackEvent('calculator_slug_changed', { old_slug: currentSlug, new_slug: newSlug });
        setTimeout(() => setSaveStatus('idle'), 3000);
      } else {
        setSaveStatus('error');
        setErrorMessage(data.error || 'Failed to change URL');
      }
    } catch (err: any) {
      setSaveStatus('error');
      setErrorMessage(err?.message || 'Failed to change URL');
    }
  };

  const canSave = newSlug !== currentSlug && newSlug.length >= 3 && availability.available === true && saveStatus !== 'saving';

  return (
    <Card className="shadow-sm mb-5 animate-fade-in-up animation-delay-150" data-testid="change-url-section">
      <CardContent className="p-6">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center justify-between w-full text-left"
          data-testid="toggle-change-url"
        >
          <SectionHeader icon={Link2} title="Change URL" iconBg="bg-violet-50" iconColor="text-violet-700" />
          <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </button>

        {expanded && (
          <div className="mt-3 animate-fade-in-up" data-testid="change-url-form">
            <p className="text-xs text-slate-500 mb-3 leading-relaxed">
              Change the URL slug for your calculator. Old URLs will redirect for 30 days.
            </p>

            {/* Current URL */}
            <div className="mb-3">
              <Label className="text-xs font-semibold text-slate-400 mb-1 block">Current URL</Label>
              <div className="flex items-center gap-2 bg-slate-50 rounded-lg px-3 py-2 border border-slate-200">
                <span className="text-xs text-slate-500 font-mono flex-1">{currentSlug}.{HOSTING_DOMAIN}</span>
              </div>
            </div>

            {/* New slug input */}
            <div className="mb-3">
              <Label className="text-xs font-semibold text-slate-500 mb-1 block">New URL</Label>
              <div className="relative">
                <input
                  data-testid="input-change-slug"
                  type="text"
                  value={newSlug}
                  onChange={e => handleInput(e.target.value)}
                  maxLength={30}
                  className="w-full px-3 py-2.5 rounded-lg border text-sm font-mono pr-10"
                  style={{
                    borderColor: newSlug !== currentSlug && availability.available === true ? '#059669' :
                      newSlug !== currentSlug && availability.available === false ? '#EF4444' : undefined,
                  }}
                />
                {newSlug !== currentSlug && newSlug.length >= 3 && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    {availability.checking && <Loader2 className="w-4 h-4 text-slate-400 animate-spin" />}
                    {!availability.checking && availability.available === true && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
                    {!availability.checking && availability.available === false && <XCircle className="w-4 h-4 text-red-500" />}
                  </div>
                )}
              </div>
              {/* Preview */}
              <p className="text-xs text-slate-400 mt-1 font-mono">
                https://{newSlug || '...'}.{HOSTING_DOMAIN}
              </p>
              {/* Status */}
              {newSlug !== currentSlug && newSlug.length >= 3 && !availability.checking && (
                <p className={`text-xs mt-1 font-medium ${availability.available ? 'text-emerald-600' : 'text-red-500'}`}>
                  {availability.available ? 'Available' : (availability.error || 'Already taken')}
                </p>
              )}
            </div>

            <div className="flex gap-2">
              <Button
                onClick={handleSave}
                disabled={!canSave}
                size="sm"
                className={`${saveStatus === 'saved' ? 'bg-emerald-600' : 'bg-violet-600 hover:bg-violet-700'}`}
                data-testid="button-save-slug"
              >
                {saveStatus === 'saving' ? (
                  <><Loader2 className="mr-1.5 w-3.5 h-3.5 animate-spin" /> Changing...</>
                ) : saveStatus === 'saved' ? (
                  <><Check className="mr-1.5 w-3.5 h-3.5" /> Changed</>
                ) : (
                  'Update URL'
                )}
              </Button>
              {newSlug !== currentSlug && (
                <Button
                  onClick={() => { setNewSlug(currentSlug); setSaveStatus('idle'); }}
                  size="sm"
                  variant="outline"
                >
                  Cancel
                </Button>
              )}
            </div>

            {saveStatus === 'error' && (
              <div className="mt-2 p-2 rounded-lg bg-red-50 border border-red-200 flex items-center gap-2">
                <AlertTriangle className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />
                <span className="text-xs text-red-600">{errorMessage}</span>
              </div>
            )}

            <p className="text-xs text-slate-400 mt-3">
              Old URLs automatically redirect to the new one for 30 days.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function DeploySection({ slug, origin }: { slug: string; origin: string }) {
  const [showEmbed, setShowEmbed] = useState(false);
  const hostedUrl = `${slug}.${HOSTING_DOMAIN}`;
  const inlineEmbed = `<script src="${origin}/embed-widget.js"\n  data-calculator-slug="${slug}"\n  async>\n</script>\n<div id="quotequick-widget"></div>`;
  const popupEmbed = `<script src="${origin}/embed-widget.js"\n  data-calculator-slug="${slug}"\n  data-mode="popup"\n  data-button-label="Get a Free Quote"\n  async>\n</script>`;

  return (
    <Card className="shadow-sm mb-5 animate-fade-in-up animation-delay-150" data-testid="deploy-section">
      <CardContent className="p-6">
        <SectionHeader icon={Globe} title="Deploy Your Calculator" iconBg="bg-emerald-50" iconColor="text-emerald-700" />

        {/* Share a Link */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-1.5">
            <Label className="text-xs font-semibold text-slate-500">Share a Link</Label>
            <span className="text-xs text-slate-400">No website needed</span>
          </div>
          <div className="flex items-center gap-2 bg-emerald-50 rounded-lg px-3 py-2.5 border border-emerald-100">
            <span className="text-sm text-emerald-700 flex-1 truncate font-mono text-xs font-semibold">{hostedUrl}</span>
            <CopyButton text={`https://${hostedUrl}`} />
          </div>
        </div>

        {/* Add to Website */}
        <div className="mb-4">
          <button
            onClick={() => setShowEmbed(!showEmbed)}
            className="flex items-center justify-between w-full text-left"
            data-testid="toggle-embed-code"
          >
            <div>
              <Label className="text-xs font-semibold text-slate-500 cursor-pointer">Add to Your Website</Label>
              <p className="text-xs text-slate-400 mt-0.5">Paste code into your site to show the calculator.</p>
            </div>
            <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${showEmbed ? 'rotate-180' : ''}`} />
          </button>

          {showEmbed && (
            <div className="mt-3 space-y-4 animate-fade-in-up">
              <div>
                <p className="text-xs font-semibold text-slate-500 mb-1">Inline Widget</p>
                <p className="text-xs text-slate-400">Paste this where you want the calculator to appear on your page.</p>
                <DeployCopyRow label="Inline" code={inlineEmbed} testId="copy-inline-embed" />
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-500 mb-1">Popup Button</p>
                <p className="text-xs text-slate-400">Adds a floating "Get a Free Quote" button to your site.</p>
                <DeployCopyRow label="Popup" code={popupEmbed} testId="copy-popup-embed" />
              </div>
            </div>
          )}
        </div>

        {/* Recovery note */}
        <p className="text-xs text-slate-400 mt-2 leading-relaxed">
          You can come back to this page anytime to copy your link or embed code.
        </p>
      </CardContent>
    </Card>
  );
}

export default function EditCalculator() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get('token');
  const qc = useQueryClient();

  const [editData, setEditData] = useState<any>({});
  const [pricingConfig, setPricingConfig] = useState<PricingConfigV1 | null>(null);
  const [saved, setSaved] = useState(false);
  const [duplicateResult, setDuplicateResult] = useState<any>(null);
  const [currentSlug, setCurrentSlug] = useState<string>('');

  const { data: calcData, isLoading, error: loadError } = useQuery<any>({
    queryKey: ['/api/calculators/lookup', { token }],
    queryFn: async () => {
      if (!token) throw new Error('No edit token provided.');
      const res = await fetch(`/api/calculators/lookup?token=${token}`);
      const json = await res.json();
      if (!res.ok || !json.calculator) throw new Error(json.error || 'Invalid token.');
      return json.calculator;
    },
    enabled: !!token,
  });

  const calculator = calcData;

  useEffect(() => {
    if (calculator && Object.keys(editData).length === 0) {
      setEditData(calculator);
      // Normalise pricing_config to a valid PricingConfigV1 (invalid/legacy
      // shapes fall back to call-for-quote — never crash the editor).
      if (calculator.pricing_config) {
        setPricingConfig(validatePricingConfig(calculator.pricing_config).config);
      }
    }
    if (calculator?.slug && !currentSlug) {
      setCurrentSlug(calculator.slug);
    }
  }, [calculator]);

  const saveMutation = useMutation({
    mutationFn: async (updates: any) => {
      const res = await apiRequest('PATCH', '/api/calculators', { token, updates });
      return res.json();
    },
    onSuccess: () => {
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    },
  });

  const duplicateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/calculators/duplicate', { token });
      return res.json();
    },
    onSuccess: (data) => {
      setDuplicateResult(data);
    },
  });

  const set = (key: string, val: string) => setEditData((prev: any) => ({ ...prev, [key]: val }));

  const handleSave = useCallback(() => {
    const allowedKeys = [
      'business_name', 'tagline', 'logo_url', 'owner_email', 'owner_phone',
      'website_url', 'primary_color', 'cta_button_text', 'lead_thank_you_message',
      'theme_overrides', 'pricing_config', 'calculator_settings',
    ];
    const updates: Record<string, any> = {};
    for (const key of allowedKeys) {
      if (key === 'pricing_config') continue;
      const val = editData[key];
      if (val !== undefined && val !== null) {
        updates[key] = val;
      }
    }
    if (pricingConfig) {
      updates.pricing_config = pricingConfig;
    }
    saveMutation.mutate(updates);
  }, [editData, pricingConfig]);

  if (!token) return (
    <div className="min-h-screen flex items-center justify-center px-4 gradient-mesh">
      <div className="text-center animate-fade-in-up">
        <div className="w-16 h-16 rounded-2xl bg-amber-50 flex items-center justify-center mx-auto mb-5 border border-amber-100">
          <AlertTriangle className="w-7 h-7 text-amber-500" />
        </div>
        <h2 className="text-xl font-bold text-slate-800 mb-2" data-testid="text-error">Access Error</h2>
        <p className="text-slate-500 text-sm">No edit token provided in the URL.</p>
      </div>
    </div>
  );

  if (isLoading) return <SkeletonLoader />;

  if (loadError) return (
    <div className="min-h-screen flex items-center justify-center px-4 gradient-mesh">
      <div className="text-center animate-fade-in-up">
        <div className="w-16 h-16 rounded-2xl bg-amber-50 flex items-center justify-center mx-auto mb-5 border border-amber-100">
          <AlertTriangle className="w-7 h-7 text-amber-500" />
        </div>
        <h2 className="text-xl font-bold text-slate-800 mb-2" data-testid="text-error">Access Error</h2>
        <p className="text-slate-500 text-sm">{(loadError as Error).message}</p>
      </div>
    </div>
  );

  if (!calculator) return null;

  const origin = window.location.origin;
  const calcUrl = `${origin}/Calculator?slug=${calculator.slug}`;
  const leadsUrl = `${origin}/Leads?token=${token}`;
  const isExpired = calculator.is_token_expired;

  if (isExpired) {
    return (
      <div className="min-h-screen gradient-mesh px-4 py-12">
        <div className="max-w-xl mx-auto animate-fade-in-up">
          <Card className="border-amber-200/60 shadow-lg">
            <CardContent className="p-8 text-center">
              <div className="w-16 h-16 rounded-2xl bg-amber-50 flex items-center justify-center mx-auto mb-5 border border-amber-100">
                <Lock className="w-7 h-7 text-amber-500" />
              </div>
              <h2 className="text-xl font-bold text-slate-900 mb-2" data-testid="text-expired">Edit Access Expired</h2>
              <p className="text-slate-600 mb-1.5 text-sm">The 7-day edit window for <strong>{calculator.business_name}</strong> has ended.</p>
              <p className="text-xs text-slate-400 mb-6">Your calculator is still live. Duplicate it to get a fresh 7-day edit period.</p>
              <div className="mb-6 text-left">
                <Label className="text-xs text-slate-500 mb-1.5 block font-semibold">Current Calculator URL</Label>
                <UrlRow url={calcUrl} />
              </div>
              {duplicateResult ? (
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-5 text-left space-y-3 animate-scale-in">
                  <div className="flex items-center gap-2 mb-3">
                    <Check className="w-5 h-5 text-emerald-600" />
                    <h3 className="font-semibold text-emerald-800 text-sm">Duplicated Successfully</h3>
                  </div>
                  <div>
                    <Label className="text-xs text-emerald-700 font-semibold">New Calculator URL</Label>
                    <UrlRow url={`${origin}/Calculator?slug=${duplicateResult.new_slug}`} />
                  </div>
                  <div>
                    <Label className="text-xs text-emerald-700 font-semibold">New Edit Link (7 days)</Label>
                    <UrlRow url={`${origin}/EditCalculator?token=${duplicateResult.new_token}`} />
                  </div>
                </div>
              ) : (
                <Button onClick={() => duplicateMutation.mutate()} disabled={duplicateMutation.isPending || calculator.is_duplicated} className="w-full bg-emerald-700 hover:bg-emerald-800 h-11" data-testid="button-duplicate">
                  {duplicateMutation.isPending ? <><Loader2 className="mr-2 w-4 h-4 animate-spin" /> Duplicating...</> : <><RefreshCw className="mr-2 w-4 h-4" /> Duplicate & Get New Edit Period</>}
                </Button>
              )}
              {duplicateMutation.error && (
                <div className="mt-3 p-3 rounded-lg bg-red-50 border border-red-200 flex items-center gap-2 animate-fade-in">
                  <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0" />
                  <span className="text-sm text-red-700">{(duplicateMutation.error as Error).message}</span>
                </div>
              )}
              {calculator.is_duplicated && !duplicateResult && (
                <p className="text-sm text-slate-400 mt-4">This calculator has already been duplicated.</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const expiryDate = new Date(calculator.token_expires_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-8">
      <div className="max-w-2xl mx-auto">
        <div className="mb-7 animate-fade-in-up">
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight" data-testid="text-edit-title">Edit Calculator</h1>
          <div className="flex items-center gap-2 mt-1.5">
            <span className="text-slate-500 text-sm">{calculator.business_name}</span>
            <span className="text-slate-300">|</span>
            <span className="inline-flex items-center gap-1 text-xs text-amber-600 font-medium bg-amber-50 px-2 py-0.5 rounded-full border border-amber-100">
              <Clock className="w-3 h-3" /> Expires {expiryDate}
            </span>
          </div>
        </div>

        <div className="flex gap-2 mb-7 flex-wrap animate-fade-in-up animation-delay-100">
          <a href={`${calcUrl}&preview=${token}`} target="_blank" rel="noopener noreferrer">
            <Button size="sm" variant="outline" data-testid="link-preview-calculator"><Eye className="mr-1.5 w-3.5 h-3.5" /> Preview</Button>
          </a>
          <a href={calcUrl} target="_blank" rel="noopener noreferrer">
            <Button size="sm" variant="outline" data-testid="link-view-calculator"><ExternalLink className="mr-1.5 w-3.5 h-3.5" /> View Live</Button>
          </a>
          <a href={leadsUrl}>
            <Button size="sm" variant="outline" data-testid="link-view-leads">View Leads</Button>
          </a>
        </div>

        {/* ─── Deploy Section ─── */}
        <DeploySection slug={currentSlug || calculator.slug} origin={origin} />

        <ChangeUrlSection
          calculatorId={calculator.id}
          currentSlug={currentSlug || calculator.slug}
          token={token!}
          onSlugChanged={(newSlug) => {
            setCurrentSlug(newSlug);
            qc.invalidateQueries({ queryKey: ['/api/calculators/lookup', { token }] });
          }}
        />

        <div className="space-y-5 animate-fade-in-up animation-delay-200">
          <Card className="shadow-sm">
            <CardContent className="p-6">
              <SectionHeader icon={Building2} title="Business Details" />
              <div className="space-y-4">
                <div>
                  <Label className="text-xs font-semibold text-slate-500">Business Name</Label>
                  <Input className="mt-1.5 premium-input" value={editData.business_name || ''} onChange={e => set('business_name', e.target.value)} data-testid="input-edit-business-name" />
                </div>
                <div>
                  <Label className="text-xs font-semibold text-slate-500">Tagline</Label>
                  <Input className="mt-1.5 premium-input" value={editData.tagline || ''} onChange={e => set('tagline', e.target.value)} data-testid="input-edit-tagline" placeholder="e.g., Fast, reliable service you can trust" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardContent className="p-6">
              <SectionHeader icon={Palette} title="Branding" />
              <div className="space-y-4">
                <div>
                  <Label className="text-xs font-semibold text-slate-500">Brand Color</Label>
                  <div className="flex gap-2.5 mt-2.5 flex-wrap items-center">
                    {PRESET_COLORS.map(color => (
                      <button key={color} onClick={() => set('primary_color', color)}
                        className={`w-9 h-9 rounded-full transition-all ${editData.primary_color === color ? 'ring-2 ring-offset-2 ring-slate-800 scale-110' : 'hover:scale-105'}`}
                        style={{ backgroundColor: color, boxShadow: editData.primary_color === color ? `0 4px 12px ${color}40` : '0 1px 3px rgba(0,0,0,0.1)' }}
                        data-testid={`color-${color.replace('#', '')}`} />
                    ))}
                    <div className="w-px h-6 bg-slate-200 mx-1" />
                    <input type="color" data-testid="input-edit-custom-color" value={editData.primary_color || '#0284C7'} onChange={e => set('primary_color', e.target.value)}
                      className="w-9 h-9 rounded-full border-2 border-slate-200 cursor-pointer p-0.5 bg-white" />
                  </div>
                </div>
                <div>
                  <Label className="text-xs font-semibold text-slate-500">Logo URL</Label>
                  <Input className="mt-1.5 premium-input" value={editData.logo_url || ''} onChange={e => set('logo_url', e.target.value)} placeholder="https://..." data-testid="input-edit-logo" />
                </div>
              </div>
            </CardContent>
          </Card>

          {pricingConfig && (
            <Card className="shadow-sm border-emerald-100" data-testid="section-pricing">
              <CardContent className="p-6">
                <SectionHeader icon={Calculator} title="Pricing" iconBg="bg-emerald-50" iconColor="text-emerald-600" />
                <p className="text-xs text-slate-400 -mt-2 mb-5">Set how your calculator prices jobs. Changes go live when you save.</p>
                <PricingConfigEditor config={pricingConfig} onChange={setPricingConfig} />
              </CardContent>
            </Card>
          )}

          <Card className="shadow-sm">
            <CardContent className="p-6">
              <SectionHeader icon={MessageSquare} title="Lead Form Settings" />
              <div className="space-y-4">
                <div>
                  <Label className="text-xs font-semibold text-slate-500">CTA Button Text</Label>
                  <Input className="mt-1.5 premium-input" value={editData.cta_button_text || ''} onChange={e => set('cta_button_text', e.target.value)} data-testid="input-edit-cta" placeholder="e.g., Get My Free Quote" />
                </div>
                <div>
                  <Label className="text-xs font-semibold text-slate-500">Thank You Message</Label>
                  <Input className="mt-1.5 premium-input" value={editData.lead_thank_you_message || ''} onChange={e => set('lead_thank_you_message', e.target.value)} data-testid="input-edit-thankyou" placeholder="e.g., Thanks! We'll call you within 24 hours." />
                </div>
                <div>
                  <Label className="text-xs font-semibold text-slate-500">Your Email (for lead notifications)</Label>
                  <Input className="mt-1.5 premium-input" type="email" value={editData.owner_email || ''} onChange={e => set('owner_email', e.target.value)} data-testid="input-edit-email" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="mt-7 animate-fade-in-up animation-delay-300">
          <Button
            onClick={handleSave}
            disabled={saveMutation.isPending}
            className={`w-full h-12 text-sm font-semibold transition-all ${saved ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-emerald-700 hover:bg-emerald-800'}`}
            data-testid="button-save"
          >
            {saveMutation.isPending ? (
              <><Loader2 className="mr-2 w-4 h-4 animate-spin" /> Saving...</>
            ) : saved ? (
              <><Check className="mr-2 w-4 h-4" /> Saved Successfully</>
            ) : (
              <><Save className="mr-2 w-4 h-4" /> Save Changes</>
            )}
          </Button>
          {saveMutation.error && (
            <div className="mt-3 p-3 rounded-lg bg-red-50 border border-red-200 flex items-center gap-2 animate-fade-in">
              <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0" />
              <span className="text-sm text-red-700">{(saveMutation.error as Error).message}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
