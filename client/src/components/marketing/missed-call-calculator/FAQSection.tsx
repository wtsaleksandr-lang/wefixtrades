import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
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
      'Results are based on the numbers you enter combined with typical ranges for your trade. They are meant as a starting point — adjust the sliders to reflect your actual call volume, booking rate, and job size for the most relevant estimate.',
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
      'No. The booking rate slider accounts for this — it represents the percentage of answered calls that turn into booked jobs. Some callers are existing customers, people comparing prices, or not a fit. The calculator factors this in.',
  },
  {
    id: 'range',
    question: 'Why do the results show a range?',
    answer:
      'Because job values, how serious callers are, and customer behavior vary from business to business and season to season. A single number would suggest a certainty we can\'t guarantee. The range gives you a low-to-high bracket that reflects real-world variation.',
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
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <div style={{
          fontSize: 11,
          fontWeight: 700,
          color: mkt.accent,
          letterSpacing: '0.12em',
          textTransform: 'uppercase' as const,
          marginBottom: 14,
        }}>
          FAQ
        </div>
        <h3
          id="faq-heading"
          style={{
            fontSize: 'clamp(22px, 3vw, 30px)',
            fontWeight: 700,
            color: colors.effortel.n300,
            margin: 0,
            letterSpacing: '-0.025em',
          }}
        >
          Frequently asked questions
        </h3>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {FAQ_ITEMS.map(item => {
          const isOpen = openId === item.id;
          const panelId = `faq-panel-${item.id}`;
          const triggerId = `faq-trigger-${item.id}`;

          return (
            <div
              key={item.id}
              style={{
                border: `1px solid ${mkt.border}`,
                borderRadius: 14,
                overflow: 'hidden',
                transition: 'border-color 0.2s ease',
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
                  gap: 16,
                  padding: '18px 22px',
                  background: isOpen ? mkt.surface : 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  color: mkt.text,
                  fontSize: 15,
                  fontWeight: 600,
                  textAlign: 'left',
                  lineHeight: 1.4,
                  transition: 'background 0.2s ease',
                }}
              >
                <span>{item.question}</span>
                <ChevronDown
                  size={17}
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
                    padding: '0 22px 18px',
                    fontSize: 14,
                    color: mkt.textMuted,
                    lineHeight: 1.7,
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
