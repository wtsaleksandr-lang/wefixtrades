import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { ChevronDown, HelpCircle } from 'lucide-react';
import { mkt, colors, radius } from '@/theme/tokens';
import { useFaqSchema } from '@/lib/useFaqSchema';

interface FAQItem {
  id: string;
  question: string;
  answer: string;
}

const FAQ_ITEMS: FAQItem[] = [
  {
    id: 'accuracy',
    question: 'How accurate are these estimates?',
    answer:
      'Results are based on the numbers you enter combined with typical ranges for your trade. They are meant as a starting point — adjust the sliders to reflect your actual call volume, close rate, and job size for the most relevant estimate.',
  },
  {
    id: 'missed-call',
    question: 'What counts as a missed call?',
    answer:
      'Any inbound call that goes unanswered, reaches voicemail, or gets a delayed response. Research shows most callers who reach voicemail hang up and call the next business, so even short delays can lead to missed opportunities.',
  },
  {
    id: 'not-all-jobs',
    question: 'Do all missed calls become jobs?',
    answer:
      'No. The close rate slider accounts for this — it represents the percentage of answered calls that typically convert to booked work. Some callers are existing customers, price shoppers, or not a fit. The calculator factors this in.',
  },
  {
    id: 'range',
    question: 'Why do the results show a range?',
    answer:
      'Because job values, lead quality, and customer behavior vary from business to business and season to season. A single number would imply false precision. The range gives you a conservative-to-high bracket that reflects real-world variance.',
  },
  {
    id: 'reduce',
    question: 'How can businesses reduce missed opportunities?',
    answer:
      'Common approaches include faster call response, better follow-up processes, after-hours call coverage, and simple lead capture so no inquiry goes unacknowledged. Even small improvements in response time can meaningfully increase the share of calls that convert.',
  },
];

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() =>
    typeof window !== 'undefined'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false
  );
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  return reduced;
}

export default function FAQSection() {
  const [openId, setOpenId] = useState<string | null>(null);
  const reducedMotion = usePrefersReducedMotion();

  const faqSchemaItems = useMemo(() => FAQ_ITEMS.map(f => ({ question: f.question, answer: f.answer })), []);
  useFaqSchema(faqSchemaItems);

  const toggle = (id: string) => setOpenId(prev => (prev === id ? null : id));

  return (
    <section
      aria-labelledby="faq-heading"
      style={{ maxWidth: 640, margin: '0 auto' }}
    >
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        marginBottom: 16,
      }}>
        <HelpCircle size={16} color={mkt.textFaint} />
        <h3
          id="faq-heading"
          style={{
            fontSize: 15,
            fontWeight: 650,
            color: colors.effortel.n400,
            margin: 0,
            letterSpacing: '-0.01em',
          }}
        >
          Frequently asked questions
        </h3>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {FAQ_ITEMS.map(item => {
          const isOpen = openId === item.id;
          const panelId = `faq-panel-${item.id}`;
          const triggerId = `faq-trigger-${item.id}`;

          return (
            <div
              key={item.id}
              style={{
                background: mkt.cardBg,
                border: `1px solid ${mkt.cardBorder}`,
                borderRadius: radius.md,
                overflow: 'hidden',
              }}
            >
              <button
                id={triggerId}
                onClick={() => toggle(item.id)}
                aria-expanded={isOpen}
                aria-controls={panelId}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                  padding: '12px 16px',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: isOpen ? colors.effortel.n200 : mkt.textMuted,
                  fontSize: 14,
                  fontWeight: 600,
                  textAlign: 'left',
                  lineHeight: 1.4,
                  transition: 'color 0.15s',
                }}
              >
                <span>{item.question}</span>
                <ChevronDown
                  size={14}
                  color={mkt.textFaint}
                  style={{
                    flexShrink: 0,
                    transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                    transition: 'transform 0.2s ease',
                  }}
                />
              </button>

              {isOpen && (
                <motion.div
                  id={panelId}
                  role="region"
                  aria-labelledby={triggerId}
                  initial={reducedMotion ? false : { opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  transition={{ duration: reducedMotion ? 0 : 0.2 }}
                  style={{ overflow: 'hidden' }}
                >
                  <div style={{
                    padding: '0 16px 14px',
                    fontSize: 13,
                    color: mkt.textFaint,
                    lineHeight: 1.6,
                  }}>
                    {item.answer}
                  </div>
                </motion.div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
