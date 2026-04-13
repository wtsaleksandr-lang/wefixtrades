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
      justifyContent: 'flex-start', padding: '0', minHeight: '100vh',
    }}>
      {/* Top bar with logo */}
      <div style={{
        width: '100%', padding: '12px 24px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        borderBottom: `1px solid ${p.colors.borderLight}`,
        background: 'rgba(255,255,255,0.8)',
        backdropFilter: 'blur(8px)',
        position: 'sticky', top: 0, zIndex: 20,
      }}>
        <a href="/" style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none' }}>
          <img src="/favicon.svg" alt="" style={{ width: 24, height: 24 }} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
          <span style={{ fontSize: 14, fontWeight: 700, color: p.colors.heading, opacity: 0.7 }}>WeFixTrades</span>
        </a>
        <span style={{ fontSize: 12, color: p.colors.muted }}>QuoteQuick Pro™ Builder</span>
      </div>

      {/* Header */}
      <div style={{
        textAlign: 'center', padding: '28px 16px 8px',
        maxWidth: '600px', width: '100%',
      }}>
        <h1 style={{
          fontSize: '22px', fontWeight: 700, color: p.colors.heading,
          lineHeight: 1.3, letterSpacing: '-0.01em',
          marginBottom: '4px',
        }}>
          Get your quote calculator live in 5 minutes
        </h1>
        <p style={{ fontSize: '13px', color: p.colors.muted, lineHeight: 1.5, marginBottom: 0 }}>
          Pick your trade, set your rates, and start getting leads. No code needed.
        </p>
      </div>

      {/* Wizard container — wider for dual-column on desktop */}
      <div style={{
        width: '100%',
        maxWidth: '1100px',
        padding: '12px 16px 48px',
      }}>
        <WizardCard />
      </div>
    </div>
  );
}
