import WizardCard from '@/components/wizard/WizardCard';
import { platformTheme } from '@/theme/platformTheme';

const p = platformTheme;

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
        textAlign: 'center', padding: '36px 16px 10px',
        maxWidth: '600px', width: '100%',
      }}>
        <h1 style={{
          fontSize: '24px', fontWeight: 700, color: p.colors.heading,
          lineHeight: 1.3, letterSpacing: '-0.01em',
          marginBottom: '6px',
        }}>
          Set Up Your Instant Quote Engine
        </h1>
        <p style={{ fontSize: '14px', color: p.colors.muted, lineHeight: 1.5 }}>
          Customize your automated quoting system in minutes.
        </p>
      </div>
      <div style={{
        width: '100%', maxWidth: '480px',
        padding: '12px 16px 48px',
      }}>
        <WizardCard />
      </div>
    </div>
  );
}
