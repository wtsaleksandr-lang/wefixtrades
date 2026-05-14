import { useMemo, useState } from 'react';
import { Link } from 'wouter';
import { ArrowRight } from 'lucide-react';
import MarketingLayout from '@/components/marketing/MarketingLayout';
import MissedCallCalculatorShell from '@/components/marketing/missed-call-calculator/MissedCallCalculatorShell';
import FAQSection from '@/components/marketing/missed-call-calculator/FAQSection';
import { usePageMeta } from '@/lib/usePageMeta';
import { useBreadcrumbSchema } from '@/lib/useBreadcrumbSchema';
import TrustStrip from '@/components/marketing/TrustStrip';
import { mkt, colors } from '@/theme/tokens';

/* ═══ Static SEO Content ═══ */

const CALC_SECTIONS = [
  {
    tab: "The Real Cost",
    heading: "Why Missed Calls Cost More Than You Think",
    text: "When a customer calls and nobody answers, they don't leave a voicemail — they call the next business on the list. In trades like plumbing, HVAC, and electrical, callers need help now. Every missed call is a job that goes to your competitor, not a message that waits in your inbox.",
  },
  {
    tab: "How It Works",
    heading: "How the Calculator Works",
    text: "Enter three numbers: how many calls you miss per week, your typical close rate on answered calls, and your average job value. The calculator shows the revenue range you're likely losing — a conservative low end and a realistic high end. No false precision, just a clear picture of the opportunity cost.",
  },
  {
    tab: "25+ Trades",
    heading: "Built for Every Trade",
    text: "The calculator includes presets for 25+ trades — from plumbing and HVAC to roofing, landscaping, and carpet cleaning. Each preset loads industry-average job values, close rates, and typical call volumes so you can see results instantly without guessing at the numbers.",
  },
];

function CalcSeoTabs() {
  const [activeIdx, setActiveIdx] = useState(0);
  return (
    <div style={{
      marginTop: 'clamp(48px, 8vw, 80px)',
      borderTop: `1px solid ${mkt.onDarkBorder}`,
      paddingTop: 'clamp(32px, 6vw, 56px)',
      maxWidth: 640,
      marginLeft: 'auto',
      marginRight: 'auto',
    }}>
      <div style={{
        display: 'flex',
        gap: 6,
        flexWrap: 'wrap',
        justifyContent: 'center',
        marginBottom: 16,
      }}>
        {CALC_SECTIONS.map((section, i) => {
          const isActive = i === activeIdx;
          return (
            <button
              key={i}
              onClick={() => setActiveIdx(i)}
              style={{
                padding: '7px 14px',
                borderRadius: 9999,
                border: `1px solid ${isActive ? 'rgba(13,60,252,0.3)' : mkt.border}`,
                background: isActive ? 'rgba(13,60,252,0.08)' : 'transparent',
                color: isActive ? mkt.accent : mkt.onDarkMuted,
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              {section.tab}
            </button>
          );
        })}
      </div>
      <div style={{
        background: mkt.cardBg,
        border: `1px solid ${mkt.cardBorder}`,
        borderRadius: 14,
        padding: '20px 22px',
      }}>
        <h2 style={{
          fontSize: 16,
          fontWeight: 700,
          color: colors.effortel.n300,
          lineHeight: 1.3,
          margin: '0 0 8px',
        }}>
          {CALC_SECTIONS[activeIdx].heading}
        </h2>
        <p style={{
          fontSize: 14,
          color: mkt.onDarkMuted,
          lineHeight: 1.7,
          margin: 0,
        }}>
          {CALC_SECTIONS[activeIdx].text}
        </p>
      </div>
      {/* Hidden SEO text — all sections in DOM for crawlers */}
      <div style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0,0,0,0)' }} aria-hidden="true">
        {CALC_SECTIONS.map((s, i) => (
          <div key={i}><h2>{s.heading}</h2><p>{s.text}</p></div>
        ))}
      </div>
    </div>
  );
}

function InlineCTA() {
  return (
    <div style={{
      maxWidth: 640,
      margin: 'clamp(24px, 4vw, 40px) auto 0',
    }}>
      <Link href="/products/tradeline" style={{ textDecoration: 'none', display: 'block' }}>
        <div style={{
          background: mkt.ctaBg,
          borderRadius: 10,
          padding: '18px 24px',
          display: 'flex',
          alignItems: 'center',
          cursor: 'pointer',
          border: '2px solid transparent',
          transition: 'border-color 0.25s, box-shadow 0.25s, background 0.2s',
        }}
          onMouseEnter={e => {
            e.currentTarget.style.borderColor = 'rgba(0,0,0,0.3)';
            e.currentTarget.style.boxShadow = '0 16px 48px rgba(0,0,0,0.15)';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.borderColor = 'transparent';
            e.currentTarget.style.boxShadow = 'none';
          }}
        >
          <div style={{ flex: 1 }}>
            <div style={{
              fontSize: 'clamp(15px, 2.5vw, 18px)',
              fontWeight: 700,
              color: '#0d1514',
              lineHeight: 1.2,
              marginBottom: 3,
            }}>
              Stop Losing Revenue to Missed Calls
            </div>
            <div style={{ fontSize: 13, color: 'rgba(13,21,20,0.55)', fontWeight: 500 }}>
              AI answers 24/7 · SMS auto-response · From $97/mo
            </div>
          </div>
          <div style={{
            width: 44, height: 44, background: '#0d1514', borderRadius: 10,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <ArrowRight size={16} color="white" strokeWidth={2.2} />
          </div>
        </div>
      </Link>
    </div>
  );
}

const BASE = "https://wefixtrades.com";

export default function MissedCallCalculator() {
  usePageMeta({
    title: "Missed Call Revenue Calculator | WeFixTrades",
    description: "Calculate how much revenue your business loses from missed calls. Free tool for plumbers, electricians, HVAC, and other trades.",
    canonicalPath: "/tools/missed-call-calculator",
  });

  const breadcrumbs = useMemo(() => [
    { name: "Home", url: `${BASE}/` },
    { name: "Free Tools", url: `${BASE}/tools` },
    { name: "Missed Call Calculator", url: `${BASE}/tools/missed-call-calculator` },
  ], []);
  useBreadcrumbSchema(breadcrumbs);

  return (
    <MarketingLayout>
      <section style={{
        background: mkt.bg,
        minHeight: '100vh',
        padding: 'clamp(100px, 12vw, 140px) clamp(16px, 5vw, 40px) clamp(48px, 8vw, 80px)',
      }}>
        {/* Breadcrumb */}
        <nav aria-label="breadcrumb" style={{ maxWidth: 640, margin: '0 auto 16px', fontSize: 13, color: mkt.onDarkMuted }}>
          <Link href="/" style={{ color: mkt.onDarkMuted, textDecoration: 'none' }}>Home</Link>
          <span style={{ margin: '0 6px' }}>/</span>
          <Link href="/tools" style={{ color: mkt.onDarkMuted, textDecoration: 'none' }}>Free Tools</Link>
          <span style={{ margin: '0 6px' }}>/</span>
          <span style={{ color: mkt.text }}>Missed Call Calculator</span>
        </nav>

        <MissedCallCalculatorShell />

        {/* Static SEO Content — tabbed */}
        <CalcSeoTabs />

        {/* CTA after explanation */}
        <InlineCTA />

        <TrustStrip theme="dark" />

        <div style={{
          marginTop: 'clamp(24px, 4vw, 40px)',
          borderTop: `1px solid ${mkt.onDarkBorder}`,
          paddingTop: 'clamp(32px, 6vw, 56px)',
        }}>
          <FAQSection />
        </div>

        {/* CTA after FAQ */}
        <InlineCTA />
      </section>
    </MarketingLayout>
  );
}
