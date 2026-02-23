import WizardCard from '@/components/wizard/WizardCard';

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

  return (
    <div className="wizard-bg" style={{ display: 'flex', justifyContent: 'center', padding: '0' }}>
      <div style={{ width: '100%', maxWidth: '480px', padding: '16px 16px 40px' }}>
        <WizardCard />
      </div>
    </div>
  );
}
