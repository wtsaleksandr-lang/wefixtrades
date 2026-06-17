// buildAdvancedConfig — single source of truth for the authored calculator
// `advanced` config.
//
// Why this exists (P0 data-loss fix, fix/wizard-persistence):
//   The live PREVIEW (PreviewPane) used to assemble the FULL authored config
//   inline (fields, calculations, result_calc, resultCalcId-resolved headline,
//   style, tiered, trustBadges, steps, header, results, numberFormat, …) while
//   the SAVE path (WizardShell.saveDraftMutation) only persisted
//   { numberFormat, results?, spamProtection? }. So a published widget lost the
//   owner's custom fields / calcs / formulas / style / tiers.
//
//   This helper extracts that build into ONE pure function used by BOTH the
//   preview AND the save payload, so the two can never drift: what the owner
//   sees in the preview is exactly what gets persisted and published.
//
// Pure + typed: given the shell state slices, returns the merged
// `AdvancedConfigShape`. No React, no side effects, no localStorage.

import {
  buildBlankPreviewConfig,
  type AdvancedConfigShape,
  type TemplateField,
  type TemplateCalculation,
  type TemplateLayout,
  type TemplateTiered,
  type TemplateStep,
  type TrustBadge,
} from '@shared/templatePresets';
import {
  DEFAULT_SHELL_NUMBER_FORMAT,
  type ShellHeader,
  type ShellResults,
  type ShellStyle,
  type ShellSettings,
  type ShellNumberFormat,
} from './types';
import { buildLeadFormConfig } from './buildLeadFormConfig';

function thousandsLiteral(sep: ShellNumberFormat['thousands']): ',' | ' ' | '' {
  return sep === 'comma' ? ',' : sep === 'space' ? ' ' : '';
}
function decimalLiteral(sep: ShellNumberFormat['decimal']): '.' | ',' {
  return sep === 'comma' ? ',' : '.';
}

/** Inputs are the shell-state slices both PreviewPane and saveDraftMutation hold. */
export interface BuildAdvancedConfigInput {
  layout: TemplateLayout;
  businessName?: string;
  fields?: TemplateField[];
  calculations?: TemplateCalculation[];
  header?: ShellHeader;
  results?: ShellResults;
  /** Stable id of the headline calc — rename-safe (resolved → name here). */
  resultCalcId?: string;
  style?: ShellStyle;
  settings?: ShellSettings;
  stepLayout?: 'stepper' | 'single';
  tiered?: TemplateTiered;
  trustBadges?: readonly TrustBadge[];
  /** AI-gen quality (gap 4) — niche default icon (QUOTEQUICK_ICONS key);
   *  rendered by AdvancedCalculator's header when no logo is uploaded. */
  defaultIcon?: string;
  /** PRICING-MODELS — per-business anchor address for `address_distance`
   *  fields (`settings.origin`). Threaded to `advanced.origin` so the
   *  server geocodes it once on save and the public distance endpoint can
   *  read it server-side (the widget client never supplies the origin). */
  origin?: ShellSettings['origin'];
  steps?: TemplateStep[];
  category?: string;
  /**
   * When true, strip the synthetic `__preview` marker inherited from
   * `buildBlankPreviewConfig`. The SAVE path passes this so the persisted /
   * published calculator is NOT flagged as a throwaway placeholder (which the
   * legacy WizardCard strips on Continue). The live preview leaves it on so
   * preview behaviour is byte-for-byte unchanged.
   */
  forSave?: boolean;
}

/**
 * Build the complete authored `advanced` config from shell state.
 *
 * Mirrors (and is the SOLE owner of) the merge logic that previously lived
 * inline in PreviewPane.previewCalculatorData. The output is the value that
 * goes into `calculator_settings.advanced` both for the live preview and for
 * the persisted/published calculator.
 *
 * result_calc / resultCalcId handling (Fix 3 — rename-safe headline):
 *   1. If a calc still carries the seed's `result_calc` name, keep it; else
 *      fall back to the LAST calc's name.
 *   2. If `resultCalcId` is set and resolves to a calc, that calc's CURRENT
 *      name wins — so renaming the headline calc never silently re-points the
 *      result to a stale name.
 */
export function buildAdvancedConfig(
  input: BuildAdvancedConfigInput,
): AdvancedConfigShape {
  const {
    layout, businessName, fields, calculations, header, results,
    resultCalcId, style, settings, stepLayout, tiered, trustBadges,
    defaultIcon, origin, steps, category, forSave,
  } = input;

  const advanced = buildBlankPreviewConfig(layout, businessName);
  let merged: AdvancedConfigShape =
    fields !== undefined ? { ...advanced, fields } : advanced;

  if (calculations && calculations.length > 0) {
    const stillHasHeadline = calculations.some((c) => c.name === merged.result_calc);
    merged = {
      ...merged,
      calculations,
      result_calc: stillHasHeadline
        ? merged.result_calc
        : calculations[calculations.length - 1].name,
    };
  }
  if (resultCalcId) {
    const hit = merged.calculations.find((c) => c.id === resultCalcId);
    if (hit) merged = { ...merged, result_calc: hit.name };
  }
  if (header) {
    const subtitleOverride = (header.subtitle ?? '').trim();
    const mergedHeader = { ...(merged.header || { title: '', align: 'left' as const }) };
    // BUG-1 fix (fix/inline-title-edit): apply the header title whenever it is
    // DEFINED — including an intentionally-cleared empty string — so the user
    // deleting the title to retype it does NOT snap the template default back
    // ("doesn't work"). `null`/`undefined` means "never set" → keep template
    // default; only an explicit value (incl. "") overrides. Subtitle keeps the
    // legacy "non-empty only" semantics (no inline editor clears it).
    if (header.title != null) mergedHeader.title = header.title;
    if (subtitleOverride !== '') mergedHeader.subtitle = header.subtitle;
    merged = { ...merged, header: mergedHeader };
  }
  if (results) {
    const headingOverride = (results.heading ?? '').trim();
    const footnoteOverride = (results.footnote ?? '').trim();
    const mergedResults = { ...(merged.results || {}) };
    if (headingOverride !== '') mergedResults.heading = results.heading;
    if (footnoteOverride !== '') mergedResults.footnote = results.footnote;
    merged = { ...merged, results: mergedResults };
  }
  if (style) {
    merged = {
      ...merged,
      style: { ...(merged.style ?? {}), ...style },
    };
  }

  // CHANGE C2 — deposit / booking PREVIEW FIDELITY.
  //
  // The renderer (AdvancedCalculator: DepositPreviewBadge / BookingCalendar-
  // Preview) reads `advanced.style.deposit` / `advanced.style.booking`. Those
  // keys are NO LONGER written by the editor — the canonical, PERSISTED config
  // moved to `settings.deposit` ({enabled,mode,value,label,required}) and
  // `settings.scheduling` ({enabled,workingDays,workingHours…}). So toggling
  // deposit/booking in the Action tab didn't update the preview (regression
  // from #1853). Adapt the canonical settings into the `style.deposit` /
  // `style.booking` shapes the preview consumes, so the editor preview tracks
  // the canonical config live. (The SAVE path persists settings.deposit /
  // settings.scheduling into appearance.* separately — this adapter only feeds
  // the preview renderer; it never changes what's persisted.)
  {
    const sd = settings?.deposit;
    if (sd && sd.enabled === true) {
      const value = typeof sd.value === 'number' && Number.isFinite(sd.value)
        ? Math.max(0, sd.value)
        : 0;
      // The preview badge shows a flat currency figure. `fixed` → the dollar
      // value directly. `percent` → the editor preview has no live quote total
      // here, so show a representative deposit = value% of a nominal sample
      // quote, and surface the percentage in the label so the figure reads
      // honestly (mirrors DepositStep's "{value}% deposit ($X)" copy).
      const PERCENT_SAMPLE_QUOTE = 1000;
      const isPercent = sd.mode === 'percent';
      const amount = isPercent
        ? Math.round((PERCENT_SAMPLE_QUOTE * value) / 100)
        : Math.round(value);
      // CHANGE A — carry the owner's "required" toggle through so the preview
      // badge copy reflects whether the deposit is mandatory before scheduling
      // (mirrors `settings.deposit.required`). The adapter previously dropped
      // it, so toggling "required" in the Action tab never changed the preview.
      const required = sd.required === true;
      const ownLabel = (sd.label ?? '').trim();
      const requiredWord = required ? 'required' : 'requested';
      const label = ownLabel !== ''
        ? ownLabel
        : (isPercent && value > 0
            ? `${value}% deposit ${requiredWord} to schedule`
            : `Deposit ${requiredWord} to schedule`);
      merged = {
        ...merged,
        style: {
          ...(merged.style ?? {}),
          deposit: { enabled: true, amount, label, required },
        },
      };
    } else if (sd && sd.enabled === false) {
      // Explicitly disabled → ensure any inherited template `style.deposit` is
      // turned off so the preview hides the badge live when the owner unticks.
      merged = {
        ...merged,
        style: {
          ...(merged.style ?? {}),
          deposit: { ...(merged.style?.deposit ?? { amount: 0 }), enabled: false },
        },
      };
    }

    const sched = settings?.scheduling;
    if (sched && sched.enabled === true) {
      merged = {
        ...merged,
        style: {
          ...(merged.style ?? {}),
          // The built-in scheduler maps to the in-widget mock slot picker.
          // CHANGE A — carry the full scheduling detail (working days/hours +
          // slot length) so the preview calendar reflects the owner's chosen
          // availability live, instead of its generic Mon–Fri 9-5 fallback. The
          // adapter previously emitted only {enabled, source}, dropping every
          // detail the Action-tab booking card edits.
          booking: {
            enabled: true,
            source: 'wefixtrades-default',
            ...(Array.isArray(sched.workingDays) ? { workingDays: [...sched.workingDays] } : {}),
            ...(typeof sched.workingHoursStart === 'string' ? { workingHoursStart: sched.workingHoursStart } : {}),
            ...(typeof sched.workingHoursEnd === 'string' ? { workingHoursEnd: sched.workingHoursEnd } : {}),
            ...(typeof sched.slotDurationMinutes === 'number' ? { slotDurationMinutes: sched.slotDurationMinutes } : {}),
            ...(typeof sched.bufferMinutes === 'number' ? { bufferMinutes: sched.bufferMinutes } : {}),
          },
        },
      };
    } else if (sched && sched.enabled === false) {
      merged = {
        ...merged,
        style: {
          ...(merged.style ?? {}),
          booking: {
            ...(merged.style?.booking ?? { source: 'wefixtrades-default' as const }),
            enabled: false,
          },
        },
      };
    }
  }
  if (stepLayout) {
    merged = { ...merged, stepLayout };
  }
  if (tiered) {
    merged = { ...merged, tiered };
  }
  if (trustBadges) {
    merged = { ...merged, trustBadges };
  }
  if (defaultIcon) {
    merged = { ...merged, defaultIcon };
  }
  // PRICING-MODELS — thread the business anchor address only when it is
  // actually set (non-empty after trim); preserve any already-geocoded
  // lat/lng so a round-tripped origin doesn't lose its coordinates.
  if (origin && origin.address.trim() !== '') {
    merged = {
      ...merged,
      origin: {
        address: origin.address.trim(),
        ...(origin.lat != null ? { lat: origin.lat } : {}),
        ...(origin.lng != null ? { lng: origin.lng } : {}),
      },
    };
  }
  if (steps && steps.length > 0) {
    merged = { ...merged, steps };
  }
  if (category && category.trim() !== '') {
    merged = { ...merged, category };
  }
  if (settings?.businessProfile) {
    merged = { ...merged, businessProfile: settings.businessProfile };
  }
  {
    const nf = settings?.numberFormat ?? DEFAULT_SHELL_NUMBER_FORMAT;
    const numberFormat = {
      thousands: thousandsLiteral(nf.thousands),
      decimal: decimalLiteral(nf.decimal),
      currency: (nf.currency || 'USD').toUpperCase(),
    };
    merged = { ...merged, numberFormat };

    const cta = (settings?.ctaLabel ?? '').trim();
    if (cta !== '') {
      merged = {
        ...merged,
        results: { ...(merged.results ?? {}), cta_label: cta },
      };
    }
    // CHANGE A — CTA heading + caption (settings.ctaHeading / ctaCaption). The
    // renderer already renders results.cta_heading / cta_sub above the result
    // CTA; the build input just never mapped the Action-tab fields into them,
    // so editing them did nothing in the preview. Map them through now (only
    // when non-empty so an absent value keeps the template's own copy).
    const ctaHeading = (settings?.ctaHeading ?? '').trim();
    if (ctaHeading !== '') {
      merged = {
        ...merged,
        results: { ...(merged.results ?? {}), cta_heading: ctaHeading },
      };
    }
    const ctaCaption = (settings?.ctaCaption ?? '').trim();
    if (ctaCaption !== '') {
      merged = {
        ...merged,
        results: { ...(merged.results ?? {}), cta_sub: ctaCaption },
      };
    }
    const submitSuccess = (settings?.submitSuccessText ?? '').trim();
    if (submitSuccess !== '') {
      merged = {
        ...merged,
        results: { ...(merged.results ?? {}), submit_success: submitSuccess },
      };
    }
    // CHANGE A — action mode + redirect URL (settings.actionMode /
    // settings.redirectUrl). Carried into results.action_mode / redirect_url so
    // the preview CTA can reflect the chosen follow-up behaviour (open the lead
    // form / redirect to a URL / show the result only). Save-path-only before
    // this; the preview ignored the mode entirely.
    if (settings?.actionMode) {
      merged = {
        ...merged,
        results: { ...(merged.results ?? {}), action_mode: settings.actionMode },
      };
    }
    const redirectUrl = (settings?.redirectUrl ?? '').trim();
    if (redirectUrl !== '') {
      merged = {
        ...merged,
        results: { ...(merged.results ?? {}), redirect_url: redirectUrl },
      };
    }
    // spamProtection defaults ON; only thread an explicit `false`.
    if (settings?.spamProtection === false) {
      merged = { ...merged, spamProtection: false };
    }
    // LEAD-FORM-FIELDS — mirror the owner's custom lead fields into
    // results.lead_custom_fields so the wizard preview's inline lead form +
    // LeadModal render the same extra inputs the deployed widget's
    // LeadCaptureStep reads from lead_form.custom_fields. Reuse
    // buildLeadFormConfig so the preview + published widget never drift on
    // normalization (blank/half-authored rows already dropped there).
    const leadForm = buildLeadFormConfig(settings);
    if (leadForm && leadForm.custom_fields.length > 0) {
      merged = {
        ...merged,
        results: { ...(merged.results ?? {}), lead_custom_fields: leadForm.custom_fields },
      };
    }
  }

  if (forSave) {
    // The persisted config is the REAL authored calculator, not a synthetic
    // placeholder — strip the preview-only marker so nothing downstream treats
    // it as throwaway. `delete` on a fresh copy keeps the helper pure.
    const { __preview: _drop, ...persisted } =
      merged as AdvancedConfigShape & { __preview?: true };
    return persisted as AdvancedConfigShape;
  }

  return merged;
}
