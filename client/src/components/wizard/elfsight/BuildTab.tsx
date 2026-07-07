// BuildTab — root of the Build tab content.
//
// Wave H2 introduced the Fields panel. Wave H3 adds the Calculations panel
// directly below. Header & Results (H4) will slot in below that. The Build
// tab also keeps the existing "Business name" input from H1 since it's the
// only top-level identity field — it lives at the top of the column.
//
// Wave J item 5 — the business-name input is now a composite control: a
// 40×40 logo-upload square on the left, and the business name input
// (floating-label) on the right.

import { useCallback, useEffect, useRef, useState } from 'react';
import { Sparkles, ImagePlus, X } from 'lucide-react';
import { platformTheme } from '@/theme/platformTheme';
import { AE } from './appleEditor';
import { useLayoutGuard } from '@/lib/layoutGuard';
import type { TemplateField, TemplateCalculation, TemplateStep, TemplateTiered } from '@shared/templatePresets';
import FieldsPanel from './FieldsPanel';
import CalculationsPanel from './CalculationsPanel';
import HeaderResultsPanel from './HeaderResultsPanel';
import StepContentPanel from './StepContentPanel';
import TemplateStrip, { type ApplyTemplatePayload } from './TemplateGallery';
import AdvancedSection from './AdvancedSection';
import FloatField from './FloatField';
import InfoCue from './InfoCue';
import { StepLayoutControl, PricingTiersSubsection } from './WizardStructureControls';
import type { ShellHeader, ShellResults } from './types';

const p = platformTheme;

interface Props {
  businessName: string;
  onBusinessNameChange: (v: string) => void;
  /** Wave J — logo data URL or null. */
  logo: string | null;
  /** Wave J — replace the logo (pass null to clear). */
  onLogoChange: (next: string | null) => void;
  fields: TemplateField[];
  onFieldsChange: (next: TemplateField[]) => void;
  calculations: TemplateCalculation[];
  onCalculationsChange: (next: TemplateCalculation[]) => void;
  /** Wave H4. */
  header: ShellHeader;
  onHeaderChange: (next: ShellHeader) => void;
  results: ShellResults;
  onResultsChange: (next: ShellResults) => void;
  /** Wave H7. */
  activeTemplateId?: string;
  onApplyTemplate: (next: ApplyTemplatePayload) => void;
  /**
   * BG-7 Item 4 — explicit `steps[]` from the active template (seeded
   * into shell state on apply). When undefined, the renderer auto-
   * derives steps and the step-content editor stays hidden.
   */
  steps?: TemplateStep[];
  onStepsChange?: (next: TemplateStep[]) => void;
  /**
   * Structure controls relocated from the Style tab (they describe the
   * calculator's STRUCTURE, not its appearance). State keys are unchanged —
   * only the editing surface moved.
   *   - stepLayout / onStepLayoutChange → settings.stepLayout (stepper/single)
   *   - tiered / onTieredChange         → state.tiered (Good/Better/Best)
   *   - templateCategory                → drives the tiered default-on hint
   */
  stepLayout?: 'stepper' | 'single';
  onStepLayoutChange?: (next: 'stepper' | 'single') => void;
  tiered?: TemplateTiered;
  onTieredChange?: (next: TemplateTiered | undefined) => void;
  templateCategory?: string;
  /**
   * "Generate with AI" card → routes the typed prompt into the existing
   * floating AI assistant (seed + auto-send). Optional so the panel still
   * renders if a caller omits it (the card just won't fire).
   *
   * `image` (optional data URL) is a reference screenshot the user attached
   * via "+ Add screenshot". When present it's fused with the text prompt by
   * the server (vision model). Text-only callers omit it — behavior unchanged.
   */
  onGenerateWithAI?: (prompt: string, image?: string) => void;
}

// Max raw bytes accepted by the logo upload before we reject (1 MB). The
// data URL inflates ~33% on top of this. Keeps localStorage from blowing up.
const LOGO_MAX_BYTES = 1024 * 1024;

// "Generate with AI" reference screenshot — mirrors the AIBubble paperclip
// caps. ≤8MB raw; jpeg/png/webp/gif only (the server's parseImage accepts the
// same media types). The data URL rides the seed into the chat send.
const AI_REF_MAX_BYTES = 8 * 1024 * 1024;
const AI_REF_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

export default function BuildTab({
  businessName, onBusinessNameChange,
  logo, onLogoChange,
  fields, onFieldsChange,
  calculations, onCalculationsChange,
  header, onHeaderChange,
  results, onResultsChange,
  activeTemplateId, onApplyTemplate,
  steps, onStepsChange,
  stepLayout, onStepLayoutChange,
  tiered, onTieredChange, templateCategory,
  onGenerateWithAI,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  // ITEM 3 — suggestion-chip scroller drag-vs-click discrimination.
  // `chipDidDrag` is set true once the pointer moves past the threshold so the
  // chip's onClick can bail (drag-to-scroll must NOT select a chip). The chips
  // live inside the (collapsible) prominent section, so the scroller node
  // mounts/unmounts as that section opens/closes — a callback ref (below)
  // attaches the drag listeners whenever the node appears, which a one-shot
  // useEffect([]) would miss (it would run once while the node was unmounted).
  const chipDidDrag = useRef(false);
  const chipCleanup = useRef<(() => void) | null>(null);
  // "Generate with AI" card prompt — local; on Generate it's handed to the
  // shell, which seeds + auto-sends the floating AI assistant.
  const [aiPrompt, setAiPrompt] = useState('');
  // Optional reference screenshot fused with the prompt (data URL). null = none.
  const [aiRefImage, setAiRefImage] = useState<string | null>(null);
  const [aiRefError, setAiRefError] = useState<string | null>(null);
  const aiRefInputRef = useRef<HTMLInputElement | null>(null);
  // Suggestion chips — a wider, more inspiring set of trade examples.
  // Rendered as a 2-row horizontal scroller (see .qq-buildai-chips), so we can
  // offer many without crowding the card; the user swipes left/right just like
  // the template strip below.
  const AI_EXAMPLES = [
    'Mobile car detailing quote',
    'Plumbing call-out estimate',
    'Event catering per head',
    'HVAC install estimate',
    'Roof replacement per sq ft',
    'Pressure washing per sq ft',
    'Solar panel installation',
    'Fencing per linear foot',
    'Junk removal by load size',
    'House painting per room',
    'Landscaping design package',
    'Pool cleaning subscription',
    'Electrician panel upgrade',
    'Moving quote by home size',
  ] as const;
  const onAiRefFile = useCallback(async (file: File | null) => {
    if (!file) return;
    if (!AI_REF_TYPES.includes(file.type)) {
      setAiRefError('Use a JPG, PNG, WebP, or GIF screenshot.');
      return;
    }
    if (file.size > AI_REF_MAX_BYTES) {
      setAiRefError('Screenshot is too large — keep it under 8 MB.');
      return;
    }
    try {
      const dataUrl = await fileToDataUrl(file);
      setAiRefImage(dataUrl);
      setAiRefError(null);
    } catch {
      setAiRefError('Could not read that image. Try another file.');
    }
  }, []);
  const generateAi = useCallback(() => {
    const v = aiPrompt.trim();
    if (!v) return;
    onGenerateWithAI?.(v, aiRefImage ?? undefined);
  }, [aiPrompt, aiRefImage, onGenerateWithAI]);
  // LAYOUT-1 — dev-only overlap/crumple detector on the Build panel.
  // Tight maxGapPx because the Build column is a vertical stack of
  // input clusters; runaway gaps here indicate a missed spacing token.
  const buildPanelRef = useRef<HTMLDivElement | null>(null);
  useLayoutGuard(buildPanelRef, { maxGapPx: 24, label: 'editor-tabpanel-build' });

  // EDITOR-POLISH — surface an inline error when the dropped logo is rejected
  // (previously a bare `return` left an oversize file silently ignored, with
  // the owner getting no feedback). Mirrors the AI reference-image error line.
  const [logoError, setLogoError] = useState<string | null>(null);
  const onLogoFile = useCallback((file: File | null) => {
    if (!file) { setLogoError(null); onLogoChange(null); return; }
    if (file.size > LOGO_MAX_BYTES) {
      setLogoError('Logo must be under 1 MB. Try a smaller or compressed image.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === 'string') {
        setLogoError(null);
        onLogoChange(result);
      }
    };
    reader.onerror = () => setLogoError('Could not read that image. Try another file.');
    reader.readAsDataURL(file);
  }, [onLogoChange]);

  // ITEM 3 — mouse drag-to-scroll on the suggestion chips, mirroring the
  // TemplateStrip pattern. A >5px movement marks the gesture as a drag so the
  // chip's onClick (which sets the prompt) is suppressed — only a clean click
  // selects. Touch swipe stays native to overflow-x. `chipDidDrag` is read
  // synchronously by the chip onClick, then reset on the next pointer-down.
  // Attached via a callback ref so it (re)binds each time the chips node mounts
  // (the prominent section it lives in is collapsible).
  const DRAG_THRESHOLD_PX = 5;
  const chipsRefCb = useCallback((el: HTMLDivElement | null) => {
    // Detach any previous binding (node replaced or unmounting).
    chipCleanup.current?.();
    chipCleanup.current = null;
    if (!el) return;
    let isDown = false;
    let moved = false;
    let startX = 0;
    let startScroll = 0;
    const onDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      isDown = true;
      moved = false;
      chipDidDrag.current = false;
      startX = e.pageX - el.offsetLeft;
      startScroll = el.scrollLeft;
    };
    const endDrag = () => {
      isDown = false;
      el.classList.remove('is-dragging');
    };
    const onMove = (e: MouseEvent) => {
      if (!isDown) return;
      const x = e.pageX - el.offsetLeft;
      const walk = x - startX;
      if (!moved && Math.abs(walk) > DRAG_THRESHOLD_PX) {
        moved = true;
        chipDidDrag.current = true;
        el.classList.add('is-dragging');
      }
      if (moved) {
        e.preventDefault();
        el.scrollLeft = startScroll - walk;
      }
    };
    el.addEventListener('mousedown', onDown);
    el.addEventListener('mouseleave', endDrag);
    el.addEventListener('mouseup', endDrag);
    el.addEventListener('mousemove', onMove);
    chipCleanup.current = () => {
      el.removeEventListener('mousedown', onDown);
      el.removeEventListener('mouseleave', endDrag);
      el.removeEventListener('mouseup', endDrag);
      el.removeEventListener('mousemove', onMove);
    };
  }, []);
  // Detach on unmount.
  useEffect(() => () => { chipCleanup.current?.(); chipCleanup.current = null; }, []);

  return (
    <div
      ref={buildPanelRef}
      data-theme="light"
      className="qq-editor-tabpanel qq-build-tab"
      data-testid="editor-tabpanel-build"
      data-section
      /* The Build panel aggregates several independent sections (Generate-
       * with-AI card, Business, etc.), each carrying exactly ONE top-left
       * cue per DESIGN-SYSTEM §2/§5 — they are separated by hairline
       * dividers, not crowded in one row. The layout guard counts cues per
       * JSX block, so this panel-level marker tells it the multiple
       * section-level cues are by design (one per section, not per row). */
      data-cue-allowed-multiple
      role="tabpanel"
    >
      {/* Decluttered default view — once the calculator already has fields,
          the heavy "Generate with AI" card + full template strip dominate
          screen 1. Tuck them behind a collapsed AdvancedSection so a
          populated calculator opens lean; keep it OPEN when blank so a new
          user lands directly on the start-here affordances. Everything stays
          fully reachable; testids/behavior are untouched. */}
      <AdvancedSection
        id="build-start"
        label="Start from a template / AI"
        hint="generate with AI or pick a template"
        defaultOpen={fields.length === 0}
        prominent
      >
      {/* Generate with AI — discoverable entry point that routes into the
          existing floating AI assistant (seed + auto-send). The bubble stays
          the chat surface for refinement; this card is just the front door. */}
      <div className="qq-buildai-card" data-testid="build-ai-card">
        <div className="qq-buildai-head">
          <span className="qq-buildai-headicon" aria-hidden="true">
            <Sparkles size={16} />
          </span>
          <span className="qq-buildai-title">Generate with AI</span>
          {/* Fastest-path affordance — subtle OUTLINE pill (NOT a bright fill,
              per the hard UI rules) that nudges first-time users toward the
              30-second AI path over manual building. Visual emphasis only;
              behavior unchanged. */}
          <span className="qq-buildai-fastest" data-testid="build-ai-fastest-badge">
            Fastest
          </span>
          {/* Rule 5 — every panel header carries a help cue (2026-06-11
              sweep: this card head was missing one). */}
          <InfoCue
            testid="build-section-generate-ai"
            text="Describe the job you quote in plain English and the AI drafts the whole calculator — fields, steps and pricing math. Optionally add a reference screenshot of a calculator you like and the AI matches its fields, layout and pricing structure, fusing that with your description (your written request wins where they disagree). It hands off to the chat assistant, where you can refine the result or edit everything by hand afterwards."
          />
        </div>
        <p className="qq-buildai-sub">
          Describe your job and we'll build the calculator for you.
        </p>
        <textarea
          className="qq-buildai-input"
          data-testid="build-ai-prompt"
          value={aiPrompt}
          onChange={(e) => setAiPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              generateAi();
            }
          }}
          placeholder="e.g. A lawn-care quote with lawn size, frequency, and add-ons"
          rows={2}
          aria-label="Describe the calculator you want"
        />
        <div className="qq-buildai-chips" role="list" ref={chipsRefCb}>
          {AI_EXAMPLES.map((ex, i) => (
            <button
              key={ex}
              type="button"
              role="listitem"
              className="qq-buildai-chip"
              data-testid={`build-ai-chip-${i}`}
              onClick={() => {
                // ITEM 3 — suppress selection when the click is the tail end of
                // a drag-to-scroll gesture (pointer moved past the threshold).
                if (chipDidDrag.current) { chipDidDrag.current = false; return; }
                setAiPrompt(ex);
              }}
            >
              {ex}
            </button>
          ))}
        </div>

        {/* Optional reference screenshot — fused with the text prompt server-
            side (vision model). Outline affordance + outline chip, never a
            bright fill, per the hard UI rules. */}
        <input
          ref={aiRefInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          aria-label="Add a reference screenshot"
          data-testid="build-ai-ref-input"
          style={{ position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap', border: 0 }}
          onChange={(e) => {
            const f = e.target.files?.[0] ?? null;
            void onAiRefFile(f);
            e.target.value = '';
          }}
        />
        {aiRefImage ? (
          <div className="qq-buildai-refrow">
            <div className="qq-buildai-refchip" data-testid="build-ai-ref-chip">
              <img src={aiRefImage} alt="" className="qq-buildai-refthumb" />
              <span className="qq-buildai-reflabel">Reference screenshot attached</span>
              <button
                type="button"
                className="qq-buildai-refremove"
                data-testid="build-ai-ref-remove"
                aria-label="Remove reference screenshot"
                onClick={() => { setAiRefImage(null); setAiRefError(null); }}
              >
                <X size={14} aria-hidden="true" />
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            className="qq-buildai-addref"
            data-testid="build-ai-add-ref"
            onClick={() => aiRefInputRef.current?.click()}
          >
            <ImagePlus size={14} aria-hidden="true" />
            <span>Add screenshot (optional)</span>
          </button>
        )}
        {aiRefError && (
          <p className="qq-buildai-referror" role="alert" data-testid="build-ai-ref-error">
            {aiRefError}
          </p>
        )}

        <button
          type="button"
          className="qq-buildai-generate"
          data-testid="build-ai-generate"
          onClick={generateAi}
          disabled={!aiPrompt.trim()}
        >
          <Sparkles size={16} aria-hidden="true" />
          <span>Generate</span>
        </button>
      </div>

      {/* H7 — horizontal template scroller, single-row, at the top. */}
      <TemplateStrip
        activeTemplateId={activeTemplateId}
        onApplyTemplate={onApplyTemplate}
      />
      </AdvancedSection>

      <div className="qq-build-divider" />

      {/* Business identity moved DOWN into a collapsed fold below the
          calculator's structure (Fields + Calculations) so it no longer
          wedges between the AI card and Fields. See the "build-business"
          AdvancedSection after CalculationsPanel. */}
      <FieldsPanel fields={fields} onChange={onFieldsChange} />

      <div className="qq-build-divider" />

      <CalculationsPanel
        calculations={calculations}
        fields={fields}
        onChange={onCalculationsChange}
      />

      {/* Business identity (logo + name) — DE-EMPHASIZED into a collapsed fold
          (progressive disclosure) so returning users land on Fields +
          Calculations first. Set once, rarely touched. Opens by default only
          while both name and logo are still blank (a fresh calculator).
          Markup / testids / wiring are unchanged — only the placement + the
          collapsible wrapper are new. */}
      <div className="qq-build-divider" />
      <AdvancedSection
        id="build-business"
        label="Business name & logo"
        hint="shown in the calculator header & hosted page"
        defaultOpen={!businessName && !logo}
      >
      <section className="qq-build-section" data-testid="editor-business-section" data-edit-key="business">
        {/* P1 (UI-audit B) — the business-name row was the only top-of-panel
         * input without a help cue. Add a section header with the InfoCue as
         * its FIRST child (top-left of the header), matching the
         * Fields/Pricing/Theme pattern on every other panel — DESIGN-SYSTEM
         * hard rule §2 (cue top-left) + §5 (one cue pattern per surface). */}
        <header className="qq-business-header">
          <h3 className="qq-business-title">
            <InfoCue
              testid="build-section-business"
              region="header"
              text="Sets the name and logo shown in your calculator's header and on its hosted quote page (and its shareable link). Leave the name blank to show a neutral placeholder until you add one."
            />
            <span>Business</span>
          </h3>
        </header>
        {/* Wave J item 5 — composite logo + business-name field. */}
        <div className="qq-business-composite" data-testid="editor-business-composite">
          {/* AUDIT-LOW — wrap the logo-upload square so the clear pill can
           * anchor via right/top relative to the 48px square itself,
           * not a hardcoded left: 38px that drifts at smaller breakpoints. */}
          <div className="qq-logo-slot">
            <button
              type="button"
              className="qq-logo-upload"
              data-testid="editor-logo-upload"
              aria-label={logo ? 'Replace business logo' : 'Upload business logo'}
              onClick={() => fileInputRef.current?.click()}
            >
              {logo ? (
                <img src={logo} alt="" data-testid="editor-logo-preview" />
              ) : (
                <ImagePlus size={20} aria-hidden="true" />
              )}
            </button>
            {logo && (
              <button
                type="button"
                className="qq-logo-clear"
                data-testid="editor-logo-clear"
                aria-label="Remove business logo"
                onClick={() => onLogoChange(null)}
              >×</button>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            aria-label="Upload business logo"
            data-testid="editor-logo-input"
            style={{ position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap', border: 0 }}
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              onLogoFile(f);
              // Allow uploading the same file twice in a row.
              e.target.value = '';
            }}
          />
          <FloatField label="Business name" htmlFor="qq-shell-business-name" className="qq-business-namewrap">
            <input
              id="qq-shell-business-name"
              type="text"
              className="premium-input"
              placeholder=" "
              value={businessName}
              onChange={(e) => onBusinessNameChange(e.target.value)}
              data-testid="input-business-name"
            />
          </FloatField>
        </div>
        {/* EDITOR-POLISH — inline feedback when a dropped logo is rejected
            (oversize / unreadable). Reuses the shared inline-error treatment. */}
        {logoError && (
          <p className="qq-buildai-referror qq-logo-error" role="alert" data-testid="editor-logo-error">
            {logoError}
          </p>
        )}
      </section>
      </AdvancedSection>

      {/* Structure (RELOCATED from Style tab) — step layout + pricing tiers.
          These shape HOW the calculator is structured, so they belong with
          Build. State keys are unchanged: settings.stepLayout + state.tiered. */}
      {(onStepLayoutChange || onTieredChange) && (
        <>
          <div className="qq-build-divider" />
          <AdvancedSection
            id="build-structure"
            label="Layout & pricing tiers"
            hint="step-by-step vs single form, Good/Better/Best tiers"
          >
            {onStepLayoutChange && (
              <StepLayoutControl
                stepLayout={stepLayout}
                onStepLayoutChange={onStepLayoutChange}
              />
            )}
            {onStepLayoutChange && onTieredChange && (
              <div className="qq-build-divider" style={{ margin: '12px 0' }} />
            )}
            {onTieredChange && (
              <PricingTiersSubsection
                tiered={tiered}
                onTieredChange={onTieredChange}
                templateCategory={templateCategory}
              />
            )}
          </AdvancedSection>
        </>
      )}

      {/* BG-7 Item 4 — per-step rich-text descriptions. Renders only
         when the active template ships explicit `steps[]`. */}
      {onStepsChange && steps && steps.length > 0 && (
        <>
          <div className="qq-build-divider" />
          <StepContentPanel steps={steps} onChange={onStepsChange} />
        </>
      )}

      <AdvancedSection
        id="build-titles"
        label="Titles & result text"
        hint="headline, subtext, result labels & CTA copy"
      >
        <HeaderResultsPanel
          header={header}
          onHeaderChange={onHeaderChange}
          results={results}
          onResultsChange={onResultsChange}
        />
      </AdvancedSection>

      <style>{`
        .qq-build-tab {
          /* W-AO-9 — section gap tightened 10px → 2px so containers sit
           * close (1–2px) per the wizard density audit. The hairline
           * .qq-build-divider already gives a visual seam. */
          display: flex; flex-direction: column; gap: 2px;
        }
        .qq-build-divider {
          height: 1px; background: ${p.colors.borderLight}; margin: 0;
        }
        /* Generate with AI card — matches the Action/Style card visual
           language (white surface, hairline border, 10px radius, accent). */
        .qq-buildai-card {
          font-family: ${AE.font.family};
          background: ${AE.color.bg};
          border: 1px solid ${AE.color.hairline};
          border-radius: ${AE.radius.md};
          box-shadow: ${AE.shadow.card};
          /* ITEM 1 — compacted: trimmed top/bottom padding and the inter-row
           * gap (was 12px 14px 14px / gap 10px) so the card reads denser. */
          padding: 10px 14px 12px;
          display: flex; flex-direction: column; gap: 7px;
          margin-bottom: 2px;
        }
        .qq-buildai-head {
          display: flex; align-items: center; gap: 8px;
        }
        .qq-buildai-headicon {
          display: inline-flex; align-items: center; justify-content: center;
          color: ${AE.color.accent};
        }
        .qq-buildai-title {
          font-size: ${AE.type.title.size};
          font-weight: 600;
          color: ${AE.color.text};
        }
        /* "Fastest" pill — OUTLINE affordance (accent border + faint accent
           tint), never a bright fill, per the hard UI rules. Draws the eye to
           the AI path without shouting. Sits right of the title in the header. */
        .qq-buildai-fastest {
          display: inline-flex; align-items: center;
          font-size: 10.5px; font-weight: 700;
          letter-spacing: 0.03em; text-transform: uppercase;
          color: ${AE.color.accent};
          background: ${AE.color.accentTint};
          border: 1px solid ${AE.color.accent};
          border-radius: ${AE.radius.pill};
          padding: 1px 7px;
          line-height: 1.4;
        }
        .qq-buildai-sub {
          /* ITEM 1 — pull the helper line up tight under the title row. */
          margin: -3px 0 1px;
          font-size: ${AE.type.helper.size};
          color: ${AE.color.secondary};
          line-height: 1.4;
        }
        .qq-buildai-input {
          width: 100%; box-sizing: border-box;
          resize: vertical; min-height: 56px;
          font: inherit; font-size: 14px;
          color: ${AE.color.text};
          background: ${AE.color.surface};
          border: 1px solid ${AE.color.hairline};
          border-radius: ${AE.radius.sm};
          padding: 10px 12px;
          line-height: 1.45;
          transition: border-color 0.12s ease, box-shadow 0.12s ease;
        }
        .qq-buildai-input::placeholder { color: ${AE.color.secondary}; }
        .qq-buildai-input:focus {
          outline: none;
          border-color: ${AE.color.accent};
          box-shadow: ${AE.shadow.focus};
        }
        /* Example prompt chips — subtle (outline/tint), NOT a bright fill.
           Laid out as a 2-row horizontal scroller (mirrors the template strip):
           compact, squared-off chips packed into two rows, swipe left/right for
           more. Lets us surface many suggestions without growing the card. */
        .qq-buildai-chips {
          display: grid;
          grid-auto-flow: column;
          grid-template-rows: repeat(2, auto);
          grid-auto-columns: max-content;
          gap: 6px;
          overflow-x: auto;
          overflow-y: hidden;
          /* ITEM 1 — trimmed the scroller's bottom padding so the chip rows
           * don't leave a dead band above the Add-screenshot affordance.
           * ITEM 3 — grab-drag panning: show the grab cursor + suppress text
           * selection while dragging (.is-dragging set by the pointer handler). */
          padding-bottom: 3px;
          margin: 0 -2px;
          padding-left: 2px; padding-right: 2px;
          cursor: grab;
          /* No scroll-snap — proximity snapping made the grab-drag feel like it
             "switched pages". Free scroll slides the pills smoothly. */
          scroll-snap-type: none;
          /* No scroll-behavior:smooth on the base — it forces native touch
             flicks through a smooth-scroll animation that fights momentum and
             feels janky on mobile. Native momentum (below) is smooth. */
          -webkit-overflow-scrolling: touch;
          scrollbar-width: thin;
        }
        .qq-buildai-chips.is-dragging {
          cursor: grabbing; user-select: none; scroll-behavior: auto;
        }
        /* During a drag the grabbing palm should show over the chips too, and
           a chip must not eat the drag — pointer-events:none lets the
           container's grabbing cursor read through and blocks stray clicks. */
        .qq-buildai-chips.is-dragging .qq-buildai-chip { pointer-events: none; }
        .qq-buildai-chips::-webkit-scrollbar { height: 5px; }
        .qq-buildai-chips::-webkit-scrollbar-thumb {
          background: ${AE.color.hairline}; border-radius: 3px;
        }
        .qq-buildai-chip {
          font: inherit; cursor: grab;
          font-size: 12px; font-weight: 500;
          white-space: nowrap;
          scroll-snap-align: start;
          color: ${AE.color.secondary};
          background: ${AE.color.surface};
          border: 1px solid ${AE.color.hairline};
          border-radius: ${AE.radius.sm};
          padding: 6px 10px;
          transition: border-color 0.12s ease, color 0.12s ease, background 0.12s ease;
        }
        .qq-buildai-chip:hover {
          color: ${AE.color.accent};
          border-color: ${AE.color.accent};
          background: ${AE.color.accentTint};
        }
        .qq-buildai-chip:focus-visible {
          outline: none; box-shadow: ${AE.shadow.focus};
        }
        /* "+ Add screenshot" — outline affordance (NOT a bright fill), aligned
           left so it reads as a secondary option above the primary Generate. */
        .qq-buildai-addref {
          align-self: flex-start;
          display: inline-flex; align-items: center; gap: 6px;
          font: inherit; font-size: 12.5px; font-weight: 500;
          color: ${AE.color.secondary};
          background: ${AE.color.surface};
          border: 1px dashed ${AE.color.hairline};
          border-radius: ${AE.radius.pill};
          padding: 6px 12px;
          cursor: pointer;
          transition: border-color 0.12s ease, color 0.12s ease, background 0.12s ease;
        }
        .qq-buildai-addref:hover {
          color: ${AE.color.accent};
          border-color: ${AE.color.accent};
          background: ${AE.color.accentTint};
        }
        .qq-buildai-addref:focus-visible {
          outline: none; box-shadow: ${AE.shadow.focus};
        }
        /* Attached-screenshot chip — outline, with a small thumbnail + remove. */
        .qq-buildai-refrow {
          display: flex; flex-wrap: wrap; gap: 6px;
        }
        .qq-buildai-refchip {
          display: inline-flex; align-items: center; gap: 8px;
          background: ${AE.color.surface};
          border: 1px solid ${AE.color.hairline};
          border-radius: ${AE.radius.pill};
          padding: 5px 8px 5px 6px;
          max-width: 100%;
        }
        .qq-buildai-refthumb {
          width: 28px; height: 28px; flex-shrink: 0;
          object-fit: cover;
          border-radius: ${AE.radius.sm};
          border: 1px solid ${AE.color.hairline};
        }
        .qq-buildai-reflabel {
          font-size: 12.5px; font-weight: 500;
          color: ${AE.color.text};
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
          min-width: 0;
        }
        .qq-buildai-refremove {
          display: inline-flex; align-items: center; justify-content: center;
          flex-shrink: 0;
          width: 20px; height: 20px;
          background: transparent; border: none; border-radius: 50%;
          color: ${AE.color.secondary}; cursor: pointer; padding: 0;
          transition: color 0.12s ease, background 0.12s ease;
        }
        .qq-buildai-refremove:hover {
          color: ${AE.color.danger};
        }
        .qq-buildai-refremove:focus-visible {
          outline: none; box-shadow: ${AE.shadow.focus};
        }
        .qq-buildai-referror {
          margin: 0;
          font-size: ${AE.type.helper.size};
          color: ${AE.color.danger};
          line-height: 1.4;
        }
        /* EDITOR-POLISH — logo rejection notice sits just under the
           logo + business-name composite. */
        .qq-logo-error { margin-top: 8px; }
        /* Primary Generate button — accent fill (this is the primary action,
           per AE.color.accent/publish). */
        .qq-buildai-generate {
          /* Near-full-width primary CTA, centered, nudged toward the bottom of
             the card (extra top margin) so it reads as the final action. */
          align-self: center;
          width: 96%;
          /* ITEM 1 — tightened from 6px; the card gap already separates it. */
          margin-top: 2px;
          display: inline-flex; align-items: center; justify-content: center; gap: 8px;
          font: inherit; font-size: 14px; font-weight: 600;
          color: ${AE.color.publishText};
          background: ${AE.color.accent};
          border: 1px solid ${AE.color.accent};
          border-radius: ${AE.radius.sm};
          padding: 11px 18px;
          cursor: pointer;
          transition: background 0.12s ease, box-shadow 0.12s ease, opacity 0.12s ease;
        }
        .qq-buildai-generate:hover:not(:disabled) {
          background: ${AE.color.accentHover};
          border-color: ${AE.color.accentHover};
        }
        .qq-buildai-generate:focus-visible {
          outline: none; box-shadow: ${AE.shadow.focus};
        }
        .qq-buildai-generate:disabled {
          opacity: 0.5; cursor: not-allowed;
        }
        @media (max-width: 768px) {
          .qq-buildai-generate {
            align-self: center; width: 100%;
          }
        }
        /* P1 (UI-audit B) — section header for the business row, mirroring
         * .qq-fields-header/.qq-fields-title so the cue sits top-left and the
         * label matches the all-caps subtle treatment used on every panel. */
        .qq-business-header {
          display: flex; align-items: center; justify-content: space-between;
          gap: 12px; margin: 0 0 6px;
        }
        .qq-business-title {
          margin: 0;
          display: inline-flex; align-items: center; gap: 6px;
          font-size: 11.5px; font-weight: 600;
          color: ${p.colors.muted};
          text-transform: uppercase; letter-spacing: 0.04em;
        }
        /* Wave J item 5 — logo + name composite. */
        .qq-business-composite {
          display: flex; align-items: stretch; gap: 10px;
        }
        .qq-business-namewrap {
          flex: 1; min-width: 0;
        }
        /* AUDIT-LOW — positioning context for .qq-logo-clear so the
         * clear pill anchors to the 48px upload square via right/top,
         * not a hardcoded "left: 38px" that drifts on responsive shrink. */
        .qq-logo-slot {
          position: relative; flex-shrink: 0;
          width: 48px; height: 48px;
        }
        .qq-logo-upload {
          flex-shrink: 0;
          width: 48px; min-width: 48px; height: 48px;
          display: inline-flex; align-items: center; justify-content: center;
          /* AUDIT-MEDIUM — was hardcoded #FFFFFF. Token resolves to white
           * in light theme + dark surface (#1E293B) under the
           * .qq-editor-shell[data-theme="dark"] scope (see index.css). */
          background: var(--qq-surface, #FFFFFF); color: ${p.colors.muted};
          border: 1px dashed ${p.colors.border}; border-radius: 10px;
          cursor: pointer; padding: 0; overflow: hidden;
          transition: border-color 0.12s ease, color 0.12s ease;
        }
        .qq-logo-upload:hover {
          border-color: ${p.colors.accent}; color: ${p.colors.accent};
        }
        .qq-logo-upload img {
          width: 100%; height: 100%; object-fit: contain;
        }
        .qq-logo-upload svg { display: block; }
        .qq-logo-clear {
          position: absolute; top: -8px; right: -8px;
          width: 18px; height: 18px;
          /* AUDIT-MEDIUM — was hardcoded #fff. Same rationale as
           * .qq-logo-upload above; dark override paints --qq-surface. */
          background: var(--qq-surface, #FFFFFF); border: 1px solid ${p.colors.border};
          border-radius: 50%; cursor: pointer; padding: 0;
          font-size: 12px; line-height: 1; color: ${p.colors.muted};
        }
        .qq-logo-clear:hover { color: ${p.colors.danger}; border-color: ${p.colors.danger}; }
        /* Touch-target ≥44px on mobile (logo upload). */
        @media (max-width: 768px) {
          .qq-logo-upload { min-width: 48px; width: 48px; height: 48px; }
        }
      `}</style>
    </div>
  );
}
