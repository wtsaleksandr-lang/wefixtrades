// /wizard — Elfsight-clone editor shell (Wave H1).
//
// The new shell is the canonical builder. The legacy 5-step wizard is
// preserved at /wizard/legacy (see pages/wizard-legacy.tsx) and will be
// retired once H2-H7 finish the tab content.

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
