/**
 * Maps marketing-page template IDs (kebab-case, from
 * client/src/config/templateConfig.ts) to canonical wizard preset IDs
 * (snake_case, from shared/templatePresets.ts).
 *
 * The /templates and /demo/:id pages link "Use" / "Start Free" CTAs to
 * /wizard?template=<wizardPresetId>. WizardShell reads the param on mount
 * and applies the preset so the user lands on the calculator they clicked.
 *
 * Why a mapping (not shared IDs): templateConfig.ts is the marketing demo
 * config (10 simplified demos); templatePresets.ts is the production
 * preset catalogue (44 full presets). Each marketing demo is paired with
 * its closest production preset.
 */

export const MARKETING_TO_WIZARD_PRESET: Record<string, string> = {
  'home-cleaning': 'property_cleaning',
  'plumbing': 'plumbing_service',
  'hvac': 'hvac_installation',
  'roofing': 'roof_repair',
  'landscaping': 'landscaping',
  'bathroom-reno': 'bathroom_renovation',
  'electrical': 'electrical_work',
  'painting': 'interior_painting',
  'concrete': 'concrete_driveway_replacement',
  'photography': 'photography_package',
};

export function marketingToWizardPresetId(marketingId: string): string | null {
  return MARKETING_TO_WIZARD_PRESET[marketingId] ?? null;
}

/**
 * Build a `/wizard?template=<id>` href for a marketing template card CTA.
 * Falls back to `/wizard` (blank shell) if the marketing id is unmapped.
 */
export function buildWizardHrefForMarketingTemplate(marketingId: string): string {
  const wid = marketingToWizardPresetId(marketingId);
  return wid ? `/wizard?template=${encodeURIComponent(wid)}` : '/wizard';
}
