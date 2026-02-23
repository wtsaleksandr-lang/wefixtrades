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
    <div className="wizard-bg" style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'flex-start', padding: '0',
    }}>
      <div style={{
        textAlign: 'center', padding: '32px 16px 8px',
        maxWidth: '600px', width: '100%',
      }}>
        <h1 style={{
          fontSize: '24px', fontWeight: 700, color: '#0F172A',
          lineHeight: 1.3, letterSpacing: '-0.01em',
          marginBottom: '6px',
        }}>
          Build Your Instant Quote System
        </h1>
        <p style={{ fontSize: '14px', color: '#64748B', lineHeight: 1.5 }}>
          Launch today. Start capturing qualified leads.
        </p>
      </div>
      <div style={{
        width: '100%', maxWidth: '480px',
        padding: '12px 16px 40px',
      }}>
        <WizardCard />
      </div>
    </div>
  );
}
