// Template-picker step — two levels. First the owner picks a LAYOUT
// (single-column / two-column / multi-step), then a TEMPLATE within that
// layout. The layout stays switchable: returning here and choosing a
// different layout re-picks. "Blank" is the first option in every layout.
//
// The themed template gallery (the real per-use-case presets) is authored in
// a later increment; today level 2 lists the layout's structural variants.
import { useState } from 'react';
import {
  TEMPLATE_LAYOUTS, getPresetsByLayout, getTemplatePreset, type TemplateLayout,
} from '@shared/templatePresets';
import { platformTheme } from '@/theme/platformTheme';
import { dashboardTheme as d } from '@/theme/dashboardTheme';
import { Check, ArrowLeft, ArrowRight, ChevronLeft, Save } from 'lucide-react';

const p = platformTheme;

interface Props {
  selectedId: string;
  onSelect: (templateId: string, layout: TemplateLayout) => void;
  onBack: () => void;
  onContinue: () => void;
  onSave?: () => void;
}

/* Stylised mini-mockup of a layout / template. */
function Mockup({ layout, blank }: { layout: TemplateLayout; blank?: boolean }) {
  const bar = (w: string, h = 7, c = '#cdd5e0') => (
    <div style={{ width: w, height: h, borderRadius: 3, background: c }} />
  );
  if (blank) {
    return (
      <div style={{
        height: 96, borderRadius: d.radius.control, border: `1.5px dashed ${p.colors.borderHover}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: p.colors.subtle, fontSize: 26, fontWeight: 300, background: '#fff',
      }}>+</div>
    );
  }
  return (
    <div style={{ height: 96, borderRadius: d.radius.control, background: d.colors.cardMuted, padding: 11, overflow: 'hidden' }}>
      {layout === 'two-column' ? (
        <div style={{ display: 'flex', gap: 8, height: '100%' }}>
          <div style={{ flex: 1.4, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {bar('70%')}{bar('100%', 13)}{bar('100%', 13)}{bar('55%')}
          </div>
          <div style={{ flex: 1, borderRadius: 6, background: p.colors.accent, display: 'flex', flexDirection: 'column', gap: 5, padding: 7 }}>
            {bar('60%', 5, 'rgba(255,255,255,0.5)')}{bar('80%', 10, 'rgba(255,255,255,0.85)')}
          </div>
        </div>
      ) : layout === 'multi-column' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          <div style={{ display: 'flex', gap: 5 }}>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>{bar('70%', 4)}{bar('100%', 11)}</div>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>{bar('70%', 4)}{bar('100%', 11)}</div>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>{bar('70%', 4)}{bar('100%', 11)}</div>
          </div>
          <div style={{ borderRadius: 5, background: p.colors.accent, height: 19 }} />
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          {bar('55%')}{bar('100%', 13)}{bar('100%', 13)}
          <div style={{ borderRadius: 5, background: p.colors.accentLighter, height: 19 }} />
          {bar('44px', 12, p.colors.accent)}
        </div>
      )}
    </div>
  );
}

/* A selectable card (used for both layouts and templates). */
function PickCard({ testId, active, mockup, name, desc, onClick }: {
  testId: string; active: boolean; mockup: React.ReactNode;
  name: string; desc: string; onClick: () => void;
}) {
  return (
    <button
      type="button" data-testid={testId} onClick={onClick}
      style={{
        textAlign: 'left', padding: 11, cursor: 'pointer', width: '100%',
        borderRadius: d.radius.card, background: d.colors.card, border: 'none',
        boxShadow: active ? `0 0 0 2px ${d.colors.accent}, ${d.shadows.card}` : d.shadows.card,
        position: 'relative', transition: d.transitions.fast,
      }}
    >
      {active && (
        <div style={{
          position: 'absolute', top: 9, right: 9, width: 20, height: 20, zIndex: 1,
          borderRadius: '50%', background: p.colors.accent,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Check style={{ width: 12, height: 12, color: '#fff' }} />
        </div>
      )}
      {mockup}
      <p style={{ fontSize: 13, fontWeight: 600, color: p.colors.heading, margin: '9px 2px 1px', lineHeight: 1.3 }}>
        {name}
      </p>
      <p style={{ fontSize: 11.5, color: p.colors.muted, margin: '0 2px', lineHeight: 1.4 }}>
        {desc}
      </p>
    </button>
  );
}

export default function TemplatePickerStep({ selectedId, onSelect, onBack, onContinue, onSave }: Props) {
  const [savedFlash, setSavedFlash] = useState(false);
  const currentPreset = getTemplatePreset(selectedId);
  const [view, setView] = useState<'layouts' | 'templates'>('layouts');
  const [activeLayout, setActiveLayout] = useState<TemplateLayout>(currentPreset?.layout || 'single-column');

  const sectionHead = (title: string, sub: string) => (
    <div style={{ marginBottom: 14 }}>
      <p style={{ fontSize: 16, fontWeight: 800, color: p.colors.heading, margin: 0, letterSpacing: '-0.01em' }}>{title}</p>
      <p style={{ fontSize: 12.5, color: p.colors.muted, margin: '3px 0 0', lineHeight: 1.5 }}>{sub}</p>
    </div>
  );

  return (
    <div data-testid="template-picker">
      <div style={{ maxWidth: 720, margin: '0 auto', marginBottom: 18 }}>
        {view === 'layouts' ? (
          <>
            {sectionHead('Choose a layout', 'The overall shape of your calculator — you can switch it any time.')}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
              {TEMPLATE_LAYOUTS.map(l => (
                <PickCard
                  key={l.id} testId={`layout-${l.id}`}
                  active={view === 'layouts' && currentPreset?.layout === l.id}
                  mockup={<Mockup layout={l.id} />}
                  name={l.name} desc={l.description}
                  onClick={() => { setActiveLayout(l.id); setView('templates'); }}
                />
              ))}
            </div>
          </>
        ) : (
          <>
            <button
              type="button" data-testid="back-to-layouts" onClick={() => setView('layouts')}
              style={{
                display: 'flex', alignItems: 'center', gap: 4, border: 'none', background: 'none',
                cursor: 'pointer', color: p.colors.accent, fontSize: 13, fontWeight: 600,
                padding: 0, marginBottom: 10,
              }}
            >
              <ChevronLeft style={{ width: 15, height: 15 }} /> Choose a different layout
            </button>
            {sectionHead(
              'Pick a template',
              'Start blank, or from a ready-made template — you customise everything next.',
            )}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
              <PickCard
                testId="template-card-blank"
                active={selectedId === 'blank'}
                mockup={<Mockup layout={activeLayout} blank />}
                name="Blank" desc="Start from scratch"
                onClick={() => onSelect('blank', activeLayout)}
              />
              {getPresetsByLayout(activeLayout).map(t => (
                <PickCard
                  key={t.id} testId={`template-card-${t.id}`}
                  active={selectedId === t.id}
                  mockup={<Mockup layout={t.layout} />}
                  name={t.name} desc={t.description}
                  onClick={() => onSelect(t.id, t.layout)}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {/* Footer — Back · Save · Continue */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <button
          data-testid="button-back" onClick={onBack}
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
            data-testid="button-continue" onClick={onContinue}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, minHeight: 44,
              padding: '10px 22px', borderRadius: p.radius.md, cursor: 'pointer',
              border: 'none', background: p.colors.accent, color: '#fff',
              fontSize: 14, fontWeight: 700,
            }}
          >
            Continue <ArrowRight style={{ width: 16, height: 16 }} />
          </button>
        </div>
      </div>
    </div>
  );
}
