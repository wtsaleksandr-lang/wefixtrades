import { designTokens } from '@/components/designTokens';
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
    <div
      className="min-h-screen flex flex-col items-center justify-start"
      style={{
        background: 'linear-gradient(180deg, #E2E8F0 0%, #CBD5E1 100%)',
        paddingTop: '40px',
        paddingBottom: '40px',
        paddingLeft: '24px',
        paddingRight: '24px',
      }}
    >
      <div className="text-center mb-6 w-full max-w-[960px] mx-auto">
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-800 tracking-tight" data-testid="text-wizard-title">
          Build Your Instant Quote System
        </h1>
        <p className="mt-2 text-sm text-slate-500">Launch today. Start capturing qualified leads.</p>
      </div>
      <div style={{ width: '100%', maxWidth: '960px', margin: '0 auto' }}>
        <WizardCard />
      </div>
    </div>
  );
}
