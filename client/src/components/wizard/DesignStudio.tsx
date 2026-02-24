import { useState, useCallback } from 'react';
import { platformTheme } from '@/theme/platformTheme';
import type { CalculatorSettings } from '@shared/schema';
import { TEMPLATE_LIBRARY, getTemplateById } from '@shared/templateLibrary';
import type { TemplateDefinition } from '@shared/templateLibrary';
import {
  Palette, Layout, TrendingUp, Link2, ChevronDown, ChevronRight,
  Info, Lock, Check, Type, Smartphone, Monitor, Globe, DollarSign,
  Mail, Phone, Clock, Eye, EyeOff, Calendar, ExternalLink,
  Sparkles, AlertTriangle, Code2, Zap, Moon, Languages, Gauge,
  LayoutGrid, Columns2, ListOrdered, CreditCard, ShieldCheck, CalendarCheck
} from 'lucide-react';

const p = platformTheme;

const TABS = [
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'layout', label: 'Layout', icon: Layout },
  { id: 'conversion', label: 'Conversion', icon: TrendingUp },
  { id: 'integrations', label: 'Integrations', icon: Link2 },
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
        <ConversionTab settings={settings.conversion} onChange={updateConversion} />
      )}
      {activeTab === 'integrations' && (
        <IntegrationsTab settings={settings.integrations} onChange={updateIntegrations} />
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
              boxShadow: active ? '0 2px 8px rgba(45,106,79,0.2)' : 'none',
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
                placeholder="#2D6A4F"
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
      <ChipGroup
        options={[
          { value: 'soft-rounded', label: 'Soft Rounded' },
          { value: 'sharp', label: 'Sharp' },
          { value: 'pill', label: 'Pill' },
        ]}
        value={settings.button_style}
        onChange={v => onChange('button_style', v)}
        testIdPrefix="btn-style"
      />

      <SectionHeader title="Border Radius" />
      <ChipGroup
        options={[
          { value: 'compact', label: 'Compact' },
          { value: 'medium', label: 'Medium' },
          { value: 'large', label: 'Large' },
        ]}
        value={settings.border_radius}
        onChange={v => onChange('border_radius', v)}
        testIdPrefix="radius"
      />

      <SectionHeader title="Surface Style" />
      <ChipGroup
        options={[
          { value: 'solid', label: 'Solid' },
          { value: 'glassmorphic', label: 'Glassmorphic' },
          { value: 'elevated', label: 'Elevated' },
        ]}
        value={settings.surface_style}
        onChange={v => onChange('surface_style', v)}
        testIdPrefix="surface"
      />

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


function ConversionTab({ settings, onChange }: {
  settings: CalculatorSettings['conversion']; onChange: (key: string, value: any) => void;
}) {
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
