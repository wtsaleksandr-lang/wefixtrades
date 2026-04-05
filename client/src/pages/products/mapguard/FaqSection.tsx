import { useState, useMemo } from "react";
import { ChevronDown } from "lucide-react";
import { mkt } from "@/theme/tokens";
import { useFaqSchema } from "@/lib/useFaqSchema";
import { HEADING_FONT, BODY_FONT, GLASS, sectionHeading, SECTION_PAD, MAX_W } from "./styles";

const FAQ_ITEMS = [
  {
    q: "How fast will I see results?",
    a: "Most clients see improved visibility within 2–4 weeks. Google needs time to process changes, but our optimizations are designed to move the needle fast. Ongoing plans continue building momentum each month.",
  },
  {
    q: "Do I need to give you access to my Google account?",
    a: "We'll need limited access to your Google Business Profile to make the changes. We'll walk you through a simple process that keeps your account secure — no passwords shared.",
  },
  {
    q: "Do you guarantee ranking?",
    a: "No one can guarantee specific rankings — be cautious of anyone who does. What we can guarantee is a properly optimized profile that gives your business the best possible chance of ranking higher for your service and area.",
  },
  {
    q: "Can I cancel anytime?",
    a: "Yes. There are no contracts or commitments on our monthly plans. If you're on a Growth or Pro plan, you can cancel anytime with no penalty.",
  },
  {
    q: "Do you work with my trade?",
    a: "We work with all trades — plumbers, electricians, HVAC, roofers, cleaners, landscapers, painters, and more. If you serve local customers, MapGuard is built for you.",
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
