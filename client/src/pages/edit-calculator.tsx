import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, AlertTriangle, Check, Copy, ExternalLink, RefreshCw, Lock } from 'lucide-react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); };
  return (
    <button onClick={copy} className="p-1.5 rounded hover:bg-slate-100 flex-shrink-0" data-testid="button-copy">
      {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4 text-slate-400" />}
    </button>
  );
}

function UrlRow({ url }: { url: string }) {
  return (
    <div className="flex items-center gap-2 bg-slate-50 rounded-lg px-3 py-2 border border-slate-200">
      <span className="text-sm text-slate-700 flex-1 truncate">{url}</span>
      <CopyButton text={url} />
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

  if (calculator && Object.keys(editData).length === 0) {
    setEditData(calculator);
  }

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
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="text-center"><AlertTriangle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
        <h2 className="text-xl font-semibold text-slate-800 mb-2" data-testid="text-error">Access Error</h2>
        <p className="text-slate-500">No edit token provided.</p>
      </div>
    </div>
  );

  if (isLoading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-slate-400" /></div>;

  if (loadError) return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="text-center"><AlertTriangle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
        <h2 className="text-xl font-semibold text-slate-800 mb-2" data-testid="text-error">Access Error</h2>
        <p className="text-slate-500">{(loadError as Error).message}</p>
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
      <div className="min-h-screen bg-slate-50 px-4 py-12">
        <div className="max-w-xl mx-auto">
          <Card className="border-amber-200">
            <CardContent className="p-8 text-center">
              <Lock className="w-12 h-12 text-amber-500 mx-auto mb-4" />
              <h2 className="text-xl font-bold text-slate-900 mb-2" data-testid="text-expired">Edit Access Expired</h2>
              <p className="text-slate-600 mb-2">The 7-day edit window for <strong>{calculator.business_name}</strong> has ended.</p>
              <p className="text-sm text-slate-500 mb-5">Your calculator is still live. Duplicate it to get a fresh 7-day edit period.</p>
              <div className="mb-5 text-left">
                <Label className="text-xs text-slate-500 mb-1 block">Current Calculator URL</Label>
                <UrlRow url={calcUrl} />
              </div>
              {duplicateResult ? (
                <div className="bg-green-50 border border-green-200 rounded-xl p-5 text-left space-y-3">
                  <h3 className="font-semibold text-green-800">Duplicated Successfully!</h3>
                  <div>
                    <Label className="text-xs text-green-700">New Calculator URL</Label>
                    <UrlRow url={`${origin}/Calculator?slug=${duplicateResult.new_slug}`} />
                  </div>
                  <div>
                    <Label className="text-xs text-green-700">New Edit Link (7 days)</Label>
                    <UrlRow url={`${origin}/EditCalculator?token=${duplicateResult.new_token}`} />
                  </div>
                </div>
              ) : (
                <Button onClick={() => duplicateMutation.mutate()} disabled={duplicateMutation.isPending || calculator.is_duplicated} className="w-full bg-indigo-600 hover:bg-indigo-700" data-testid="button-duplicate">
                  {duplicateMutation.isPending ? <><Loader2 className="mr-2 w-4 h-4 animate-spin" /> Duplicating...</> : <><RefreshCw className="mr-2 w-4 h-4" /> Duplicate & Get New Edit Period</>}
                </Button>
              )}
              {duplicateMutation.error && (
                <div className="mt-3 p-3 rounded-lg bg-red-50 border border-red-200 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0" />
                  <span className="text-sm text-red-700">{(duplicateMutation.error as Error).message}</span>
                </div>
              )}
              {calculator.is_duplicated && !duplicateResult && (
                <p className="text-sm text-slate-500 mt-3">This calculator has already been duplicated.</p>
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
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900" data-testid="text-edit-title">Edit Calculator</h1>
          <p className="text-slate-500 text-sm mt-1">{calculator.business_name} -- Edit access expires {expiryDate}</p>
        </div>

        <div className="flex gap-2 mb-6 flex-wrap">
          <a href={calcUrl} target="_blank" rel="noopener noreferrer">
            <Button size="sm" variant="outline" data-testid="link-view-calculator"><ExternalLink className="mr-1.5 w-3.5 h-3.5" /> View Calculator</Button>
          </a>
          <a href={leadsUrl}>
            <Button size="sm" variant="outline" data-testid="link-view-leads">View Leads</Button>
          </a>
        </div>

        <div className="space-y-4">
          <Card>
            <CardContent className="p-5 space-y-4">
              <h3 className="font-semibold text-slate-800">Business Details</h3>
              <div>
                <Label>Business Name</Label>
                <Input className="mt-1" value={editData.business_name || ''} onChange={e => set('business_name', e.target.value)} data-testid="input-edit-business-name" />
              </div>
              <div>
                <Label>Tagline</Label>
                <Input className="mt-1" value={editData.tagline || ''} onChange={e => set('tagline', e.target.value)} data-testid="input-edit-tagline" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5 space-y-4">
              <h3 className="font-semibold text-slate-800">Branding</h3>
              <div>
                <Label>Brand Color</Label>
                <div className="flex gap-2 mt-2 flex-wrap items-center">
                  {PRESET_COLORS.map(color => (
                    <button key={color} onClick={() => set('primary_color', color)}
                      className={`w-8 h-8 rounded-full border-2 transition-all ${editData.primary_color === color ? 'border-slate-800 scale-110' : 'border-transparent hover:scale-105'}`}
                      style={{ backgroundColor: color }}
                      data-testid={`color-${color.replace('#', '')}`} />
                  ))}
                  <input type="color" value={editData.primary_color || '#6366f1'} onChange={e => set('primary_color', e.target.value)}
                    className="w-8 h-8 rounded-full border-2 border-slate-300 cursor-pointer p-0.5 bg-transparent" />
                </div>
              </div>
              <div>
                <Label>Logo URL</Label>
                <Input className="mt-1" value={editData.logo_url || ''} onChange={e => set('logo_url', e.target.value)} placeholder="https://..." data-testid="input-edit-logo" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5 space-y-4">
              <h3 className="font-semibold text-slate-800">Lead Form</h3>
              <div>
                <Label>CTA Button Text</Label>
                <Input className="mt-1" value={editData.cta_button_text || ''} onChange={e => set('cta_button_text', e.target.value)} data-testid="input-edit-cta" />
              </div>
              <div>
                <Label>Thank You Message</Label>
                <Input className="mt-1" value={editData.lead_thank_you_message || ''} onChange={e => set('lead_thank_you_message', e.target.value)} data-testid="input-edit-thankyou" />
              </div>
              <div>
                <Label>Your Email (for lead notifications)</Label>
                <Input className="mt-1" type="email" value={editData.owner_email || ''} onChange={e => set('owner_email', e.target.value)} data-testid="input-edit-email" />
              </div>
            </CardContent>
          </Card>
        </div>

        <Button onClick={() => saveMutation.mutate(editData)} disabled={saveMutation.isPending} className="w-full mt-6 bg-indigo-600 hover:bg-indigo-700 h-12" data-testid="button-save">
          {saveMutation.isPending ? <><Loader2 className="mr-2 w-4 h-4 animate-spin" /> Saving...</> :
            saved ? <><Check className="mr-2 w-4 h-4" /> Saved!</> : 'Save Changes'}
        </Button>
        {saveMutation.error && (
          <div className="mt-3 p-3 rounded-lg bg-red-50 border border-red-200 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0" />
            <span className="text-sm text-red-700">{(saveMutation.error as Error).message}</span>
          </div>
        )}
      </div>
    </div>
  );
}
