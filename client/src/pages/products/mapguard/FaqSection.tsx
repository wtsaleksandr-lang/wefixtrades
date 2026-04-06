import { useState, useMemo } from "react";
import { ChevronDown } from "lucide-react";
import { mkt } from "@/theme/tokens";
import { useFaqSchema } from "@/lib/useFaqSchema";
import { HEADING_FONT, BODY_FONT, GLASS, sectionHeading, SECTION_PAD, MAX_W } from "./styles";

const FAQ_ITEMS = [
  {
    q: "How long before I see results?",
    a: "Most clients see improvement within 30\u201360 days. Google needs time to process changes, but our optimizations are designed to move the needle fast. Ongoing plans keep building momentum each month.",
  },
  {
    q: "Do I need to do anything?",
    a: "No. We handle everything \u2014 setup, optimization, posts, reviews, monitoring. You don\u2019t need to log in or learn any tools.",
  },
  {
    q: "Is this SEO?",
    a: "It\u2019s focused specifically on Google Maps visibility \u2014 where your calls actually come from. When someone searches \u201Cplumber near me,\u201D we make sure your business shows up.",
  },
  {
    q: "Can I cancel anytime?",
    a: "Yes. No contracts, no commitments. Monthly plans can be cancelled anytime with no penalty.",
  },
  {
    q: "Do you work with my trade?",
    a: "We work with all trades \u2014 plumbers, electricians, HVAC, roofers, cleaners, landscapers, painters, and more. If you serve local customers, MapGuard is built for you.",
  },
  {
    q: "Do you guarantee rankings?",
    a: "No one can honestly guarantee specific rankings. What we guarantee is a fully optimized, actively managed profile that gives your business the best possible chance of ranking higher in your area.",
  },
];

function FaqItem({ q, a, delay }: { q: string; a: string; delay: number }) {
  const [open, setOpen] = useState(false);

  return (
    <div
      data-reveal="fade-up"
      data-delay={String(delay)}
      style={{
        ...GLASS,
        padding: 0,
        marginBottom: 12,
        overflow: "hidden",
      }}
    >
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          width: "100%",
          padding: "20px 24px",
          background: "transparent",
          border: "none",
          cursor: "pointer",
          textAlign: "left",
          gap: 16,
        }}
      >
        <span
          style={{
            fontFamily: BODY_FONT,
            fontSize: 16,
            fontWeight: 600,
            color: mkt.text,
            lineHeight: 1.4,
          }}
        >
          {q}
        </span>
        <ChevronDown
          size={18}
          color={mkt.accent}
          strokeWidth={2}
          style={{
            flexShrink: 0,
            transition: "transform 0.25s ease",
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
          }}
        />
      </button>

      <div
        style={{
          maxHeight: open ? 300 : 0,
          overflow: "hidden",
          transition: "max-height 0.3s cubic-bezier(0.22, 1, 0.36, 1)",
        }}
      >
        <div
          style={{
            padding: "0 24px 20px",
            fontFamily: BODY_FONT,
            fontSize: 15,
            color: mkt.textMuted,
            lineHeight: 1.7,
          }}
        >
          {a}
        </div>
      </div>
    </div>
  );
}

export default function FaqSection() {
  const faqSchemaItems = useMemo(() => FAQ_ITEMS.map(f => ({ question: f.q, answer: f.a })), []);
  useFaqSchema(faqSchemaItems);

  return (
    <section style={{ ...SECTION_PAD, background: mkt.bg }}>
      <div style={{ ...MAX_W, maxWidth: 720 }}>
        <div style={{ textAlign: "center", marginBottom: 48 }} data-reveal="fade-up">
          <h2 style={sectionHeading}>
            Frequently Asked{" "}
            <span style={{ color: mkt.accent }}>Questions</span>
          </h2>
        </div>

        {FAQ_ITEMS.map((item, i) => (
          <FaqItem key={item.q} q={item.q} a={item.a} delay={i * 80} />
        ))}
      </div>
    </section>
  );
}
