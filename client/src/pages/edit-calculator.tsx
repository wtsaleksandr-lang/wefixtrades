import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, AlertTriangle, Check, Copy, ExternalLink, RefreshCw, Lock, Building2, Palette, MessageSquare, Save, Clock } from 'lucide-react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); };
  return (
    <button onClick={copy} className="p-1.5 rounded-md hover:bg-slate-100 flex-shrink-0 transition-colors" data-testid="button-copy">
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

function SectionHeader({ icon: Icon, title }: { icon: any; title: string }) {
  return (
    <div className="flex items-center gap-2.5 mb-4">
      <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center">
        <Icon className="w-4 h-4 text-indigo-500" />
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

const PRESET_COLORS = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6'];

export default function EditCalculator() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get('token');

  const [editData, setEditData] = useState<any>({});
  const [saved, setSaved] = useState(false);
  const [duplicateResult, setDuplicateResult] = useState<any>(null);

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
                <Button onClick={() => duplicateMutation.mutate()} disabled={duplicateMutation.isPending || calculator.is_duplicated} className="w-full bg-indigo-600 hover:bg-indigo-700 h-11" data-testid="button-duplicate">
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
          <a href={calcUrl} target="_blank" rel="noopener noreferrer">
            <Button size="sm" variant="outline" data-testid="link-view-calculator"><ExternalLink className="mr-1.5 w-3.5 h-3.5" /> View Calculator</Button>
          </a>
          <a href={leadsUrl}>
            <Button size="sm" variant="outline" data-testid="link-view-leads">View Leads</Button>
          </a>
        </div>

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
                    <input type="color" data-testid="input-edit-custom-color" value={editData.primary_color || '#6366f1'} onChange={e => set('primary_color', e.target.value)}
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
            onClick={() => saveMutation.mutate(editData)}
            disabled={saveMutation.isPending}
            className={`w-full h-12 text-sm font-semibold transition-all ${saved ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-indigo-600 hover:bg-indigo-700'}`}
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
