// FROZEN — scheduled for rebuild in Phase 3 (Builder Wizard). Do not add features.
// This component will be decomposed into tab-level modules.
import { useState, useCallback } from 'react';
import { platformTheme } from '@/theme/platformTheme';
import type { CalculatorSettings } from '@shared/schema';
import { TEMPLATE_LIBRARY, getTemplateById } from '@shared/templateLibrary';
import type { TemplateDefinition } from '@shared/templateLibrary';
import type { ConversionBlocks, ConversionImageItem, ConversionTestimonialItem } from '@shared/schema';
import {
  Palette, Layout, TrendingUp, Link2, ChevronDown, ChevronRight,
  Info, Lock, Check, Type, Smartphone, Monitor, Globe, DollarSign,
  Mail, Phone, Clock, Eye, EyeOff, Calendar, ExternalLink,
  Sparkles, AlertTriangle, Code2, Zap, Moon, Languages, Gauge,
  LayoutGrid, Columns2, ListOrdered, CreditCard, ShieldCheck, CalendarCheck,
  X, ArrowUp, ArrowDown, Star, Image, MessageSquare, Shield, Award, ThumbsUp, Plus, Upload
} from 'lucide-react';

const p = platformTheme;

const TABS = [
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'layout', label: 'Layout', icon: Layout },
  { id: 'conversion', label: 'Conversion', icon: TrendingUp },
  { id: 'integrations', label: 'Integrations', icon: Link2 },
  { id: 'automation', label: 'Automation', icon: Zap },
] as const;

type TabId = typeof TABS[number]['id'];

interface DesignStudioProps {
  settings: CalculatorSettings;
  onChange: (settings: CalculatorSettings) => void;
}

const TEMPLATE_ICONS: Record<string, any> = {
  classic_single: LayoutGrid,
  classic_two_column: Columns2,
  multi_step_progressive: ListOrdered,
  package_selector: CreditCard,
  range_only_leadgate: ShieldCheck,
  estimate_then_book: CalendarCheck,
};

export default function DesignStudio({ settings, onChange }: DesignStudioProps) {
  const [activeTab, setActiveTab] = useState<TabId>('appearance');

  const selectedTemplateId = settings.ui_template?.template_id || 'classic_single';

  const selectTemplate = useCallback((template: TemplateDefinition) => {
    onChange({
      ...settings,
      ui_template: {
        ...settings.ui_template,
        template_id: template.id,
        version: 1,
        layout: {
          style: template.layout_style,
          sticky_summary: template.defaults.sticky_summary,
          show_breakdown: template.defaults.show_breakdown,
          show_trust_block: template.defaults.show_trust_block,
          show_testimonials: template.defaults.show_testimonials,
          show_images: template.defaults.show_images,
        },
        inputs: {
          ...settings.ui_template?.inputs,
          use_sliders: settings.ui_template?.inputs?.use_sliders ?? true,
          slider_defaults: settings.ui_template?.inputs?.slider_defaults ?? {
            step: 1,
            show_value_bubble: true,
            show_min_max_labels: true,
          },
        },
      },
    });
  }, [settings, onChange]);

  const updateUiTemplateLayout = useCallback((key: string, value: any) => {
    onChange({
      ...settings,
      ui_template: {
        ...settings.ui_template,
        layout: { ...settings.ui_template?.layout, [key]: value },
      },
    });
  }, [settings, onChange]);

  const updateUiTemplateInputs = useCallback((key: string, value: any) => {
    onChange({
      ...settings,
      ui_template: {
        ...settings.ui_template,
        inputs: { ...settings.ui_template?.inputs, [key]: value },
      },
    });
  }, [settings, onChange]);

  const updateAppearance = useCallback((key: string, value: any) => {
    onChange({ ...settings, appearance: { ...settings.appearance, [key]: value } });
  }, [settings, onChange]);

  const updateLayout = useCallback((key: string, value: any) => {
    onChange({ ...settings, layout: { ...settings.layout, [key]: value } });
  }, [settings, onChange]);

  const updateConversion = useCallback((key: string, value: any) => {
    onChange({ ...settings, conversion: { ...settings.conversion, [key]: value } });
  }, [settings, onChange]);

  const updateIntegrations = useCallback((key: string, value: any) => {
    onChange({ ...settings, integrations: { ...settings.integrations, [key]: value } });
  }, [settings, onChange]);

  const updateConversionBlocks = useCallback((blocks: ConversionBlocks) => {
    onChange({ ...settings, conversion_blocks: blocks });
  }, [settings, onChange]);

  const updatePromotions = useCallback((patch: Partial<CalculatorSettings['promotions']>) => {
    onChange({ ...settings, promotions: { ...settings.promotions, ...patch } });
  }, [settings, onChange]);

  const updateQuoteRules = useCallback((patch: Partial<CalculatorSettings['quote_rules']>) => {
    onChange({ ...settings, quote_rules: { ...settings.quote_rules, ...patch } });
  }, [settings, onChange]);

  const updateFollowup = useCallback((patch: Partial<CalculatorSettings['followup']>) => {
    onChange({ ...settings, followup: { ...settings.followup, ...patch } });
  }, [settings, onChange]);

  const currentTemplate = getTemplateById(selectedTemplateId);

  return (
    <div className="animate-fade-in-up">
      <div data-testid="design-studio-remark" style={{
        padding: '12px 16px', borderRadius: p.radius.md,
        background: '#F0FDF4', border: '1px solid #BBF7D0',
        marginBottom: '20px', display: 'flex', alignItems: 'flex-start', gap: '10px',
      }}>
        <Info style={{ width: '16px', height: '16px', color: p.colors.accent, flexShrink: 0, marginTop: '1px' }} />
        <p style={{ fontSize: '12px', color: '#166534', lineHeight: 1.5 }}>
          All selections can be changed anytime. Custom modifications also available on request for an additional fee.
        </p>
      </div>

      <SectionHeader title="Template" />
      <div
        data-testid="template-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: '10px',
          marginBottom: '20px',
        }}
        className="template-grid-responsive"
      >
        {TEMPLATE_LIBRARY.map(template => {
          const active = selectedTemplateId === template.id;
          const Icon = TEMPLATE_ICONS[template.id] || LayoutGrid;
          return (
            <button
              key={template.id}
              data-testid={`template-card-${template.id}`}
              onClick={() => selectTemplate(template)}
              style={{
                position: 'relative',
                padding: '14px 12px',
                borderRadius: p.radius.md,
                border: active ? `2px solid ${p.colors.accent}` : `1px solid ${p.colors.border}`,
                background: active ? p.colors.accentLighter : '#FFFFFF',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                gap: '6px',
                textAlign: 'left',
                transition: 'all 0.2s ease',
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              {active && (
                <div style={{
                  position: 'absolute', top: '8px', right: '8px',
                  width: '20px', height: '20px', borderRadius: '50%',
                  background: p.colors.accent,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Check style={{ width: '12px', height: '12px', color: '#FFFFFF' }} />
                </div>
              )}
              <Icon style={{
                width: '20px', height: '20px',
                color: active ? p.colors.accent : p.colors.subtle,
              }} />
              <span style={{
                fontSize: '13px', fontWeight: 600,
                color: active ? p.colors.accentDark : p.colors.heading,
                lineHeight: 1.3,
              }}>
                {template.name}
              </span>
              <span style={{
                fontSize: '11px', fontWeight: 400,
                color: active ? p.colors.accent : p.colors.muted,
                lineHeight: 1.4,
              }}>
                {template.best_for.slice(0, 3).join(', ')}
              </span>
            </button>
          );
        })}
      </div>

      <style>{`
        @media (min-width: 768px) {
          .template-grid-responsive {
            grid-template-columns: repeat(3, 1fr) !important;
          }
        }
      `}</style>

      <SectionHeader title="Inputs" />
      <div style={{ marginBottom: '20px' }}>
        <ToggleSwitch
          value={settings.ui_template?.inputs?.use_sliders ?? true}
          onChange={v => updateUiTemplateInputs('use_sliders', v)}
          testId="toggle-use-sliders"
          label="Use sliders where possible"
          sublabel="Replace number inputs with draggable sliders"
        />
        <ToggleSwitch
          value={settings.ui_template?.layout?.sticky_summary ?? false}
          onChange={v => updateUiTemplateLayout('sticky_summary', v)}
          testId="toggle-template-sticky-summary"
          label="Show sticky price summary"
          sublabel={currentTemplate?.layout_style === 'single_page' ? 'Not available for single-page templates' : 'Keep quote visible while scrolling'}
        />
        <ToggleSwitch
          value={settings.ui_template?.layout?.show_breakdown ?? true}
          onChange={v => updateUiTemplateLayout('show_breakdown', v)}
          testId="toggle-template-breakdown"
          label="Show breakdown"
          sublabel="Display itemized price breakdown"
        />
        <ToggleSwitch
          value={settings.ui_template?.layout?.show_trust_block ?? false}
          onChange={v => {
            updateUiTemplateLayout('show_trust_block', v);
            if (!v) updateUiTemplateLayout('show_testimonials', false);
          }}
          testId="toggle-template-trust"
          label="Show trust + testimonials blocks"
          sublabel="Build credibility with trust badges and reviews"
        />
      </div>

      <div data-testid="design-studio-tabs" style={{
        display: 'flex', gap: '4px', marginBottom: '20px',
        background: '#F3F4F6', borderRadius: p.radius.md, padding: '4px',
      }}>
        {TABS.map(tab => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              data-testid={`tab-${tab.id}`}
              onClick={() => setActiveTab(tab.id)}
              style={{
                flex: 1, padding: '10px 6px', borderRadius: '8px', border: 'none',
                background: active ? '#FFFFFF' : 'transparent',
                boxShadow: active ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                cursor: 'pointer', display: 'flex', flexDirection: 'column',
                alignItems: 'center', gap: '4px',
                transition: 'all 0.2s ease',
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              <Icon style={{ width: '16px', height: '16px', color: active ? p.colors.accent : p.colors.subtle }} />
              <span style={{
                fontSize: '10px', fontWeight: active ? 700 : 500,
                color: active ? p.colors.heading : p.colors.muted,
                letterSpacing: '0.02em',
              }}>
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>

      {activeTab === 'appearance' && (
        <AppearanceTab settings={settings.appearance} onChange={updateAppearance} />
      )}
      {activeTab === 'layout' && (
        <LayoutTab settings={settings.layout} onChange={updateLayout} />
      )}
      {activeTab === 'conversion' && (
        <ConversionTab
          settings={settings.conversion}
          onChange={updateConversion}
          conversionBlocks={settings.conversion_blocks}
          onBlocksChange={updateConversionBlocks}
        />
      )}
      {activeTab === 'integrations' && (
        <IntegrationsTab settings={settings.integrations} onChange={updateIntegrations} />
      )}
      {activeTab === 'automation' && (
        <AutomationTab
          settings={settings}
          onPromotionsChange={updatePromotions}
          onQuoteRulesChange={updateQuoteRules}
          onFollowupChange={updateFollowup}
        />
      )}
    </div>
  );
}


function SectionHeader({ title }: { title: string }) {
  return (
    <p style={{
      fontSize: '11px', fontWeight: 700, letterSpacing: '0.06em',
      textTransform: 'uppercase', color: p.colors.subtle, marginBottom: '10px', marginTop: '20px',
    }}>
      {title}
    </p>
  );
}

function ChipGroup({ options, value, onChange, testIdPrefix }: {
  options: { value: string; label: string }[];
  value: string; onChange: (v: string) => void; testIdPrefix: string;
}) {
  return (
    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
      {options.map(opt => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            data-testid={`${testIdPrefix}-${opt.value}`}
            onClick={() => onChange(opt.value)}
            style={{
              padding: '8px 16px', borderRadius: '20px', border: 'none',
              background: active ? p.colors.accent : '#F3F4F6',
              color: active ? 'white' : p.colors.body,
              fontSize: '13px', fontWeight: active ? 600 : 500,
              cursor: 'pointer', transition: 'all 0.2s ease',
              boxShadow: active ? '0 2px 8px rgba(13,60,252,0.2)' : 'none',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function ToggleSwitch({ value, onChange, testId, label, sublabel }: {
  value: boolean; onChange: (v: boolean) => void;
  testId: string; label: string; sublabel?: string;
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '12px 0', borderBottom: `1px solid ${p.colors.borderLight}`,
    }}>
      <div>
        <p style={{ fontSize: '13px', fontWeight: 500, color: p.colors.heading }}>{label}</p>
        {sublabel && <p style={{ fontSize: '11px', color: p.colors.muted, marginTop: '2px' }}>{sublabel}</p>}
      </div>
      <button
        data-testid={testId}
        onClick={() => onChange(!value)}
        style={{
          width: '44px', height: '24px', borderRadius: '12px', border: 'none',
          background: value ? p.colors.accent : '#D1D5DB',
          cursor: 'pointer', position: 'relative', transition: 'background 0.2s ease',
          flexShrink: 0,
        }}
      >
        <div style={{
          width: '20px', height: '20px', borderRadius: '50%',
          background: 'white', boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
          position: 'absolute', top: '2px',
          left: value ? '22px' : '2px',
          transition: 'left 0.2s ease',
        }} />
      </button>
    </div>
  );
}

function StudioInput({ value, onChange, testId, placeholder, label, sublabel, type, error }: {
  value: string; onChange: (v: string) => void; testId: string;
  placeholder: string; label: string; sublabel?: string; type?: string; error?: string;
}) {
  return (
    <div style={{ marginBottom: '14px' }}>
      <label style={{ fontSize: '12px', fontWeight: 600, color: p.colors.body, display: 'block', marginBottom: '6px' }}>
        {label}
        {sublabel && <span style={{ fontWeight: 400, color: p.colors.subtle, fontSize: '11px', marginLeft: '4px' }}>{sublabel}</span>}
      </label>
      <input
        data-testid={testId}
        type={type || 'text'}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="premium-input"
        style={error ? { borderColor: p.colors.danger } : undefined}
      />
      {error && <p style={{ fontSize: '11px', color: p.colors.danger, marginTop: '4px' }}>{error}</p>}
    </div>
  );
}

function CollapsibleSection({ title, children, testId, badge }: {
  title: string; children: any; testId: string; badge?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{
      marginTop: '16px', borderRadius: p.radius.md,
      border: `1px solid ${p.colors.border}`, overflow: 'hidden',
    }}>
      <button
        data-testid={testId}
        onClick={() => setOpen(!open)}
        style={{
          width: '100%', padding: '12px 16px', border: 'none',
          background: '#FAFAFA', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          WebkitTapHighlightColor: 'transparent',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '13px', fontWeight: 600, color: p.colors.heading }}>{title}</span>
          {badge && (
            <span style={{
              fontSize: '10px', fontWeight: 600, color: '#3B82F6',
              background: '#EFF6FF', padding: '2px 8px', borderRadius: '10px',
              border: '1px solid #BFDBFE',
            }}>{badge}</span>
          )}
        </div>
        <ChevronDown style={{
          width: '16px', height: '16px', color: p.colors.muted,
          transition: 'transform 0.2s ease',
          transform: open ? 'rotate(180deg)' : 'rotate(0)',
        }} />
      </button>
      {open && (
        <div className="animate-expand" style={{ padding: '16px', borderTop: `1px solid ${p.colors.borderLight}` }}>
          {children}
        </div>
      )}
    </div>
  );
}


const COLOR_THEMES = [
  { value: 'graphite', label: 'Graphite', color: '#374151' },
  { value: 'navy', label: 'Navy', color: '#1E3A5F' },
  { value: 'emerald', label: 'Emerald', color: '#059669' },
  { value: 'slate', label: 'Slate', color: '#64748B' },
  { value: 'custom', label: 'Custom', color: null },
];

function AppearanceTab({ settings, onChange }: {
  settings: CalculatorSettings['appearance']; onChange: (key: string, value: any) => void;
}) {
  return (
    <div>
      <SectionHeader title="Color Theme" />
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '16px' }}>
        {COLOR_THEMES.map(theme => {
          const active = settings.color_theme === theme.value;
          return (
            <button
              key={theme.value}
              data-testid={`theme-${theme.value}`}
              onClick={() => {
                onChange('color_theme', theme.value);
                if (theme.color) onChange('accent_color', theme.color);
              }}
              style={{
                width: '64px', display: 'flex', flexDirection: 'column',
                alignItems: 'center', gap: '8px', padding: '12px 8px',
                borderRadius: p.radius.md, cursor: 'pointer',
                border: active ? `2px solid ${p.colors.accent}` : `1px solid ${p.colors.border}`,
                background: active ? p.colors.accentLighter : '#FFFFFF',
                transition: 'all 0.2s ease',
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              {theme.color ? (
                <div style={{
                  width: '32px', height: '32px', borderRadius: '8px',
                  background: theme.color, boxShadow: '0 2px 6px rgba(0,0,0,0.12)',
                }} />
              ) : (
                <div style={{
                  width: '32px', height: '32px', borderRadius: '8px',
                  border: '2px dashed #D1D5DB', display: 'flex',
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  <Palette style={{ width: '14px', height: '14px', color: p.colors.subtle }} />
                </div>
              )}
              <span style={{ fontSize: '10px', fontWeight: 600, color: active ? p.colors.accentDark : p.colors.muted }}>
                {theme.label}
              </span>
            </button>
          );
        })}
      </div>

      {settings.color_theme === 'custom' && (
        <div style={{ marginBottom: '16px' }}>
          <label style={{ fontSize: '12px', fontWeight: 600, color: p.colors.body, display: 'block', marginBottom: '8px' }}>
            Accent Color
          </label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <input
              data-testid="input-accent-color"
              type="color"
              value={settings.accent_color}
              onChange={e => onChange('accent_color', e.target.value)}
              style={{
                width: '48px', height: '48px', borderRadius: '12px',
                border: `2px solid ${p.colors.border}`, cursor: 'pointer',
                padding: '3px', background: 'white',
              }}
            />
            <div style={{ flex: 1 }}>
              <input
                data-testid="input-accent-hex"
                type="text"
                value={settings.accent_color}
                onChange={e => {
                  if (/^#[0-9a-fA-F]{0,6}$/.test(e.target.value)) onChange('accent_color', e.target.value);
                }}
                className="premium-input"
                placeholder="#0d3cfc"
                style={{ fontFamily: 'monospace', fontSize: '14px' }}
              />
            </div>
            <div style={{
              width: '48px', height: '48px', borderRadius: '12px',
              background: settings.accent_color,
              boxShadow: `0 4px 14px ${settings.accent_color}30`,
              flexShrink: 0,
            }} />
          </div>
        </div>
      )}

      <SectionHeader title="Button Style" />
      <p style={{ fontSize: 11, color: p.colors.muted, margin: '-4px 0 8px', lineHeight: 1.4 }}>How your action buttons appear to customers</p>
      <div style={{ display: 'flex', gap: 8 }}>
        {([
          { value: 'soft-rounded', label: 'Soft', radius: '8px' },
          { value: 'sharp', label: 'Sharp', radius: '2px' },
          { value: 'pill', label: 'Pill', radius: '999px' },
        ] as const).map(opt => {
          const active = settings.button_style === opt.value;
          return (
            <button key={opt.value} data-testid={`btn-style-${opt.value}`}
              onClick={() => onChange('button_style', opt.value)}
              style={{
                flex: 1, padding: '12px 8px', borderRadius: 12, cursor: 'pointer',
                border: active ? `2px solid ${p.colors.accent}` : `1px solid ${p.colors.border}`,
                background: active ? p.colors.accentLighter : '#fff',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
                transition: 'all 0.15s ease',
              }}>
              <div style={{
                padding: '6px 20px', fontSize: 12, fontWeight: 600, color: '#fff',
                background: settings.accent_color || p.colors.accent,
                borderRadius: opt.radius,
              }}>
                Get Quote
              </div>
              <span style={{ fontSize: 11, fontWeight: 500, color: active ? p.colors.accentDark : p.colors.muted }}>{opt.label}</span>
            </button>
          );
        })}
      </div>

      <SectionHeader title="Corner Style" />
      <p style={{ fontSize: 11, color: p.colors.muted, margin: '-4px 0 8px', lineHeight: 1.4 }}>How rounded or sharp the edges appear</p>
      <div style={{ display: 'flex', gap: 8 }}>
        {([
          { value: 'compact', label: 'Compact', radius: '4px' },
          { value: 'medium', label: 'Medium', radius: '12px' },
          { value: 'large', label: 'Large', radius: '20px' },
        ] as const).map(opt => {
          const active = settings.border_radius === opt.value;
          return (
            <button key={opt.value} data-testid={`radius-${opt.value}`}
              onClick={() => onChange('border_radius', opt.value)}
              style={{
                flex: 1, padding: '12px 8px', borderRadius: 12, cursor: 'pointer',
                border: active ? `2px solid ${p.colors.accent}` : `1px solid ${p.colors.border}`,
                background: active ? p.colors.accentLighter : '#fff',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                transition: 'all 0.15s ease',
              }}>
              <div style={{
                width: 48, height: 32, borderRadius: opt.radius,
                border: `2px solid ${active ? p.colors.accent : '#d1d5db'}`,
                background: active ? 'rgba(13,60,252,0.06)' : '#f9fafb',
              }} />
              <span style={{ fontSize: 11, fontWeight: 500, color: active ? p.colors.accentDark : p.colors.muted }}>{opt.label}</span>
            </button>
          );
        })}
      </div>

      <SectionHeader title="Card Style" />
      <p style={{ fontSize: 11, color: p.colors.muted, margin: '-4px 0 8px', lineHeight: 1.4 }}>How your quote card looks — flat, frosted, or raised</p>
      <div style={{ display: 'flex', gap: 8 }}>
        {([
          { value: 'solid', label: 'Solid', bg: '#fff', shadow: 'none', border: '1px solid #e5e7eb' },
          { value: 'glassmorphic', label: 'Frosted', bg: 'rgba(255,255,255,0.7)', shadow: 'none', border: '1px solid rgba(255,255,255,0.5)', extra: 'backdropFilter:blur(8px)' },
          { value: 'elevated', label: 'Elevated', bg: '#fff', shadow: '0 4px 16px rgba(0,0,0,0.1)', border: '1px solid #f3f4f6' },
        ] as const).map(opt => {
          const active = settings.surface_style === opt.value;
          return (
            <button key={opt.value} data-testid={`surface-${opt.value}`}
              onClick={() => onChange('surface_style', opt.value)}
              style={{
                flex: 1, padding: '12px 8px', borderRadius: 12, cursor: 'pointer',
                border: active ? `2px solid ${p.colors.accent}` : `1px solid ${p.colors.border}`,
                background: active ? p.colors.accentLighter : '#fafbfc',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                transition: 'all 0.15s ease',
              }}>
              <div style={{
                width: 56, height: 36, borderRadius: 8,
                background: opt.bg, boxShadow: opt.shadow, border: opt.border,
                ...(opt.value === 'glassmorphic' ? { backdropFilter: 'blur(8px)' } : {}),
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <div style={{ width: 28, height: 4, borderRadius: 2, background: '#d1d5db' }} />
              </div>
              <span style={{ fontSize: 11, fontWeight: 500, color: active ? p.colors.accentDark : p.colors.muted }}>{opt.label}</span>
            </button>
          );
        })}
      </div>

      <SectionHeader title="Font" />
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        {[
          { value: 'inter', label: 'Inter', family: 'Inter, sans-serif' },
          { value: 'georgia', label: 'Georgia', family: 'Georgia, serif' },
          { value: 'montserrat', label: 'Montserrat', family: 'Montserrat, sans-serif' },
          { value: 'merriweather', label: 'Merriweather', family: 'Merriweather, serif' },
          { value: 'roboto-mono', label: 'Roboto Mono', family: '"Roboto Mono", monospace' },
        ].map(font => {
          const active = settings.font === font.value;
          return (
            <button
              key={font.value}
              data-testid={`font-${font.value}`}
              onClick={() => onChange('font', font.value)}
              style={{
                padding: '8px 14px', borderRadius: '8px',
                border: active ? `2px solid ${p.colors.accent}` : `1px solid ${p.colors.border}`,
                background: active ? p.colors.accentLighter : '#FFFFFF',
                cursor: 'pointer', fontSize: '13px', fontWeight: 500,
                fontFamily: font.family,
                color: active ? p.colors.accentDark : p.colors.body,
                transition: 'all 0.2s ease',
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              {font.label}
            </button>
          );
        })}
      </div>

      <CollapsibleSection title="Button & Interaction" testId="section-button-interaction">
        <SectionHeader title="Hover Effect" />
        <ChipGroup
          options={[
            { value: 'subtle-lift', label: 'Subtle Lift' },
            { value: 'glow', label: 'Glow' },
            { value: 'color-shift', label: 'Color Shift' },
            { value: 'none', label: 'None' },
          ]}
          value={settings.hover_effect}
          onChange={v => onChange('hover_effect', v)}
          testIdPrefix="hover"
        />

        <div style={{ marginTop: '12px' }} />
        <ToggleSwitch
          value={settings.click_animation}
          onChange={v => onChange('click_animation', v)}
          testId="toggle-click-animation"
          label="Click animation"
          sublabel="Scale-down tap effect on buttons"
        />
        <ToggleSwitch
          value={settings.gradient_buttons}
          onChange={v => onChange('gradient_buttons', v)}
          testId="toggle-gradient"
          label="Gradient buttons"
          sublabel="Apply gradient to primary buttons"
        />

        <SectionHeader title="Button Size" />
        <ChipGroup
          options={[
            { value: 'compact', label: 'Compact' },
            { value: 'standard', label: 'Standard' },
            { value: 'large', label: 'Large' },
          ]}
          value={settings.button_size}
          onChange={v => onChange('button_size', v)}
          testIdPrefix="btn-size"
        />
      </CollapsibleSection>

      <CollapsibleSection title="Branding & CTA" testId="section-branding-cta">
        <StudioInput
          value={settings.cta_text}
          onChange={v => onChange('cta_text', v)}
          testId="input-cta-text"
          placeholder="e.g. Get My Estimate"
          label="CTA Button Text"
        />

        <ToggleSwitch
          value={settings.trust_badge}
          onChange={v => onChange('trust_badge', v)}
          testId="toggle-trust-badge"
          label="Trust badge"
          sublabel="Show a trust message near the CTA"
        />
        {settings.trust_badge && (
          <div style={{ paddingBottom: '8px' }}>
            <ChipGroup
              options={[
                { value: 'No obligation', label: 'No obligation' },
                { value: 'Instant result', label: 'Instant result' },
                { value: 'Free estimate', label: 'Free estimate' },
              ]}
              value={settings.trust_badge_text}
              onChange={v => onChange('trust_badge_text', v)}
              testIdPrefix="trust"
            />
          </div>
        )}

        <StudioInput
          value={settings.company_phone || ''}
          onChange={v => onChange('company_phone', v)}
          testId="input-company-phone"
          placeholder="+1 (555) 123-4567"
          label="Company Phone"
          sublabel="(shown under CTA)"
        />

        <StudioInput
          value={settings.logo_url || ''}
          onChange={v => onChange('logo_url', v)}
          testId="input-logo-url"
          placeholder="https://yoursite.com/logo.png"
          label="Logo URL"
          sublabel="(optional)"
        />

        <ToggleSwitch
          value={settings.show_powered_by}
          onChange={v => onChange('show_powered_by', v)}
          testId="toggle-powered-by"
          label="Show 'Powered by' badge"
          sublabel={settings.show_powered_by
            ? "Keep the badge and get 10% off your subscription"
            : "Badge hidden — no discount applied"}
        />
        {settings.show_powered_by && (
          <div style={{
            padding: '10px 14px', borderRadius: p.radius.sm,
            background: '#F0FDF4', border: '1px solid #BBF7D0',
            display: 'flex', alignItems: 'center', gap: '8px',
            marginBottom: '8px',
          }}>
            <DollarSign style={{ width: '14px', height: '14px', color: '#059669', flexShrink: 0 }} />
            <span style={{ fontSize: '12px', color: '#166534' }}>
              10% discount applied for displaying the badge.
            </span>
          </div>
        )}
      </CollapsibleSection>
    </div>
  );
}


function LayoutTab({ settings, onChange }: {
  settings: CalculatorSettings['layout']; onChange: (key: string, value: any) => void;
}) {
  return (
    <div>
      <SectionHeader title="Card Spacing" />
      <ChipGroup
        options={[
          { value: 'tight', label: 'Tight' },
          { value: 'normal', label: 'Normal' },
          { value: 'airy', label: 'Airy' },
        ]}
        value={settings.card_spacing}
        onChange={v => onChange('card_spacing', v)}
        testIdPrefix="spacing"
      />

      <SectionHeader title="Input Field Style" />
      <ChipGroup
        options={[
          { value: 'outlined', label: 'Outlined' },
          { value: 'filled', label: 'Filled' },
          { value: 'minimal', label: 'Minimal' },
        ]}
        value={settings.input_style}
        onChange={v => onChange('input_style', v)}
        testIdPrefix="input-style"
      />

      <SectionHeader title="Step Progress Style" />
      <ChipGroup
        options={[
          { value: 'numbers', label: 'Numbers' },
          { value: 'dots', label: 'Dots' },
          { value: 'bar', label: 'Bar' },
          { value: 'hidden', label: 'Hidden' },
        ]}
        value={settings.progress_style}
        onChange={v => onChange('progress_style', v)}
        testIdPrefix="progress"
      />

      <SectionHeader title="Layout" />
      <ChipGroup
        options={[
          { value: 'single', label: 'Single Column' },
          { value: 'two-column', label: 'Two Column' },
        ]}
        value={settings.columns}
        onChange={v => onChange('columns', v)}
        testIdPrefix="columns"
      />

      <div style={{ marginTop: '12px' }} />
      <ToggleSwitch
        value={settings.sticky_summary}
        onChange={v => onChange('sticky_summary', v)}
        testId="toggle-sticky-summary"
        label="Sticky summary panel"
        sublabel="Keep quote summary visible while scrolling (desktop)"
      />
    </div>
  );
}


function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function sanitizeText(str: string) {
  return str.replace(/<[^>]*>/g, '');
}

function ConversionTab({ settings, onChange, conversionBlocks, onBlocksChange }: {
  settings: CalculatorSettings['conversion'];
  onChange: (key: string, value: any) => void;
  conversionBlocks?: ConversionBlocks;
  onBlocksChange: (blocks: ConversionBlocks) => void;
}) {
  const blocks: ConversionBlocks = conversionBlocks || {
    version: 1,
    images: { enabled: false, placement: 'under_title', layout: 'grid', max_items: 6, items: [] },
    testimonials: { enabled: false, placement: 'under_total', layout: 'cards', max_items: 6, items: [] },
    trust: { enabled: true, placement: 'under_title', badges: { insured: true, licensed: true, bonded: false, satisfaction: true }, microcopy: null },
  };

  const updateImages = (patch: Partial<ConversionBlocks['images']>) => {
    onBlocksChange({ ...blocks, images: { ...blocks.images, ...patch } });
  };
  const updateTestimonials = (patch: Partial<ConversionBlocks['testimonials']>) => {
    onBlocksChange({ ...blocks, testimonials: { ...blocks.testimonials, ...patch } });
  };
  const updateTrust = (patch: Partial<ConversionBlocks['trust']>) => {
    onBlocksChange({ ...blocks, trust: { ...blocks.trust, ...patch } });
  };

  const [reviewForm, setReviewForm] = useState({ name: '', location: '', rating: 5, text: '' });
  const [reviewErrors, setReviewErrors] = useState<Record<string, string>>({});

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    const currentItems = blocks.images.items || [];
    const remaining = 6 - currentItems.length;
    const filesToProcess = Array.from(files).slice(0, remaining);

    filesToProcess.forEach(file => {
      if (file.size > 5 * 1024 * 1024) return;
      if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) return;
      const reader = new FileReader();
      reader.onload = () => {
        const url = reader.result as string;
        const newItem: ConversionImageItem = {
          id: generateId(),
          url,
          caption: null,
          sort_order: (blocks.images.items || []).length,
        };
        updateImages({ items: [...(blocks.images.items || []), newItem] });
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  };

  const removePhoto = (id: string) => {
    updateImages({ items: (blocks.images.items || []).filter(i => i.id !== id) });
  };

  const reorderPhoto = (index: number, direction: 'up' | 'down') => {
    const items = [...(blocks.images.items || [])];
    const swapIdx = direction === 'up' ? index - 1 : index + 1;
    if (swapIdx < 0 || swapIdx >= items.length) return;
    [items[index], items[swapIdx]] = [items[swapIdx], items[index]];
    items.forEach((item, i) => item.sort_order = i);
    updateImages({ items });
  };

  const updatePhotoCaption = (id: string, caption: string) => {
    updateImages({
      items: (blocks.images.items || []).map(i =>
        i.id === id ? { ...i, caption: sanitizeText(caption).slice(0, 60) } : i
      ),
    });
  };

  const addReview = () => {
    const errs: Record<string, string> = {};
    if (!reviewForm.name.trim()) errs.name = 'Name is required';
    if (reviewForm.text.length < 20) errs.text = 'Min 20 characters';
    if (reviewForm.text.length > 240) errs.text = 'Max 240 characters';
    if (Object.keys(errs).length) { setReviewErrors(errs); return; }
    if ((blocks.testimonials.items || []).length >= 6) return;

    const newItem: ConversionTestimonialItem = {
      id: generateId(),
      name: sanitizeText(reviewForm.name.trim()),
      location: reviewForm.location.trim() ? sanitizeText(reviewForm.location.trim()) : null,
      rating: reviewForm.rating,
      text: sanitizeText(reviewForm.text),
      sort_order: (blocks.testimonials.items || []).length,
    };
    updateTestimonials({ items: [...(blocks.testimonials.items || []), newItem] });
    setReviewForm({ name: '', location: '', rating: 5, text: '' });
    setReviewErrors({});
  };

  const removeReview = (id: string) => {
    updateTestimonials({ items: (blocks.testimonials.items || []).filter(i => i.id !== id) });
  };

  const reorderReview = (index: number, direction: 'up' | 'down') => {
    const items = [...(blocks.testimonials.items || [])];
    const swapIdx = direction === 'up' ? index - 1 : index + 1;
    if (swapIdx < 0 || swapIdx >= items.length) return;
    [items[index], items[swapIdx]] = [items[swapIdx], items[index]];
    items.forEach((item, i) => item.sort_order = i);
    updateTestimonials({ items });
  };

  return (
    <div>
      <SectionHeader title="Result Page" />
      <ChipGroup
        options={[
          { value: 'range', label: 'Price Range' },
          { value: 'exact', label: 'Exact Price' },
        ]}
        value={settings.price_display}
        onChange={v => onChange('price_display', v)}
        testIdPrefix="price"
      />

      <div style={{ marginTop: '14px' }} />
      <StudioInput
        value={settings.disclaimer_text}
        onChange={v => onChange('disclaimer_text', v)}
        testId="input-disclaimer"
        placeholder="Prices are estimates and may vary..."
        label="Disclaimer Text"
      />

      <ToggleSwitch
        value={settings.show_breakdown}
        onChange={v => onChange('show_breakdown', v)}
        testId="toggle-breakdown"
        label="Show price breakdown"
        sublabel="Expandable detailed breakdown after result"
      />

      <ToggleSwitch
        value={settings.context_range?.enabled ?? false}
        onChange={v => onChange('context_range', { ...settings.context_range, enabled: v })}
        testId="toggle-context-range"
        label="Typical-range gauge"
        sublabel="Plot the estimate on a low–high band for context"
      />
      {settings.context_range?.enabled && (
        <div style={{ display: 'flex', gap: '10px', paddingBottom: '8px' }}>
          <div style={{ flex: 1 }}>
            <StudioInput
              value={settings.context_range?.low ? String(settings.context_range.low) : ''}
              onChange={v => onChange('context_range', { ...settings.context_range, low: Number(v) || 0 })}
              testId="input-context-low"
              type="number"
              placeholder="0"
              label="Typical low ($)"
            />
          </div>
          <div style={{ flex: 1 }}>
            <StudioInput
              value={settings.context_range?.high ? String(settings.context_range.high) : ''}
              onChange={v => onChange('context_range', { ...settings.context_range, high: Number(v) || 0 })}
              testId="input-context-high"
              type="number"
              placeholder="0"
              label="Typical high ($)"
            />
          </div>
        </div>
      )}

      <ToggleSwitch
        value={settings.show_upsell}
        onChange={v => onChange('show_upsell', v)}
        testId="toggle-upsell"
        label="Upsell section"
        sublabel="Show additional services after the result"
      />
      {settings.show_upsell && (
        <div style={{ paddingBottom: '8px' }}>
          <StudioInput
            value={settings.upsell_text || ''}
            onChange={v => onChange('upsell_text', v)}
            testId="input-upsell-text"
            placeholder="e.g. Add premium materials for 20% more"
            label="Upsell message"
          />
        </div>
      )}

      <ToggleSwitch
        value={settings.booking_button}
        onChange={v => onChange('booking_button', v)}
        testId="toggle-booking"
        label="Booking calendar button"
        sublabel="Let customers book directly after their quote"
      />
      {settings.booking_button && (
        <div style={{ paddingBottom: '8px' }}>
          <StudioInput
            value={settings.booking_url || ''}
            onChange={v => onChange('booking_url', v)}
            testId="input-booking-url"
            placeholder="https://calendly.com/your-link"
            label="Booking URL"
          />
        </div>
      )}

      <StudioInput
        value={settings.redirect_url || ''}
        onChange={v => onChange('redirect_url', v)}
        testId="input-redirect-url"
        placeholder="https://yoursite.com/thank-you"
        label="Thank-you page redirect"
        sublabel="(optional)"
      />

      <CollapsibleSection title="Lead Capture & Urgency" testId="section-lead-capture">
        <ToggleSwitch
          value={settings.require_email}
          onChange={v => onChange('require_email', v)}
          testId="toggle-require-email"
          label="Require email before showing price"
          sublabel="Gate the result behind email capture"
        />

        <SectionHeader title="Phone Number" />
        <ChipGroup
          options={[
            { value: 'hidden', label: 'Hidden' },
            { value: 'optional', label: 'Optional' },
            { value: 'required', label: 'Required' },
          ]}
          value={settings.require_phone}
          onChange={v => onChange('require_phone', v)}
          testIdPrefix="phone"
        />

        <div style={{ marginTop: '12px' }} />
        <ToggleSwitch
          value={settings.show_starting_price}
          onChange={v => onChange('show_starting_price', v)}
          testId="toggle-starting-price"
          label="Show 'Starting from $X' preview"
          sublabel="Teaser price before full calculation"
        />

        <StudioInput
          value={settings.urgency_message || ''}
          onChange={v => onChange('urgency_message', v)}
          testId="input-urgency"
          placeholder="e.g. Limited slots this week"
          label="Urgency message"
          sublabel="(optional)"
        />

        <ToggleSwitch
          value={settings.delay_result}
          onChange={v => onChange('delay_result', v)}
          testId="toggle-delay"
          label="Delay result display"
          sublabel="1-2 second pause for psychological effect"
        />
      </CollapsibleSection>

      <CollapsibleSection title="Photos" testId="section-photos">
        <ToggleSwitch
          value={blocks.images.enabled}
          onChange={v => updateImages({ enabled: v })}
          testId="toggle-photos-enabled"
          label="Show photos"
          sublabel="Display project photos on your calculator"
        />
        {blocks.images.enabled && (
          <div style={{ marginTop: '12px' }}>
            <label style={{ fontSize: '12px', fontWeight: 600, color: p.colors.body, display: 'block', marginBottom: '6px' }}>Placement</label>
            <select
              data-testid="select-photos-placement"
              value={blocks.images.placement}
              onChange={e => updateImages({ placement: e.target.value as any })}
              className="premium-input"
              style={{ width: '100%', marginBottom: '12px' }}
            >
              <option value="top">Top</option>
              <option value="under_title">Under Title</option>
              <option value="near_cta">Near CTA</option>
              <option value="under_total">Under Total</option>
            </select>

            <SectionHeader title="Layout" />
            <ChipGroup
              options={[
                { value: 'grid', label: 'Grid' },
                { value: 'carousel', label: 'Carousel' },
              ]}
              value={blocks.images.layout}
              onChange={v => updateImages({ layout: v as any })}
              testIdPrefix="photos-layout"
            />

            <div style={{ marginTop: '14px' }}>
              <label
                data-testid="upload-photos-area"
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                  padding: '16px', borderRadius: p.radius.md,
                  border: `2px dashed ${p.colors.border}`, cursor: 'pointer',
                  background: '#FAFAFA', transition: 'border-color 0.2s',
                }}
              >
                <Upload style={{ width: '16px', height: '16px', color: p.colors.subtle }} />
                <span style={{ fontSize: '13px', color: p.colors.muted }}>
                  Upload photos (max 5MB, PNG/JPG/WebP)
                </span>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  multiple
                  onChange={handlePhotoUpload}
                  style={{ display: 'none' }}
                  disabled={(blocks.images.items || []).length >= 6}
                />
              </label>
              <p style={{ fontSize: '11px', color: p.colors.muted, marginTop: '4px' }}>
                {(blocks.images.items || []).length}/6 photos
              </p>
            </div>

            {blocks.images.enabled && (blocks.images.items || []).length === 0 && (
              <div style={{
                padding: '10px 14px', borderRadius: p.radius.sm,
                background: '#FFFBEB', border: '1px solid #FDE68A',
                display: 'flex', alignItems: 'center', gap: '8px',
                marginTop: '8px',
              }}>
                <AlertTriangle style={{ width: '14px', height: '14px', color: '#D97706', flexShrink: 0 }} />
                <span style={{ fontSize: '12px', color: '#92400E' }}>Add at least one photo to display</span>
              </div>
            )}

            {(blocks.images.items || []).length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px', marginTop: '12px' }}>
                {(blocks.images.items || []).map((item, idx) => (
                  <div key={item.id} style={{
                    borderRadius: p.radius.md, border: `1px solid ${p.colors.borderLight}`,
                    overflow: 'hidden', background: '#FAFAFA',
                  }}>
                    <div style={{ position: 'relative' }}>
                      <img
                        src={item.url}
                        alt={item.caption || 'Photo'}
                        style={{ width: '100%', height: '80px', objectFit: 'cover', display: 'block' }}
                      />
                      <div style={{ position: 'absolute', top: '4px', right: '4px', display: 'flex', gap: '2px' }}>
                        {idx > 0 && (
                          <button
                            data-testid={`photo-up-${item.id}`}
                            onClick={() => reorderPhoto(idx, 'up')}
                            style={{
                              width: '22px', height: '22px', borderRadius: '50%', border: 'none',
                              background: 'rgba(0,0,0,0.5)', cursor: 'pointer',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}
                          >
                            <ArrowUp style={{ width: '12px', height: '12px', color: '#fff' }} />
                          </button>
                        )}
                        {idx < (blocks.images.items || []).length - 1 && (
                          <button
                            data-testid={`photo-down-${item.id}`}
                            onClick={() => reorderPhoto(idx, 'down')}
                            style={{
                              width: '22px', height: '22px', borderRadius: '50%', border: 'none',
                              background: 'rgba(0,0,0,0.5)', cursor: 'pointer',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}
                          >
                            <ArrowDown style={{ width: '12px', height: '12px', color: '#fff' }} />
                          </button>
                        )}
                        <button
                          data-testid={`photo-remove-${item.id}`}
                          onClick={() => removePhoto(item.id)}
                          style={{
                            width: '22px', height: '22px', borderRadius: '50%', border: 'none',
                            background: 'rgba(220,38,38,0.8)', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}
                        >
                          <X style={{ width: '12px', height: '12px', color: '#fff' }} />
                        </button>
                      </div>
                    </div>
                    <div style={{ padding: '6px' }}>
                      <input
                        data-testid={`photo-caption-${item.id}`}
                        type="text"
                        value={item.caption || ''}
                        onChange={e => updatePhotoCaption(item.id, e.target.value)}
                        placeholder="Caption (optional)"
                        maxLength={60}
                        className="premium-input"
                        style={{ fontSize: '11px' }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </CollapsibleSection>

      <CollapsibleSection title="Reviews" testId="section-reviews">
        <ToggleSwitch
          value={blocks.testimonials.enabled}
          onChange={v => updateTestimonials({ enabled: v })}
          testId="toggle-reviews-enabled"
          label="Show reviews"
          sublabel="Display customer reviews on your calculator"
        />
        {blocks.testimonials.enabled && (
          <div style={{ marginTop: '12px' }}>
            <label style={{ fontSize: '12px', fontWeight: 600, color: p.colors.body, display: 'block', marginBottom: '6px' }}>Placement</label>
            <select
              data-testid="select-reviews-placement"
              value={blocks.testimonials.placement}
              onChange={e => updateTestimonials({ placement: e.target.value as any })}
              className="premium-input"
              style={{ width: '100%', marginBottom: '12px' }}
            >
              <option value="under_total">Under Total</option>
              <option value="near_cta">Near CTA</option>
              <option value="bottom">Bottom</option>
            </select>

            <SectionHeader title="Layout" />
            <ChipGroup
              options={[
                { value: 'cards', label: 'Cards' },
                { value: 'carousel', label: 'Carousel' },
              ]}
              value={blocks.testimonials.layout}
              onChange={v => updateTestimonials({ layout: v as any })}
              testIdPrefix="reviews-layout"
            />

            {blocks.testimonials.enabled && (blocks.testimonials.items || []).length === 0 && (
              <div style={{
                padding: '10px 14px', borderRadius: p.radius.sm,
                background: '#FFFBEB', border: '1px solid #FDE68A',
                display: 'flex', alignItems: 'center', gap: '8px',
                marginTop: '12px',
              }}>
                <AlertTriangle style={{ width: '14px', height: '14px', color: '#D97706', flexShrink: 0 }} />
                <span style={{ fontSize: '12px', color: '#92400E' }}>Add at least one review to display</span>
              </div>
            )}

            {(blocks.testimonials.items || []).length > 0 && (
              <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {(blocks.testimonials.items || []).map((item, idx) => (
                  <div key={item.id} style={{
                    padding: '10px 12px', borderRadius: p.radius.md,
                    border: `1px solid ${p.colors.borderLight}`, background: '#FAFAFA',
                    display: 'flex', alignItems: 'flex-start', gap: '10px',
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '13px', fontWeight: 600, color: p.colors.heading }}>{item.name}</span>
                        <span style={{ fontSize: '12px', color: '#F59E0B' }}>
                          {'★'.repeat(item.rating)}{'☆'.repeat(5 - item.rating)}
                        </span>
                      </div>
                      <p style={{ fontSize: '11px', color: p.colors.muted, marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {item.text}
                      </p>
                    </div>
                    <div style={{ display: 'flex', gap: '2px', flexShrink: 0 }}>
                      {idx > 0 && (
                        <button data-testid={`review-up-${item.id}`} onClick={() => reorderReview(idx, 'up')} style={{ width: '22px', height: '22px', borderRadius: '50%', border: 'none', background: '#E5E7EB', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <ArrowUp style={{ width: '12px', height: '12px', color: p.colors.body }} />
                        </button>
                      )}
                      {idx < (blocks.testimonials.items || []).length - 1 && (
                        <button data-testid={`review-down-${item.id}`} onClick={() => reorderReview(idx, 'down')} style={{ width: '22px', height: '22px', borderRadius: '50%', border: 'none', background: '#E5E7EB', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <ArrowDown style={{ width: '12px', height: '12px', color: p.colors.body }} />
                        </button>
                      )}
                      <button data-testid={`review-remove-${item.id}`} onClick={() => removeReview(item.id)} style={{ width: '22px', height: '22px', borderRadius: '50%', border: 'none', background: '#FEE2E2', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <X style={{ width: '12px', height: '12px', color: '#DC2626' }} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {(blocks.testimonials.items || []).length < 6 && (
              <div style={{
                marginTop: '14px', padding: '14px', borderRadius: p.radius.md,
                border: `1px solid ${p.colors.borderLight}`, background: '#FAFAFA',
              }}>
                <p style={{ fontSize: '12px', fontWeight: 600, color: p.colors.heading, marginBottom: '10px' }}>Add Review</p>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                  <div style={{ flex: 1 }}>
                    <input
                      data-testid="input-review-name"
                      type="text"
                      value={reviewForm.name}
                      onChange={e => setReviewForm(f => ({ ...f, name: e.target.value }))}
                      placeholder="Name *"
                      className="premium-input"
                      style={reviewErrors.name ? { borderColor: p.colors.danger } : undefined}
                    />
                    {reviewErrors.name && <p style={{ fontSize: '11px', color: p.colors.danger, marginTop: '2px' }}>{reviewErrors.name}</p>}
                  </div>
                  <div style={{ flex: 1 }}>
                    <input
                      data-testid="input-review-location"
                      type="text"
                      value={reviewForm.location}
                      onChange={e => setReviewForm(f => ({ ...f, location: e.target.value }))}
                      placeholder="Location (optional)"
                      className="premium-input"
                    />
                  </div>
                </div>

                <div style={{ marginBottom: '8px' }}>
                  <label style={{ fontSize: '11px', fontWeight: 600, color: p.colors.body, display: 'block', marginBottom: '4px' }}>Rating</label>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    {[1, 2, 3, 4, 5].map(star => (
                      <button
                        key={star}
                        data-testid={`review-star-${star}`}
                        onClick={() => setReviewForm(f => ({ ...f, rating: star }))}
                        style={{
                          background: 'none', border: 'none', cursor: 'pointer', padding: '2px',
                          WebkitTapHighlightColor: 'transparent',
                        }}
                      >
                        <Star style={{
                          width: '20px', height: '20px',
                          color: star <= reviewForm.rating ? '#F59E0B' : '#D1D5DB',
                          fill: star <= reviewForm.rating ? '#F59E0B' : 'none',
                        }} />
                      </button>
                    ))}
                  </div>
                </div>

                <div style={{ marginBottom: '8px' }}>
                  <textarea
                    data-testid="input-review-text"
                    value={reviewForm.text}
                    onChange={e => setReviewForm(f => ({ ...f, text: e.target.value.slice(0, 240) }))}
                    placeholder="Review text (20-240 characters)"
                    className="premium-input"
                    style={{
                      width: '100%', minHeight: '60px', resize: 'vertical',
                      ...(reviewErrors.text ? { borderColor: p.colors.danger } : {}),
                    }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '2px' }}>
                    {reviewErrors.text ? (
                      <p style={{ fontSize: '11px', color: p.colors.danger }}>{reviewErrors.text}</p>
                    ) : <span />}
                    <span style={{ fontSize: '11px', color: p.colors.muted }}>{reviewForm.text.length}/240</span>
                  </div>
                </div>

                <button
                  data-testid="button-add-review"
                  onClick={addReview}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '6px',
                    padding: '8px 16px', borderRadius: '8px', border: 'none',
                    background: p.colors.accent, color: '#fff',
                    fontSize: '13px', fontWeight: 600, cursor: 'pointer',
                    WebkitTapHighlightColor: 'transparent',
                  }}
                >
                  <Plus style={{ width: '14px', height: '14px' }} />
                  Add
                </button>
              </div>
            )}
          </div>
        )}
      </CollapsibleSection>

      <CollapsibleSection title="Trust Badges" testId="section-trust">
        <ToggleSwitch
          value={blocks.trust.enabled}
          onChange={v => updateTrust({ enabled: v })}
          testId="toggle-trust-enabled"
          label="Show trust badges"
          sublabel="Display trust signals on your calculator"
        />
        {blocks.trust.enabled && (
          <div style={{ marginTop: '12px' }}>
            <label style={{ fontSize: '12px', fontWeight: 600, color: p.colors.body, display: 'block', marginBottom: '6px' }}>Placement</label>
            <select
              data-testid="select-trust-placement"
              value={blocks.trust.placement}
              onChange={e => updateTrust({ placement: e.target.value as any })}
              className="premium-input"
              style={{ width: '100%', marginBottom: '12px' }}
            >
              <option value="under_title">Under Title</option>
              <option value="near_cta">Near CTA</option>
              <option value="bottom">Bottom</option>
            </select>

            <SectionHeader title="Badges" />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
              <ToggleSwitch
                value={blocks.trust.badges.insured}
                onChange={v => updateTrust({ badges: { ...blocks.trust.badges, insured: v } })}
                testId="toggle-badge-insured"
                label="Insured"
              />
              <ToggleSwitch
                value={blocks.trust.badges.licensed}
                onChange={v => updateTrust({ badges: { ...blocks.trust.badges, licensed: v } })}
                testId="toggle-badge-licensed"
                label="Licensed"
              />
              <ToggleSwitch
                value={blocks.trust.badges.bonded}
                onChange={v => updateTrust({ badges: { ...blocks.trust.badges, bonded: v } })}
                testId="toggle-badge-bonded"
                label="Bonded"
              />
              <ToggleSwitch
                value={blocks.trust.badges.satisfaction}
                onChange={v => updateTrust({ badges: { ...blocks.trust.badges, satisfaction: v } })}
                testId="toggle-badge-satisfaction"
                label="Satisfaction Guarantee"
              />
            </div>

            <div style={{ marginTop: '12px' }}>
              <label style={{ fontSize: '12px', fontWeight: 600, color: p.colors.body, display: 'block', marginBottom: '6px' }}>
                Microcopy
                <span style={{ fontWeight: 400, color: p.colors.subtle, fontSize: '11px', marginLeft: '4px' }}>(optional, max 80 chars)</span>
              </label>
              <input
                data-testid="input-trust-microcopy"
                type="text"
                value={blocks.trust.microcopy || ''}
                onChange={e => updateTrust({ microcopy: sanitizeText(e.target.value).slice(0, 80) || null })}
                placeholder="e.g. Your project is in safe hands"
                className="premium-input"
                maxLength={80}
              />
              <p style={{ fontSize: '11px', color: p.colors.muted, marginTop: '2px', textAlign: 'right' }}>
                {(blocks.trust.microcopy || '').length}/80
              </p>
            </div>
          </div>
        )}
      </CollapsibleSection>
    </div>
  );
}


function generateCouponId() {
  return 'coupon_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

type Coupon = CalculatorSettings['promotions']['coupons'][number];

function AutomationTab({ settings, onPromotionsChange, onQuoteRulesChange, onFollowupChange }: {
  settings: CalculatorSettings;
  onPromotionsChange: (patch: Partial<CalculatorSettings['promotions']>) => void;
  onQuoteRulesChange: (patch: Partial<CalculatorSettings['quote_rules']>) => void;
  onFollowupChange: (patch: Partial<CalculatorSettings['followup']>) => void;
}) {
  const promotions = settings.promotions || { version: 1, enabled: false, coupons: [] };
  const quoteRules = settings.quote_rules || { expiration_enabled: false, valid_days: 7, show_countdown: false };
  const followup = settings.followup || { version: 1, enabled: false };

  const [newCoupon, setNewCoupon] = useState<{
    code: string;
    type: 'percentage' | 'fixed';
    value: string;
    applies_to: 'estimate_total' | 'deposit_only';
    expires_at: string;
    usage_limit: string;
  }>({
    code: '',
    type: 'percentage',
    value: '',
    applies_to: 'estimate_total',
    expires_at: '',
    usage_limit: '',
  });
  const [couponError, setCouponError] = useState('');

  const addCoupon = () => {
    if (!newCoupon.code.trim()) { setCouponError('Code is required'); return; }
    if (!newCoupon.value || isNaN(Number(newCoupon.value)) || Number(newCoupon.value) <= 0) {
      setCouponError('Enter a valid discount value'); return;
    }
    const existing = promotions.coupons || [];
    if (existing.length >= 10) { setCouponError('Max 10 coupons'); return; }
    const code = newCoupon.code.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (existing.some(c => c.code === code)) { setCouponError('Coupon code already exists'); return; }
    const coupon: Coupon = {
      id: generateCouponId(),
      code,
      type: newCoupon.type,
      value: Number(newCoupon.value),
      applies_to: newCoupon.applies_to,
      expires_at: newCoupon.expires_at ? new Date(newCoupon.expires_at).getTime() : null,
      usage_limit: newCoupon.usage_limit ? Number(newCoupon.usage_limit) : null,
      usage_count: 0,
      active: true,
    };
    onPromotionsChange({ coupons: [...existing, coupon] });
    setNewCoupon({ code: '', type: 'percentage', value: '', applies_to: 'estimate_total', expires_at: '', usage_limit: '' });
    setCouponError('');
  };

  const removeCoupon = (id: string) => {
    onPromotionsChange({ coupons: (promotions.coupons || []).filter(c => c.id !== id) });
  };

  const toggleCouponActive = (id: string) => {
    onPromotionsChange({
      coupons: (promotions.coupons || []).map(c => c.id === id ? { ...c, active: !c.active } : c),
    });
  };

  const getCouponStatus = (coupon: Coupon): { label: string; color: string; bg: string } => {
    if (!coupon.active) return { label: 'Inactive', color: '#6B7280', bg: '#F3F4F6' };
    if (coupon.expires_at && coupon.expires_at < Date.now()) return { label: 'Expired', color: '#DC2626', bg: '#FEF2F2' };
    if (coupon.usage_limit !== null && coupon.usage_count >= coupon.usage_limit) return { label: 'Limit Reached', color: '#D97706', bg: '#FFFBEB' };
    return { label: 'Active', color: '#059669', bg: '#F0FDF4' };
  };

  const availableCoupons = (promotions.coupons || []).filter(c => c.active);

  const reminder1Enabled = followup.reminders?.reminder_1_enabled ?? true;
  const reminder1Hours = followup.reminders?.reminder_1_delay_hours ?? 24;
  const reminder2Enabled = followup.reminders?.reminder_2_enabled ?? true;
  const reminder2Days = followup.reminders?.reminder_2_delay_days ?? 3;
  const reminder2IncludeDiscount = followup.reminders?.reminder_2_include_discount ?? false;
  const reminder2CouponId = followup.reminders?.reminder_2_coupon_id ?? null;

  const updateReminders = (patch: Partial<NonNullable<typeof followup.reminders>>) => {
    onFollowupChange({ reminders: { ...followup.reminders, ...patch } });
  };

  const updateTemplates = (patch: Partial<NonNullable<typeof followup.templates>>) => {
    onFollowupChange({ templates: { ...followup.templates, ...patch } });
  };

  return (
    <div>
      <CollapsibleSection title="Promo Codes" testId="section-coupons">
        <ToggleSwitch
          value={promotions.enabled}
          onChange={v => onPromotionsChange({ enabled: v })}
          testId="toggle-promotions-enabled"
          label="Enable promo codes"
          sublabel="Allow customers to apply discount codes"
        />
        {promotions.enabled && (
          <div style={{ marginTop: '16px' }}>
            {(promotions.coupons || []).length > 0 && (
              <div style={{ marginBottom: '16px' }}>
                {(promotions.coupons || []).map(coupon => {
                  const status = getCouponStatus(coupon);
                  return (
                    <div key={coupon.id} data-testid={`coupon-row-${coupon.id}`} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '10px 12px', borderRadius: p.radius.sm,
                      border: `1px solid ${p.colors.borderLight}`,
                      background: '#FAFAFA', marginBottom: '8px', gap: '8px',
                    }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '13px', fontWeight: 700, color: p.colors.heading, fontFamily: 'monospace' }}>
                            {coupon.code}
                          </span>
                          <span style={{
                            fontSize: '11px', fontWeight: 600, color: status.color,
                            background: status.bg, padding: '2px 7px', borderRadius: '10px',
                            border: `1px solid ${status.color}30`,
                          }}>
                            {status.label}
                          </span>
                        </div>
                        <span style={{ fontSize: '11px', color: p.colors.muted }}>
                          {coupon.type === 'percentage' ? `${coupon.value}% off` : `$${coupon.value} off`}
                          {coupon.applies_to === 'deposit_only' ? ' (deposit)' : ''}
                          {coupon.usage_limit !== null ? ` · ${coupon.usage_count}/${coupon.usage_limit} uses` : ''}
                        </span>
                      </div>
                      <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                        <button
                          data-testid={`coupon-toggle-${coupon.id}`}
                          onClick={() => toggleCouponActive(coupon.id)}
                          title={coupon.active ? 'Deactivate' : 'Activate'}
                          style={{
                            padding: '4px 8px', borderRadius: '6px', border: `1px solid ${p.colors.border}`,
                            background: 'white', cursor: 'pointer', fontSize: '11px',
                            color: coupon.active ? p.colors.muted : p.colors.accent,
                          }}
                        >
                          {coupon.active ? 'Disable' : 'Enable'}
                        </button>
                        <button
                          data-testid={`coupon-remove-${coupon.id}`}
                          onClick={() => removeCoupon(coupon.id)}
                          style={{
                            width: '28px', height: '28px', borderRadius: '6px', border: `1px solid #FCA5A5`,
                            background: '#FEF2F2', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}
                        >
                          <X style={{ width: '12px', height: '12px', color: '#DC2626' }} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {(promotions.coupons || []).length < 10 && (
              <div style={{
                padding: '14px', borderRadius: p.radius.md,
                border: `1px dashed ${p.colors.border}`, background: '#FAFAFA',
              }}>
                <p style={{ fontSize: '12px', fontWeight: 600, color: p.colors.body, marginBottom: '10px' }}>Add Coupon</p>
                <div style={{ marginBottom: '10px' }}>
                  <label style={{ fontSize: '11px', fontWeight: 600, color: p.colors.subtle, display: 'block', marginBottom: '4px' }}>
                    Code (alphanumeric)
                  </label>
                  <input
                    data-testid="input-coupon-code"
                    type="text"
                    value={newCoupon.code}
                    onChange={e => setNewCoupon(prev => ({ ...prev, code: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') }))}
                    placeholder="e.g. SAVE20"
                    className="premium-input"
                    maxLength={20}
                  />
                </div>

                <div style={{ marginBottom: '10px' }}>
                  <label style={{ fontSize: '11px', fontWeight: 600, color: p.colors.subtle, display: 'block', marginBottom: '6px' }}>Type</label>
                  <ChipGroup
                    options={[
                      { value: 'percentage', label: 'Percentage' },
                      { value: 'fixed', label: 'Fixed ($)' },
                    ]}
                    value={newCoupon.type}
                    onChange={v => setNewCoupon(prev => ({ ...prev, type: v as 'percentage' | 'fixed' }))}
                    testIdPrefix="coupon-type"
                  />
                </div>

                <div style={{ marginBottom: '10px' }}>
                  <label style={{ fontSize: '11px', fontWeight: 600, color: p.colors.subtle, display: 'block', marginBottom: '4px' }}>
                    Value {newCoupon.type === 'percentage' ? '(%)' : '($)'}
                  </label>
                  <input
                    data-testid="input-coupon-value"
                    type="number"
                    min="0"
                    value={newCoupon.value}
                    onChange={e => setNewCoupon(prev => ({ ...prev, value: e.target.value }))}
                    placeholder={newCoupon.type === 'percentage' ? 'e.g. 20' : 'e.g. 50'}
                    className="premium-input"
                  />
                </div>

                <div style={{ marginBottom: '10px' }}>
                  <label style={{ fontSize: '11px', fontWeight: 600, color: p.colors.subtle, display: 'block', marginBottom: '6px' }}>Applies To</label>
                  <ChipGroup
                    options={[
                      { value: 'estimate_total', label: 'Estimate Total' },
                      { value: 'deposit_only', label: 'Deposit Only' },
                    ]}
                    value={newCoupon.applies_to}
                    onChange={v => setNewCoupon(prev => ({ ...prev, applies_to: v as 'estimate_total' | 'deposit_only' }))}
                    testIdPrefix="coupon-applies"
                  />
                </div>

                <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: '11px', fontWeight: 600, color: p.colors.subtle, display: 'block', marginBottom: '4px' }}>
                      Expiry Date <span style={{ fontWeight: 400 }}>(optional)</span>
                    </label>
                    <input
                      data-testid="input-coupon-expires"
                      type="date"
                      value={newCoupon.expires_at}
                      onChange={e => setNewCoupon(prev => ({ ...prev, expires_at: e.target.value }))}
                      className="premium-input"
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: '11px', fontWeight: 600, color: p.colors.subtle, display: 'block', marginBottom: '4px' }}>
                      Usage Limit <span style={{ fontWeight: 400 }}>(optional)</span>
                    </label>
                    <input
                      data-testid="input-coupon-limit"
                      type="number"
                      min="1"
                      value={newCoupon.usage_limit}
                      onChange={e => setNewCoupon(prev => ({ ...prev, usage_limit: e.target.value }))}
                      placeholder="Unlimited"
                      className="premium-input"
                    />
                  </div>
                </div>

                {couponError && (
                  <p style={{ fontSize: '11px', color: p.colors.danger, marginBottom: '8px' }}>{couponError}</p>
                )}

                <button
                  data-testid="button-add-coupon"
                  onClick={addCoupon}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '6px',
                    padding: '8px 16px', borderRadius: p.radius.sm,
                    border: `1px solid ${p.colors.accent}`,
                    background: p.colors.accent, color: 'white',
                    fontSize: '13px', fontWeight: 600, cursor: 'pointer',
                  }}
                >
                  <Plus style={{ width: '14px', height: '14px' }} />
                  Add Coupon
                </button>
              </div>
            )}
            {(promotions.coupons || []).length >= 10 && (
              <p style={{ fontSize: '12px', color: p.colors.muted }}>Maximum 10 coupons reached.</p>
            )}
          </div>
        )}
      </CollapsibleSection>

      <CollapsibleSection title="Quote Expiration" testId="section-expiration">
        <ToggleSwitch
          value={quoteRules.expiration_enabled}
          onChange={v => onQuoteRulesChange({ expiration_enabled: v })}
          testId="toggle-expiration-enabled"
          label="Enable quote expiration"
          sublabel="Quotes become invalid after a set number of days"
        />
        {quoteRules.expiration_enabled && (
          <div style={{ marginTop: '12px' }}>
            <div style={{ marginBottom: '14px' }}>
              <label style={{ fontSize: '12px', fontWeight: 600, color: p.colors.body, display: 'block', marginBottom: '6px' }}>
                Valid for (days)
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <input
                  data-testid="input-valid-days"
                  type="number"
                  min="1"
                  max="365"
                  value={quoteRules.valid_days}
                  onChange={e => {
                    const v = Math.min(365, Math.max(1, Number(e.target.value)));
                    onQuoteRulesChange({ valid_days: v });
                  }}
                  className="premium-input"
                  style={{ width: '80px' }}
                />
                <span style={{ fontSize: '13px', color: p.colors.muted }}>days</span>
              </div>
            </div>
            <ToggleSwitch
              value={quoteRules.show_countdown}
              onChange={v => onQuoteRulesChange({ show_countdown: v })}
              testId="toggle-show-countdown"
              label="Show countdown timer"
              sublabel="Display time remaining on the quote"
            />
          </div>
        )}
      </CollapsibleSection>

      <CollapsibleSection title="Follow-Up Reminders" testId="section-reminders">
        <p style={{ fontSize: '12px', color: p.colors.muted, marginBottom: '12px', lineHeight: 1.5 }}>
          Configure the follow-up emails sent to leads after they submit a quote request.
        </p>
        <ToggleSwitch
          value={followup.enabled}
          onChange={v => onFollowupChange({ enabled: v })}
          testId="toggle-followup-enabled"
          label="Enable follow-up emails"
          sublabel="Automatically follow up with leads via email"
        />
        {followup.enabled && (
          <div style={{ marginTop: '16px' }}>
            <div style={{
              padding: '14px', borderRadius: p.radius.md,
              border: `1px solid ${p.colors.borderLight}`,
              background: '#FAFAFA', marginBottom: '12px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                <p style={{ fontSize: '13px', fontWeight: 600, color: p.colors.heading }}>Reminder 1</p>
                <button
                  data-testid="toggle-reminder-1"
                  onClick={() => updateReminders({ reminder_1_enabled: !reminder1Enabled })}
                  style={{
                    width: '36px', height: '20px', borderRadius: '10px', border: 'none',
                    background: reminder1Enabled ? p.colors.accent : '#D1D5DB',
                    cursor: 'pointer', position: 'relative', transition: 'background 0.2s ease', flexShrink: 0,
                  }}
                >
                  <div style={{
                    width: '16px', height: '16px', borderRadius: '50%',
                    background: 'white', boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
                    position: 'absolute', top: '2px',
                    left: reminder1Enabled ? '18px' : '2px',
                    transition: 'left 0.2s ease',
                  }} />
                </button>
              </div>
              <div style={{ marginBottom: '10px' }}>
                <label style={{ fontSize: '11px', fontWeight: 600, color: p.colors.subtle, display: 'block', marginBottom: '4px' }}>
                  Delay (hours)
                </label>
                <input
                  data-testid="input-reminder-1-hours"
                  type="number"
                  min="1"
                  max="168"
                  value={reminder1Hours}
                  onChange={e => updateReminders({ reminder_1_delay_hours: Number(e.target.value) })}
                  className="premium-input"
                  style={{ width: '80px' }}
                />
              </div>
              <div style={{ marginBottom: '8px' }}>
                <label style={{ fontSize: '11px', fontWeight: 600, color: p.colors.subtle, display: 'block', marginBottom: '4px' }}>Subject</label>
                <input
                  data-testid="input-reminder-1-subject"
                  type="text"
                  value={followup.templates?.reminder?.subject || ''}
                  onChange={e => updateTemplates({ reminder: { ...followup.templates?.reminder, subject: e.target.value } })}
                  placeholder="Following up on your quote..."
                  className="premium-input"
                />
              </div>
              <div>
                <label style={{ fontSize: '11px', fontWeight: 600, color: p.colors.subtle, display: 'block', marginBottom: '4px' }}>Body</label>
                <textarea
                  data-testid="input-reminder-1-body"
                  value={followup.templates?.reminder?.body || ''}
                  onChange={e => updateTemplates({ reminder: { ...followup.templates?.reminder, body: e.target.value } })}
                  placeholder="Hi {{name}}, just checking in..."
                  className="premium-input"
                  rows={4}
                  style={{ resize: 'vertical', fontFamily: 'inherit', fontSize: '12px' }}
                />
              </div>
            </div>

            <div style={{
              padding: '14px', borderRadius: p.radius.md,
              border: `1px solid ${p.colors.borderLight}`,
              background: '#FAFAFA',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                <p style={{ fontSize: '13px', fontWeight: 600, color: p.colors.heading }}>Reminder 2 (Last Call)</p>
                <button
                  data-testid="toggle-reminder-2"
                  onClick={() => updateReminders({ reminder_2_enabled: !reminder2Enabled })}
                  style={{
                    width: '36px', height: '20px', borderRadius: '10px', border: 'none',
                    background: reminder2Enabled ? p.colors.accent : '#D1D5DB',
                    cursor: 'pointer', position: 'relative', transition: 'background 0.2s ease', flexShrink: 0,
                  }}
                >
                  <div style={{
                    width: '16px', height: '16px', borderRadius: '50%',
                    background: 'white', boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
                    position: 'absolute', top: '2px',
                    left: reminder2Enabled ? '18px' : '2px',
                    transition: 'left 0.2s ease',
                  }} />
                </button>
              </div>
              <div style={{ marginBottom: '10px' }}>
                <label style={{ fontSize: '11px', fontWeight: 600, color: p.colors.subtle, display: 'block', marginBottom: '4px' }}>
                  Delay (days)
                </label>
                <input
                  data-testid="input-reminder-2-days"
                  type="number"
                  min="1"
                  max="30"
                  value={reminder2Days}
                  onChange={e => updateReminders({ reminder_2_delay_days: Number(e.target.value) })}
                  className="premium-input"
                  style={{ width: '80px' }}
                />
              </div>
              <div style={{ marginBottom: '10px' }}>
                <ToggleSwitch
                  value={reminder2IncludeDiscount}
                  onChange={v => updateReminders({ reminder_2_include_discount: v })}
                  testId="toggle-reminder-2-discount"
                  label="Include discount code"
                  sublabel="Attach a promo code to this reminder email"
                />
              </div>
              {reminder2IncludeDiscount && (
                <div style={{ marginBottom: '10px' }}>
                  <label style={{ fontSize: '11px', fontWeight: 600, color: p.colors.subtle, display: 'block', marginBottom: '4px' }}>
                    Select Coupon
                  </label>
                  {availableCoupons.length === 0 ? (
                    <p style={{ fontSize: '12px', color: p.colors.muted }}>
                      No active coupons. Enable promo codes and add a coupon above.
                    </p>
                  ) : (
                    <select
                      data-testid="select-reminder-2-coupon"
                      value={reminder2CouponId || ''}
                      onChange={e => updateReminders({ reminder_2_coupon_id: e.target.value || null })}
                      className="premium-input"
                      style={{ width: '100%' }}
                    >
                      <option value="">Select a coupon...</option>
                      {availableCoupons.map(c => (
                        <option key={c.id} value={c.id}>
                          {c.code} — {c.type === 'percentage' ? `${c.value}% off` : `$${c.value} off`}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )}
              <div style={{ marginBottom: '8px' }}>
                <label style={{ fontSize: '11px', fontWeight: 600, color: p.colors.subtle, display: 'block', marginBottom: '4px' }}>Subject</label>
                <input
                  data-testid="input-reminder-2-subject"
                  type="text"
                  value={followup.templates?.last_call?.subject || ''}
                  onChange={e => updateTemplates({ last_call: { ...followup.templates?.last_call, subject: e.target.value } })}
                  placeholder="Last chance to lock in your slot..."
                  className="premium-input"
                />
              </div>
              <div>
                <label style={{ fontSize: '11px', fontWeight: 600, color: p.colors.subtle, display: 'block', marginBottom: '4px' }}>Body</label>
                <textarea
                  data-testid="input-reminder-2-body"
                  value={followup.templates?.last_call?.body || ''}
                  onChange={e => updateTemplates({ last_call: { ...followup.templates?.last_call, body: e.target.value } })}
                  placeholder="Hi {{name}}, last chance..."
                  className="premium-input"
                  rows={4}
                  style={{ resize: 'vertical', fontFamily: 'inherit', fontSize: '12px' }}
                />
                <p style={{ fontSize: '10px', color: p.colors.muted, marginTop: '4px' }}>
                  Use {'{{discount_code}}'} and {'{{discount_value}}'} as placeholders for the coupon.
                </p>
              </div>
            </div>
          </div>
        )}
      </CollapsibleSection>
    </div>
  );
}


function IntegrationsTab({ settings, onChange }: {
  settings: CalculatorSettings['integrations']; onChange: (key: string, value: any) => void;
}) {
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validateGtmId = (v: string) => {
    if (v && !/^GTM-[A-Z0-9]{4,}$/i.test(v)) {
      setErrors(prev => ({ ...prev, gtm_id: 'Format: GTM-XXXXXXX' }));
    } else {
      setErrors(prev => { const n = { ...prev }; delete n.gtm_id; return n; });
    }
    onChange('gtm_id', v);
  };

  const validatePixelId = (v: string) => {
    if (v && !/^\d{10,20}$/.test(v)) {
      setErrors(prev => ({ ...prev, facebook_pixel_id: 'Must be a numeric ID (10-20 digits)' }));
    } else {
      setErrors(prev => { const n = { ...prev }; delete n.facebook_pixel_id; return n; });
    }
    onChange('facebook_pixel_id', v);
  };

  const validateWebhook = (v: string) => {
    if (v && !/^https?:\/\/.+/.test(v)) {
      setErrors(prev => ({ ...prev, webhook_url: 'Must be a valid URL starting with http(s)://' }));
    } else {
      setErrors(prev => { const n = { ...prev }; delete n.webhook_url; return n; });
    }
    onChange('webhook_url', v);
  };

  return (
    <div>
      <SectionHeader title="Tracking" />
      <StudioInput
        value={settings.gtm_id || ''}
        onChange={validateGtmId}
        testId="input-gtm-id"
        placeholder="GTM-XXXXXXX"
        label="Google Tag Manager ID"
        error={errors.gtm_id}
      />

      <StudioInput
        value={settings.facebook_pixel_id || ''}
        onChange={validatePixelId}
        testId="input-pixel-id"
        placeholder="1234567890123456"
        label="Facebook Pixel ID"
        error={errors.facebook_pixel_id}
      />

      <SectionHeader title="Data" />
      <StudioInput
        value={settings.webhook_url || ''}
        onChange={validateWebhook}
        testId="input-webhook-url"
        placeholder="https://yourapp.com/webhooks/quotes"
        label="Webhook URL"
        sublabel="Receive lead data via POST"
        error={errors.webhook_url}
      />

      <ToggleSwitch
        value={settings.crm_enabled}
        onChange={v => onChange('crm_enabled', v)}
        testId="toggle-crm"
        label="CRM integration"
        sublabel="Auto-sync leads to your CRM"
      />

      <StudioInput
        value={settings.email_template || ''}
        onChange={v => onChange('email_template', v)}
        testId="input-email-template"
        placeholder="Custom notification email template..."
        label="Email notification template"
        sublabel="(optional)"
      />

      <CollapsibleSection title="Advanced" testId="section-advanced" badge="Pro">
        <div style={{
          padding: '10px 14px', borderRadius: p.radius.sm,
          background: '#FFF7ED', border: '1px solid #FED7AA',
          marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px',
        }}>
          <Lock style={{ width: '14px', height: '14px', color: '#EA580C', flexShrink: 0 }} />
          <span style={{ fontSize: '12px', color: '#9A3412' }}>
            Advanced features are available on the Pro plan.
          </span>
        </div>

        <div style={{ opacity: 0.6, pointerEvents: 'none' }}>
          <StudioInput
            value={settings.custom_css || ''}
            onChange={v => onChange('custom_css', v)}
            testId="input-custom-css"
            placeholder=".widget { ... }"
            label="Custom CSS"
          />

          <StudioInput
            value={settings.custom_js || ''}
            onChange={v => onChange('custom_js', v)}
            testId="input-custom-js"
            placeholder="window.onQuoteComplete = function() { ... }"
            label="Custom JS Hook"
          />

          <SectionHeader title="Language & Currency" />
          <div style={{ display: 'flex', gap: '10px' }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: '12px', fontWeight: 600, color: p.colors.body, display: 'block', marginBottom: '6px' }}>Language</label>
              <select
                data-testid="select-language"
                value={settings.language}
                onChange={e => onChange('language', e.target.value)}
                className="premium-input"
                style={{ width: '100%' }}
              >
                <option value="en">English</option>
                <option value="es">Spanish</option>
                <option value="fr">French</option>
                <option value="de">German</option>
                <option value="pt">Portuguese</option>
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: '12px', fontWeight: 600, color: p.colors.body, display: 'block', marginBottom: '6px' }}>Currency</label>
              <select
                data-testid="select-currency"
                value={settings.currency}
                onChange={e => onChange('currency', e.target.value)}
                className="premium-input"
                style={{ width: '100%' }}
              >
                <option value="USD">USD ($)</option>
                <option value="EUR">EUR (€)</option>
                <option value="GBP">GBP (£)</option>
                <option value="CAD">CAD ($)</option>
                <option value="AUD">AUD ($)</option>
              </select>
            </div>
          </div>

          <div style={{ marginTop: '12px' }} />
          <ToggleSwitch
            value={settings.dark_mode}
            onChange={v => onChange('dark_mode', v)}
            testId="toggle-dark-mode"
            label="Dark mode"
            sublabel="Enable dark theme for the calculator"
          />

          <SectionHeader title="Animation Speed" />
          <ChipGroup
            options={[
              { value: 'slow', label: 'Slow' },
              { value: 'normal', label: 'Normal' },
              { value: 'fast', label: 'Fast' },
            ]}
            value={settings.animation_speed}
            onChange={v => onChange('animation_speed', v)}
            testIdPrefix="anim-speed"
          />
        </div>
      </CollapsibleSection>
    </div>
  );
}
