// Rebuilt builder Step 1 — a SINGLE screen that collapses the old separate
// "Business" step and "Templates" step into one flow:
//
//   1. Business name        — typing updates the live preview header in real time.
//   2. Layout selector      — a COMPACT segmented control over the 3 real layouts;
//                             selecting one drives the live preview AND filters
//                             the template gallery (getPresetsByLayout).
//   3. Template gallery      — the layout's templates, shown as attractive cards.
//   4. Category browser      — the gallery is categorised via getTemplateCategories()
//                             / getPresetsByCategory(); the user browses by category.
//
// The trade picker / owner email live just below (still part of this one screen,
// driven by the host's children) so later builder steps keep working unchanged.
//
// The live-preview panel is owned by WizardCard — this component only emits
// businessName + layout + template selection back up so the preview reacts.
import { useState, useMemo } from 'react';
import {
  TEMPLATE_LAYOUTS, getPresetsByLayout, getPresetsByCategory,
  getTemplateCategories, getTemplatePreset, type TemplateLayout,
} from '@shared/templatePresets';
import { platformTheme } from '@/theme/platformTheme';
import { dashboardTheme as d } from '@/theme/dashboardTheme';
import { PickCard, Mockup } from './TemplatePickerStep';
import { Check } from 'lucide-react';

const p = platformTheme;

interface Props {
  /** Business name — controlled by the wizard so the live preview reacts. */
  businessName: string;
  onBusinessNameChange: (v: string) => void;
  businessNameError?: string;
  /** Currently-selected template id ('blank' or a preset id). */
  selectedTemplateId: string;
  /** Currently-selected layout — also drives the live preview. */
  selectedLayout: TemplateLayout;
  /** Emits a template + its layout (mirrors TemplatePickerStep.onSelect). */
  onSelect: (templateId: string, layout: TemplateLayout) => void;
  /** Emits a layout change with no template (filters gallery + drives preview). */
  onLayoutChange: (layout: TemplateLayout) => void;
  /** Trade picker / email — rendered inside this single screen, below the gallery. */
  children?: React.ReactNode;
  /** Step footer (Back/Save/Continue) — pinned to the bottom of the column. */
  footer?: React.ReactNode;
}

function sectionHead(title: string, sub: string, n: number) {
  return (
    <div data-theme="light" style={{ display: 'flex', alignItems: 'flex-start', gap: 9, marginBottom: 12 }}>
      <span style={{
        flexShrink: 0, width: 21, height: 21, borderRadius: '50%',
        background: p.colors.accent, color: '#fff', fontSize: 11.5, fontWeight: 800,
        display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 1,
      }}>{n}</span>
      <div>
        <p style={{ fontSize: 15, fontWeight: 800, color: p.colors.heading, margin: 0, letterSpacing: '-0.01em' }}>{title}</p>
        <p style={{ fontSize: 12, color: p.colors.muted, margin: '2px 0 0', lineHeight: 1.45 }}>{sub}</p>
      </div>
    </div>
  );
}

export default function BuilderStep1({
  businessName, onBusinessNameChange, businessNameError,
  selectedTemplateId, selectedLayout, onSelect, onLayoutChange, children, footer,
}: Props) {
  // Category filter — '' means "All categories".
  const [activeCategory, setActiveCategory] = useState('');
  const categories = useMemo(() => getTemplateCategories(), []);

  // Gallery = templates of the chosen layout, optionally narrowed to a category.
  const layoutPresets = useMemo(() => getPresetsByLayout(selectedLayout), [selectedLayout]);
  const gallery = useMemo(() => {
    if (!activeCategory) return layoutPresets;
    return getPresetsByCategory(activeCategory).filter(t => t.layout === selectedLayout);
  }, [activeCategory, selectedLayout, layoutPresets]);

  // Only show category chips that actually have a template in the current layout.
  const layoutCategories = useMemo(() => {
    const inLayout = new Set(layoutPresets.map(t => t.category));
    return categories.filter(c => inLayout.has(c));
  }, [categories, layoutPresets]);

  const handleLayoutPick = (l: TemplateLayout) => {
    if (l === selectedLayout) return;
    setActiveCategory('');
    // If the current template belongs to another layout, drop back to blank for
    // the new layout; otherwise just switch the layout (filters the gallery).
    const current = getTemplatePreset(selectedTemplateId);
    if (current && current.layout !== l) {
      onSelect('blank', l);
    } else {
      onLayoutChange(l);
    }
  };

  return (
    <div className="wizard-step-fill" data-testid="builder-step-1">
      <div style={{ flex: 1 }}>
        {/* ── 1. Business name ── */}
        {sectionHead('Business name', 'Shown in your calculator header — the preview updates as you type.', 1)}
        <input
          id="business-name"
          data-testid="input-business-name"
          type="text"
          value={businessName}
          onChange={e => onBusinessNameChange(e.target.value)}
          placeholder="e.g. Metro Plumbing Co."
          className="premium-input"
          style={{ height: 44, fontSize: 14, marginBottom: businessNameError ? 4 : 22 }}
        />
        {businessNameError && (
          <p data-error-field data-testid="error-business-name"
            style={{ fontSize: 12, color: p.colors.danger, margin: '0 0 18px' }}>
            {businessNameError}
          </p>
        )}

        {/* ── 2. Layout — compact segmented selector ── */}
        {sectionHead('Choose a layout', 'The overall shape of your calculator. Switch any time.', 2)}
        <div
          role="radiogroup"
          aria-label="Calculator layout"
          data-testid="layout-selector"
          style={{
            display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6,
            padding: 4, borderRadius: d.radius.control,
            background: d.colors.cardMuted, marginBottom: 22,
          }}
        >
          {TEMPLATE_LAYOUTS.map(l => {
            const active = l.id === selectedLayout;
            return (
              <button
                key={l.id}
                type="button"
                role="radio"
                aria-checked={active}
                data-testid={`layout-${l.id}`}
                onClick={() => handleLayoutPick(l.id)}
                title={l.description}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                  padding: '9px 6px', cursor: 'pointer',
                  borderRadius: d.radius.control,
                  border: active ? `1.5px solid ${p.colors.accent}` : '1.5px solid transparent',
                  background: active ? '#fff' : 'transparent',
                  boxShadow: active ? d.shadows.card : 'none',
                  transition: d.transitions.fast,
                }}
              >
                <div style={{ width: '100%', maxWidth: 92, transform: 'scale(0.78)', transformOrigin: 'center' }}>
                  <Mockup layout={l.id} />
                </div>
                <span style={{
                  fontSize: 11.5, fontWeight: 700, lineHeight: 1.2, textAlign: 'center',
                  color: active ? p.colors.accentDark : p.colors.body,
                }}>
                  {l.name}
                </span>
              </button>
            );
          })}
        </div>

        {/* ── 3 + 4. Template gallery, browseable by category ── */}
        {sectionHead('Pick a template', 'Start blank, or from a ready-made template for your trade — everything stays editable.', 3)}

        {/* Category browser — chips. "All" + per-trade categories. */}
        {layoutCategories.length > 1 && (
          <div
            data-testid="template-categories"
            style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}
          >
            {[{ id: '', label: 'All' }, ...layoutCategories.map(c => ({ id: c, label: c }))].map(c => {
              const active = c.id === activeCategory;
              return (
                <button
                  key={c.id || 'all'}
                  type="button"
                  data-testid={`template-category-${c.id || 'all'}`}
                  onClick={() => setActiveCategory(c.id)}
                  style={{
                    padding: '5px 11px', borderRadius: 999, cursor: 'pointer',
                    fontSize: 12, fontWeight: 600,
                    border: `1px solid ${active ? p.colors.accent : p.colors.border}`,
                    background: active ? p.colors.accent : '#fff',
                    color: active ? '#fff' : p.colors.muted,
                    transition: p.transitions.fast, whiteSpace: 'nowrap',
                  }}
                >
                  {active && <Check style={{ width: 11, height: 11, marginRight: 4, verticalAlign: '-1px' }} />}
                  {c.label}
                </button>
              );
            })}
          </div>
        )}

        {/* The gallery grid. */}
        <div
          data-testid="template-gallery"
          style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10, marginBottom: 6 }}
        >
          <PickCard
            testId="template-card-blank"
            active={selectedTemplateId === 'blank'}
            mockup={<Mockup layout={selectedLayout} blank />}
            name="Blank"
            desc="Start from scratch"
            onClick={() => onSelect('blank', selectedLayout)}
          />
          {gallery.map(t => (
            <PickCard
              key={t.id}
              testId={`template-card-${t.id}`}
              active={selectedTemplateId === t.id}
              mockup={<Mockup layout={t.layout} />}
              name={t.name}
              desc={t.description}
              onClick={() => onSelect(t.id, t.layout)}
            />
          ))}
        </div>
        {gallery.length === 0 && (
          <p data-testid="template-gallery-empty"
            style={{ fontSize: 12.5, color: p.colors.muted, margin: '4px 2px 0' }}>
            No templates in this category for the chosen layout — pick another category, or start blank.
          </p>
        )}

        {/* Trade picker / owner email — same single screen, host-provided. */}
        {children}
      </div>
      {footer}
    </div>
  );
}
