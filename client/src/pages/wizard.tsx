// /wizard — Elfsight-clone editor shell (Wave H1).
//
// The new shell is the canonical builder. The legacy 5-step wizard was
// retired in the trial-truth sweep (its PublishStep advertised a 14-day
// AI trial that contradicted the permanent free tier); /wizard/legacy now
// redirects here.

import WizardShell from '@/components/wizard/elfsight/WizardShell';
import { PageMeta } from '@/components/seo/PageMeta';
import { useWidgetFonts } from '@/hooks/useWidgetFonts';

export default function Wizard() {
  // Load curated widget font set (Wave 45 — moved out of index.html).
  useWidgetFonts();

  const isEmbed = ['1', 'true'].includes(
    new URLSearchParams(window.location.search).get('embed') || ''
  );

  if (isEmbed) {
    return (
      <div className="w-full">
        <WizardShell embed />
      </div>
    );
  }

  return (
    <>
      <PageMeta
        title="Quote Builder"
        description="Build and customize your free instant-quote calculator widget for your trade business."
        noIndex
      />
      <WizardShell />
    </>
  );
}
