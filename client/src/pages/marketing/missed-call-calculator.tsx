import { useEffect } from 'react';
import MarketingLayout from '@/components/marketing/MarketingLayout';
import MissedCallCalculatorShell from '@/components/marketing/missed-call-calculator/MissedCallCalculatorShell';
import FAQSection from '@/components/marketing/missed-call-calculator/FAQSection';
import { mkt, colors } from '@/theme/tokens';

/* ═══ Static SEO Content ═══ */

const CALC_SECTIONS = [
  {
    heading: "Why Missed Calls Cost More Than You Think",
    text: "When a customer calls and nobody answers, they don't leave a voicemail — they call the next business on the list. In trades like plumbing, HVAC, and electrical, callers need help now. Every missed call is a job that goes to your competitor, not a message that waits in your inbox.",
  },
  {
    heading: "How the Calculator Works",
    text: "Enter three numbers: how many calls you miss per week, your typical close rate on answered calls, and your average job value. The calculator shows the revenue range you're likely losing — a conservative low end and a realistic high end. No false precision, just a clear picture of the opportunity cost.",
  },
  {
    heading: "Built for Every Trade",
    text: "The calculator includes presets for 25+ trades — from plumbing and HVAC to roofing, landscaping, and carpet cleaning. Each preset loads industry-average job values, close rates, and typical call volumes so you can see results instantly without guessing at the numbers.",
  },
];

export default function MissedCallCalculator() {
  useEffect(() => {
    document.title = "Missed Call Revenue Calculator | WeFixTrades";
    const setMeta = (name: string, content: string) => {
      let el = document.querySelector(`meta[name="${name}"]`);
      if (!el) { el = document.createElement("meta"); (el as HTMLMetaElement).name = name; document.head.appendChild(el); }
      el.setAttribute("content", content);
    };
    setMeta("description", "Calculate how much revenue your business loses from missed calls. Free tool for plumbers, electricians, HVAC, and other trades.");
    let link = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (!link) { link = document.createElement("link"); link.rel = "canonical"; document.head.appendChild(link); }
    link.href = `${window.location.origin}/tools/missed-call-calculator`;
  }, []);

  return (
    <MarketingLayout>
      <section style={{
        background: mkt.bg,
        minHeight: '100vh',
        padding: 'clamp(100px, 12vw, 140px) clamp(16px, 5vw, 40px) clamp(48px, 8vw, 80px)',
      }}>
        <MissedCallCalculatorShell />

        {/* Static SEO Content */}
        <div style={{
          marginTop: 'clamp(48px, 8vw, 80px)',
          borderTop: `1px solid ${mkt.border}`,
          paddingTop: 'clamp(32px, 6vw, 56px)',
          maxWidth: 640,
          marginLeft: 'auto',
          marginRight: 'auto',
        }}>
          {CALC_SECTIONS.map((section, i) => (
            <div key={i} style={{ marginBottom: 28 }}>
              <h2 style={{
                fontSize: 'clamp(18px, 2.5vw, 22px)',
                fontWeight: 700,
                color: colors.effortel.n300,
                lineHeight: 1.2,
                letterSpacing: '-0.01em',
                margin: '0 0 8px',
              }}>
                {section.heading}
              </h2>
              <p style={{
                fontSize: 14,
                color: mkt.textMuted,
                lineHeight: 1.7,
                margin: 0,
              }}>
                {section.text}
              </p>
            </div>
          ))}
        </div>

        <div style={{
          marginTop: 'clamp(48px, 8vw, 80px)',
          borderTop: `1px solid ${mkt.border}`,
          paddingTop: 'clamp(32px, 6vw, 56px)',
        }}>
          <FAQSection />
        </div>
      </section>
    </MarketingLayout>
  );
}
