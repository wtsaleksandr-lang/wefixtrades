import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { mkt } from "@/theme/tokens";
import { BODY_FONT, GLASS, sectionHeading, SECTION_PAD, MAX_W } from "./styles";

const FAQ_ITEMS = [
  {
    q: "How accurate are the estimates?",
    a: "Estimates are based on the pricing rules you set — base fees, rates, add-ons, difficulty tiers, and modifiers. What the customer sees is calculated from your real numbers, so accuracy is entirely in your control.",
  },
  {
    q: "What pricing models are supported?",
    a: "QuoteQuick supports 10 pricing types: hourly, per unit, per square foot, per linear foot, base + rate, tiered packages, tiered ranges, minimum charge + add-ons, price ranges, and call-for-quote. Most trades use 1–2 of these.",
  },
  {
    q: "Can I update my prices later?",
    a: "Yes. You can change your rates, add-ons, and pricing rules anytime from your dashboard. Changes go live immediately — no republishing needed.",
  },
  {
    q: "How does the widget work on my website?",
    a: "You embed a single line of code on any page. The widget loads automatically, adapts to mobile, and matches your brand colors. It works on WordPress, Wix, Squarespace, and any site that supports HTML.",
  },
  {
    q: "What happens when a customer submits a quote?",
    a: "You get an email with their name, email, phone, quote amount, and all their selections. The lead also appears in your dashboard. If you have follow-ups enabled, automated emails go out on your behalf.",
  },
  {
    q: "Is there a contract?",
    a: "No. Both plans are month-to-month. Cancel anytime with no penalty.",
  },
];

function FaqItem({ q, a, delay }: { q: string; a: string; delay: number }) {
  const [open, setOpen] = useState(false);

  return (
    <div
      data-reveal="fade-up"
      data-delay={String(delay)}
      style={{ ...GLASS, padding: 0, marginBottom: 12, overflow: "hidden" }}
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
