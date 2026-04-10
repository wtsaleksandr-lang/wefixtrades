import { useState, useMemo } from "react";
import { ChevronDown } from "lucide-react";
import { mkt } from "@/theme/tokens";
import { useFaqSchema } from "@/lib/useFaqSchema";
import { HEADING_FONT, BODY_FONT, GLASS, sectionHeading, SECTION_PAD, MAX_W } from "./styles";

const FAQ_ITEMS = [
  {
    q: "What exactly does MapGuard do?",
    a: "MapGuard is a fully managed Google Maps visibility service. We optimize your Google Business Profile, monitor your rankings every week, fix issues as they happen, and send you a monthly report showing your progress. You don\u2019t need to do anything.",
  },
  {
    q: "Do I need to do anything?",
    a: "No. We handle everything \u2014 the initial setup, ongoing optimization, posting, and monitoring. You\u2019ll receive a monthly report showing what we did and how your visibility changed. That\u2019s it.",
  },
  {
    q: "What\u2019s the difference between Basic and Pro?",
    a: "Both plans include weekly monitoring and monthly reporting. Pro includes more optimization work each month, which means faster improvements. Pro also adds review response management, competitor tracking, and ongoing keyword optimization. If you\u2019re in a competitive area or have multiple issues to address, Pro gets results faster.",
  },
  {
    q: "What happens each month?",
    a: "Our system scans your visibility and rankings every week. Our team reviews the data, executes optimization work on your profile, and sends you a report at the end of the month showing what changed. Higher plans include more optimization actions per month.",
  },
  {
    q: "How long before I see improvement?",
    a: "Most clients see measurable improvement within 30\u201360 days. Google needs time to process profile changes, but our system starts monitoring and optimizing immediately. Each month builds on the last.",
  },
  {
    q: "Is this the same as SEO?",
    a: "MapGuard focuses specifically on Google Maps and local search visibility \u2014 where most trades businesses get their calls. It\u2019s not website SEO. When someone searches \u201Cplumber near me,\u201D we make sure your business shows up.",
  },
  {
    q: "Can I cancel anytime?",
    a: "Yes. No contracts, no commitments. Monthly plans can be cancelled anytime with no penalty.",
  },
  {
    q: "Do you guarantee rankings?",
    a: "No one can honestly guarantee specific Google rankings. What we guarantee is a fully optimized, actively managed profile with weekly monitoring and real improvements executed every month. We show you the data so you can see the results yourself.",
  },
  {
    q: "Who does the actual work?",
    a: "Our internal team and specialist partners handle all optimization work. You get a dedicated monitoring system that scans your visibility weekly, and our team acts on the findings. Everything is managed for you.",
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
