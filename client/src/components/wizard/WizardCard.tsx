// QuoteQuick calculator builder wizard — 4-step flow: Trade → Pricing → Preview → Publish.
// Sub-components: DesignStudio, CustomTradeQuestionnaire, PricingIntakeStage2, TestGateStep, LeadFormStep, PublishStep.
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { platformTheme } from '@/theme/platformTheme';
import { dashboardTheme } from '@/theme/dashboardTheme';
import { CATEGORIES, TRADES, getTradesByCategory, type Trade } from '@/data/trades';
import { calculatorSettingsSchema, customTradeDataSchema, type CalculatorSettings, type CustomTradeData, type Stage2Data, type SampleQuote } from '@shared/schema';
import DesignStudio from './DesignStudio';
import CustomTradeQuestionnaire from './CustomTradeQuestionnaire';
import PricingIntakeStage2 from './PricingIntakeStage2';
import TestGateStep, { type TestGateResult } from './TestGateStep';
import LeadFormStep from './LeadFormStep';
import PublishStep from './PublishStep';
import TemplatePickerStep from './TemplatePickerStep';
import PricingBuildStep from './PricingBuildStep';
import WizardSecondaryNav, { type SecondarySection } from './WizardSecondaryNav';
import { trackEvent } from '@/lib/trackEvent';
import QuoteWidget from '@/components/quote-widget/QuoteWidget';
import type { CalculatorData } from '@/components/quote-widget/types';
import { mapPricingIntakeToConfig } from '@shared/pricingIntakeMapper';
import { getRecommendedTemplate, getTemplateById, type LayoutStyle } from '@shared/templateLibrary';
import { getTemplatePreset } from '@shared/templatePresets';
import {
  Loader2, ArrowRight, ArrowLeft, Check, Sparkles, Wrench, Hammer,
  Layers, AlertTriangle, Car, Briefcase, Plus, HelpCircle, X,
  Search, ChevronDown, ExternalLink, Copy, Zap, AlertCircle,
  RotateCcw, Code2, Eye, Upload, Trash2, Image as ImageIcon, ChevronRight,
  FileText, Shield, Mail, Phone, User, Building2,
  CheckCircle2, TriangleAlert, Smartphone, Monitor, Save
} from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';

const ICON_MAP: Record<string, any> = {
  Sparkles, Hammer, Layers, Wrench, AlertTriangle, Car, Briefcase, Plus,
};


interface TestScenario {
  label: string;
  answers: Record<string, string>;
  expectedMin: string;
  expectedMax: string;
  confirmed: boolean;
}

interface WizardState {
  businessName: string;
  selectedCategory: string;
  selectedTrade: string;
  isCustomTrade: boolean;
  customTradeData: CustomTradeData;
  stage2Data: Stage2Data;
  sampleQuotes: SampleQuote[];
  ownerEmail: string;
  primaryColor: string;
  tagline: string;
  logoUrl: string;
  calculatorSettings: CalculatorSettings;
  testScenarios: TestScenario[];
  testPassed: boolean;
  draftJobId: string;
}

const DEFAULT_SETTINGS = calculatorSettingsSchema.parse({});
const DEFAULT_CUSTOM_TRADE = customTradeDataSchema.parse({});

const EMPTY_SCENARIO: TestScenario = {
  label: '', answers: {}, expectedMin: '', expectedMax: '', confirmed: false,
};

const DEFAULT_SAMPLE_QUOTES: SampleQuote[] = [
  { label: 'small', inputs: { qty: 0, notes_optional: '' }, final_price: 0 },
  { label: 'typical', inputs: { qty: 0, notes_optional: '' }, final_price: 0 },
  { label: 'big', inputs: { qty: 0, notes_optional: '' }, final_price: 0 },
];

const INITIAL_STATE: WizardState = {
  businessName: '', selectedCategory: '', selectedTrade: '',
  isCustomTrade: false, customTradeData: DEFAULT_CUSTOM_TRADE,
  stage2Data: {},
  sampleQuotes: DEFAULT_SAMPLE_QUOTES.map(q => ({ ...q, inputs: { ...q.inputs } })),
  ownerEmail: '', primaryColor: '#0284C7',
  tagline: '', logoUrl: '',
  calculatorSettings: DEFAULT_SETTINGS,
  testScenarios: [{ ...EMPTY_SCENARIO }, { ...EMPTY_SCENARIO }, { ...EMPTY_SCENARIO }],
  testPassed: false,
  draftJobId: '',
};

function loadState(): WizardState {
  try {
    const s = localStorage.getItem('qq_wizard');
    if (s) {
      const parsed = JSON.parse(s);
      return {
        ...INITIAL_STATE,
        ...parsed,
        customTradeData: parsed.customTradeData
          ? { ...DEFAULT_CUSTOM_TRADE, ...parsed.customTradeData }
          : DEFAULT_CUSTOM_TRADE,
        stage2Data: parsed.stage2Data || {},
        sampleQuotes: parsed.sampleQuotes || DEFAULT_SAMPLE_QUOTES.map(q => ({ ...q, inputs: { ...q.inputs } })),
        calculatorSettings: parsed.calculatorSettings
          ? calculatorSettingsSchema.parse(parsed.calculatorSettings)
          : DEFAULT_SETTINGS,
        testScenarios: parsed.testScenarios || [{ ...EMPTY_SCENARIO }, { ...EMPTY_SCENARIO }, { ...EMPTY_SCENARIO }],
        draftJobId: parsed.draftJobId || '',
      };
    }
  } catch {}
  return { ...INITIAL_STATE };
}

function loadResult(): any {
  try {
    const s = localStorage.getItem('qq_result');
    if (s) return JSON.parse(s);
  } catch {}
  return null;
}

function loadStep(): number {
  try {
    const s = localStorage.getItem('qq_step');
    if (s) return parseInt(s, 10) || 0;
  } catch {}
  return 0;
}

const p = platformTheme;
const d = dashboardTheme;
// Linear flow: Step 0 (trade) → Step 2 (pricing) → Step 3 (contact form)
//            → Step 1 (customize & publish) → Step 5 (result).
// Step 4 (test gate) is off-path / unused.
const TOTAL_STEPS = 6; // Trade · Template · Pricing · Contact · Branding.

// 1-based visual step for the progress display. The published result screen
// is `TOTAL_STEPS + 1` so the counter reads "Published" rather than a step number.
function visualStep(internalStep: number): number {
  if (internalStep === 0) return 1; // Business info
  if (internalStep === 6) return 2; // Templates
  if (internalStep === 1) return 3; // Design
  if (internalStep === 2) return 4; // Logic
  if (internalStep === 3) return 5; // CTA & Marketing
  if (internalStep === 4) return 6; // Test gate (off-path)
  if (internalStep === 5) return 6; // Installation / go-live
  return internalStep;
}

// Visual step (1-based) -> internal step id. Used by the clickable top nav.
const VISUAL_TO_INTERNAL = [0, 6, 1, 2, 3, 5];

const STEP_HINTS = [
  'Next: pick a template',
  'Next: set your pricing',
  'Next: set up your contact form',
  'Next: install & go live',
  'Publishing your calculator...',
  '',
];
const STEP_TIME = ['~1 min', '', '~1 min', '', '', ''];

// 2nd-bar contextual sections, keyed by INTERNAL step id. Steps with fewer
// than 2 entries render no 2nd bar (WizardSecondaryNav returns null).
const SECONDARY_SECTIONS: Record<number, SecondarySection[]> = {
  0: [
    { id: 'business', label: 'Business', target: '#wiz-sec-business', Icon: Building2 },
    { id: 'trade', label: 'Trade', target: '#wiz-sec-trade', Icon: Briefcase },
    { id: 'contact', label: 'Contact', target: '#wiz-sec-contact', Icon: Mail },
  ],
  1: [
    { id: 'branding', label: 'Branding', target: '#wiz-sec-branding', Icon: ImageIcon },
    { id: 'look', label: 'Look & feel', target: '#wiz-sec-look', Icon: Sparkles },
    { id: 'offers', label: 'Offers', target: '#wiz-sec-offers', Icon: Zap },
  ],
  2: [
    { id: 'model', label: 'Pricing', target: '[data-testid="card-pricing-model"]', Icon: Wrench },
    { id: 'fields', label: 'Fields', target: '[data-testid="button-add-field"]', Icon: Layers },
  ],
  3: [
    { id: 'capture', label: 'Lead form', target: '[data-testid="mode-optional"]', Icon: User },
    { id: 'cta', label: 'Call to action', target: '[data-testid="input-cta-text"]', Icon: Zap },
    { id: 'delivery', label: 'Delivery', target: '[data-testid="toggle-delivery-section"]', Icon: Mail },
  ],
};

export default function WizardCard({ embed = false }: { embed?: boolean }) {
  const savedResult = loadResult();
  const savedStep = loadStep();
  const [step, setStep] = useState(savedResult && savedStep === 5 ? 5 : ([0, 1, 2, 3, 6].includes(savedStep) ? savedStep : 0));
  // 2nd-bar contextual section state.
  const [activeSection, setActiveSection] = useState('');
  useEffect(() => {
    setActiveSection(SECONDARY_SECTIONS[step]?.[0]?.id || '');
  }, [step]);
  const handleSection = (id: string) => {
    setActiveSection(id);
    const sec = (SECONDARY_SECTIONS[step] || []).find((s) => s.id === id);
    if (sec) document.querySelector(sec.target)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  const [ws, setWs] = useState<WizardState>(loadState);
  const [showHelp, setShowHelp] = useState(false);
  const [tradeSearch, setTradeSearch] = useState('');
  const [tradeOpen, setTradeOpen] = useState(false);
  const [result, setResult] = useState<any>(savedResult);
  const [genProgress, setGenProgress] = useState(0);
  const [showPreview, setShowPreview] = useState(false);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [pricingDraftLoading, setPricingDraftLoading] = useState(false);
  const [showCustomInHelp, setShowCustomInHelp] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [showPublishConfirm, setShowPublishConfirm] = useState(false);
  const [mobileMode, setMobileMode] = useState<'edit' | 'preview'>('edit');
  const [previewDevice, setPreviewDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [publishError, setPublishError] = useState('');
  const saveFlashRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    localStorage.setItem('qq_wizard', JSON.stringify(ws));
    setJustSaved(true);
    if (saveFlashRef.current) clearTimeout(saveFlashRef.current);
    saveFlashRef.current = setTimeout(() => setJustSaved(false), 2200);
  }, [ws]);

  useEffect(() => {
    localStorage.setItem('qq_step', String(step));
  }, [step]);

  useEffect(() => {
    if (result) localStorage.setItem('qq_result', JSON.stringify(result));
  }, [result]);

  // Track trial_started on first wizard load
  useEffect(() => { trackEvent('trial_started'); }, []);

  const set = useCallback(<K extends keyof WizardState>(k: K, v: WizardState[K]) => {
    setWs(p => ({ ...p, [k]: v }));
    if (validationErrors[k]) setValidationErrors(p => { const n = { ...p }; delete n[k]; return n; });
  }, [validationErrors]);

  // Explicit "Save" — the wizard auto-persists to localStorage on every change,
  // but the per-step Save button gives the user explicit, reassuring control.
  const handleManualSave = useCallback(() => {
    try {
      localStorage.setItem('qq_wizard', JSON.stringify(ws));
      localStorage.setItem('qq_step', String(step));
    } catch {}
    setJustSaved(true);
    if (saveFlashRef.current) clearTimeout(saveFlashRef.current);
    saveFlashRef.current = setTimeout(() => setJustSaved(false), 2200);
  }, [ws, step]);

  // Template-picker selection → apply the template (or a blank start) and its
  // layout to calculator_settings. `id === 'blank'` keeps the chosen layout
  // with no presets; a real template carries its own layout + display defaults.
  const handleTemplateSelect = (id: string, layout: LayoutStyle) => {
    // A themed template — drop its whole preset config into the calculator.
    const preset = getTemplatePreset(id);
    if (preset) {
      set('calculatorSettings', {
        ...ws.calculatorSettings,
        ui_template: {
          ...ws.calculatorSettings.ui_template,
          template_id: id,
          layout: { ...ws.calculatorSettings.ui_template?.layout, style: preset.layout },
        },
        advanced: { ...preset.advanced, layout: preset.layout } as any,
      });
      return;
    }
    // Blank — keep the chosen layout with no presets.
    set('calculatorSettings', {
      ...ws.calculatorSettings,
      ui_template: {
        ...ws.calculatorSettings.ui_template,
        template_id: id,
        layout: {
          ...ws.calculatorSettings.ui_template?.layout,
          style: layout,
          sticky_summary: layout === 'two_column',
          show_breakdown: true,
          show_trust_block: false,
          show_testimonials: false,
          show_images: false,
        },
      },
    });
  };

  useEffect(() => {
    const currentTemplateId = ws.calculatorSettings.ui_template?.template_id || 'classic_single';
    if (currentTemplateId !== 'classic_single' && currentTemplateId !== 'estimate_then_book') return;

    const bookingEnabled = ws.calculatorSettings.calculator_type === 'estimate_plus_booking';
    const tradeId = ws.selectedTrade || '';
    const recommended = getRecommendedTemplate(tradeId, bookingEnabled);

    if (recommended !== currentTemplateId) {
      const tmpl = getTemplateById(recommended);
      if (tmpl) {
        setWs(prev => ({
          ...prev,
          calculatorSettings: {
            ...prev.calculatorSettings,
            ui_template: {
              ...prev.calculatorSettings.ui_template,
              template_id: recommended,
              layout: {
                ...prev.calculatorSettings.ui_template?.layout,
                style: tmpl.layout_style,
                sticky_summary: tmpl.defaults.sticky_summary,
                show_breakdown: tmpl.defaults.show_breakdown,
                show_trust_block: tmpl.defaults.show_trust_block,
                show_testimonials: tmpl.defaults.show_testimonials,
                show_images: tmpl.defaults.show_images,
              },
            },
          },
        }));
      }
    }
  }, [ws.calculatorSettings.calculator_type]);

  const filteredTrades = ws.selectedCategory && ws.selectedCategory !== 'custom'
    ? getTradesByCategory(ws.selectedCategory) : [];
  const searchedTrades = tradeSearch
    ? filteredTrades.filter(tr => tr.label.toLowerCase().includes(tradeSearch.toLowerCase()))
    : filteredTrades;

  // Global trade search (searches ALL trades, bypasses category)
  const globalSearchResults = tradeSearch.length >= 2
    ? TRADES.filter(tr => tr.label.toLowerCase().includes(tradeSearch.toLowerCase())).slice(0, 8)
    : [];

  const selectCategory = (id: string) => {
    if (id === ws.selectedCategory) return;
    setWs(p => ({
      ...p, selectedCategory: id, selectedTrade: '',
      isCustomTrade: id === 'custom',
      customTradeData: id === 'custom' ? p.customTradeData : DEFAULT_CUSTOM_TRADE,
    }));
    setTradeSearch('');
    setTradeOpen(false);
  };

  const selectTrade = (tr: Trade) => {
    set('selectedTrade', tr.id);
    setTradeOpen(false);
    setTradeSearch('');
    trackEvent('wizard_trade_selected', { trade: tr.id, label: tr.label });

    const currentTemplateId = ws.calculatorSettings.ui_template?.template_id || 'classic_single';
    if (currentTemplateId === 'classic_single') {
      const bookingEnabled = ws.calculatorSettings.calculator_type === 'estimate_plus_booking';
      const recommended = getRecommendedTemplate(tr.id, bookingEnabled);
      if (recommended !== 'classic_single') {
        const tmpl = getTemplateById(recommended);
        if (tmpl) {
          setWs(prev => ({
            ...prev,
            selectedTrade: tr.id,
            calculatorSettings: {
              ...prev.calculatorSettings,
              ui_template: {
                ...prev.calculatorSettings.ui_template,
                template_id: recommended,
                layout: {
                  ...prev.calculatorSettings.ui_template?.layout,
                  style: tmpl.layout_style,
                  sticky_summary: tmpl.defaults.sticky_summary,
                  show_breakdown: tmpl.defaults.show_breakdown,
                  show_trust_block: tmpl.defaults.show_trust_block,
                  show_testimonials: tmpl.defaults.show_testimonials,
                  show_images: tmpl.defaults.show_images,
                },
              },
            },
          }));
        }
      }
    }
  };

  const canContinueStep0 = () => {
    if (!ws.businessName.trim()) return false;
    if (!ws.ownerEmail.trim()) return false;
    if (!ws.selectedCategory) return false;
    if (ws.selectedCategory === 'custom') return true;
    return !!ws.selectedTrade;
  };

  const tryStep0Continue = () => {
    const errs: Record<string, string> = {};
    if (!ws.businessName.trim()) errs.businessName = 'Business name is required.';
    if (!ws.ownerEmail.trim()) errs.ownerEmail = 'Email is required for lead notifications.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ws.ownerEmail)) errs.ownerEmail = 'Enter a valid email address.';
    if (!ws.selectedCategory) errs.selectedCategory = 'Please select a service category.';
    else if (ws.selectedCategory !== 'custom' && !ws.selectedTrade) errs.selectedTrade = 'Please select your trade.';

    if (ws.selectedCategory === 'custom') {
      const ctd = ws.customTradeData;
      if (!ctd.charge_method || ctd.charge_method === 'not_sure') {
        if ((ctd.price_factors || []).length === 0) {
          errs.customTrade = 'Please select how you charge or at least one price factor.';
        }
      }
      if (ctd.has_minimum_charge && (!ctd.minimum_charge_amount || ctd.minimum_charge_amount <= 0)) {
        errs.customTradeMinCharge = 'Enter your minimum charge amount.';
      }
      if (ctd.has_trip_fee && (!ctd.trip_fee_amount || ctd.trip_fee_amount <= 0)) {
        errs.customTradeTripFee = 'Enter your trip fee amount.';
      }
      if (ctd.charge_method && ctd.charge_method !== 'not_sure') {
        if (ctd.price_range_min == null || ctd.price_range_max == null) {
          errs.customTradePriceRange = 'Enter your typical price range (min and max).';
        } else if (ctd.price_range_max < ctd.price_range_min) {
          errs.customTradePriceRange = 'Max price must be greater than or equal to min price.';
        }
      }
    }

    setValidationErrors(errs);
    if (Object.keys(errs).length > 0) {
      setTimeout(() => {
        const firstErr = document.querySelector('[data-error-field]');
        firstErr?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
      return;
    }
    if (Object.keys(errs).length === 0) {
      if (ws.isCustomTrade && ws.customTradeData.charge_method === 'not_sure') {
        triggerPricingDraft();
      }
      setStep(6); // Flow: trade → template
    }
  };

  const validateStage2 = (): Record<string, string> => {
    const errs: Record<string, string> = {};
    const ctd = ws.customTradeData;
    const s2 = ws.stage2Data;
    const charge = ctd.charge_method;

    if (charge === 'per_hour') {
      if (!s2.hourly_rate || s2.hourly_rate <= 0) errs.stage2Rate = 'Enter your hourly rate (must be greater than $0).';
      if (!s2.crew_size || s2.crew_size <= 0) errs.stage2Crew = 'Enter your typical crew size.';
      if (!s2.min_hours || s2.min_hours <= 0) errs.stage2MinHours = 'Enter minimum hours per job.';
      if (s2.max_hours != null && s2.min_hours != null && s2.max_hours < s2.min_hours) errs.stage2MaxHours = 'Max hours must be greater than or equal to min hours.';
    }

    if (charge === 'per_sqft') {
      if (!s2.sqft_rate || s2.sqft_rate <= 0) errs.stage2Rate = 'Enter your rate per square foot (must be greater than $0).';
      if (s2.materials_included == null) errs.stage2Materials = 'Select whether your rate includes materials or is labor only.';
      if (s2.setup_fee != null && s2.setup_fee <= 0) errs.stage2SetupFee = 'Setup fee must be greater than $0, or leave it empty.';
    }

    if (charge === 'per_linear_ft') {
      if (!s2.unit_rate || s2.unit_rate <= 0) errs.stage2Rate = 'Enter your rate per linear foot (must be greater than $0).';
    }

    if (charge === 'per_item') {
      if (!s2.unit_rate || s2.unit_rate <= 0) errs.stage2Rate = 'Enter your price per unit (must be greater than $0).';
    }

    if (charge === 'base_plus_variable') {
      if (!s2.unit_rate || s2.unit_rate <= 0) errs.stage2Rate = 'Enter your variable unit rate (must be greater than $0).';
    }

    if (charge === 'fixed_project') {
      const hasValidPkgs = s2.packages && s2.packages.filter(pk => pk.label && pk.price > 0).length >= 2;
      const hasMinCharge = ctd.has_minimum_charge && ctd.minimum_charge_amount && ctd.minimum_charge_amount > 0;
      const hasRange = ctd.price_range_min != null && ctd.price_range_max != null && ctd.price_range_max >= ctd.price_range_min;
      if (!hasValidPkgs && !hasMinCharge && !hasRange) {
        errs.stage2Fixed = 'For fixed project pricing, provide at least 2 packages with prices, a minimum charge, or a valid price range.';
      }
    }

    if (ctd.offers_packages && charge !== 'fixed_project') {
      const pkgs = s2.packages || [];
      const validPkgs = pkgs.filter(pk => pk.label && pk.price > 0);
      if (validPkgs.length < 2) {
        errs.stage2Packages = 'Each package needs a name and a price greater than $0. At least 2 packages required.';
      }
    }

    if ((ctd.price_factors || []).includes('Materials') && s2.materials_markup_pct != null) {
      if (s2.materials_markup_pct <= 0 || s2.materials_markup_pct > 100) {
        errs.stage2Markup = 'Materials markup must be between 1% and 100%.';
      }
    }

    if (s2.after_hours_multiplier != null && s2.after_hours_multiplier > 0 && s2.after_hours_multiplier < 1) {
      errs.stage2AfterHours = 'After-hours multiplier must be 1 or greater.';
    }

    return errs;
  };

  const tryStep2Continue = () => {
    if (!ws.isCustomTrade || ws.customTradeData.charge_method === 'not_sure') {
      setValidationErrors({});
      trackEvent('wizard_pricing_set', { trade: ws.selectedTrade, isCustom: false });
      setStep(3); // Flow: pricing → contact form
      return;
    }
    const errs = validateStage2();
    setValidationErrors(errs);
    if (Object.keys(errs).length === 0) {
      trackEvent('wizard_pricing_set', { trade: ws.selectedTrade, isCustom: true });
      setStep(3); // Flow: pricing → contact form
    }
  };

  const triggerPricingDraft = async () => {
    if (pricingDraftLoading) return;
    setPricingDraftLoading(true);
    setWs(prev => ({
      ...prev,
      calculatorSettings: {
        ...prev.calculatorSettings,
        pricing_draft: {
          pricing_config: {},
          assumptions: [],
          confidence_score: 0,
          needs_human_review: true,
          status: 'generating' as const,
        },
      },
    }));
    try {
      const validQuotes = ws.sampleQuotes.filter(q => q.inputs.qty > 0 && q.final_price > 0);
      const res = await apiRequest('POST', '/api/ai/pricing-config-draft', {
        pricing_intake: {
          version: 1,
          stage1: ws.customTradeData,
          stage2: ws.stage2Data,
          sample_quotes: validQuotes.length > 0 ? validQuotes : undefined,
        },
        sample_quotes: validQuotes.length > 0 ? validQuotes : undefined,
      });
      const data = await res.json();
      if (data.success && data.job_id) {
        set('draftJobId', data.job_id);
      } else {
        throw new Error('Failed to start draft job');
      }
    } catch {
      setWs(prev => ({
        ...prev,
        draftJobId: '',
        calculatorSettings: {
          ...prev.calculatorSettings,
          pricing_draft: {
            pricing_config: { pricingType: 'call_for_quote_only', message: 'Request a quote' },
            assumptions: [],
            confidence_score: 0,
            needs_human_review: true,
            status: 'failed' as const,
          },
        },
      }));
    } finally {
      setPricingDraftLoading(false);
    }
  };

  const draftJobIdRef = useRef(ws.draftJobId);
  draftJobIdRef.current = ws.draftJobId;

  useEffect(() => {
    if (!ws.draftJobId) return;
    const draft = ws.calculatorSettings.pricing_draft;
    if (draft && (draft.status === 'ready' || draft.status === 'failed')) return;

    const currentJobId = ws.draftJobId;
    let attempts = 0;
    const maxAttempts = 15;
    const interval = setInterval(async () => {
      if (draftJobIdRef.current !== currentJobId) {
        clearInterval(interval);
        return;
      }
      attempts++;
      if (attempts > maxAttempts) {
        clearInterval(interval);
        setWs(prev => ({
          ...prev,
          draftJobId: '',
          calculatorSettings: {
            ...prev.calculatorSettings,
            pricing_draft: {
              pricing_config: { pricingType: 'call_for_quote_only', message: 'Request a quote' },
              assumptions: [],
              confidence_score: 0,
              needs_human_review: true,
              status: 'failed' as const,
            },
          },
        }));
        return;
      }
      try {
        const res = await fetch(`/api/ai/pricing-config-draft/${currentJobId}`);
        const data = await res.json();
        if (data.status === 'completed' && data.result) {
          clearInterval(interval);
          const { pricing_audit, ...draftData } = data.result;
          setWs(prev => ({
            ...prev,
            draftJobId: '',
            calculatorSettings: {
              ...prev.calculatorSettings,
              pricing_draft: { ...draftData, status: 'ready' as const },
              pricing_audit: pricing_audit || undefined,
            },
          }));
        } else if (data.status === 'failed') {
          clearInterval(interval);
          setWs(prev => ({
            ...prev,
            draftJobId: '',
            calculatorSettings: {
              ...prev.calculatorSettings,
              pricing_draft: {
                pricing_config: { pricingType: 'call_for_quote_only', message: 'Request a quote' },
                assumptions: [],
                confidence_score: 0,
                needs_human_review: true,
                status: 'failed' as const,
              },
            },
          }));
        }
      } catch {}
    }, 2000);

    return () => clearInterval(interval);
  }, [ws.draftJobId]);

  const generateMutation = useMutation({
    mutationFn: async () => {
      setGenProgress(0);
      const progressTimer = setInterval(() => {
        setGenProgress(p => Math.min(p + Math.random() * 12, 90));
      }, 400);
      try {
        const tradeLabel = TRADES.find(tr => tr.id === ws.selectedTrade)?.label || ws.customTradeData.short_description || ws.selectedCategory;

        let pricingConfig: any;

        if (ws.isCustomTrade && ws.customTradeData.charge_method !== 'not_sure') {
          // Custom trade with explicit charge method → use mapper
          const mapResult = mapPricingIntakeToConfig(ws.customTradeData, ws.stage2Data);
          if (mapResult.success) {
            pricingConfig = mapResult.config;
            setGenProgress(50);
          } else {
            throw new Error(mapResult.errors[0] || 'Please go back and fill in all required pricing fields.');
          }
        } else if (ws.isCustomTrade && ws.calculatorSettings.pricing_draft?.status === 'ready' && ws.calculatorSettings.pricing_draft?.pricing_config?.pricingType) {
          // Custom trade with AI draft → use draft config
          pricingConfig = ws.calculatorSettings.pricing_draft.pricing_config;
          setGenProgress(50);
        } else if (ws.calculatorSettings?.pricing_mode && ws.calculatorSettings.pricing_mode !== 'ai_suggested') {
          // Standard trade with manual pricing mode → use resolvedPricingConfig (already computed)
          pricingConfig = resolvedPricingConfig;
          setGenProgress(50);
        } else {
          // AI-suggested mode → try AI generation, fall back to safe defaults if it fails
          try {
            const aiRes = await apiRequest('POST', '/api/ai/generate-pricing', {
              trade_type: tradeLabel,
              business_description: tradeLabel,
              services: tradeLabel,
            });
            const aiData = await aiRes.json();
            if (aiData.success && aiData.pricing_config) {
              pricingConfig = aiData.pricing_config;
            } else {
              // AI returned but without valid config → use safe fallback
              console.warn('[Wizard] AI pricing returned no config, using fallback');
              pricingConfig = { pricingType: 'hourly', unitName: 'hour', rate: 75, baseFee: 50, minQuantity: 1, maxQuantity: 12 };
            }
          } catch (aiErr) {
            // AI endpoint failed entirely → use safe fallback instead of breaking
            console.warn('[Wizard] AI pricing generation failed, using fallback:', aiErr);
            pricingConfig = { pricingType: 'hourly', unitName: 'hour', rate: 75, baseFee: 50, minQuantity: 1, maxQuantity: 12 };
          }
        }
        setGenProgress(70);
        const createRes = await apiRequest('POST', '/api/calculators', {
          business_name: ws.businessName,
          trade_type: tradeLabel,
          owner_email: ws.ownerEmail || undefined,
          pricing_config: pricingConfig,
          primary_color: ws.primaryColor,
          tagline: ws.tagline || undefined,
          logo_url: ws.logoUrl || undefined,
          calculator_settings: {
            ...ws.calculatorSettings,
            pricing_intake: ws.isCustomTrade ? {
              version: 1 as const,
              stage1: ws.customTradeData,
              stage2: ws.stage2Data,
            } : undefined,
            sample_quotes: ws.isCustomTrade
              ? ws.sampleQuotes.filter(q => q.inputs.qty > 0 && q.final_price > 0)
              : undefined,
            test_history: testHistory ? {
              scenarios: testHistory.scenarios.map(s => ({
                label: s.label,
                inputs: s.inputs,
                yourCharge: s.yourCharge,
              })),
              accuracy_score: testHistory.accuracyScore,
              confirmed: testHistory.confirmed,
              advanced_adjustments: testHistory.advancedAdjustments,
              timestamp: testHistory.timestamp,
              refinement: testHistory.refinement || undefined,
            } : undefined,
            pricing_edits_applied: ws.isCustomTrade
              && ws.calculatorSettings.pricing_draft?.status === 'ready'
              && ws.calculatorSettings.pricing_draft?.pricing_config?.pricingType
              && JSON.stringify(ws.calculatorSettings.pricing_draft.pricing_config) !== JSON.stringify(pricingConfig),
          },
        });
        const d = await createRes.json();
        if (!d.success) throw new Error(d.error || 'Failed to create calculator.');
        setGenProgress(100);
        clearInterval(progressTimer);
        return d;
      } catch (err) {
        clearInterval(progressTimer);
        setGenProgress(0);
        throw err;
      }
    },
    onSuccess: (d) => {
      setResult(d);
      trackEvent('wizard_published', { slug: d?.slug, calculator_id: d?.calculator?.id });
      setTimeout(() => setStep(5), 500);
    },
  });

  const genError = generateMutation.error ? (generateMutation.error as Error).message : null;

  const resolvedPricingConfig = useMemo(() => {
    // 1. Custom trade with explicit charge method → use mapper
    if (ws.isCustomTrade && ws.customTradeData.charge_method !== 'not_sure') {
      const mapResult = mapPricingIntakeToConfig(ws.customTradeData, ws.stage2Data);
      if (mapResult.success) return mapResult.config;
    }
    // 2. Custom trade with AI draft → use draft config
    if (ws.isCustomTrade && ws.calculatorSettings.pricing_draft?.status === 'ready' && ws.calculatorSettings.pricing_draft?.pricing_config?.pricingType) {
      return ws.calculatorSettings.pricing_draft.pricing_config;
    }
    // 3. Standard trade with manual pricing mode → convert to PricingConfigV1
    const mode = ws.calculatorSettings?.pricing_mode;
    if (mode && mode !== 'ai_suggested') {
      if (mode === 'hourly') {
        const rate = ws.calculatorSettings?.manual_hourly_rate || 75;
        return { pricingType: 'hourly', unitName: 'hour', rate, baseFee: 0, minQuantity: 1, maxQuantity: 12 };
      }
      if (mode === 'fixed') {
        const price = ws.calculatorSettings?.manual_fixed_price || 200;
        return { pricingType: 'price_range_only', rangeLabel: 'Estimated Cost', rangeMin: price, rangeMax: price };
      }
      if (mode === 'range') {
        const min = ws.calculatorSettings?.manual_range_min || 100;
        const max = ws.calculatorSettings?.manual_range_max || 500;
        return { pricingType: 'price_range_only', rangeLabel: 'Estimated Cost', rangeMin: min, rangeMax: max };
      }
      if (mode === 'custom') {
        const cfg = ws.calculatorSettings?.manual_custom_config as any;
        if (cfg && cfg.pricingType) return cfg;
        return { pricingType: 'hourly', unitName: 'hour', rate: 0 };
      }
    }
    // 4. Standard trade with AI mode or default → use trade defaults
    const trade = TRADES.find(tr => tr.id === ws.selectedTrade);
    if (trade && (trade as any).defaultPricing) return (trade as any).defaultPricing;
    return { pricingType: 'hourly', unitName: 'hour', rate: 75, baseFee: 50 };
  }, [ws.isCustomTrade, ws.customTradeData, ws.stage2Data, ws.calculatorSettings.pricing_draft, ws.selectedTrade, ws.calculatorSettings?.pricing_mode, ws.calculatorSettings?.manual_hourly_rate, ws.calculatorSettings?.manual_fixed_price, ws.calculatorSettings?.manual_range_min, ws.calculatorSettings?.manual_range_max, ws.calculatorSettings?.manual_custom_config]);

  // Synthetic CalculatorData for live preview (no DB save required)
  const previewCalculatorData = useMemo<CalculatorData>(() => ({
    id: -1, // Sentinel: preview mode — LeadCaptureStep/BookingStep skip API calls
    slug: 'preview',
    business_name: ws.businessName || 'Your Business',
    tagline: ws.tagline || undefined,
    logo_url: ws.logoUrl || undefined,
    primary_color: ws.primaryColor || '#394247',
    pricing_config: resolvedPricingConfig,
    cta_button_text: ws.calculatorSettings?.lead_form?.cta?.button_text || undefined,
    lead_thank_you_message: ws.calculatorSettings?.lead_form?.cta?.helper_text || undefined,
    calculator_settings: {
      ...ws.calculatorSettings,
      calculator_type: ws.calculatorSettings?.calculator_type || 'estimate_only',
      ui_template: ws.calculatorSettings?.ui_template || { template_id: 'classic_single' },
    },
  }), [ws.businessName, ws.tagline, ws.logoUrl, ws.primaryColor, resolvedPricingConfig, ws.calculatorSettings]);

  const [testHistory, setTestHistory] = useState<TestGateResult | null>(() => {
    const th = ws.calculatorSettings.test_history;
    if (th) {
      return {
        scenarios: th.scenarios.map(s => ({ ...s, confirmed: true })),
        accuracyScore: th.accuracy_score,
        confirmed: th.confirmed,
        advancedAdjustments: th.advanced_adjustments ?? null,
        timestamp: th.timestamp,
        refinement: th.refinement ?? undefined,
      };
    }
    return null;
  });

  const handlePricingConfigChange = useCallback((newConfig: any) => {
    if (ws.isCustomTrade && ws.calculatorSettings.pricing_draft) {
      set('calculatorSettings', {
        ...ws.calculatorSettings,
        pricing_draft: {
          ...ws.calculatorSettings.pricing_draft,
          pricing_config: newConfig,
        },
      });
    }
  }, [ws.isCustomTrade, ws.calculatorSettings, set]);

  useEffect(() => {
    if (testHistory) {
      const serialized = {
        scenarios: testHistory.scenarios.map(s => ({
          label: s.label,
          inputs: s.inputs,
          yourCharge: s.yourCharge,
        })),
        accuracy_score: testHistory.accuracyScore,
        confirmed: testHistory.confirmed,
        advanced_adjustments: testHistory.advancedAdjustments,
        timestamp: testHistory.timestamp,
        refinement: testHistory.refinement || undefined,
      };
      if (JSON.stringify(ws.calculatorSettings.test_history) !== JSON.stringify(serialized)) {
        set('calculatorSettings', {
          ...ws.calculatorSettings,
          test_history: serialized,
        });
      }
    }
  }, [testHistory]);

  const selectedTradeLabel = TRADES.find(tr => tr.id === ws.selectedTrade)?.label || '';
  const selectedCategoryLabel = CATEGORIES.find(c => c.id === ws.selectedCategory)?.label || '';

  const startOver = () => {
    setStep(0);
    setWs({ ...INITIAL_STATE });
    setResult(null);
    setGenProgress(0);
    setShowHelp(false);
    setShowPreview(false);
    setValidationErrors({});
    generateMutation.reset();
    localStorage.removeItem('qq_wizard');
    localStorage.removeItem('qq_result');
    localStorage.removeItem('qq_step');
  };

  const [logoError, setLogoError] = useState('');

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const valid = ['image/png', 'image/jpeg', 'image/svg+xml'];
    if (!valid.includes(file.type)) {
      setLogoError('Please upload a PNG, JPG, or SVG file.');
      e.target.value = '';
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setLogoError('File must be under 2MB.');
      e.target.value = '';
      return;
    }
    setLogoError('');
    const reader = new FileReader();
    reader.onload = (ev) => {
      if (ev.target?.result) set('logoUrl', ev.target.result as string);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // Live preview is shown on every build step (including the first) — only the
  // published result screen (step 5) hides it.
  // Preview shows on every step except the post-publish PublishStep screen.
  const showSidePreview = !(step === 5 && result);

  return (
    <>
      <div className="wizard-shell">
      <WizardNav current={visualStep(step)} onHelp={() => setShowHelp(true)} justSaved={justSaved}
        onNavigate={(v) => setStep(VISUAL_TO_INTERNAL[v - 1])} />
      <div className={`wizard-shell-body ${showSidePreview ? '' : 'wizard-no-preview'} ${step === 6 ? 'wizard-template-mode' : ''}`}>
        <WizardSecondaryNav
          sections={SECONDARY_SECTIONS[step] || []}
          active={activeSection}
          onSelect={handleSection}
        />
        <div className="wizard-left">
          <div className="wizard-left-inner">


        {/* Step 0: Business & Trade Setup */}
        {step === 0 && (
          <div className="animate-fade-in-up wizard-step-fill">
            <div id="wiz-sec-business" style={{ scrollMarginTop: 16 }} />
            <InputField
              id="business-name" testId="input-business-name"
              label="Business Name" required
              value={ws.businessName} onChange={v => set('businessName', v)}
              placeholder="e.g. Metro Plumbing Co."
              error={validationErrors.businessName}
            />

            <div id="wiz-sec-trade" style={{ scrollMarginTop: 16 }} />
            <div style={{ marginTop: '10px', marginBottom: '10px' }}>
              <label style={{ ...p.typography.label, display: 'block', marginBottom: '4px' }}>
                What kind of work do you do? <span style={{ color: p.colors.danger }}>*</span>
              </label>
            </div>

            {/* Trade search — find your trade instantly */}
            <div style={{ marginBottom: '7px', position: 'relative' }}>
              <div style={{ position: 'relative' }}>
                <Search style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', width: '16px', height: '16px', color: p.colors.subtle }} />
                <input
                  data-testid="input-trade-search"
                  type="text"
                  placeholder="Type your trade... (e.g. plumber, cleaning, HVAC)"
                  value={!ws.selectedCategory ? tradeSearch : ''}
                  onChange={e => { setTradeSearch(e.target.value); if (ws.selectedCategory) { selectCategory(''); } }}
                  className="premium-input"
                  style={{ paddingLeft: '36px', height: '44px', fontSize: '14px' }}
                />
              </div>
              {globalSearchResults.length > 0 && !ws.selectedCategory && (
                <div style={{
                  marginTop: '6px', display: 'flex', flexDirection: 'column', gap: '4px',
                  border: `1px solid ${p.colors.border}`, borderRadius: p.radius.md,
                  background: '#fff', overflow: 'hidden',
                }}>
                  {globalSearchResults.map(tr => (
                    <button
                      key={tr.id}
                      data-testid={`search-result-${tr.id}`}
                      onClick={() => {
                        selectCategory(tr.categoryId);
                        setTimeout(() => selectTrade(tr), 0);
                        setTradeSearch('');
                      }}
                      style={{
                        textAlign: 'left', padding: '10px 14px', border: 'none',
                        background: ws.selectedTrade === tr.id ? p.colors.accentLighter : 'transparent',
                        cursor: 'pointer', fontSize: '14px', color: p.colors.heading,
                        transition: p.transitions.fast,
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = p.colors.surfaceRaised; }}
                      onMouseLeave={e => { e.currentTarget.style.background = ws.selectedTrade === tr.id ? p.colors.accentLighter : 'transparent'; }}
                    >
                      {tr.label}
                      <span style={{ fontSize: '11px', color: p.colors.subtle, marginLeft: '8px' }}>
                        {CATEGORIES.find(c => c.id === tr.categoryId)?.label}
                      </span>
                    </button>
                  ))}
                </div>
              )}
              {tradeSearch.length >= 2 && globalSearchResults.length === 0 && !ws.selectedCategory && (
                <p style={{ fontSize: '12px', color: p.colors.muted, margin: '6px 0 0' }}>
                  No matches. Choose a category below or select "Custom / Not Listed."
                </p>
              )}
            </div>

            {/* Category grid — or browse by category */}
            {!ws.selectedTrade && (
              <div style={{ marginBottom: '8px' }}>
                <p style={{ fontSize: '12px', color: p.colors.subtle, marginBottom: '8px' }}>Or browse by category:</p>
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px', marginBottom: '8px' }}>
              {CATEGORIES.map((cat) => {
                const Icon = ICON_MAP[cat.icon] || Plus;
                const sel = ws.selectedCategory === cat.id;
                return (
                  <button
                    key={cat.id}
                    data-testid={`category-${cat.id}`}
                    onClick={() => selectCategory(cat.id)}
                    className="category-card"
                    style={{
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px',
                      padding: '18px 8px', borderRadius: p.radius.lg, cursor: 'pointer',
                      border: sel ? `2px solid ${p.colors.accent}` : `1px solid ${p.colors.border}`,
                      background: sel ? p.colors.accentLighter : '#FFFFFF',
                      position: 'relative', outline: 'none',
                      WebkitTapHighlightColor: 'transparent',
                    }}
                  >
                    {sel && (
                      <div style={{
                        position: 'absolute', top: '6px', right: '6px',
                        width: '20px', height: '20px', borderRadius: '50%',
                        background: p.colors.accent, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <Check style={{ width: '12px', height: '12px', color: 'white' }} />
                      </div>
                    )}
                    <div data-testid={`icon-container-${cat.id}`} style={{
                      width: '40px', height: '40px', borderRadius: '12px',
                      background: sel ? p.colors.accent : '#F3F4F6',
                      border: `1.5px solid ${sel ? p.colors.accent : '#E5E7EB'}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0, transition: 'all 0.15s ease',
                    }}>
                      <Icon style={{ width: '20px', height: '20px', color: sel ? 'white' : p.colors.muted, flexShrink: 0 }} />
                    </div>
                    <span style={{
                      fontSize: '12px', fontWeight: 600, textAlign: 'center', lineHeight: 1.3,
                      color: sel ? p.colors.accentDark : p.colors.heading,
                    }}>
                      {cat.label}
                    </span>
                  </button>
                );
              })}
            </div>
            {validationErrors.selectedCategory && (
              <p style={{ fontSize: '12px', color: p.colors.danger, marginBottom: '8px' }}>{validationErrors.selectedCategory}</p>
            )}

            {ws.selectedCategory && ws.selectedCategory !== 'custom' && (
              <TradeDropdown
                trades={filteredTrades} searched={searchedTrades}
                selectedId={ws.selectedTrade} selectedLabel={selectedTradeLabel}
                search={tradeSearch} isOpen={tradeOpen}
                onSearch={setTradeSearch} onToggle={() => setTradeOpen(p => !p)}
                onSelect={selectTrade} onClose={() => setTradeOpen(false)}
                error={validationErrors.selectedTrade}
              />
            )}

            {ws.selectedCategory === 'custom' && (
              <>
                <CustomTradeQuestionnaire
                  data={ws.customTradeData}
                  onChange={(data) => set('customTradeData', data)}
                  calculatorSettings={ws.calculatorSettings}
                  onSettingsChange={(s) => set('calculatorSettings', s)}
                />
                {(validationErrors.customTrade || validationErrors.customTradeMinCharge || validationErrors.customTradeTripFee || validationErrors.customTradePriceRange) && (
                  <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {validationErrors.customTrade && (
                      <p data-testid="error-custom-trade" style={{ fontSize: '12px', color: p.colors.danger }}>{validationErrors.customTrade}</p>
                    )}
                    {validationErrors.customTradeMinCharge && (
                      <p data-testid="error-custom-min-charge" style={{ fontSize: '12px', color: p.colors.danger }}>{validationErrors.customTradeMinCharge}</p>
                    )}
                    {validationErrors.customTradeTripFee && (
                      <p data-testid="error-custom-trip-fee" style={{ fontSize: '12px', color: p.colors.danger }}>{validationErrors.customTradeTripFee}</p>
                    )}
                    {validationErrors.customTradePriceRange && (
                      <p data-testid="error-custom-price-range" style={{ fontSize: '12px', color: p.colors.danger }}>{validationErrors.customTradePriceRange}</p>
                    )}
                  </div>
                )}
              </>
            )}

            <div id="wiz-sec-contact" style={{ scrollMarginTop: 16 }} />
            <div style={{ marginTop: '9px' }}>
              <InputField id="owner-email" testId="input-owner-email"
                label="Your Email" sublabel="(for lead notifications)" type="email" required
                value={ws.ownerEmail} onChange={v => set('ownerEmail', v)}
                placeholder="you@company.com"
                error={validationErrors.ownerEmail} />
            </div>

            <Footer onBack={undefined} onNext={tryStep0Continue} onSave={handleManualSave}
              nextDisabled={false} backDisabled hint={STEP_HINTS[0]} />
          </div>
        )}

        {/* Step 1: Preview & Polish (side panel shows live preview on desktop) */}
        {step === 1 && (
          <div className="wizard-step-fill">
            {/* The live preview renders once, in `wizard-preview-fixed`
               (desktop: side column; mobile: stacked above the form) — no
               inline duplicate here. */}

            {/* Quick customization */}
            <div id="wiz-sec-branding" style={{ scrollMarginTop: 16 }} />
            <div className="animate-fade-in-up" style={{ marginBottom: '10px' }}>
              <label style={{ ...p.typography.label, display: 'block', marginBottom: '6px' }}>
                Brand Color
              </label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '9px', alignItems: 'center', marginBottom: '10px' }}>
                {['#0284C7', '#0ea5e9', '#2563EB', '#059669', '#f59e0b', '#ef4444', '#7C3AED', '#ec4899'].map(color => {
                  const selected = ws.primaryColor === color;
                  return (
                    <button
                      key={color}
                      data-testid={`color-option-${color.replace('#', '')}`}
                      onClick={() => set('primaryColor', color)}
                      aria-label={`Brand colour ${color}`}
                      style={{
                        width: '34px', height: '34px', borderRadius: '50%', backgroundColor: color,
                        border: 'none', cursor: 'pointer', padding: 0, flexShrink: 0,
                        boxShadow: selected
                          ? `0 0 0 2px ${d.colors.panel}, 0 0 0 4px ${color}`
                          : '0 0 0 1px rgba(15,23,42,0.10)',
                        transition: 'box-shadow 0.15s ease',
                        outline: 'none', WebkitTapHighlightColor: 'transparent',
                      }}
                    />
                  );
                })}
                {(() => {
                  const presets = ['#0284C7', '#0ea5e9', '#2563EB', '#059669', '#f59e0b', '#ef4444', '#7C3AED', '#ec4899'];
                  const isCustom = !presets.includes(ws.primaryColor);
                  return (
                    <label
                      title="Custom colour"
                      style={{
                        position: 'relative', width: '34px', height: '34px', flexShrink: 0,
                        borderRadius: '50%', cursor: 'pointer', display: 'block',
                        background: 'conic-gradient(from 0deg, #ef4444, #f59e0b, #059669, #0ea5e9, #2563eb, #7c3aed, #ec4899, #ef4444)',
                        boxShadow: isCustom
                          ? `0 0 0 2px ${d.colors.panel}, 0 0 0 4px ${ws.primaryColor}`
                          : '0 0 0 1px rgba(15,23,42,0.10)',
                      }}
                    >
                      <input data-testid="input-custom-color" type="color" value={ws.primaryColor}
                        onChange={e => set('primaryColor', e.target.value)}
                        style={{
                          position: 'absolute', inset: 0, width: '100%', height: '100%',
                          opacity: 0, cursor: 'pointer', border: 'none', padding: 0, margin: 0,
                        }} />
                    </label>
                  );
                })()}
              </div>

              <div style={{ marginBottom: '9px' }}>
                <label style={{ ...p.typography.label, display: 'block', marginBottom: '8px' }}>
                  Brand Logo <span style={{ fontWeight: 400, color: p.colors.subtle, textTransform: 'none', fontSize: '11px' }}>(optional)</span>
                </label>
                {ws.logoUrl ? (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: '6px',
                    padding: '12px 16px', borderRadius: p.radius.md,
                    border: `1px solid ${p.colors.border}`, background: p.colors.surfaceRaised,
                  }}>
                    <img src={ws.logoUrl} alt="Logo" style={{ width: '48px', height: '48px', objectFit: 'contain', borderRadius: '8px', background: 'white', border: `1px solid ${p.colors.borderLight}` }} />
                    <div style={{ flex: 1 }}>
                      <p style={{ fontSize: '13px', fontWeight: 500, color: p.colors.heading }}>Logo uploaded</p>
                      <p style={{ fontSize: '11px', color: p.colors.muted }}>PNG, JPG, or SVG</p>
                    </div>
                    <button data-testid="button-remove-logo" onClick={() => set('logoUrl', '')}
                      style={{ width: '36px', height: '36px', borderRadius: '8px', border: `1px solid ${p.colors.border}`, background: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Trash2 style={{ width: '14px', height: '14px', color: p.colors.danger }} />
                    </button>
                  </div>
                ) : (
                  <label data-testid="button-upload-logo" style={{
                    display: 'flex', alignItems: 'center', gap: '10px',
                    padding: '14px 16px', borderRadius: p.radius.md,
                    border: `1.5px dashed ${p.colors.border}`, background: p.colors.surfaceRaised,
                    cursor: 'pointer', transition: p.transitions.fast,
                  }}>
                    <Upload style={{ width: '18px', height: '18px', color: p.colors.subtle }} />
                    <span style={{ fontSize: '14px', color: p.colors.muted }}>Upload PNG, JPG or SVG</span>
                    <input type="file" accept=".png,.jpg,.jpeg,.svg" onChange={handleLogoUpload} style={{ display: 'none' }} />
                  </label>
                )}
                {logoError && <p data-testid="text-logo-error" style={{ fontSize: '12px', color: p.colors.danger, marginTop: '6px' }}>{logoError}</p>}
              </div>

              <div style={{ marginBottom: '9px' }}>
                <label htmlFor="tagline" style={{ ...p.typography.label, display: 'block', marginBottom: '8px' }}>
                  Tagline <span style={{ fontWeight: 400, color: p.colors.subtle, textTransform: 'none', fontSize: '11px' }}>(optional)</span>
                </label>
                <input id="tagline" data-testid="input-tagline"
                  value={ws.tagline} onChange={e => { if (e.target.value.length <= 120) set('tagline', e.target.value); }}
                  placeholder="e.g. Trusted concrete specialists serving the GTA."
                  className="premium-input" maxLength={120} />
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '4px' }}>
                  <span style={{ fontSize: '11px', color: ws.tagline.length > 100 ? p.colors.warning : p.colors.subtle, fontWeight: 500 }}>
                    {ws.tagline.length}/120
                  </span>
                </div>
              </div>
            </div>

            {/* Offers & call-to-action */}
            <div id="wiz-sec-offers" style={{ scrollMarginTop: 16 }} />
            <div style={{
              marginTop: '4px', marginBottom: '9px', padding: '16px',
              borderRadius: p.radius.md, border: `1px solid ${p.colors.borderLight}`,
              background: p.colors.surfaceRaised,
            }}>
              <p style={{ ...p.typography.label, marginBottom: '10px' }}>Offers &amp; call-to-action</p>

              <label htmlFor="cta-text" style={{ fontSize: '12px', fontWeight: 500, color: p.colors.body, display: 'block', marginBottom: '6px' }}>
                Button text
              </label>
              <input
                id="cta-text" data-testid="input-cta-text"
                value={ws.calculatorSettings?.lead_form?.cta?.button_text || ''}
                onChange={e => set('calculatorSettings', {
                  ...ws.calculatorSettings,
                  lead_form: {
                    ...ws.calculatorSettings.lead_form,
                    cta: { ...ws.calculatorSettings.lead_form?.cta, button_text: e.target.value.slice(0, 40) },
                  },
                })}
                placeholder="Get My Free Quote"
                className="premium-input"
              />

              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', marginTop: '7px' }}>
                <input
                  type="checkbox" data-testid="toggle-upsell"
                  checked={ws.calculatorSettings?.conversion?.show_upsell === true}
                  onChange={e => set('calculatorSettings', {
                    ...ws.calculatorSettings,
                    conversion: { ...ws.calculatorSettings.conversion, show_upsell: e.target.checked },
                  })}
                  style={{ width: 15, height: 15, accentColor: p.colors.accent }}
                />
                <span style={{ fontSize: '13px', fontWeight: 500, color: p.colors.body }}>
                  Show a special offer / upsell
                </span>
              </label>
              {ws.calculatorSettings?.conversion?.show_upsell && (
                <input
                  data-testid="input-upsell-text"
                  value={ws.calculatorSettings?.conversion?.upsell_text || ''}
                  onChange={e => set('calculatorSettings', {
                    ...ws.calculatorSettings,
                    conversion: { ...ws.calculatorSettings.conversion, upsell_text: e.target.value.slice(0, 80) },
                  })}
                  placeholder="e.g. Book this week and save 10%"
                  className="premium-input"
                  style={{ marginTop: '8px' }}
                />
              )}
            </div>

            {/* Advanced design — collapsed by default */}
            <div id="wiz-sec-look" style={{ scrollMarginTop: 16 }} />
            <details style={{ marginTop: '4px' }}>
              <summary style={{
                fontSize: '13px', fontWeight: 600, color: p.colors.accent,
                cursor: 'pointer', padding: '10px 0', listStyle: 'none',
                display: 'flex', alignItems: 'center', gap: '6px',
                userSelect: 'none',
              }}>
                <ChevronDown style={{ width: '14px', height: '14px' }} />
                Customize look &amp; feel
                <span style={{ fontSize: '11px', fontWeight: 400, color: p.colors.subtle }}>(recommended)</span>
              </summary>
              <DesignStudio
                settings={ws.calculatorSettings}
                onChange={(newSettings) => set('calculatorSettings', newSettings)}
              />
            </details>
            <Footer onBack={() => setStep(6)} onNext={() => setStep(2)} onSave={handleManualSave} hint={STEP_HINTS[1]} />
          </div>
        )}

        {/* Step 6 (visual step 2): Template picker */}
        {step === 6 && (
          <TemplatePickerStep
            selectedId={ws.calculatorSettings.ui_template?.template_id || 'classic_single'}
            onSelect={handleTemplateSelect}
            onBack={() => setStep(0)}
            onContinue={() => setStep(1)}
            onSave={handleManualSave}
          />
        )}

        {/* Step 2: Pricing Logic */}
        {step === 2 && (
          <div className="animate-fade-in-up wizard-step-fill">
            {ws.isCustomTrade ? (
              <>
                {ws.customTradeData.charge_method !== 'not_sure' && (
                  <div style={{ marginBottom: '10px' }}>
                    <PricingIntakeStage2
                      stage1={ws.customTradeData}
                      data={ws.stage2Data}
                      onChange={(data) => set('stage2Data', data)}
                    />
                  </div>
                )}
                {pricingDraftLoading ? (
                  <div style={{ textAlign: 'center', padding: '32px 0' }}>
                    <div style={{
                      width: '56px', height: '56px', borderRadius: '50%',
                      background: p.colors.accent, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      margin: '0 auto 16px', boxShadow: `0 8px 24px ${p.colors.accentGlow}`,
                    }}>
                      <Loader2 style={{ width: '24px', height: '24px', color: 'white', animation: 'spin 1.2s linear infinite' }} />
                    </div>
                    <h3 style={{ fontSize: '18px', fontWeight: 700, color: p.colors.heading, marginBottom: '6px' }}>
                      Generating Pricing Draft
                    </h3>
                    <p style={{ fontSize: '13px', color: p.colors.muted }}>
                      AI is analyzing your trade and building a pricing configuration...
                    </p>
                  </div>
                ) : ws.calculatorSettings.pricing_draft?.status === 'ready' ? (
                  <div>
                    <div style={{
                      padding: '16px', borderRadius: p.radius.md,
                      background: '#F0FDF4', border: '1px solid #BBF7D0', marginBottom: '8px',
                      display: 'flex', alignItems: 'flex-start', gap: '10px',
                    }}>
                      <CheckCircle2 style={{ width: '18px', height: '18px', color: '#059669', flexShrink: 0, marginTop: '1px' }} />
                      <div>
                        <p style={{ fontSize: '14px', fontWeight: 600, color: '#065F46', marginBottom: '4px' }}>Pricing ready for review</p>
                        <p style={{ fontSize: '13px', color: '#047857', lineHeight: 1.5 }}>
                          {(() => {
                            const score = Math.round((ws.calculatorSettings.pricing_draft?.confidence_score || 0) * 100);
                            if (score >= 80) return 'Strong match — pricing looks accurate for your trade.';
                            if (score >= 60) return 'Good match — we recommend reviewing the numbers below.';
                            return 'Needs adjustment — please review carefully before continuing.';
                          })()}
                        </p>
                      </div>
                    </div>

                    <div style={{ padding: '16px', borderRadius: p.radius.md, border: `1px solid ${p.colors.border}`, background: '#FFFFFF', marginBottom: '8px' }}>
                      <p style={{ fontSize: '11px', fontWeight: 700, color: p.colors.subtle, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '10px' }}>
                        Pricing Family
                      </p>
                      <p style={{ fontSize: '14px', fontWeight: 500, color: p.colors.heading, marginBottom: '8px' }}>
                        {ws.calculatorSettings.pricing_draft?.pricing_config?.pricingType || 'Custom'}
                      </p>

                      {(ws.calculatorSettings.pricing_draft?.assumptions || []).length > 0 && (
                        <>
                          <p style={{ fontSize: '11px', fontWeight: 700, color: p.colors.subtle, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '8px' }}>
                            Assumptions
                          </p>
                          <ul style={{ margin: 0, padding: '0 0 0 16px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            {ws.calculatorSettings.pricing_draft?.assumptions.map((a: string, i: number) => (
                              <li key={i} style={{ fontSize: '13px', color: p.colors.body, lineHeight: 1.5 }}>{a}</li>
                            ))}
                          </ul>
                        </>
                      )}
                    </div>

                    <button data-testid="button-regenerate-draft" onClick={triggerPricingDraft}
                      style={{
                        width: '100%', padding: '12px', borderRadius: p.radius.md,
                        border: `1px solid ${p.colors.border}`, background: '#FFFFFF',
                        cursor: 'pointer', fontSize: '14px', fontWeight: 500, color: p.colors.muted,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                        marginBottom: '8px',
                      }}>
                      <RotateCcw style={{ width: '14px', height: '14px' }} /> Regenerate Draft
                    </button>
                  </div>
                ) : ws.calculatorSettings.pricing_draft?.status === 'failed' ? (
                  <div>
                    <div style={{
                      padding: '16px', borderRadius: p.radius.md,
                      background: '#FEF3C7', border: '1px solid #FDE68A', marginBottom: '8px',
                      display: 'flex', alignItems: 'flex-start', gap: '10px',
                    }}>
                      <TriangleAlert style={{ width: '18px', height: '18px', color: '#D97706', flexShrink: 0, marginTop: '1px' }} />
                      <div>
                        <p style={{ fontSize: '14px', fontWeight: 600, color: '#92400E', marginBottom: '4px' }}>We'll use "Request a Quote" mode</p>
                        <p style={{ fontSize: '13px', color: '#A16207', lineHeight: 1.5 }}>
                          We couldn't auto-generate confident pricing for your trade. Instead, your calculator will ask customers to request a quote — you'll respond with a price. You can try again or continue.
                        </p>
                      </div>
                    </div>
                    <button data-testid="button-retry-draft" onClick={triggerPricingDraft}
                      style={{
                        width: '100%', padding: '12px', borderRadius: p.radius.md,
                        border: `1px solid ${p.colors.border}`, background: '#FFFFFF',
                        cursor: 'pointer', fontSize: '14px', fontWeight: 500, color: p.colors.muted,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                      }}>
                      <RotateCcw style={{ width: '14px', height: '14px' }} /> Try Again
                    </button>
                  </div>
                ) : (
                  <div style={{ padding: '8px 0' }}>
                    <div style={{
                      padding: '16px', borderRadius: p.radius.md,
                      border: `1px solid ${p.colors.border}`, background: '#FFFFFF', marginBottom: '10px',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                        <FileText style={{ width: '16px', height: '16px', color: p.colors.accent }} />
                        <p style={{ fontSize: '14px', fontWeight: 600, color: p.colors.heading, margin: 0 }}>
                          Sample Quotes <span style={{ fontSize: '12px', fontWeight: 400, color: p.colors.muted }}>(optional)</span>
                        </p>
                      </div>
                      <p style={{ fontSize: '12px', color: p.colors.muted, lineHeight: 1.5, marginBottom: '7px' }}>
                        Share 1-3 past jobs so AI can calibrate pricing. Leave blank to skip.
                      </p>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {ws.sampleQuotes.map((sq, idx) => (
                          <div key={idx} data-testid={`sample-quote-${idx}`} style={{
                            padding: '12px', borderRadius: p.radius.sm,
                            border: `1px solid ${p.colors.borderLight}`, background: '#FAFBFC',
                            display: 'flex', alignItems: 'center', gap: '10px',
                          }}>
                            <span style={{ fontSize: '11px', fontWeight: 700, color: p.colors.subtle, textTransform: 'uppercase', minWidth: '46px' }}>
                              {sq.label}
                            </span>
                            <input data-testid={`input-sq-qty-${idx}`}
                              type="number" placeholder="Qty" min="0"
                              value={sq.inputs.qty || ''}
                              onChange={e => {
                                const updated = [...ws.sampleQuotes];
                                updated[idx] = { ...updated[idx], inputs: { ...updated[idx].inputs, qty: Number(e.target.value) || 0 } };
                                set('sampleQuotes', updated);
                              }}
                              className="premium-input"
                              style={{ width: '70px', padding: '8px 10px', fontSize: '13px' }}
                            />
                            <input data-testid={`input-sq-price-${idx}`}
                              type="number" placeholder="$" min="0" step="0.01"
                              value={sq.final_price || ''}
                              onChange={e => {
                                const updated = [...ws.sampleQuotes];
                                updated[idx] = { ...updated[idx], final_price: Number(e.target.value) || 0 };
                                set('sampleQuotes', updated);
                              }}
                              className="premium-input"
                              style={{ width: '90px', padding: '8px 10px', fontSize: '13px' }}
                            />
                            <input data-testid={`input-sq-notes-${idx}`}
                              type="text" placeholder="Notes"
                              value={sq.inputs.notes_optional || ''}
                              onChange={e => {
                                const updated = [...ws.sampleQuotes];
                                updated[idx] = { ...updated[idx], inputs: { ...updated[idx].inputs, notes_optional: e.target.value } };
                                set('sampleQuotes', updated);
                              }}
                              className="premium-input"
                              style={{ flex: 1, minWidth: 0, padding: '8px 10px', fontSize: '13px' }}
                            />
                          </div>
                        ))}
                      </div>
                    </div>

                    <PrimaryBtn testId="button-generate-draft" onClick={triggerPricingDraft} fullWidth>
                      <Sparkles style={{ width: '16px', height: '16px' }} /> Generate Pricing Draft
                    </PrimaryBtn>
                  </div>
                )}
              </>
            ) : (
              <PricingBuildStep
                trade={selectedTradeLabel || 'your trade'}
                pricingMode={ws.calculatorSettings?.pricing_mode || 'ai_suggested'}
                hourlyRate={ws.calculatorSettings?.manual_hourly_rate || 75}
                fixedPrice={ws.calculatorSettings?.manual_fixed_price || 200}
                rangeMin={ws.calculatorSettings?.manual_range_min || 100}
                rangeMax={ws.calculatorSettings?.manual_range_max || 500}
                customConfig={ws.calculatorSettings?.manual_custom_config}
                fieldOverrides={ws.calculatorSettings?.field_overrides || {}}
                advanced={ws.calculatorSettings?.advanced}
                onChange={(key, val) => set('calculatorSettings', { ...ws.calculatorSettings, [key]: val })}
              />
            )}
            {Object.keys(validationErrors).some(k => k.startsWith('stage2')) && (
              <div data-testid="stage2-errors" style={{ marginTop: '6px', padding: '12px 14px', borderRadius: p.radius.md, background: '#FEF2F2', border: '1px solid #FECACA', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {Object.entries(validationErrors).filter(([k]) => k.startsWith('stage2')).map(([k, v]) => (
                  <p key={k} data-testid={`error-${k}`} style={{ fontSize: '12px', color: '#DC2626', margin: 0 }}>{v}</p>
                ))}
              </div>
            )}
            <Footer onBack={() => setStep(1)} onNext={tryStep2Continue} onSave={handleManualSave} hint={STEP_HINTS[2]} />
          </div>
        )}

        {/* Step 3: Lead Form Builder */}
        {step === 3 && (
          <LeadFormStep
            leadForm={ws.calculatorSettings.lead_form}
            action={ws.calculatorSettings.action}
            ownerEmail={ws.ownerEmail}
            onChange={(lf) => {
              set('calculatorSettings', { ...ws.calculatorSettings, lead_form: lf });
            }}
            onActionChange={(a) => {
              set('calculatorSettings', { ...ws.calculatorSettings, action: a });
            }}
            onBack={() => setStep(2)}
            onNext={() => setStep(5)}
            onSave={handleManualSave}
            draftGenerating={!!ws.draftJobId}
          />
        )}

        {/* Step 4: Final Test & Preview (quality gate) */}
        {step === 4 && !generateMutation.isPending && (
          <TestGateStep
            pricingConfig={resolvedPricingConfig}
            onPricingConfigChange={handlePricingConfigChange}
            onPublish={() => generateMutation.mutate()}
            onBack={() => setStep(1)}
            onTestHistoryChange={setTestHistory}
            publishPending={generateMutation.isPending}
            genError={genError}
            initialTestHistory={testHistory}
          />
        )}

        {step === 4 && generateMutation.isPending && (
          <GeneratingAnimation progress={genProgress} businessName={ws.businessName} />
        )}

        {/* Step 5: Publish & Share */}
        {step === 5 && result && (
          <PublishStep
            result={result}
            publishData={ws.calculatorSettings.publish}
            testPassed={!!testHistory?.confirmed}
            leadFormValid={!!(ws.calculatorSettings.lead_form.delivery.primary_email)}
            pricingExists={!!resolvedPricingConfig}
            businessName={ws.businessName}
            aiEmployee={ws.calculatorSettings.ai_employee}
            tradeCategory={ws.selectedTrade || ws.selectedCategory}
            onPublishDataChange={(pd) => set('calculatorSettings', { ...ws.calculatorSettings, publish: pd })}
            onAiEmployeeChange={(ae) => set('calculatorSettings', { ...ws.calculatorSettings, ai_employee: ae })}
            onStartOver={startOver}
          />
        )}

        {step === 5 && !result && (
          <div className="animate-fade-in-up wizard-step-fill">
            <div style={{
              display: 'flex', gap: 10, padding: 12, borderRadius: p.radius.md,
              background: p.colors.surfaceRaised, marginBottom: 18,
            }}>
              <Zap style={{ width: 16, height: 16, color: p.colors.accent, flexShrink: 0, marginTop: 1 }} />
              <p style={{ fontSize: 12.5, color: p.colors.body, lineHeight: 1.5, margin: 0 }}>
                Last step — publish your calculator to make it live. You'll get your shareable link, embed code and the done-for-you install option.
              </p>
            </div>

            {/* Publish with confirmation */}
            <div style={{ marginTop: '4px' }}>
              {showPublishConfirm && !generateMutation.isPending && (
                <div style={{
                  padding: '16px', borderRadius: p.radius.md, marginBottom: '6px',
                  background: '#F0FDF4', border: '1px solid #BBF7D0',
                }}>
                  <p style={{ fontSize: '14px', fontWeight: 600, color: '#065F46', marginBottom: '8px' }}>Ready to go live?</p>
                  <div style={{ fontSize: '13px', color: '#047857', lineHeight: 1.8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                      <span>Trade</span><strong>{selectedTradeLabel || ws.customTradeData?.short_description || 'Custom'}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                      <span>Leads sent to</span><strong>{ws.ownerEmail}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', alignItems: 'center' }}>
                      <span>Brand color</span><div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><div style={{ width: 12, height: 12, borderRadius: 3, background: ws.primaryColor }} /><strong>{ws.primaryColor}</strong></div>
                    </div>
                  </div>
                  <p style={{ fontSize: '11px', color: '#059669', marginTop: '8px' }}>You can always edit after publishing.</p>
                </div>
              )}
              <button
                data-testid="button-publish-from-preview"
                onClick={() => {
                  // Pre-publish validation — surfaced inline, not via browser alert()
                  if (!ws.businessName.trim()) {
                    setPublishError('Please enter your business name before publishing.');
                    return;
                  }
                  if (!ws.ownerEmail.trim()) {
                    setPublishError('Please enter your email so leads can reach you.');
                    return;
                  }
                  setPublishError('');
                  if (!showPublishConfirm && !generateMutation.isPending) {
                    setShowPublishConfirm(true);
                    return;
                  }
                  generateMutation.mutate();
                }}
                disabled={generateMutation.isPending}
                style={{
                  width: '100%', padding: '16px', borderRadius: p.radius.lg,
                  background: p.colors.accent, color: 'white', border: 'none',
                  fontSize: '15px', fontWeight: 700, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                  transition: p.transitions.fast,
                  opacity: generateMutation.isPending ? 0.6 : 1,
                }}
              >
                {generateMutation.isPending ? (
                  <><Loader2 style={{ width: '16px', height: '16px', animation: 'spin 1s linear infinite' }} /> Building your calculator...</>
                ) : showPublishConfirm ? (
                  <><Zap style={{ width: '16px', height: '16px' }} /> Confirm &amp; Publish</>
                ) : (
                  <><Zap style={{ width: '16px', height: '16px' }} /> Publish My Calculator</>
                )}
              </button>
              {publishError && !genError && (
                <p style={{ fontSize: '13px', color: p.colors.danger, marginTop: '8px', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                  <AlertCircle style={{ width: 14, height: 14, flexShrink: 0 }} /> {publishError}
                </p>
              )}
              {genError && (
                <p style={{ fontSize: '13px', color: p.colors.danger, marginTop: '8px', textAlign: 'center' }}>{genError}</p>
              )}
            </div>
            <Footer onBack={() => setStep(3)} onNext={undefined} onSave={handleManualSave} hint={STEP_HINTS[5]} />
          </div>
        )}

        {/* LivePreview accordion removed — real QuoteWidget is shown in:
           1. Side panel (desktop, sticky right column)
           2. Inline preview (mobile, inside Step 1)
           The old LivePreview was a static summary, not the actual calculator. */}

          </div>
        </div>

        {showSidePreview && (
          <div className="wizard-preview-fixed">
            <div className="wizard-preview-stage">
            {/* Stage header — device toggle only */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
              padding: '10px 20px 6px',
            }}>
              <div style={{
                display: 'flex', gap: 3, padding: 3, borderRadius: 10,
                background: '#fff', border: `1px solid ${p.colors.borderLight}`,
              }}>
                {([['desktop', Monitor], ['mobile', Smartphone]] as const).map(([mode, Icon]) => (
                  <button
                    key={mode}
                    data-testid={`preview-device-${mode}`}
                    onClick={() => setPreviewDevice(mode)}
                    aria-label={`${mode} preview`}
                    title={`${mode === 'desktop' ? 'Desktop' : 'Mobile'} preview`}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      width: 34, height: 27, borderRadius: 7, border: 'none', cursor: 'pointer',
                      background: previewDevice === mode ? p.colors.accentLighter : 'transparent',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <Icon style={{ width: 14, height: 14, color: previewDevice === mode ? p.colors.accent : p.colors.muted }} />
                  </button>
                ))}
              </div>
            </div>

            {/* Stage surface — the real QuoteWidget, centred on a preview canvas */}
            <div
              className="widget-scope"
              style={{
                padding: previewDevice === 'mobile' ? '4px 20px 24px' : '4px 24px 24px',
                /* Template step stacks the preview above the form — keep it
                   compact so the template strip stays near the fold. */
                minHeight: step === 6 ? 0 : 430,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              {previewDevice === 'mobile' ? (
                <div style={{
                  maxWidth: 386, margin: '0 auto',
                  background: '#0b1120', borderRadius: 42, padding: 12,
                  border: '1px solid rgba(255,255,255,0.09)',
                  boxShadow: '0 14px 32px rgba(20,30,45,0.22)',
                }}>
                  <div style={{ borderRadius: 31, overflow: 'hidden', background: '#fff' }}>
                    <QuoteWidget calculator={previewCalculatorData} isEmbed />
                  </div>
                </div>
              ) : (
                <div style={{
                  width: '100%', maxWidth: 720, margin: '0 auto',
                  borderRadius: 16, overflow: 'hidden', background: '#fff',
                  boxShadow: d.shadows.cardHover,
                }}>
                  <QuoteWidget calculator={previewCalculatorData} isEmbed />
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      </div>
      </div>

      {/* App-shell layout CSS */}
      <style>{`
        .wizard-shell {
          background: ${d.colors.canvas};
          min-height: 100vh;
          padding: ${d.layout.shellPad};
          box-sizing: border-box;
        }
        /* Detached, floating header bar — "split bars and sections".
           Two rows: a compact brand row, then the full-width step rail. */
        .wizard-navbar {
          display: flex; flex-direction: column; gap: 5px;
          height: 84px; padding: 8px 16px 10px; box-sizing: border-box;
          background: ${d.colors.panelHeader};
          border-radius: 14px;
          box-shadow: ${d.shadows.panel};
          position: sticky; top: ${d.layout.shellPad}; z-index: 30;
        }
        .wizard-nav-top {
          display: flex; align-items: center; justify-content: space-between;
          flex-shrink: 0; height: 26px;
        }
        .wizard-nav-brand {
          display: flex; align-items: center; gap: 7px; text-decoration: none;
          font-size: 13px; font-weight: 800; color: ${p.colors.heading}; flex-shrink: 0;
        }
        /* Step rail — full navbar width; scrolls horizontally if it can't fit. */
        .wizard-nav-steps {
          display: flex; align-items: center; flex: 1; min-height: 0;
          overflow-x: auto; overflow-y: hidden; scrollbar-width: none;
        }
        .wizard-nav-steps::-webkit-scrollbar { display: none; }
        /* Steps grow to fill the rail; the connector line absorbs the slack.
           They never shrink below their content — the rail scrolls instead. */
        .wizard-nav-step { display: flex; align-items: center; flex: 1 0 auto; }
        .wizard-nav-step:last-child { flex: 0 0 auto; }
        .wizard-nav-stepbtn {
          display: flex; align-items: center; gap: 0;
          border: none; background: none; padding: 4px 6px; margin: -4px 0;
          border-radius: 8px; font: inherit; transition: background 0.12s ease;
        }
        .wizard-nav-stepbtn:not(:disabled):hover { background: rgba(255,255,255,0.6); }
        .wizard-nav-num {
          width: 24px; height: 24px; border-radius: 50%; flex-shrink: 0;
          display: flex; align-items: center; justify-content: center;
          font-size: 12px; font-weight: 700; line-height: 1;
          font-variant-numeric: tabular-nums;
        }
        .wizard-nav-label { font-size: 13px; font-weight: 600; margin-left: 8px; white-space: nowrap; }
        .wizard-nav-line { flex: 1 1 12px; min-width: 12px; height: 1.5px; background: ${p.colors.border}; margin: 0 6px; }
        /* Step circles are always numbered (never checkmarks) and always filled. */
        .wizard-nav-step[data-state="todo"] .wizard-nav-num { background: #D6DEE6; color: ${p.colors.muted}; }
        .wizard-nav-step[data-state="todo"] .wizard-nav-label { color: ${p.colors.subtle}; }
        .wizard-nav-step[data-state="active"] .wizard-nav-num { background: ${p.colors.accent}; color: #fff; box-shadow: 0 0 0 3px ${p.colors.accentLighter}; }
        .wizard-nav-step[data-state="active"] .wizard-nav-label { color: ${p.colors.heading}; }
        .wizard-nav-step[data-state="done"] .wizard-nav-num { background: ${p.colors.accent}; color: #fff; }
        .wizard-nav-step[data-state="done"] .wizard-nav-label { color: ${p.colors.muted}; }
        .wizard-nav-right { display: flex; align-items: center; gap: 10px; flex-shrink: 0; }
        .wizard-nav-saved {
          font-size: 11px; font-weight: 600; color: ${p.colors.accentDark};
          background: ${p.colors.accentLighter}; padding: 3px 9px; border-radius: 999px;
          transition: opacity 0.3s ease;
        }
        .wizard-nav-help {
          width: 24px; height: 24px; border-radius: 50%; cursor: pointer;
          border: 1px solid ${p.colors.border}; background: #fff;
          color: ${p.colors.muted}; font-weight: 700; font-size: 13px;
        }
        /* Native colour picker — round the inner swatch so the custom-colour
           control reads as a circle alongside the preset swatches. */
        input[type="color"]::-webkit-color-swatch-wrapper { padding: 0; }
        input[type="color"]::-webkit-color-swatch { border: none; border-radius: 50%; }
        input[type="color"]::-moz-color-swatch { border: none; border-radius: 50%; }
        /* Main floating panel — sits below the header bar with a canvas gap. */
        .wizard-shell-body {
          display: flex; align-items: stretch;
          height: calc(100vh - 84px - ${d.layout.shellPad} - ${d.layout.shellPad} - ${d.layout.panelGap});
          margin-top: ${d.layout.panelGap};
          background: ${d.colors.panel};
          border-radius: ${d.radius.panel};
          box-shadow: ${d.shadows.panel};
          overflow: hidden;
        }
        .wizard-left {
          width: 420px; flex-shrink: 0; background: ${d.colors.panel};
          border-right: 1px solid ${d.colors.borderLight};
          height: 100%; overflow-y: auto;
        }
        .wizard-left-inner {
          padding: 12px 14px 0; min-height: 100%; box-sizing: border-box;
          display: flex; flex-direction: column;
        }
        /* The Action step owns its footer internally, so its root must fill
           the column for that footer's margin-top:auto to reach the bottom. */
        .wizard-left-inner > .wizard-step-fill { flex: 1; display: flex; flex-direction: column; }
        /* Step footer — pinned to the bottom of the form panel (margin-top:auto),
           and sticky so it stays visible while a long form scrolls. */
        .wizard-footer {
          position: sticky; bottom: 0; z-index: 5;
          margin: auto -14px 0; padding: 8px 14px 10px;
          background: ${d.colors.panel};
          border-top: 1px solid ${d.colors.borderLight};
        }
        .wizard-step-head { margin-bottom: 20px; }
        .wizard-step-title { font-size: 19px; font-weight: 800; letter-spacing: -0.02em; color: ${p.colors.heading}; margin: 0 0 4px; }
        .wizard-step-sub { font-size: 13px; line-height: 1.5; color: ${p.colors.muted}; margin: 0; }
        .wizard-preview-fixed {
          flex: 1; min-width: 0; display: flex; align-items: center; justify-content: center;
          padding: 10px; box-sizing: border-box;
          background: ${d.colors.panel};
          height: 100%; overflow-y: auto;
        }
        /* Light preview column — no dark frame; the calculator card sits
           directly on the panel grey (one preview, on-lock). */
        .wizard-preview-stage {
          width: 100%; max-width: 820px; display: flex; flex-direction: column;
          background: transparent;
        }
        .wizard-no-preview .wizard-left { width: 100%; border-right: none; }

        /* Template step — Elfsight layout: preview is the main screen, the
           template strip docks beneath it (full width, both desktop & mobile). */
        .wizard-shell-body.wizard-template-mode {
          flex-direction: column; height: auto; overflow: visible;
        }
        .wizard-template-mode .wizard-preview-fixed {
          order: 0; flex: none; height: auto; min-height: 0;
          width: 100%; overflow-y: visible; padding: 20px 24px;
        }
        .wizard-template-mode .wizard-left {
          order: 1; width: 100%; height: auto; overflow-y: visible;
          border-right: none; border-top: 1px solid ${d.colors.borderLight};
        }
        .wizard-template-mode .wizard-left-inner { padding: 18px 26px 30px; }
        .template-strip::-webkit-scrollbar { display: none; }
        .template-strip { touch-action: pan-x; }

        /* 2nd bar — contextual per-step adjustments. Desktop = left rail. */
        .wizard-2ndbar {
          display: flex; flex-direction: column; gap: 4px;
          width: 96px; flex-shrink: 0; box-sizing: border-box;
          background: transparent; border-right: 1px solid ${d.colors.borderLight};
          padding: 16px 8px;
          height: 100%; overflow-y: auto;
        }
        .wizard-2ndbar-item {
          display: flex; flex-direction: column; align-items: center; gap: 5px;
          border: none; background: none; cursor: pointer;
          padding: 9px 4px; border-radius: 10px; transition: background 0.12s ease;
        }
        .wizard-2ndbar-item:hover { background: rgba(255,255,255,0.6); }
        .wizard-2ndbar-item.is-active { background: transparent; }
        .wizard-2ndbar-icon {
          width: 34px; height: 34px; border-radius: 9px; flex-shrink: 0;
          display: flex; align-items: center; justify-content: center;
        }
        .wizard-2ndbar-label { font-size: 11px; font-weight: 600; text-align: center; line-height: 1.25; }

        @media (max-width: 980px) {
          .wizard-shell-body { flex-direction: column; height: auto; overflow: visible; }
          .wizard-left { width: 100%; height: auto; overflow-y: visible; border-right: none; }
          .wizard-left-inner { padding-bottom: 84px; min-height: 0; }
          .wizard-footer { position: static; }
          /* Single preview, stacked above the form (order:-1) — never a
             second copy under the footer. */
          .wizard-preview-fixed {
            order: -1; height: auto; min-height: 0; overflow-y: visible;
            padding: 12px 16px; border-bottom: 1px solid ${d.colors.borderLight};
          }
          .wizard-nav-label { display: none; }
          /* 2nd bar becomes a fixed bottom bar on mobile. */
          .wizard-2ndbar {
            position: fixed; bottom: 0; left: 0; right: 0;
            flex-direction: row; width: auto; height: 62px;
            background: ${d.colors.panelHeader};
            border-right: none; border-top: 1px solid ${d.colors.borderLight};
            padding: 6px 8px; gap: 0; z-index: 25;
            box-shadow: 0 -2px 12px rgba(15,23,42,0.06);
          }
          .wizard-2ndbar-item { flex: 1; padding: 5px 2px; gap: 3px; }
          .wizard-2ndbar-icon { width: 26px; height: 26px; }
          .wizard-2ndbar-label { font-size: 10px; }
        }
      `}</style>

      {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}
    </>
  );
}


function PreviewRow({ label, value, children }: { label: string; value: string; children?: any }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '10px 14px', borderRadius: '8px', background: '#F9FAFB',
    }}>
      <span style={{ fontSize: '12px', color: platformTheme.colors.muted, fontWeight: 500 }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {children}
        <span style={{ fontSize: '13px', fontWeight: 500, color: platformTheme.colors.heading, maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</span>
      </div>
    </div>
  );
}


function LivePreview({ ws, tradeLabel, categoryLabel, isOpen, onToggle, step }: {
  ws: WizardState; tradeLabel: string; categoryLabel: string;
  isOpen: boolean; onToggle: () => void; step: number;
}) {
  if (step === 4 || step === 5) return null;

  return (
    <div style={{ marginTop: '10px', borderTop: `1px solid ${p.colors.borderLight}`, paddingTop: '16px' }}>
      <button data-testid="button-live-preview-toggle" onClick={onToggle}
        style={{
          width: '100%', padding: '12px 16px', borderRadius: p.radius.md,
          border: `1px solid ${p.colors.border}`, background: p.colors.surfaceRaised,
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          WebkitTapHighlightColor: 'transparent',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Eye style={{ width: '16px', height: '16px', color: p.colors.accent }} />
          <div style={{ textAlign: 'left' }}>
            <span style={{ fontSize: '14px', fontWeight: 600, color: p.colors.heading, display: 'block' }}>Live Quote Preview</span>
            <span style={{ fontSize: '11px', color: p.colors.muted }}>See how your calculator will appear to customers.</span>
          </div>
        </div>
        <ChevronDown style={{
          width: '18px', height: '18px', color: p.colors.muted,
          transition: p.transitions.fast, transform: isOpen ? 'rotate(180deg)' : 'rotate(0)',
        }} />
      </button>

      {isOpen && (
        <div className="animate-expand widget-scope" style={{
          marginTop: '10px', padding: '20px', borderRadius: p.radius.md,
          border: `1px solid ${p.colors.border}`, background: 'white',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
            {ws.logoUrl ? (
              <img data-testid="preview-logo" src={ws.logoUrl} alt="Logo" style={{ width: '40px', height: '40px', objectFit: 'contain', borderRadius: '8px' }} />
            ) : (
              <div data-testid="preview-logo-placeholder" style={{ width: '40px', height: '40px', borderRadius: '8px', background: ws.primaryColor || '#0284C7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: '16px', fontWeight: 700, color: 'white' }}>
                  {(ws.businessName || 'Q').charAt(0).toUpperCase()}
                </span>
              </div>
            )}
            <div style={{ flex: 1 }}>
              <p data-testid="preview-business-name" style={{ fontSize: '16px', fontWeight: 700, color: p.colors.heading }}>
                {ws.businessName || 'Your Business Name'}
              </p>
              {ws.tagline && (
                <p data-testid="preview-tagline" style={{ fontSize: '12px', color: p.colors.muted, marginTop: '2px' }}>{ws.tagline}</p>
              )}
            </div>
          </div>

          <div style={{
            padding: '12px 16px', borderRadius: p.radius.sm,
            background: '#F3F4F6', marginBottom: '6px',
          }}>
            <p style={{ fontSize: '11px', fontWeight: 700, color: p.colors.subtle, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '6px' }}>Category</p>
            <p data-testid="preview-category" style={{ fontSize: '14px', fontWeight: 500, color: p.colors.heading }}>
              {categoryLabel || ws.customTradeData.short_description || 'Not selected'}
            </p>
            {tradeLabel && (
              <p data-testid="preview-trade" style={{ fontSize: '12px', color: p.colors.muted, marginTop: '2px' }}>{tradeLabel}</p>
            )}
          </div>

          <div style={{
            marginTop: '6px', padding: '10px 16px', borderRadius: p.radius.sm,
            background: `${ws.primaryColor || '#0284C7'}0A`,
            border: `1px solid ${ws.primaryColor || '#0284C7'}18`,
            display: 'flex', alignItems: 'center', gap: '8px',
          }}>
            <div style={{ width: '16px', height: '16px', borderRadius: '4px', background: ws.primaryColor || '#0284C7' }} />
            <span style={{ fontSize: '12px', color: p.colors.muted }}>Brand color: <strong>{ws.primaryColor || '#0284C7'}</strong></span>
          </div>

          {ws.calculatorSettings.appearance.button_style !== 'soft-rounded' && (
            <div style={{ marginTop: '8px', padding: '10px 16px', borderRadius: p.radius.sm, background: '#F9FAFB' }}>
              <span style={{ fontSize: '12px', color: p.colors.muted }}>
                Button: <strong>{ws.calculatorSettings.appearance.button_style}</strong>
                {' · '}Font: <strong>{ws.calculatorSettings.appearance.font}</strong>
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}


function SummaryCard({ ws, tradeLabel }: { ws: WizardState; tradeLabel: string }) {
  return (
    <div style={{
      marginTop: '10px', padding: '16px', borderRadius: p.radius.md,
      background: p.colors.surfaceRaised, border: `1px solid ${p.colors.borderLight}`,
    }}>
      <p style={{ fontSize: '11px', fontWeight: 700, color: p.colors.subtle, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '10px' }}>
        Summary
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <SummaryRow label="Business" value={ws.businessName} />
        <SummaryRow label="Trade" value={tradeLabel || ws.customTradeData.short_description || '---'} />
        {ws.tagline && <SummaryRow label="Tagline" value={ws.tagline} />}
        {ws.ownerEmail && <SummaryRow label="Email" value={ws.ownerEmail} />}
      </div>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '6px' }}>
      <span style={{ fontSize: '12px', color: p.colors.muted, flexShrink: 0, minWidth: '60px' }}>{label}</span>
      <span style={{ fontSize: '13px', fontWeight: 500, color: p.colors.heading, textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as any }}>{value}</span>
    </div>
  );
}

/** Preview sections for enabled feature toggles — renders below the QuoteWidget */
function FeatureTogglePreviews({ layout, primaryColor }: { layout?: any; primaryColor?: string }) {
  const sticky = layout?.sticky_summary;
  const breakdown = layout?.show_breakdown;
  const trust = layout?.show_trust_block;
  const testimonials = layout?.show_testimonials;
  const accent = primaryColor || '#0d3cfc';

  if (!sticky && !breakdown && !trust && !testimonials) return null;

  return (
    <div style={{ padding: '12px 14px', borderTop: `1px solid ${p.colors.borderLight}`, background: '#fff' }}>
      <p style={{ fontSize: 10, fontWeight: 700, color: p.colors.subtle, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>
        Enabled features
      </p>

      {sticky && (
        <div style={{
          padding: '10px 14px', borderRadius: 10, marginBottom: 8,
          background: accent, color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
        }}>
          <span style={{ fontSize: 12, fontWeight: 600 }}>Estimated Total</span>
          <span style={{ fontSize: 16, fontWeight: 700 }}>$285</span>
        </div>
      )}

      {breakdown && (
        <div style={{
          padding: '10px 14px', borderRadius: 8, marginBottom: 8,
          border: `1px solid ${p.colors.borderLight}`, background: '#FAFBFC',
        }}>
          <p style={{ fontSize: 11, fontWeight: 600, color: p.colors.heading, marginBottom: 6 }}>Price Breakdown</p>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: p.colors.muted, marginBottom: 3 }}>
            <span>Labor (3 hrs × $75)</span><span>$225</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: p.colors.muted, marginBottom: 3 }}>
            <span>Call-out fee</span><span>$60</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 600, color: p.colors.heading, borderTop: `1px solid ${p.colors.borderLight}`, paddingTop: 4 }}>
            <span>Total</span><span>$285</span>
          </div>
        </div>
      )}

      {trust && (
        <div style={{
          padding: '10px 14px', borderRadius: 8, marginBottom: 8,
          border: `1px solid ${p.colors.borderLight}`, background: '#F0FDF4',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <Shield style={{ width: 14, height: 14, color: '#059669', flexShrink: 0 }} />
          <div>
            <p style={{ fontSize: 11, fontWeight: 600, color: '#065F46', margin: 0 }}>Verified & Insured</p>
            <p style={{ fontSize: 10, color: '#047857', margin: 0 }}>Licensed · Background checked · Satisfaction guaranteed</p>
          </div>
        </div>
      )}

      {testimonials && (
        <div style={{
          padding: '10px 14px', borderRadius: 8, marginBottom: 4,
          border: `1px solid ${p.colors.borderLight}`, background: '#FFFBEB',
        }}>
          <div style={{ display: 'flex', gap: 2, marginBottom: 4 }}>
            {[1,2,3,4,5].map(i => <span key={i} style={{ fontSize: 12, color: '#F59E0B' }}>★</span>)}
          </div>
          <p style={{ fontSize: 12, color: p.colors.body, lineHeight: 1.4, margin: 0, fontStyle: 'italic' }}>
            "Fast, professional, and great price. Will definitely use again."
          </p>
          <p style={{ fontSize: 11, color: p.colors.muted, marginTop: 4 }}>— Recent customer</p>
        </div>
      )}
    </div>
  );
}

function GeneratingAnimation({ progress, businessName }: { progress: number; businessName: string }) {
  const messages = [
    'Analyzing your trade...',
    'Building pricing structure...',
    'Generating service questions...',
    'Creating your calculator...',
    'Almost there...',
  ];
  const msgIndex = Math.min(Math.floor(progress / 22), messages.length - 1);

  return (
    <div className="animate-fade-in" style={{ textAlign: 'center', padding: '16px 0 8px' }}>
      <div style={{
        width: '56px', height: '56px', borderRadius: '50%',
        background: p.colors.accent,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        margin: '0 auto 20px',
        boxShadow: `0 8px 24px ${p.colors.accentGlow}`,
      }}>
        <Loader2 style={{ width: '24px', height: '24px', color: 'white', animation: 'spin 1.2s linear infinite' }} />
      </div>

      <h3 style={{ fontSize: '18px', fontWeight: 700, color: p.colors.heading, marginBottom: '6px' }}>
        Building {businessName || 'Your Calculator'}
      </h3>
      <p style={{ fontSize: '13px', color: p.colors.muted, marginBottom: '12px', minHeight: '20px' }}>
        {messages[msgIndex]}
      </p>

      <div style={{
        height: '4px', borderRadius: '2px',
        background: p.colors.borderLight, overflow: 'hidden',
        margin: '0 8px',
      }}>
        <div style={{
          height: '100%', width: `${progress}%`,
          background: p.colors.accent, borderRadius: '2px',
          transition: 'width 0.4s ease-out',
        }} />
      </div>
      <p style={{ fontSize: '12px', color: p.colors.subtle, marginTop: '8px' }}>
        {Math.round(progress)}%
      </p>
    </div>
  );
}




/* ─── Top step navbar (app-shell chrome) ─── */
// 5-step target model: Trade · Template · Pricing · Branding · Go live.
// Stage 1 wires the layout for today's 4 build steps; Template + Go-live
// land as their own stages.
const NAV_STEPS = ['Business', 'Templates', 'Design', 'Logic', 'CTA & Marketing', 'Install'];

function WizardNav({ current, onHelp, justSaved, onNavigate }: {
  current: number; onHelp: () => void; justSaved?: boolean;
  onNavigate?: (visualStep: number) => void;
}) {
  return (
    <div className="wizard-navbar">
      <div className="wizard-nav-top">
        <a href="/" className="wizard-nav-brand" aria-label="WeFixTrades home">
          <img src="/favicon.svg" alt="" style={{ width: 16, height: 16 }}
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
          <span>QuoteQuick</span>
        </a>
        <div className="wizard-nav-right">
          <span className="wizard-nav-saved" style={{ opacity: justSaved ? 1 : 0 }}>✓ Saved</span>
          <button onClick={onHelp} className="wizard-nav-help" aria-label="Help">?</button>
        </div>
      </div>
      <div className="wizard-nav-steps">
        {NAV_STEPS.map((label, i) => {
          const n = i + 1;
          const state = current > n ? 'done' : current === n ? 'active' : 'todo';
          // Clickable only for reached steps (done or active) — no skipping ahead.
          const reachable = n <= current && !!onNavigate;
          return (
            <div key={n} className="wizard-nav-step" data-state={state}>
              <button
                type="button"
                className="wizard-nav-stepbtn"
                data-testid={`nav-step-${n}`}
                disabled={!reachable || n === current}
                onClick={() => reachable && onNavigate!(n)}
                style={{ cursor: reachable && n !== current ? 'pointer' : 'default' }}
              >
                <span className="wizard-nav-num">{n}</span>
                <span className="wizard-nav-label">{label}</span>
              </button>
              {n < NAV_STEPS.length && <span className="wizard-nav-line" />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Shell({ children, step, total, onHelp, title, subtitle, generating, genProgress, justSaved, stepTime }: {
  children: any; step: number; total: number; onHelp: () => void;
  title?: string; subtitle?: string; generating?: boolean; genProgress?: number;
  justSaved?: boolean; stepTime?: string;
}) {
  // `step` is 1-based; the published result screen is `total + 1`.
  const isResult = step > total;
  const progress = generating
    ? Math.min((step / total) * 100, 100)
    : Math.min((step / total) * 100, 100);

  return (
    <div style={{
      borderRadius: '20px', overflow: 'visible',
      background: '#FFFFFF', boxShadow: p.shadows.wizardCard,
      border: `1px solid ${p.colors.border}`,
    }}>
      <div style={{
        padding: '20px 24px 20px', position: 'relative',
        borderRadius: '20px 20px 0 0', borderBottom: `1px solid ${p.colors.borderLight}`,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: '12px', fontWeight: 600, letterSpacing: '0.02em', color: p.colors.muted }}>
              {isResult ? 'Published' : `Step ${step} of ${total}`}
            </span>
            {!isResult && step === total && (
              <span style={{
                fontSize: '11px', fontWeight: 600, color: '#059669',
                background: '#ECFDF5', border: '1px solid #A7F3D0',
                padding: '2px 8px', borderRadius: 20,
              }}>
                Last step
              </span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{
              fontSize: '11px', fontWeight: 600,
              color: justSaved ? '#0d3cfc' : 'transparent',
              background: justSaved ? '#EEF3FF' : 'transparent',
              border: `1px solid ${justSaved ? '#A7F3D0' : 'transparent'}`,
              padding: '2px 8px', borderRadius: 20,
              transition: 'all 0.3s ease',
            }}>
              ✓ Saved
            </span>
            <button data-testid="button-help" onClick={onHelp}
              style={{
                width: '28px', height: '28px', borderRadius: '50%',
                border: '1px solid #BFDBFE', background: '#EFF6FF',
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                WebkitTapHighlightColor: 'transparent',
              }}
              aria-label="Help"
            >
              <HelpCircle style={{ width: '15px', height: '15px', color: '#3B82F6' }} />
            </button>
          </div>
        </div>

        {title && (
          <div style={{ marginBottom: '4px' }}>
            <h2 style={{ fontSize: '20px', fontWeight: 700, lineHeight: 1.2, marginBottom: '4px', color: p.colors.heading }}>{title}</h2>
            {subtitle && <p style={{ fontSize: '13px', color: p.colors.muted, lineHeight: 1.4 }}>{subtitle}</p>}
          </div>
        )}

        <div style={{
          height: '3px', borderRadius: '2px',
          background: p.colors.borderLight,
          marginTop: '7px', overflow: 'hidden',
        }}>
          <div style={{
            height: '100%', width: `${progress}%`,
            background: p.colors.accent, borderRadius: '2px',
            transition: 'width 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
          }} />
        </div>
      </div>

      <div style={{ padding: '24px 24px 20px', position: 'relative' }}>
        {children}
      </div>
    </div>
  );
}


function InputField({ id, testId, label, sublabel, required, value, onChange, placeholder, type, multiline, rows, error }: {
  id: string; testId: string; label: string; sublabel?: string; required?: boolean;
  value: string; onChange: (v: string) => void; placeholder: string;
  type?: string; multiline?: boolean; rows?: number; error?: string;
}) {
  return (
    <div>
      <label htmlFor={id} style={{ ...p.typography.label, display: 'block', marginBottom: '8px' }}>
        {label} {required && <span style={{ color: p.colors.danger }}>*</span>}
        {sublabel && <span style={{ fontWeight: 400, color: p.colors.subtle, textTransform: 'none', fontSize: '11px', marginLeft: '4px' }}>{sublabel}</span>}
      </label>
      {multiline ? (
        <textarea id={id} data-testid={testId} value={value}
          onChange={e => onChange(e.target.value)} placeholder={placeholder}
          rows={rows || 3} className="premium-input"
          style={error ? { resize: 'vertical', borderColor: p.colors.danger, background: '#FEF2F2' } : { resize: 'vertical' }} />
      ) : (
        <input id={id} data-testid={testId} type={type || 'text'}
          value={value} onChange={e => onChange(e.target.value)}
          placeholder={placeholder} className="premium-input"
          style={error ? { borderColor: p.colors.danger, background: '#FEF2F2' } : undefined}
        />
      )}
      {error && <p data-error-field={id} style={{ fontSize: '12px', color: p.colors.danger, marginTop: '4px', display: 'flex', alignItems: 'center', gap: 4 }}>⚠ {error}</p>}
    </div>
  );
}


function TradeDropdown({ trades, searched, selectedId, selectedLabel, search, isOpen, onSearch, onToggle, onSelect, onClose, error }: {
  trades: Trade[]; searched: Trade[]; selectedId: string; selectedLabel: string;
  search: string; isOpen: boolean; onSearch: (v: string) => void;
  onToggle: () => void; onSelect: (t: Trade) => void; onClose: () => void;
  error?: string;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0, width: 0 });

  useEffect(() => {
    if (isOpen && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setDropdownPos({ top: rect.bottom + 6, left: rect.left, width: rect.width });
    }
  }, [isOpen]);

  useEffect(() => { if (isOpen && searchRef.current) searchRef.current.focus(); }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const h = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
          triggerRef.current && !triggerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [isOpen, onClose]);

  return (
    <div className="animate-fade-in" style={{ marginBottom: '8px' }}>
      <label style={{ ...p.typography.label, display: 'block', marginBottom: '8px' }}>
        Choose Your Primary Trade <span style={{ color: p.colors.danger }}>*</span>
      </label>
      <button ref={triggerRef} data-testid="trade-dropdown-trigger" onClick={onToggle}
        style={{
          width: '100%', padding: '12px 16px', borderRadius: p.radius.md,
          border: `1px solid ${isOpen ? p.colors.accent : error ? p.colors.danger : p.colors.border}`,
          background: '#FFFFFF', cursor: 'pointer', textAlign: 'left',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          fontSize: '15px', color: selectedId ? p.colors.heading : p.colors.subtle,
          transition: p.transitions.fast,
          boxShadow: isOpen ? p.shadows.focus : 'none',
          WebkitTapHighlightColor: 'transparent',
        }}
      >
        <span>{selectedLabel || 'Choose a trade...'}</span>
        <ChevronDown style={{
          width: '18px', height: '18px', color: p.colors.muted,
          transition: p.transitions.fast, transform: isOpen ? 'rotate(180deg)' : 'rotate(0)',
        }} />
      </button>
      {error && !isOpen && <p style={{ fontSize: '12px', color: p.colors.danger, marginTop: '4px' }}>{error}</p>}

      {isOpen && createPortal(
        <>
          <div className="trade-dropdown-overlay" onClick={onClose} />
          <div ref={dropdownRef} className="animate-scale-in" style={{
            position: 'fixed',
            top: `${dropdownPos.top}px`, left: `${dropdownPos.left}px`,
            width: `${dropdownPos.width}px`,
            borderRadius: p.radius.md,
            border: `1px solid ${p.colors.border}`, background: '#FFFFFF',
            boxShadow: p.shadows.xl, zIndex: 50, overflow: 'hidden',
          }}>
            <div style={{ padding: '10px 12px', borderBottom: `1px solid ${p.colors.borderLight}` }}>
              <div style={{ position: 'relative' }}>
                <Search style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', width: '16px', height: '16px', color: p.colors.subtle }} />
                <input ref={searchRef} data-testid="trade-search-input" value={search}
                  onChange={e => onSearch(e.target.value)} placeholder="Search trades..."
                  style={{
                    width: '100%', padding: '10px 12px 10px 34px', borderRadius: '8px',
                    border: `1px solid ${p.colors.border}`, fontSize: '14px',
                    background: p.colors.surfaceRaised, boxSizing: 'border-box', outline: 'none',
                  }}
                  onFocus={e => { (e.currentTarget as HTMLElement).style.borderColor = p.colors.accent; }}
                  onBlur={e => { (e.currentTarget as HTMLElement).style.borderColor = p.colors.border; }}
                />
              </div>
            </div>
            <div style={{ maxHeight: '240px', overflowY: 'auto' }}>
              {searched.length === 0 ? (
                <div style={{ padding: '20px 16px', textAlign: 'center', fontSize: '13px', color: p.colors.muted }}>
                  No trades found for "{search}"
                </div>
              ) : searched.map(tr => (
                <button key={tr.id} data-testid={`trade-option-${tr.id}`} onClick={() => onSelect(tr)}
                  style={{
                    width: '100%', padding: '12px 16px', border: 'none',
                    background: tr.id === selectedId ? p.colors.accentLighter : 'transparent',
                    cursor: 'pointer', textAlign: 'left', fontSize: '14px',
                    color: tr.id === selectedId ? p.colors.accentDark : p.colors.body,
                    fontWeight: tr.id === selectedId ? 600 : 400,
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    transition: p.transitions.fast, WebkitTapHighlightColor: 'transparent',
                  }}
                >
                  <span>{tr.label}</span>
                  {tr.id === selectedId && <Check style={{ width: '16px', height: '16px', color: p.colors.accent }} />}
                </button>
              ))}
            </div>
          </div>
        </>,
        document.body
      )}
    </div>
  );
}



function MiniField({ label, required, optional, error, children }: {
  label: string; required?: boolean; optional?: boolean; error?: string; children: any;
}) {
  return (
    <div>
      <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: 500, color: p.colors.body }}>
        {label} {required && <span style={{ color: p.colors.danger }}>*</span>}
        {optional && <span style={{ fontWeight: 400, color: p.colors.subtle, fontSize: '11px' }}> (optional)</span>}
      </label>
      {children}
      {error && <p style={{ fontSize: '12px', color: p.colors.danger, marginTop: '4px' }}>{error}</p>}
    </div>
  );
}


/* Secondary "Save" button — persists the draft and flashes confirmation. */
function SaveButton({ onSave }: { onSave: () => void }) {
  const [saved, setSaved] = useState(false);
  return (
    <button
      data-testid="button-save"
      onClick={() => { onSave(); setSaved(true); setTimeout(() => setSaved(false), 1800); }}
      style={{
        display: 'flex', alignItems: 'center', gap: '6px',
        padding: '10px 16px', borderRadius: p.radius.md,
        border: `1px solid ${saved ? p.colors.accent : p.colors.border}`,
        background: saved ? p.colors.accentLighter : '#FFFFFF',
        cursor: 'pointer', fontSize: '14px', fontWeight: 600,
        color: saved ? p.colors.accentDark : p.colors.body,
        transition: p.transitions.fast, WebkitTapHighlightColor: 'transparent',
        minHeight: '44px',
      }}
    >
      {saved
        ? <><Check style={{ width: 15, height: 15 }} /> Saved</>
        : <><Save style={{ width: 15, height: 15 }} /> Save</>}
    </button>
  );
}

function Footer({ onBack, onNext, onSave, nextDisabled, backDisabled, children, hint }: {
  onBack?: () => void; onNext?: () => void; onSave?: () => void;
  nextDisabled?: boolean; backDisabled?: boolean;
  children?: any; hint?: string;
}) {
  return (
    <div className="wizard-footer">
      {hint && (
        <p style={{ fontSize: '12px', color: p.colors.muted, marginBottom: '6px', textAlign: 'center', lineHeight: 1.4 }}>
          {hint}
        </p>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
        <button data-testid="button-back"
          onClick={backDisabled ? undefined : onBack} disabled={backDisabled}
          style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            padding: '10px 16px', borderRadius: p.radius.md,
            border: `1px solid ${p.colors.border}`, background: '#FFFFFF',
            cursor: backDisabled ? 'default' : 'pointer',
            fontSize: '14px', fontWeight: 500, color: backDisabled ? p.colors.subtle : p.colors.muted,
            transition: p.transitions.fast, opacity: backDisabled ? 0.5 : 1,
            WebkitTapHighlightColor: 'transparent', minHeight: '44px', whiteSpace: 'nowrap',
          }}
        >
          <ArrowLeft style={{ width: '16px', height: '16px' }} /> Back
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {onSave && <SaveButton onSave={onSave} />}
          {children || (onNext ? (
            <PrimaryBtn testId="button-continue" onClick={onNext} disabled={nextDisabled}>
              Continue <ArrowRight style={{ width: '16px', height: '16px' }} />
            </PrimaryBtn>
          ) : null)}
        </div>
      </div>
    </div>
  );
}


function PrimaryBtn({ children, onClick, disabled, loading, testId, fullWidth, style: extraStyle }: {
  children: any; onClick?: () => void; disabled?: boolean; loading?: boolean;
  testId?: string; fullWidth?: boolean; style?: any;
}) {
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);

  return (
    <button data-testid={testId}
      onClick={disabled ? undefined : onClick} disabled={disabled}
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => { setHovered(false); setPressed(false); }}
      onMouseDown={() => setPressed(true)} onMouseUp={() => setPressed(false)}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
        padding: '10px 22px', borderRadius: p.radius.md, border: 'none',
        background: disabled && !loading ? '#D1D5DB' : (hovered && !disabled ? p.colors.accentDark : p.colors.accent),
        color: disabled && !loading ? '#9CA3AF' : 'white',
        cursor: disabled ? (loading ? 'wait' : 'not-allowed') : 'pointer',
        fontSize: '14px', fontWeight: 600, whiteSpace: 'nowrap',
        boxShadow: disabled ? 'none' : (hovered && !disabled ? p.shadows.buttonHover : p.shadows.button),
        opacity: loading ? 0.9 : 1,
        width: fullWidth ? '100%' : 'auto',
        transform: pressed && !disabled ? 'scale(0.98)' : (hovered && !disabled ? 'translateY(-1px)' : 'none'),
        transition: 'all 0.15s ease-out',
        WebkitTapHighlightColor: 'transparent', minHeight: '44px',
        ...extraStyle,
      }}
    >
      {children}
    </button>
  );
}


function HelpModal({ onClose }: { onClose: () => void }) {
  const modalRef = useRef<HTMLDivElement>(null);
  const [expandedQ, setExpandedQ] = useState<number | null>(null);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 640);

  useEffect(() => {
    const h = () => setIsMobile(window.innerWidth < 640);
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', h);
    modalRef.current?.focus();
    return () => { document.body.style.overflow = ''; document.removeEventListener('keydown', h); };
  }, [onClose]);

  const faqs = [
    { q: 'Do I need an account?', a: 'No account needed. You\'ll receive a secure edit link to manage your calculator for 7 days. After that, you can duplicate it to keep going.' },
    { q: 'How do I add this to my website?', a: 'After generating your calculator, you\'ll receive an embed code. Copy the HTML snippet and paste it into your website\'s code wherever you want the calculator to appear.' },
    { q: 'What if I don\'t have a website?', a: 'No problem! Every calculator gets a unique shareable link. Send it directly to customers via email, text, or social media.' },
    { q: 'How do I receive leads?', a: 'When customers submit a quote request through your calculator, their contact info and quote details are captured. View all leads from your Leads Dashboard.' },
    { q: 'Can I edit later?', a: 'Yes! Use your edit link to update business details, pricing, questions, branding, and more anytime within the 7-day window.' },
  ];

  return createPortal(
    <div
      className="animate-modal-overlay"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        display: 'flex',
        alignItems: isMobile ? 'flex-end' : 'center',
        justifyContent: 'center',
        background: 'rgba(0, 0, 0, 0.2)',
        backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
        padding: isMobile ? '0' : '20px',
      }}
    >
      <div ref={modalRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="How it works"
        className={isMobile ? 'animate-modal-sheet' : 'animate-modal-content'}
        style={{
          width: '100%',
          maxWidth: isMobile ? '100%' : '420px',
          background: '#FFFFFF',
          borderRadius: isMobile ? `${p.radius.xl} ${p.radius.xl} 0 0` : p.radius.xl,
          boxShadow: p.shadows.xl,
          padding: '24px 20px 28px',
          outline: 'none',
          maxHeight: isMobile ? '85vh' : '80vh',
          overflowY: 'auto',
          position: 'relative',
        }}
      >
        {isMobile && (
          <div style={{ width: '36px', height: '4px', borderRadius: '2px', background: p.colors.border, margin: '0 auto 16px' }} />
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <h3 style={{ fontSize: '20px', fontWeight: 700, color: p.colors.heading }}>How it works</h3>
          <button data-testid="button-close-help" onClick={onClose} aria-label="Close"
            style={{
              width: '32px', height: '32px', borderRadius: '50%',
              border: 'none', background: p.colors.borderLight,
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <X style={{ width: '16px', height: '16px', color: p.colors.muted }} />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '14px' }}>
          {[
            { n: 1, text: 'Customize your instant quote tool' },
            { n: 2, text: 'Set your pricing logic' },
            { n: 3, text: 'Publish and start receiving qualified leads' },
          ].map(item => (
            <div key={item.n} style={{ display: 'flex', gap: '7px', alignItems: 'center' }}>
              <div style={{
                width: '32px', height: '32px', borderRadius: '50%', flexShrink: 0,
                background: p.colors.accentLighter,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '14px', fontWeight: 700, color: p.colors.accent,
              }}>
                {item.n}
              </div>
              <p style={{ fontSize: '15px', fontWeight: 500, color: p.colors.heading, lineHeight: 1.4 }}>
                {item.text}
              </p>
            </div>
          ))}
        </div>

        <p style={{
          fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
          color: p.colors.subtle, marginBottom: '6px',
        }}>
          Questions
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', borderTop: `1px solid ${p.colors.borderLight}` }}>
          {faqs.map((faq, i) => (
            <div key={i} style={{ borderBottom: `1px solid ${p.colors.borderLight}` }}>
              <button
                data-testid={`faq-toggle-${i}`}
                onClick={() => setExpandedQ(expandedQ === i ? null : i)}
                style={{
                  width: '100%', padding: '14px 0', border: 'none', background: 'none',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  fontSize: '14px', fontWeight: 500, color: p.colors.heading, textAlign: 'left',
                  WebkitTapHighlightColor: 'transparent',
                }}
              >
                <span>{faq.q}</span>
                <ChevronDown style={{
                  width: '16px', height: '16px', color: p.colors.muted, flexShrink: 0,
                  transition: p.transitions.fast,
                  transform: expandedQ === i ? 'rotate(180deg)' : 'rotate(0)',
                }} />
              </button>
              {expandedQ === i && (
                <div className="animate-expand" style={{ paddingBottom: '14px' }}>
                  <p style={{ fontSize: '13px', color: p.colors.muted, lineHeight: 1.6 }}>{faq.a}</p>
                </div>
              )}
            </div>
          ))}
        </div>

        <div style={{
          marginTop: '12px', padding: '16px', borderRadius: p.radius.md,
          background: '#FFFBEB', textAlign: 'center',
        }}>
          <p style={{ fontSize: '14px', fontWeight: 500, color: p.colors.heading, marginBottom: '6px' }}>
            Need something custom?
          </p>
          <button
            data-testid="button-request-custom-tool"
            onClick={onClose}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '6px',
              padding: '10px 20px', borderRadius: p.radius.md, border: 'none',
              background: '#FBBF24', color: '#78350F',
              cursor: 'pointer', fontSize: '14px', fontWeight: 600,
              boxShadow: '0 1px 3px rgba(251,191,36,0.3), 0 1px 2px rgba(0,0,0,0.06)',
              transition: p.transitions.fast,
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            Request Custom Tool <ArrowRight style={{ width: '14px', height: '14px' }} />
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}


