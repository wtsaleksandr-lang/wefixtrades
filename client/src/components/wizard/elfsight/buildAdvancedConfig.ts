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
    const submitSuccess = (settings?.submitSuccessText ?? '').trim();
    if (submitSuccess !== '') {
      merged = {
        ...merged,
        results: { ...(merged.results ?? {}), submit_success: submitSuccess },
      };
    }
    // spamProtection defaults ON; only thread an explicit `false`.
    if (settings?.spamProtection === false) {
      merged = { ...merged, spamProtection: false };
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
