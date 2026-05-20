// WizardShell — Elfsight-clone editor shell (Wave H1 → Wave I).
//
// Layout:
//   ┌────────────────────────────────────────────────────────┐
//   │ EditorTopBar  (brand · saved · spacer · device · ? · X) │
//   ├──────────┬─────────────────────────────────────────────┤
//   │ Tabs     │ Build · Style · Settings · Install          │
//   ├──────────┴─────────────┬───────────────────────────────┤
//   │ <TabPlaceholder>       │  <PreviewPane>                │
//   │ (editor column)        │  sticky live preview          │
//   └────────────────────────┴───────────────────────────────┘
//
// Wave I additions:
//  - One <DndContext/> spans the entire body so drags from the AddFieldMenu
//    (in the left pane) into the preview (right pane) work cross-section.
//    The single onDragEnd handler routes by container id.
//  - <SelectionProvider/> shares "which row is the user looking at?" state
//    between left-pane rows and right-pane preview-overlay decorators.
//  - Vertical drag-handle on the right edge of the left pane resizes it;
//    persisted to localStorage (`qq_editor_pane_width`). Hidden on mobile
//    (≤768px) via CSS — replaced by nothing since mobile stacks vertically.
//  - Open / close transitions on the wizard-shell-modal overlay (CSS only,
//    respects `prefers-reduced-motion`). Snappier on mobile.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import {
  DndContext, type DragEndEvent, closestCenter, pointerWithin,
} from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import { apiRequest } from '@/lib/queryClient';
import { platformTheme } from '@/theme/platformTheme';
import { dashboardTheme } from '@/theme/dashboardTheme';
import {
  buildBlankPreviewConfig,
  type TemplateField, type TemplateCalculation,
} from '@shared/templatePresets';
import EditorTopBar from './EditorTopBar';
import EditorTabs from './EditorTabs';
import TabPlaceholder from './TabPlaceholder';
import BuildTab from './BuildTab';
import PreviewPane from './PreviewPane';
import StyleTab from './StyleTab';
import SettingsTab from './SettingsTab';
import InstallTab from './InstallTab';
import { makeField } from './FieldsPanel';
import { SelectionProvider } from './selection';
import { useEditorDndSensors, DND_CONTAINERS } from './dnd';
import {
  INITIAL_SHELL_STATE, DEFAULT_SHELL_STYLE, DEFAULT_SHELL_NUMBER_FORMAT,
  type EditorTab, type PreviewDevice, type ShellState,
  type ShellHeader, type ShellResults, type ShellStyle,
  type ShellSettings, type ShellNumberFormat, type ShellPricing,
  type PublicFieldType,
} from './types';

const p = platformTheme;
const d = dashboardTheme;

const STORAGE_KEY = 'qq_elfsight_shell';
const PANE_WIDTH_KEY = 'qq_editor_pane_width';
const PANE_WIDTH_MIN = 320;
const PANE_WIDTH_MAX = 640;
const PANE_WIDTH_DEFAULT = 420;

function seedFields(layout: ShellState['layout']): TemplateField[] {
  return buildBlankPreviewConfig(layout).fields.map((f) => ({ ...f }));
}
function seedCalculations(layout: ShellState['layout']): TemplateCalculation[] {
  return buildBlankPreviewConfig(layout).calculations.map((c) => ({ ...c }));
}

function loadShellState(): ShellState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const layout = parsed.layout ?? INITIAL_SHELL_STATE.layout;
      const hasFields = Array.isArray(parsed.fields) && parsed.fields.length > 0;
      const hasCalcs = Array.isArray(parsed.calculations) && parsed.calculations.length > 0;
      return {
        ...INITIAL_SHELL_STATE,
        ...parsed,
        layout,
        fields: hasFields
          ? parsed.fields
          : (parsed.fields === undefined ? seedFields(layout) : []),
        calculations: hasCalcs
          ? parsed.calculations
          : (parsed.calculations === undefined ? seedCalculations(layout) : []),
        header: parsed.header ?? {},
        results: parsed.results ?? {},
        resultCalcId: parsed.resultCalcId,
        style: { ...DEFAULT_SHELL_STYLE, ...(parsed.style ?? {}) },
        settings: {
          ...(INITIAL_SHELL_STATE.settings ?? {}),
          ...(parsed.settings ?? {}),
          numberFormat: {
            ...DEFAULT_SHELL_NUMBER_FORMAT,
            ...((parsed.settings && parsed.settings.numberFormat) ?? {}),
          },
        },
      };
    }
  } catch {}
  return {
    ...INITIAL_SHELL_STATE,
    fields: seedFields(INITIAL_SHELL_STATE.layout),
    calculations: seedCalculations(INITIAL_SHELL_STATE.layout),
    style: { ...DEFAULT_SHELL_STYLE },
  };
}

function loadPaneWidth(): number {
  try {
    const raw = localStorage.getItem(PANE_WIDTH_KEY);
    if (raw) {
      const n = Number(raw);
      if (Number.isFinite(n) && n >= PANE_WIDTH_MIN && n <= PANE_WIDTH_MAX) return n;
    }
  } catch {}
  return PANE_WIDTH_DEFAULT;
}

function thousandsLiteral(sep: ShellNumberFormat['thousands']): ',' | ' ' | '' {
  return sep === 'comma' ? ',' : sep === 'space' ? ' ' : '';
}
function decimalLiteral(sep: ShellNumberFormat['decimal']): '.' | ',' {
  return sep === 'comma' ? ',' : '.';
}

function toAdvNumberFormat(nf: ShellNumberFormat | undefined) {
  const resolved = nf ?? DEFAULT_SHELL_NUMBER_FORMAT;
  return {
    thousands: thousandsLiteral(resolved.thousands),
    decimal: decimalLiteral(resolved.decimal),
    currency: resolved.currency || 'USD',
  };
}

function toPricingConfig(pricing: ShellPricing | undefined) {
  if (!pricing) {
    return { pricingType: 'hourly', unitName: 'hour', rate: 75, baseFee: 50 } as const;
  }
  if (pricing.mode === 'hourly') {
    const rate = typeof pricing.rate === 'number' && pricing.rate >= 0 ? pricing.rate : 75;
    return { pricingType: 'hourly', unitName: 'hour', rate } as const;
  }
  if (pricing.mode === 'fixed') {
    const minCharge = typeof pricing.value === 'number' && pricing.value >= 0 ? pricing.value : 0;
    return { pricingType: 'min_charge_plus_addons', minCharge } as const;
  }
  const unitName = (pricing.label ?? '').trim() || 'unit';
  const rate = typeof pricing.rate === 'number' && pricing.rate >= 0 ? pricing.rate : 1;
  return { pricingType: 'per_unit', unitName, rate } as const;
}

interface Props {
  embed?: boolean;
}

export default function WizardShell({ embed = false }: Props) {
  const [, navigate] = useLocation();
  const [state, setState] = useState<ShellState>(() => loadShellState());
  const [activeTab, setActiveTab] = useState<EditorTab>('build');
  const [device, setDevice] = useState<PreviewDevice>('desktop');
  const [justSaved, setJustSaved] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  // ── Wave I (d): resizable left pane width ─────────────────────────────
  const [paneWidth, setPaneWidth] = useState<number>(() => loadPaneWidth());
  const [isResizing, setIsResizing] = useState(false);

  useEffect(() => {
    try { localStorage.setItem(PANE_WIDTH_KEY, String(paneWidth)); } catch {}
  }, [paneWidth]);

  const onResizeStart = useCallback((startX: number, startWidth: number) => {
    setIsResizing(true);
    const onMove = (ev: MouseEvent | TouchEvent) => {
      const x = 'touches' in ev ? ev.touches[0].clientX : ev.clientX;
      const next = Math.max(PANE_WIDTH_MIN, Math.min(PANE_WIDTH_MAX, startWidth + (x - startX)));
      setPaneWidth(next);
    };
    const onUp = () => {
      setIsResizing(false);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchmove', onMove, { passive: true });
    window.addEventListener('touchend', onUp);
  }, []);

  // ── Wave H7: reflect the chosen language on the shell wrapper. Only the
  // LANG attribute is wired; translation strings are out of scope.
  // TODO(i18n): when translations land, propagate down to AdvancedCalculator
  // and the wizard headline copy as well.
  const shellLang = (state.settings?.language ?? 'en');

  // ── Wave I (h): mount/unmount transition state ────────────────────────
  // The modal wrapper paints in `is-entering` → `is-open` for the open
  // animation, and is set to `is-leaving` for ~180ms (snappier on mobile)
  // before navigation completes the close. `prefers-reduced-motion` skips.
  const [openPhase, setOpenPhase] = useState<'entering' | 'open' | 'leaving'>('entering');
  useEffect(() => {
    if (embed) { setOpenPhase('open'); return; }
    // Settle to "open" after the next frame so the entering keyframe paints.
    const id = requestAnimationFrame(() => setOpenPhase('open'));
    return () => cancelAnimationFrame(id);
  }, [embed]);

  // Persist locally.
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {}
  }, [state]);

  const setBusinessName = useCallback((v: string) => {
    setState((s) => ({ ...s, businessName: v }));
  }, []);

  const setFields = useCallback((next: TemplateField[]) => {
    setState((s) => ({ ...s, fields: next }));
  }, []);

  const setCalculations = useCallback((next: TemplateCalculation[]) => {
    setState((s) => ({ ...s, calculations: next }));
  }, []);

  const setHeader = useCallback((next: ShellHeader) => {
    setState((s) => ({ ...s, header: next }));
  }, []);

  const setResults = useCallback((next: ShellResults) => {
    setState((s) => ({ ...s, results: next }));
  }, []);

  const setStyle = useCallback((next: ShellStyle) => {
    setState((s) => ({ ...s, style: next }));
  }, []);

  const setSettings = useCallback((next: ShellSettings) => {
    setState((s) => ({ ...s, settings: next }));
  }, []);

  const setResultCalc = useCallback((calcId: string) => {
    setState((s) => {
      const nextCalcs = s.calculations.map((c) => {
        if (c.id === calcId) return { ...c, resultMode: 'primary' as const };
        if (c.resultMode === 'primary') return { ...c, resultMode: 'secondary' as const };
        return c;
      });
      return { ...s, resultCalcId: calcId, calculations: nextCalcs };
    });
  }, []);

  // ── Wave I (f): in-preview remove / add ──────────────────────────────
  const removeField = useCallback((fieldId: string) => {
    setState((s) => ({ ...s, fields: s.fields.filter((f) => f.id !== fieldId) }));
  }, []);
  const addField = useCallback((publicType: PublicFieldType) => {
    setState((s) => ({ ...s, fields: [...s.fields, makeField(publicType)] }));
  }, []);

  // ── Wave I (a)+(b): cross-section DnD router ─────────────────────────
  const sensors = useEditorDndSensors();
  const onDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;
    const activeId = String(active.id);
    const overId = String(over.id);

    // ── (b) Drag from AddFieldMenu into the preview ────────────────────
    if (activeId.startsWith('addfield:')) {
      const overKind = (over.data?.current as { kind?: string } | undefined)?.kind;
      const overContainer = over.id as string;
      if (
        overKind === 'preview-append'
        || overContainer === 'qq-dnd-preview-pane'
        || overContainer === DND_CONTAINERS.previewAppend
      ) {
        const publicType = activeId.slice('addfield:'.length) as PublicFieldType;
        addField(publicType);
      }
      return;
    }

    // Same-id drops aren't reorders.
    if (activeId === overId) return;

    // ── (a) Reorder Fields ─────────────────────────────────────────────
    setState((s) => {
      const fieldIds = s.fields.map((f) => f.id);
      const calcIds = s.calculations.map((c) => c.id);
      const fIdx = fieldIds.indexOf(activeId);
      if (fIdx >= 0) {
        const newIdx = fieldIds.indexOf(overId);
        if (newIdx >= 0) {
          return { ...s, fields: arrayMove(s.fields, fIdx, newIdx) };
        }
        return s;
      }
      const cIdx = calcIds.indexOf(activeId);
      if (cIdx >= 0) {
        const newIdx = calcIds.indexOf(overId);
        if (newIdx >= 0) {
          return { ...s, calculations: arrayMove(s.calculations, cIdx, newIdx) };
        }
        return s;
      }
      return s;
    });
  }, [addField]);

  const saveDraftMutation = useMutation({
    mutationFn: async () => {
      const settings = state.settings ?? {};
      const leadEmail = (settings.leadEmail ?? '').trim();
      const leadEmailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(leadEmail);
      const tradeId = (settings.tradeId ?? '').trim();
      const ctaLabel = (settings.ctaLabel ?? '').trim();

      const advanced: Record<string, unknown> = {
        numberFormat: toAdvNumberFormat(settings.numberFormat),
      };
      if (ctaLabel !== '') {
        advanced.results = { cta_label: ctaLabel };
      }

      // Wave H7 — surface the language pick as both a top-level
      // `calculator_settings.language` (explicit, easy for server consumers)
      // AND inside `shell_settings.language` (raw user state). The server
      // schema's `.catchall(z.any())` accepts the top-level field.
      const language = (settings.language ?? 'en');

      const res = await apiRequest('POST', '/api/calculators', {
        business_name: state.businessName,
        trade_type: tradeId || 'general',
        is_draft: true,
        pricing_config: toPricingConfig(settings.pricing),
        ...(leadEmailOk ? { owner_email: leadEmail } : {}),
        primary_color: p.colors.accent,
        calculator_settings: {
          calculator_type: 'estimate_only',
          ui_template: { template_id: 'classic_single' },
          advanced,
          shell_settings: settings,
          language,
        },
      });
      return res.json();
    },
    onSuccess: () => {
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 1800);
    },
  });

  const reduceMotion = useMemo(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);

  const handleClose = useCallback(() => {
    // Item (h): paint the exit transition, then navigate.
    if (!embed) setOpenPhase('leaving');
    const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768;
    const exitMs = reduceMotion ? 0 : (isMobile ? 150 : 180);

    setTimeout(() => {
      if (typeof window !== 'undefined' && window.history.length > 1) {
        window.history.back();
        setTimeout(() => {
          if (typeof window !== 'undefined' && window.location.pathname === '/wizard') {
            navigate('/');
          }
        }, 80);
      } else {
        navigate('/');
      }
    }, exitMs);
  }, [navigate, embed, reduceMotion]);

  const modalPhaseClass = embed
    ? ''
    : openPhase === 'entering'
      ? ' is-entering'
      : openPhase === 'leaving'
        ? ' is-leaving'
        : ' is-open';

  return (
    <SelectionProvider>
      <DndContext
        sensors={sensors}
        collisionDetection={pointerWithin}
        onDragEnd={onDragEnd}
      >
        <div
          className={`qq-editor-shell ${embed ? '' : 'wizard-shell-modal'}${modalPhaseClass}`}
          role={embed ? undefined : 'dialog'}
          aria-modal={embed ? undefined : true}
          aria-label="QuoteQuick editor"
          data-testid="quotequick-editor-shell"
          data-modal-phase={embed ? 'embed' : openPhase}
          lang={shellLang}
        >
          <div className="qq-editor-frame">
            <EditorTopBar
              justSaved={justSaved}
              device={device}
              onDeviceChange={setDevice}
              onHelp={() => setShowHelp(true)}
              onClose={handleClose}
            />

            <EditorTabs active={activeTab} onChange={setActiveTab} />

            <div className="qq-editor-body">
              <div
                className="qq-editor-left"
                data-testid="editor-left-panel"
                style={{ width: paneWidth }}
              >
                <div className="qq-editor-left-inner">
                  {activeTab === 'build' ? (
                    <BuildTab
                      businessName={state.businessName}
                      onBusinessNameChange={setBusinessName}
                      fields={state.fields}
                      onFieldsChange={setFields}
                      calculations={state.calculations}
                      onCalculationsChange={setCalculations}
                      header={state.header ?? {}}
                      onHeaderChange={setHeader}
                      results={state.results ?? {}}
                      onResultsChange={setResults}
                      resultCalcId={state.resultCalcId}
                      onResultCalcChange={setResultCalc}
                    />
                  ) : activeTab === 'style' ? (
                    <StyleTab
                      style={state.style ?? { ...DEFAULT_SHELL_STYLE }}
                      onChange={setStyle}
                    />
                  ) : activeTab === 'settings' ? (
                    <SettingsTab
                      settings={state.settings ?? {}}
                      onChange={setSettings}
                    />
                  ) : activeTab === 'install' ? (
                    <InstallTab
                      settings={state.settings ?? {}}
                      onChange={setSettings}
                    />
                  ) : (
                    <TabPlaceholder
                      tab={activeTab}
                      businessName={state.businessName}
                      onBusinessNameChange={setBusinessName}
                    />
                  )}
                  {activeTab === 'build' && (
                    <div className="qq-editor-actions">
                      <button
                        type="button"
                        onClick={() => saveDraftMutation.mutate()}
                        disabled={saveDraftMutation.isPending || !state.businessName.trim()}
                        data-testid="quotequick-save-draft"
                        className="qq-editor-btn"
                      >
                        {saveDraftMutation.isPending ? 'Saving…' : 'Save draft'}
                      </button>
                      {saveDraftMutation.isError && (
                        <span className="qq-editor-save-error" data-testid="quotequick-save-error">
                          Couldn't save — try again.
                        </span>
                      )}
                    </div>
                  )}
                </div>
                {/* Resize handle (d). Hidden on mobile via CSS. */}
                <button
                  type="button"
                  className={`qq-editor-resize${isResizing ? ' is-resizing' : ''}`}
                  data-testid="editor-pane-resize"
                  aria-label="Resize editor pane"
                  onMouseDown={(e) => { e.preventDefault(); onResizeStart(e.clientX, paneWidth); }}
                  onTouchStart={(e) => {
                    const x = e.touches[0]?.clientX ?? 0;
                    onResizeStart(x, paneWidth);
                  }}
                  onKeyDown={(e) => {
                    // Keyboard resize (a11y): arrow keys nudge 16px.
                    if (e.key === 'ArrowLeft') {
                      setPaneWidth((w) => Math.max(PANE_WIDTH_MIN, w - 16));
                    } else if (e.key === 'ArrowRight') {
                      setPaneWidth((w) => Math.min(PANE_WIDTH_MAX, w + 16));
                    }
                  }}
                >
                  <span aria-hidden="true" />
                </button>
              </div>

              <div className="qq-editor-right" data-testid="editor-right-pane">
                <PreviewPane
                  businessName={state.businessName}
                  layout={state.layout}
                  device={device}
                  fields={state.fields}
                  calculations={state.calculations}
                  header={state.header}
                  results={state.results}
                  resultCalcId={state.resultCalcId}
                  style={state.style}
                  settings={state.settings}
                  onRemoveField={removeField}
                  onAddField={addField}
                />
              </div>
            </div>

            {showHelp && (
              <div
                className="qq-editor-help"
                role="dialog"
                aria-label="Editor help"
                onClick={() => setShowHelp(false)}
                data-testid="editor-help-overlay"
              >
                <div className="qq-editor-help-card" onClick={(e) => e.stopPropagation()}>
                  <p style={{ fontSize: 14, fontWeight: 700, margin: 0, color: p.colors.heading }}>
                    QuoteQuick editor — Wave H1 preview
                  </p>
                  <p style={{ fontSize: 12.5, color: p.colors.muted, margin: '8px 0 0', lineHeight: 1.5 }}>
                    The new editor shell is in place. Build · Style · Settings · Install
                    tab content lands in subsequent waves.
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowHelp(false)}
                    className="qq-editor-btn"
                    style={{ marginTop: 14 }}
                  >
                    Got it
                  </button>
                </div>
              </div>
            )}
          </div>

          <style>{`
            .qq-editor-shell {
              background: ${d.colors.canvas};
              min-height: 100vh;
              padding: ${d.layout.shellPad};
              box-sizing: border-box;
            }
            .wizard-shell-modal {
              position: fixed; inset: 0; z-index: 1000;
              background: rgba(15, 23, 42, 0.55);
              overflow-y: auto;
              backdrop-filter: blur(2px);
              -webkit-backdrop-filter: blur(2px);
            }
            /* Wave I (h) — open / close animations. CSS-only; respects
               prefers-reduced-motion. The frame inside scales/slides from
               translateY(8px) scale(.97) → translateY(0) scale(1). */
            .wizard-shell-modal {
              transition: background-color 200ms ease-out, backdrop-filter 200ms ease-out;
            }
            .wizard-shell-modal.is-entering { background: rgba(15,23,42,0); backdrop-filter: blur(0); }
            .wizard-shell-modal.is-entering .qq-editor-frame {
              opacity: 0;
              transform: translateY(8px) scale(0.97);
            }
            .wizard-shell-modal.is-open .qq-editor-frame {
              opacity: 1;
              transform: translateY(0) scale(1);
              transition: opacity 200ms ease-out, transform 200ms ease-out;
            }
            .wizard-shell-modal.is-leaving {
              background: rgba(15,23,42,0);
              backdrop-filter: blur(0);
              transition: background-color 180ms ease-in, backdrop-filter 180ms ease-in;
            }
            .wizard-shell-modal.is-leaving .qq-editor-frame {
              opacity: 0;
              transform: translateY(8px) scale(0.97);
              transition: opacity 180ms ease-in, transform 180ms ease-in;
            }
            .qq-editor-frame {
              display: flex; flex-direction: column;
              background: ${d.colors.panel};
              border-radius: 14px;
              box-shadow: ${d.shadows.panel};
              overflow: hidden;
              min-height: calc(100vh - ${d.layout.shellPad} - ${d.layout.shellPad});
              transition: opacity 200ms ease-out, transform 200ms ease-out;
              will-change: opacity, transform;
            }
            @media (max-width: 768px) {
              .wizard-shell-modal {
                transition: background-color 150ms ease-out, backdrop-filter 150ms ease-out;
              }
              .wizard-shell-modal.is-entering .qq-editor-frame {
                transform: translateY(4px) scale(0.99);
              }
              .wizard-shell-modal.is-open .qq-editor-frame {
                transition: opacity 150ms ease-out, transform 150ms ease-out;
              }
              .wizard-shell-modal.is-leaving .qq-editor-frame {
                transition: opacity 150ms ease-in, transform 150ms ease-in;
                transform: translateY(4px) scale(0.99);
              }
            }
            @media (prefers-reduced-motion: reduce) {
              .wizard-shell-modal,
              .wizard-shell-modal.is-entering,
              .wizard-shell-modal.is-open,
              .wizard-shell-modal.is-leaving,
              .wizard-shell-modal .qq-editor-frame,
              .wizard-shell-modal.is-entering .qq-editor-frame,
              .wizard-shell-modal.is-open .qq-editor-frame,
              .wizard-shell-modal.is-leaving .qq-editor-frame {
                transition: none !important;
                transform: none !important;
                opacity: 1 !important;
                animation: none !important;
              }
              .wizard-shell-modal.is-entering { background: rgba(15,23,42,0.55); backdrop-filter: blur(2px); }
              .wizard-shell-modal.is-leaving  { background: rgba(15,23,42,0); backdrop-filter: blur(0); opacity: 0; }
            }
            .qq-editor-topbar {
              display: flex; align-items: center; gap: 10px;
              padding: 10px 16px; flex-shrink: 0;
              background: ${d.colors.panelHeader};
              border-bottom: 1px solid ${d.colors.borderLight};
            }
            .qq-editor-brand {
              display: flex; align-items: center; gap: 7px; text-decoration: none;
              font-size: 13px; font-weight: 800; color: ${p.colors.heading}; flex-shrink: 0;
            }
            .qq-editor-saved {
              font-size: 11px; font-weight: 600; color: ${p.colors.accentDark};
              background: ${p.colors.accentLighter}; padding: 3px 9px; border-radius: 999px;
              transition: opacity 0.3s ease; flex-shrink: 0;
            }
            .qq-editor-spacer { flex: 1; min-width: 0; }
            .qq-editor-device {
              display: flex; gap: 3px; padding: 3px; flex-shrink: 0;
              border-radius: 9px; background: #fff;
              border: 1px solid ${p.colors.borderLight};
            }
            .qq-editor-device button {
              display: flex; align-items: center; justify-content: center;
              width: 32px; height: 25px; border-radius: 7px; border: none;
              cursor: pointer; transition: background 0.15s ease;
            }
            .qq-editor-icon-btn {
              width: 26px; height: 26px; border-radius: 50%; cursor: pointer;
              border: 1px solid ${p.colors.border}; background: #fff;
              color: ${p.colors.muted}; padding: 0;
              display: flex; align-items: center; justify-content: center;
              transition: background 0.12s ease, color 0.12s ease;
            }
            .qq-editor-icon-btn:hover {
              background: ${p.colors.surfaceRaised};
              color: ${p.colors.heading};
            }
            .qq-editor-tabs {
              display: flex; flex-shrink: 0;
              background: #fff;
              border-bottom: 1px solid ${d.colors.borderLight};
              overflow-x: auto;
              scrollbar-width: none;
            }
            .qq-editor-tabs::-webkit-scrollbar { display: none; }
            .qq-editor-tabs-inner {
              display: flex; align-items: center; gap: 4px;
              padding: 0 12px;
              min-width: max-content;
            }
            .qq-editor-tab {
              font: inherit; background: none; border: none; cursor: pointer;
              padding: 12px 16px;
              font-size: 13px; font-weight: 600;
              border-bottom: 2px solid transparent;
              transition: color 0.12s ease, border-color 0.12s ease;
            }
            .qq-editor-tab:hover { color: ${p.colors.heading}; }
            .qq-editor-tab.is-active { font-weight: 700; }
            .qq-editor-body {
              display: flex; align-items: stretch;
              flex: 1; min-height: 0;
            }
            .qq-editor-left {
              position: relative;
              flex-shrink: 0;
              background: ${d.colors.panel};
              border-right: 1px solid ${d.colors.borderLight};
              overflow-y: auto;
            }
            .qq-editor-left-inner {
              padding: 18px 18px 24px;
              display: flex; flex-direction: column; gap: 14px;
              min-height: 100%; box-sizing: border-box;
            }
            /* Wave I (d) — resize handle on the right edge of the left pane. */
            .qq-editor-resize {
              position: absolute; top: 0; right: -3px; bottom: 0;
              width: 6px;
              background: transparent;
              border: 0; padding: 0; cursor: col-resize;
              z-index: 5;
              touch-action: none;
              transition: background 0.12s ease;
            }
            .qq-editor-resize:hover,
            .qq-editor-resize.is-resizing {
              background: ${p.colors.accentLighter};
            }
            .qq-editor-resize > span {
              position: absolute; top: 50%; left: 50%;
              transform: translate(-50%, -50%);
              width: 2px; height: 30px; border-radius: 2px;
              background: ${p.colors.borderLight};
            }
            .qq-editor-resize:hover > span,
            .qq-editor-resize.is-resizing > span {
              background: ${p.colors.accent};
            }
            .qq-editor-actions {
              display: flex; align-items: center; gap: 10px;
              margin-top: auto; padding-top: 14px;
              border-top: 1px solid ${d.colors.borderLight};
            }
            .qq-editor-btn {
              display: inline-flex; align-items: center; justify-content: center;
              padding: 8px 14px; border-radius: 8px;
              font-size: 12.5px; font-weight: 700; cursor: pointer;
              background: ${p.colors.accent}; color: #fff; border: none;
              box-shadow: ${p.shadows.button};
              transition: box-shadow 0.12s ease, transform 0.06s ease;
            }
            .qq-editor-btn:hover:not(:disabled) { box-shadow: ${p.shadows.buttonHover}; }
            .qq-editor-btn:disabled { opacity: 0.55; cursor: not-allowed; }
            .qq-editor-save-error { font-size: 11.5px; color: ${p.colors.danger}; font-weight: 600; }
            .qq-editor-right {
              flex: 1; min-width: 0;
              background: radial-gradient(120% 80% at 50% 0%, #f4f6f9 0%, ${d.colors.panel} 72%);
              overflow-y: auto;
            }
            .qq-preview-pane {
              position: sticky; top: 0;
              display: flex; align-items: center; justify-content: center;
              padding: 20px; box-sizing: border-box; min-height: 100%;
            }
            .qq-preview-stage {
              width: 100%; max-width: 920px;
              display: flex; flex-direction: column;
              align-items: center; justify-content: center; background: transparent;
            }
            .qq-editor-help {
              position: fixed; inset: 0; z-index: 1100;
              background: rgba(15,23,42,0.45);
              display: flex; align-items: center; justify-content: center;
              padding: 20px;
            }
            .qq-editor-help-card {
              background: #fff; border-radius: 14px;
              padding: 18px 20px; max-width: 380px; width: 100%;
              box-shadow: ${p.shadows.xl};
              border: 1px solid ${p.colors.borderLight};
            }

            /* Mobile — preview stacks below the editor column. Resize handle
               is hidden (mobile is vertical-stack, no use for it). */
            @media (max-width: 768px) {
              .qq-editor-shell { padding: 8px; }
              .qq-editor-frame {
                min-height: calc(100vh - 16px);
              }
              .qq-editor-body { flex-direction: column; }
              .qq-editor-left {
                width: 100% !important; border-right: none;
                border-bottom: 1px solid ${d.colors.borderLight};
                order: 1;
              }
              .qq-editor-resize { display: none !important; }
              .qq-editor-right { order: 0; }
              .qq-preview-pane {
                position: static; padding: 12px 8px;
                border-bottom: 1px solid ${p.colors.border};
              }
              .qq-preview-stage { max-width: 100%; }
              .qq-preview-pane > .qq-preview-stage > .widget-scope { padding: 0 !important; }
              .qq-bezel--desktop {
                max-width: 100% !important;
                max-height: none !important;
                border-radius: 12px;
              }
              .qq-bezel--mobile {
                max-width: 100% !important;
                max-height: none !important;
                padding: 8px 6px !important;
                border-radius: 28px;
              }
              .qq-bezel--mobile > div:last-child { border-radius: 22px; }
              .qq-editor-tab { padding: 10px 12px; font-size: 12.5px; }
            }
            @media (max-width: 480px) {
              .qq-editor-topbar { padding: 8px 10px; gap: 6px; }
              .qq-editor-saved { font-size: 10.5px; padding: 2px 7px; }
              .qq-editor-device button { width: 28px; height: 22px; }
              .qq-editor-icon-btn { width: 24px; height: 24px; }
            }
          `}</style>
        </div>
      </DndContext>
    </SelectionProvider>
  );
}
