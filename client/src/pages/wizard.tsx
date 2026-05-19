import WizardCard from '@/components/wizard/legacy/WizardCard';

// The wizard is a full app-shell (its own top navbar + split body), so the
// page is just a full-bleed mount point.
export default function Wizard() {
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
