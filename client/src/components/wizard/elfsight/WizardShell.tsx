// WizardShell — Elfsight-clone editor shell (Wave H1).
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
// In H1 the tab content is intentionally a stub — the only field that drives
// the preview is `businessName` (proves the wiring). The Save-draft button
// hits `POST /api/calculators` so the persist round-trip stays in force
// (the `__preview` strip + draft-flag pattern from Wave F is unaffected).
//
// Mobile: at ≤768px the preview pane stacks below the editor column and the
// tab bar can scroll horizontally if needed.

import { useCallback, useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useLocation } from 'wouter';
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
import {
  INITIAL_SHELL_STATE, type EditorTab, type PreviewDevice, type ShellState,
  type ShellHeader, type ShellResults,
} from './types';

const p = platformTheme;
const d = dashboardTheme;

const STORAGE_KEY = 'qq_elfsight_shell';

/**
 * Seed the initial Build > Fields list from the same placeholder config used
 * by the live preview. Once the user edits the list, the persisted state
 * takes over (see localStorage rehydrate below).
 */
function seedFields(layout: ShellState['layout']): TemplateField[] {
  return buildBlankPreviewConfig(layout).fields.map((f) => ({ ...f }));
}

/**
 * Seed the initial Build > Calculations list from the same placeholder config
 * used by the live preview. This means the preview shows a real price out of
 * the box. Once the user edits the list, persistence takes over.
 */
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
        // H2 introduces `fields`; older persisted state pre-dates it, so seed
        // from the placeholder when absent. Empty-array edits are preserved.
        fields: hasFields
          ? parsed.fields
          : (parsed.fields === undefined ? seedFields(layout) : []),
        // H3 introduces editable `calculations`; older persisted state
        // pre-dates it, so seed from the placeholder when absent (so the
        // preview shows a real price). An explicit empty array is preserved.
        calculations: hasCalcs
          ? parsed.calculations
          : (parsed.calculations === undefined ? seedCalculations(layout) : []),
        // H4 — header & results overrides. Both are optional objects; if the
        // persisted state pre-dates them they're seeded to empty objects.
        header: parsed.header ?? {},
        results: parsed.results ?? {},
        resultCalcId: parsed.resultCalcId,
      };
    }
  } catch {}
  return {
    ...INITIAL_SHELL_STATE,
    fields: seedFields(INITIAL_SHELL_STATE.layout),
    calculations: seedCalculations(INITIAL_SHELL_STATE.layout),
  };
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

  // Persist locally — keeps state across reloads so the user doesn't lose
  // their work on accidental refresh. Server-side persistence happens via
  // saveDraftMutation below.
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

  /**
   * Set the headline calc by id. ALSO promotes that calc's `resultMode` to
   * `'primary'` and demotes any other primaries to `'secondary'`, so the
   * renderer's explicit-primary rule and the UI's segmented control stay
   * in sync.
   */
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

  // Save round-trip — keeps the legacy POST /api/calculators contract live
  // from the new shell so future phases can extend it without re-introducing
  // the persistence layer from scratch. Wave H1 only sends businessName +
  // a sentinel draft flag (`is_draft: true`) — backend treats missing
  // pricing_config as a draft already (see __preview strip / draft logic).
  const saveDraftMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/calculators', {
        business_name: state.businessName,
        is_draft: true,
        // Minimum viable pricing_config so the schema validator passes —
        // server still strips `__preview` configs. Wave H2+ replaces this
        // with the real Fields/Calculations payload.
        pricing_config: { pricingType: 'hourly', unitName: 'hour', rate: 75, baseFee: 50 },
        primary_color: p.colors.accent,
        calculator_settings: {
          calculator_type: 'estimate_only',
          ui_template: { template_id: 'classic_single' },
        },
      });
      return res.json();
    },
    onSuccess: () => {
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 1800);
    },
  });

  const handleClose = useCallback(() => {
    // History fallback: prefer back; if there's no history, send the user
    // home. Mirrors the Wave F legacy behaviour so the `quotequick-close`
    // testid keeps the same semantics.
    if (typeof window !== 'undefined' && window.history.length > 1) {
      window.history.back();
      // Belt-and-braces: if the back nav is intercepted (e.g. same-route
      // hash), fall through to navigate home after a microtask.
      setTimeout(() => {
        if (typeof window !== 'undefined' && window.location.pathname === '/wizard') {
          navigate('/');
        }
      }, 80);
    } else {
      navigate('/');
    }
  }, [navigate]);

  return (
    <div
      className={`qq-editor-shell ${embed ? '' : 'wizard-shell-modal'}`}
      role={embed ? undefined : 'dialog'}
      aria-modal={embed ? undefined : true}
      aria-label="QuoteQuick editor"
      data-testid="quotequick-editor-shell"
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
          <div className="qq-editor-left" data-testid="editor-left-panel">
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
              ) : (
                <TabPlaceholder
                  tab={activeTab}
                  businessName={state.businessName}
                  onBusinessNameChange={setBusinessName}
                />
              )}
              {/* Save-draft hook — keeps POST /api/calculators alive from
                  the new shell. Visible in the Build tab so QA can hit it. */}
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
        .qq-editor-frame {
          display: flex; flex-direction: column;
          background: ${d.colors.panel};
          border-radius: 14px;
          box-shadow: ${d.shadows.panel};
          overflow: hidden;
          min-height: calc(100vh - ${d.layout.shellPad} - ${d.layout.shellPad});
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
          width: 420px; flex-shrink: 0;
          background: ${d.colors.panel};
          border-right: 1px solid ${d.colors.borderLight};
          overflow-y: auto;
        }
        .qq-editor-left-inner {
          padding: 18px 18px 24px;
          display: flex; flex-direction: column; gap: 14px;
          min-height: 100%; box-sizing: border-box;
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

        /* Mobile — preview stacks below the editor column. Tab bar can scroll
           horizontally if needed but never overflows the viewport. */
        @media (max-width: 768px) {
          .qq-editor-shell { padding: 8px; }
          .qq-editor-frame {
            min-height: calc(100vh - 16px);
          }
          .qq-editor-body { flex-direction: column; }
          .qq-editor-left {
            width: 100%; border-right: none;
            border-bottom: 1px solid ${d.colors.borderLight};
            order: 1;
          }
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
  );
}
