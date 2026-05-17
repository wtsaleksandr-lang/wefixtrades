// Template-picker step — Elfsight-style catalogue. Renders in the wizard's
// left pane: a scrollable 2-column template grid + a categories list, with
// "Continue with this template" pinned below. The right preview pane shows
// the selected template live (driven by ui_template.template_id).
//
// NOTE: the catalogue is intentionally seeded with the 6 layout templates +
// a Blank option. The real per-trade template set is authored later, once
// the wizard itself is feature-complete.
import { useState } from 'react';
import { TEMPLATE_LIBRARY } from '@shared/templateLibrary';
import { platformTheme } from '@/theme/platformTheme';
import { Check, ArrowLeft, ArrowRight, ChevronRight, Save } from 'lucide-react';

const p = platformTheme;

interface CatalogueItem {
  id: string;
  name: string;
  description: string;
  layout_style: 'single_page' | 'multi_step' | 'two_column';
}

const BLANK: CatalogueItem = {
  id: 'blank',
  name: 'Blank — start from scratch',
  description: 'A clean default calculator you build up yourself',
  layout_style: 'single_page',
};

const ITEMS: CatalogueItem[] = [
  BLANK,
  ...TEMPLATE_LIBRARY.map(t => ({
    id: t.id, name: t.name, description: t.description, layout_style: t.layout_style,
  })),
];

// Trade-facing categories. Counts/contents are placeholders until the real
// per-trade templates are authored with the finished wizard.
const CATEGORIES = [
  { id: 'all', label: 'All templates' },
  { id: 'cleaning', label: 'Cleaning & Maintenance' },
  { id: 'construction', label: 'Home Construction' },
  { id: 'auto', label: 'Auto & Mobile Services' },
  { id: 'professional', label: 'Professional Services' },
  { id: 'other', label: 'Other Trades' },
];

/* Stylised mini-mockup of a template's layout. */
function TemplateThumb({ layout, blank }: { layout: string; blank?: boolean }) {
  const bar = (w: string, h = 7, c = '#cdd5e0') => (
    <div style={{ width: w, height: h, borderRadius: 3, background: c }} />
  );
  if (blank) {
    return (
      <div style={{
        height: 96, borderRadius: 8, border: `1.5px dashed ${p.colors.borderHover}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: p.colors.subtle, fontSize: 22, fontWeight: 300, background: '#fff',
      }}>+</div>
    );
  }
  return (
    <div style={{ height: 96, borderRadius: 8, background: '#fff', border: `1px solid ${p.colors.borderLight}`, padding: 10, overflow: 'hidden' }}>
      {layout === 'two_column' ? (
        <div style={{ display: 'flex', gap: 8, height: '100%' }}>
          <div style={{ flex: 1.4, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {bar('70%')}{bar('100%', 14)}{bar('100%', 14)}{bar('55%')}
          </div>
          <div style={{ flex: 1, borderRadius: 6, background: p.colors.accent, display: 'flex', flexDirection: 'column', gap: 5, padding: 7 }}>
            {bar('60%', 6, 'rgba(255,255,255,0.5)')}{bar('80%', 10, 'rgba(255,255,255,0.85)')}
          </div>
        </div>
      ) : layout === 'multi_step' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          <div style={{ display: 'flex', gap: 4 }}>
            {bar('33%', 4, p.colors.accent)}{bar('33%', 4)}{bar('33%', 4)}
          </div>
          {bar('60%')}{bar('100%', 16)}
          <div style={{ alignSelf: 'flex-end' }}>{bar('38px', 12, p.colors.accent)}</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          {bar('55%')}{bar('100%', 14)}{bar('100%', 14)}
          <div style={{ borderRadius: 5, background: p.colors.accentLighter, height: 20 }} />
          {bar('44px', 12, p.colors.accent)}
        </div>
      )}
    </div>
  );
}

interface Props {
  selectedId: string;
  onSelect: (id: string) => void;
  onBack: () => void;
  onContinue: () => void;
  onSave?: () => void;
}

export default function TemplatePickerStep({ selectedId, onSelect, onBack, onContinue, onSave }: Props) {
  const [category, setCategory] = useState('all');
  const [savedFlash, setSavedFlash] = useState(false);

  // Until per-trade templates exist, every category shows the full set.
  const items = ITEMS;

  return (
    <div data-testid="template-picker">
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 22,
      }}>
        {items.map(t => {
          const active = selectedId === t.id;
          return (
            <button
              key={t.id}
              data-testid={`template-card-${t.id}`}
              onClick={() => onSelect(t.id)}
              style={{
                textAlign: 'left', padding: 10, cursor: 'pointer',
                borderRadius: 12, background: '#fff',
                border: active ? `2px solid ${p.colors.accent}` : `1px solid ${p.colors.border}`,
                position: 'relative', transition: 'border-color 0.15s ease',
              }}
            >
              {active && (
                <div style={{
                  position: 'absolute', top: 8, right: 8, width: 20, height: 20,
                  borderRadius: '50%', background: p.colors.accent,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Check style={{ width: 12, height: 12, color: '#fff' }} />
                </div>
              )}
              <TemplateThumb layout={t.layout_style} blank={t.id === 'blank'} />
              <p style={{ fontSize: 12.5, fontWeight: 600, color: p.colors.heading, margin: '9px 2px 0', lineHeight: 1.3 }}>
                {t.name}
              </p>
            </button>
          );
        })}
      </div>

      {/* Categories */}
      <div style={{ marginBottom: 8 }}>
        <p style={{
          fontSize: 10.5, fontWeight: 700, letterSpacing: '0.1em',
          color: p.colors.subtle, margin: '0 0 8px',
        }}>
          CATEGORIES
        </p>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {CATEGORIES.map(c => {
            const active = category === c.id;
            const count = c.id === 'all' ? items.length : 0;
            return (
              <button
                key={c.id}
                data-testid={`template-category-${c.id}`}
                onClick={() => setCategory(c.id)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '10px 12px', cursor: 'pointer', border: 'none',
                  borderRadius: 8, background: active ? p.colors.accentLighter : 'transparent',
                  textAlign: 'left', transition: 'background 0.12s ease',
                }}
              >
                <span style={{ fontSize: 13, fontWeight: 500, color: active ? p.colors.accentDark : p.colors.body }}>
                  {c.label}
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ fontSize: 12, color: p.colors.subtle }}>{count}</span>
                  <ChevronRight style={{ width: 14, height: 14, color: p.colors.subtle }} />
                </span>
              </button>
            );
          })}
        </div>
        {category !== 'all' && (
          <p style={{ fontSize: 12, color: p.colors.muted, margin: '8px 12px 0', lineHeight: 1.5 }}>
            Trade-specific templates for this category are coming soon — pick a layout
            above or start blank.
          </p>
        )}
      </div>

      {/* Footer — Back · Save · Continue with this template */}
      <div style={{
        marginTop: 24, paddingTop: 18, borderTop: `1px solid ${p.colors.borderLight}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
      }}>
        <button
          data-testid="button-back"
          onClick={onBack}
          style={{
            display: 'flex', alignItems: 'center', gap: 6, minHeight: 44,
            padding: '10px 16px', borderRadius: p.radius.md, cursor: 'pointer',
            border: `1px solid ${p.colors.border}`, background: '#fff',
            fontSize: 14, fontWeight: 500, color: p.colors.muted,
          }}
        >
          <ArrowLeft style={{ width: 16, height: 16 }} /> Back
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {onSave && (
            <button
              data-testid="button-save"
              onClick={() => { onSave(); setSavedFlash(true); setTimeout(() => setSavedFlash(false), 1800); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, minHeight: 44,
                padding: '10px 16px', borderRadius: p.radius.md, cursor: 'pointer',
                border: `1px solid ${savedFlash ? p.colors.accent : p.colors.border}`,
                background: savedFlash ? p.colors.accentLighter : '#fff',
                fontSize: 14, fontWeight: 600, color: savedFlash ? p.colors.accentDark : p.colors.body,
              }}
            >
              {savedFlash
                ? <><Check style={{ width: 15, height: 15 }} /> Saved</>
                : <><Save style={{ width: 15, height: 15 }} /> Save</>}
            </button>
          )}
          <button
            data-testid="button-continue"
            onClick={onContinue}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, minHeight: 44,
              padding: '10px 22px', borderRadius: p.radius.md, cursor: 'pointer',
              border: 'none', background: p.colors.accent, color: '#fff',
              fontSize: 14, fontWeight: 700,
            }}
          >
            Continue with this template <ArrowRight style={{ width: 16, height: 16 }} />
          </button>
        </div>
      </div>
    </div>
  );
}
