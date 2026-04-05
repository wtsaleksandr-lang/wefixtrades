import { useEffect } from 'react';
import MarketingLayout from '@/components/marketing/MarketingLayout';
import MissedCallCalculatorShell from '@/components/marketing/missed-call-calculator/MissedCallCalculatorShell';
import FAQSection from '@/components/marketing/missed-call-calculator/FAQSection';
import { mkt } from '@/theme/tokens';

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
