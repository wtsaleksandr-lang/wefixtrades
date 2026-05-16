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
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'flex-start', padding: '0', minHeight: '100vh',
      background: 'linear-gradient(180deg, #f8fafc 0%, #eef1f6 55%, #e8ecf2 100%)',
    }}>
      {/* Top bar with logo */}
      <div style={{
        width: '100%', padding: '13px 26px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        borderBottom: `1px solid ${p.colors.borderLight}`,
        background: 'rgba(255,255,255,0.85)',
        backdropFilter: 'blur(10px)',
        position: 'sticky', top: 0, zIndex: 20,
      }}>
        <a href="/" style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none' }}>
          <img src="/favicon.svg" alt="" style={{ width: 24, height: 24 }} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
          <span style={{ fontSize: 14, fontWeight: 700, color: p.colors.heading, opacity: 0.75 }}>WeFixTrades</span>
        </a>
        <span style={{
          fontSize: 11, fontWeight: 600, letterSpacing: '0.03em',
          color: p.colors.accentDark, background: p.colors.accentLighter,
          padding: '4px 11px', borderRadius: 999,
        }}>
          QuoteQuick Pro™ Builder
        </span>
      </div>

      {/* Header */}
      <div style={{
        textAlign: 'center', padding: '34px 16px 12px',
        maxWidth: '620px', width: '100%',
      }}>
        <h1 style={{
          fontSize: '26px', fontWeight: 800, color: p.colors.heading,
          lineHeight: 1.22, letterSpacing: '-0.022em',
          marginBottom: '7px',
        }}>
          Get your quote calculator live in 5 minutes
        </h1>
        <p style={{ fontSize: '13.5px', color: p.colors.muted, lineHeight: 1.55, marginBottom: 0 }}>
          Pick your trade, set your rates, and start getting leads. No code needed.
        </p>
      </div>

      {/* Wizard container — wider for dual-column on desktop */}
      <div style={{
        width: '100%',
        maxWidth: '1100px',
        padding: '14px 16px 52px',
      }}>
        <WizardCard />
      </div>
    </div>
  );
}
