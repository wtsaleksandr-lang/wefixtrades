// Legacy QuoteQuick wizard — preserved at /wizard/legacy as part of Wave H1.
//
// The new Elfsight-clone editor shell mounts at /wizard. This page exists
// purely so the original 5-step builder (BuilderStep1 → Design → Logic →
// CTA → Install) keeps working unchanged for reference and as a safety
// net while subsequent H-wave phases fill in the new shell's tab content.

import WizardCard from '@/components/wizard/legacy/WizardCard';

export default function WizardLegacy() {
  const isEmbed = ['1', 'true'].includes(
    new URLSearchParams(window.location.search).get('embed') || ''
  );

  if (isEmbed) {
    return (
      <div className="w-full">
        <WizardCard embed />
      </div>
    );
  }

  return <WizardCard />;
}
