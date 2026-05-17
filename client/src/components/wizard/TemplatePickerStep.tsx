// Template-picker step — Elfsight-style. The live calculator preview is the
// main screen (rendered by WizardCard's preview pane); this component is the
// dock beneath it: a single horizontal row of template cards, scrollable by
// ‹ › arrows and by drag/swipe, with "Continue with this template" pinned.
//
// NOTE: the catalogue is seeded with the 6 layout templates + a Blank option.
// The real per-trade template set is authored later.
import { useRef, useState } from 'react';
import { TEMPLATE_LIBRARY } from '@shared/templateLibrary';
import { platformTheme } from '@/theme/platformTheme';
import { Check, ArrowLeft, ArrowRight, ChevronLeft, ChevronRight, Save } from 'lucide-react';

const p = platformTheme;

interface CatalogueItem {
  id: string;
  name: string;
  description: string;
  layout_style: 'single_page' | 'multi_step' | 'two_column';
}

const BLANK: CatalogueItem = {
  id: 'blank',
  name: 'Blank',
  description: 'Start from scratch',
  layout_style: 'single_page',
};

const ITEMS: CatalogueItem[] = [
  BLANK,
  ...TEMPLATE_LIBRARY.map(t => ({
    id: t.id, name: t.name, description: t.description, layout_style: t.layout_style,
  })),
];

/* Stylised mini-mockup of a template's layout. */
function TemplateThumb({ layout, blank }: { layout: string; blank?: boolean }) {
  const bar = (w: string, h = 7, c = '#cdd5e0') => (
    <div style={{ width: w, height: h, borderRadius: 3, background: c }} />
  );
  if (blank) {
    return (
      <div style={{
        height: 88, borderRadius: 8, border: `1.5px dashed ${p.colors.borderHover}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: p.colors.subtle, fontSize: 24, fontWeight: 300, background: '#fff',
      }}>+</div>
    );
  }
  return (
    <div style={{ height: 88, borderRadius: 8, background: '#fff', border: `1px solid ${p.colors.borderLight}`, padding: 9, overflow: 'hidden' }}>
      {layout === 'two_column' ? (
        <div style={{ display: 'flex', gap: 7, height: '100%' }}>
          <div style={{ flex: 1.4, display: 'flex', flexDirection: 'column', gap: 5 }}>
            {bar('70%')}{bar('100%', 12)}{bar('100%', 12)}{bar('55%')}
          </div>
          <div style={{ flex: 1, borderRadius: 6, background: p.colors.accent, display: 'flex', flexDirection: 'column', gap: 4, padding: 6 }}>
            {bar('60%', 5, 'rgba(255,255,255,0.5)')}{bar('80%', 9, 'rgba(255,255,255,0.85)')}
          </div>
        </div>
      ) : layout === 'multi_step' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', gap: 4 }}>
            {bar('33%', 4, p.colors.accent)}{bar('33%', 4)}{bar('33%', 4)}
          </div>
          {bar('60%')}{bar('100%', 14)}
          <div style={{ alignSelf: 'flex-end' }}>{bar('34px', 11, p.colors.accent)}</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {bar('55%')}{bar('100%', 12)}{bar('100%', 12)}
          <div style={{ borderRadius: 5, background: p.colors.accentLighter, height: 17 }} />
          {bar('40px', 11, p.colors.accent)}
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
  const [savedFlash, setSavedFlash] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Drag-to-scroll — tracks movement so a drag doesn't fire a card click.
  const drag = useRef({ active: false, startX: 0, startScroll: 0, moved: 0 });

  const onPointerDown = (e: React.PointerEvent) => {
    const el = scrollRef.current;
    if (!el) return;
    drag.current = { active: true, startX: e.clientX, startScroll: el.scrollLeft, moved: 0 };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const el = scrollRef.current;
    if (!el || !drag.current.active) return;
    const dx = e.clientX - drag.current.startX;
    drag.current.moved = Math.max(drag.current.moved, Math.abs(dx));
    el.scrollLeft = drag.current.startScroll - dx;
  };
  const onPointerUp = () => { drag.current.active = false; };

  const handleCardClick = (id: string) => {
    // Suppress the click that ends a drag gesture.
    if (drag.current.moved > 6) return;
    onSelect(id);
  };

  const arrow = (dir: -1 | 1) => () => {
    scrollRef.current?.scrollBy({ left: dir * 240, behavior: 'smooth' });
  };

  return (
    <div data-testid="template-picker">
      <div style={{ marginBottom: 12 }}>
        <p style={{ fontSize: 13, color: p.colors.muted, margin: 0, lineHeight: 1.5 }}>
          Pick a starting layout — the preview above updates instantly. You can fine-tune everything later.
        </p>
      </div>

      {/* Horizontal template strip — arrows + drag/swipe */}
      <div style={{ position: 'relative', marginBottom: 18 }}>
        <button
          type="button" data-testid="template-scroll-left" aria-label="Scroll left"
          onClick={arrow(-1)}
          style={{
            position: 'absolute', left: -6, top: '50%', transform: 'translateY(-50%)', zIndex: 2,
            width: 32, height: 32, borderRadius: '50%', cursor: 'pointer',
            border: `1px solid ${p.colors.border}`, background: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: p.shadows.sm,
          }}
        >
          <ChevronLeft style={{ width: 16, height: 16, color: p.colors.muted }} />
        </button>

        <div
          ref={scrollRef}
          className="template-strip"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
          style={{
            display: 'flex', gap: 12, overflowX: 'auto', padding: '4px 28px 10px',
            scrollbarWidth: 'none', cursor: 'grab', WebkitOverflowScrolling: 'touch',
          }}
        >
          {ITEMS.map(t => {
            const active = selectedId === t.id;
            return (
              <button
                key={t.id}
                data-testid={`template-card-${t.id}`}
                onClick={() => handleCardClick(t.id)}
                style={{
                  flex: '0 0 auto', width: 152, textAlign: 'left', padding: 9, cursor: 'pointer',
                  borderRadius: 12, background: '#fff',
                  border: active ? `2px solid ${p.colors.accent}` : `1px solid ${p.colors.border}`,
                  position: 'relative', transition: 'border-color 0.15s ease',
                }}
              >
                {active && (
                  <div style={{
                    position: 'absolute', top: 7, right: 7, width: 19, height: 19,
                    borderRadius: '50%', background: p.colors.accent, zIndex: 1,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Check style={{ width: 11, height: 11, color: '#fff' }} />
                  </div>
                )}
                <TemplateThumb layout={t.layout_style} blank={t.id === 'blank'} />
                <p style={{ fontSize: 12.5, fontWeight: 600, color: p.colors.heading, margin: '8px 2px 1px', lineHeight: 1.3 }}>
                  {t.name}
                </p>
                <p style={{ fontSize: 11, color: p.colors.muted, margin: '0 2px', lineHeight: 1.35, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {t.description}
                </p>
              </button>
            );
          })}
        </div>

        <button
          type="button" data-testid="template-scroll-right" aria-label="Scroll right"
          onClick={arrow(1)}
          style={{
            position: 'absolute', right: -6, top: '50%', transform: 'translateY(-50%)', zIndex: 2,
            width: 32, height: 32, borderRadius: '50%', cursor: 'pointer',
            border: `1px solid ${p.colors.border}`, background: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: p.shadows.sm,
          }}
        >
          <ChevronRight style={{ width: 16, height: 16, color: p.colors.muted }} />
        </button>
      </div>

      {/* Footer — Back · Save · Continue with this template */}
      <div style={{
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
