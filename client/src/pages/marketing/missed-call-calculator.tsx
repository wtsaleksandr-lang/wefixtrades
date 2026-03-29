import MarketingLayout from '@/components/marketing/MarketingLayout';
import MissedCallCalculatorShell from '@/components/marketing/missed-call-calculator/MissedCallCalculatorShell';
import FAQSection from '@/components/marketing/missed-call-calculator/FAQSection';
import { mkt } from '@/theme/tokens';

export default function MissedCallCalculator() {
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
