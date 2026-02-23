import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, AlertTriangle, Check, Copy, ExternalLink, RefreshCw, Lock, Building2, Palette, MessageSquare, Save, Clock, DollarSign, ChevronDown, ChevronUp, Plus, Trash2, GripVertical, Calculator } from 'lucide-react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';

interface QuestionOption {
  label: string;
  value: string;
  price_impact: number;
}

interface Question {
  id: string;
  label: string;
  type: string;
  options: QuestionOption[];
}

interface PricingConfig {
  questions: Question[];
  base_price: number;
  currency: string;
}

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

function SectionHeader({ icon: Icon, title, iconBg, iconColor }: { icon: any; title: string; iconBg?: string; iconColor?: string }) {
  return (
    <div className="flex items-center gap-2.5 mb-4">
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${iconBg || 'bg-blue-50'}`}>
        <Icon className={`w-4 h-4 ${iconColor || 'text-blue-600'}`} />
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

function QuestionEditor({
  question,
  index,
  totalQuestions,
  onUpdate,
  onRemove,
  onMoveUp,
  onMoveDown,
}: {
  question: Question;
  index: number;
  totalQuestions: number;
  onUpdate: (q: Question) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const updateOption = (optIdx: number, field: keyof QuestionOption, val: string | number) => {
    const newOpts = [...question.options];
    newOpts[optIdx] = { ...newOpts[optIdx], [field]: val };
    onUpdate({ ...question, options: newOpts });
  };

  const addOption = () => {
    const newOpts = [...question.options, { label: '', value: `opt_${Date.now()}`, price_impact: 0 }];
    onUpdate({ ...question, options: newOpts });
  };

  const removeOption = (optIdx: number) => {
    const newOpts = question.options.filter((_, i) => i !== optIdx);
    onUpdate({ ...question, options: newOpts });
  };

  return (
    <div className="border border-slate-200 rounded-xl bg-white overflow-hidden" data-testid={`question-editor-${index}`}>
      <div className="flex items-center gap-2 px-4 py-3 bg-slate-50/80 border-b border-slate-100">
        <GripVertical className="w-4 h-4 text-slate-300 flex-shrink-0" />
        <span className="text-xs font-bold text-slate-400 flex-shrink-0">Q{index + 1}</span>
        <span className="text-sm font-medium text-slate-700 flex-1 truncate">{question.label || 'Untitled Question'}</span>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button onClick={onMoveUp} disabled={index === 0}
            className="p-1 rounded hover:bg-slate-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            data-testid={`button-move-up-${index}`}>
            <ChevronUp className="w-4 h-4 text-slate-500" />
          </button>
          <button onClick={onMoveDown} disabled={index === totalQuestions - 1}
            className="p-1 rounded hover:bg-slate-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            data-testid={`button-move-down-${index}`}>
            <ChevronDown className="w-4 h-4 text-slate-500" />
          </button>
          <button onClick={() => setExpanded(p => !p)}
            className="p-1 rounded hover:bg-slate-200 transition-colors"
            data-testid={`button-toggle-question-${index}`}>
            <ChevronDown className={`w-4 h-4 text-slate-500 transition-transform ${expanded ? 'rotate-180' : ''}`} />
          </button>
          <button onClick={onRemove}
            className="p-1 rounded hover:bg-red-50 transition-colors"
            data-testid={`button-remove-question-${index}`}>
            <Trash2 className="w-3.5 h-3.5 text-red-400 hover:text-red-600" />
          </button>
        </div>
      </div>

      {expanded && (
        <div className="p-4 space-y-4 animate-fade-in-up">
          <div>
            <Label className="text-xs font-semibold text-slate-500">Question Label</Label>
            <Input
              className="mt-1.5 premium-input"
              value={question.label}
              onChange={e => onUpdate({ ...question, label: e.target.value })}
              placeholder="e.g., What type of service do you need?"
              data-testid={`input-question-label-${index}`}
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <Label className="text-xs font-semibold text-slate-500">Answer Options</Label>
              <span className="text-xs text-slate-400">{question.options.length} option{question.options.length !== 1 ? 's' : ''}</span>
            </div>

            <div className="space-y-2">
              {question.options.map((opt, optIdx) => (
                <div key={optIdx} className="flex items-center gap-2 p-2.5 bg-slate-50 rounded-lg border border-slate-100" data-testid={`option-row-${index}-${optIdx}`}>
                  <div className="flex-1 min-w-0">
                    <Input
                      className="premium-input text-sm h-9"
                      value={opt.label}
                      onChange={e => updateOption(optIdx, 'label', e.target.value)}
                      placeholder="Option label"
                      data-testid={`input-option-label-${index}-${optIdx}`}
                    />
                  </div>
                  <div className="w-24 flex-shrink-0">
                    <div className="relative">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400">$</span>
                      <Input
                        className="premium-input text-sm h-9 pl-6 text-right"
                        type="number"
                        value={opt.price_impact}
                        onChange={e => updateOption(optIdx, 'price_impact', parseFloat(e.target.value) || 0)}
                        data-testid={`input-option-price-${index}-${optIdx}`}
                      />
                    </div>
                  </div>
                  <button onClick={() => removeOption(optIdx)}
                    className="p-1.5 rounded hover:bg-red-50 transition-colors flex-shrink-0"
                    data-testid={`button-remove-option-${index}-${optIdx}`}>
                    <Trash2 className="w-3.5 h-3.5 text-red-400" />
                  </button>
                </div>
              ))}
            </div>

            <button onClick={addOption}
              className="mt-2 flex items-center gap-1.5 text-xs font-medium text-emerald-600 hover:text-emerald-700 transition-colors py-1.5"
              data-testid={`button-add-option-${index}`}>
              <Plus className="w-3.5 h-3.5" /> Add Option
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const PRESET_COLORS = ['#2563EB', '#0ea5e9', '#0891B2', '#059669', '#f59e0b', '#ef4444', '#7C3AED', '#ec4899'];

export default function EditCalculator() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get('token');

  const [editData, setEditData] = useState<any>({});
  const [pricingConfig, setPricingConfig] = useState<PricingConfig | null>(null);
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
      if (calculator.pricing_config) {
        setPricingConfig(calculator.pricing_config as PricingConfig);
      }
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
      'theme_overrides', 'pricing_config',
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

  const updateQuestion = useCallback((idx: number, q: Question) => {
    setPricingConfig(prev => {
      if (!prev) return prev;
      const questions = [...prev.questions];
      questions[idx] = q;
      return { ...prev, questions };
    });
  }, []);

  const removeQuestion = useCallback((idx: number) => {
    setPricingConfig(prev => {
      if (!prev) return prev;
      return { ...prev, questions: prev.questions.filter((_, i) => i !== idx) };
    });
  }, []);

  const moveQuestion = useCallback((idx: number, dir: -1 | 1) => {
    setPricingConfig(prev => {
      if (!prev) return prev;
      const questions = [...prev.questions];
      const target = idx + dir;
      if (target < 0 || target >= questions.length) return prev;
      [questions[idx], questions[target]] = [questions[target], questions[idx]];
      return { ...prev, questions };
    });
  }, []);

  const addQuestion = useCallback(() => {
    setPricingConfig(prev => {
      if (!prev) return prev;
      const newQ: Question = {
        id: `q_${Date.now()}`,
        label: '',
        type: 'select',
        options: [
          { label: '', value: `opt_${Date.now()}_1`, price_impact: 0 },
          { label: '', value: `opt_${Date.now()}_2`, price_impact: 0 },
        ],
      };
      return { ...prev, questions: [...prev.questions, newQ] };
    });
  }, []);

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
                <Button onClick={() => duplicateMutation.mutate()} disabled={duplicateMutation.isPending || calculator.is_duplicated} className="w-full bg-blue-600 hover:bg-blue-700 h-11" data-testid="button-duplicate">
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
                    <input type="color" data-testid="input-edit-custom-color" value={editData.primary_color || '#2563EB'} onChange={e => set('primary_color', e.target.value)}
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
                <SectionHeader icon={Calculator} title="Pricing & Questions" iconBg="bg-emerald-50" iconColor="text-emerald-600" />
                <p className="text-xs text-slate-400 -mt-2 mb-5">Customize the questions your customers answer and adjust the pricing logic.</p>

                <div className="mb-6">
                  <Label className="text-xs font-semibold text-slate-500">Base Price</Label>
                  <p className="text-xs text-slate-400 mt-0.5 mb-1.5">Starting price before any options are selected</p>
                  <div className="relative w-40">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium text-slate-400">
                      {pricingConfig.currency === 'USD' ? '$' : pricingConfig.currency}
                    </span>
                    <Input
                      className="premium-input pl-7 text-lg font-semibold"
                      type="number"
                      value={pricingConfig.base_price}
                      onChange={e => setPricingConfig(prev => prev ? { ...prev, base_price: parseFloat(e.target.value) || 0 } : prev)}
                      data-testid="input-base-price"
                    />
                  </div>
                </div>

                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <Label className="text-xs font-semibold text-slate-500">Questions</Label>
                    <p className="text-xs text-slate-400 mt-0.5">Each question shows as a step in your calculator. Click to expand and edit.</p>
                  </div>
                  <span className="text-xs text-slate-400 font-medium bg-slate-100 px-2 py-1 rounded-full">{pricingConfig.questions.length} question{pricingConfig.questions.length !== 1 ? 's' : ''}</span>
                </div>

                <div className="space-y-3 mb-4">
                  {pricingConfig.questions.map((q, idx) => (
                    <QuestionEditor
                      key={q.id}
                      question={q}
                      index={idx}
                      totalQuestions={pricingConfig.questions.length}
                      onUpdate={updated => updateQuestion(idx, updated)}
                      onRemove={() => removeQuestion(idx)}
                      onMoveUp={() => moveQuestion(idx, -1)}
                      onMoveDown={() => moveQuestion(idx, 1)}
                    />
                  ))}
                </div>

                <button onClick={addQuestion}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed border-slate-200 text-sm font-medium text-slate-500 hover:border-emerald-300 hover:text-emerald-600 hover:bg-emerald-50/50 transition-all"
                  data-testid="button-add-question">
                  <Plus className="w-4 h-4" /> Add Question
                </button>
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
            className={`w-full h-12 text-sm font-semibold transition-all ${saved ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-blue-600 hover:bg-blue-700'}`}
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
