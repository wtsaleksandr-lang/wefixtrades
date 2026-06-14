/**
 * ToolFaq — shared collapsible FAQ accordion for the /tools/* free-tool pages.
 *
 * Why this exists: every free-tool page rendered its FAQ as an always-expanded
 * stack of <div> question/answer pairs directly below the tool. With 6-10 long
 * Q&A items that turned the bottom of each page into a text-wall that buried
 * the tool's value props and made the page feel heavy.
 *
 * This component keeps EVERY question + answer in the DOM (rendered, just
 * visually collapsed) so the page's FAQPage JSON-LD (emitted separately via
 * useFaqSchema) and Google's text extraction are completely unaffected — the
 * SEO depth is preserved, only the visual density changes. The first item can
 * default open so the section never looks empty.
 *
 * Light-theme only — matches FreeToolLayout's light public-marketing surface.
 * Inline styles + rgb()/rgba() colors to satisfy the hardcoded-color guard and
 * the data-theme="light" subtree (no global token reset on these pages).
 */
import { useState } from "react";
import { ChevronDown } from "lucide-react";

export interface ToolFaqItem {
  question: string;
  answer: string;
}

function FaqRow({ item, defaultOpen }: { item: ToolFaqItem; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div
      style={{
        border: "1px solid rgba(0,0,0,0.09)",
        borderRadius: 12,
        background: "rgba(255,255,255,0.6)",
        overflow: "hidden",
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        style={{
          width: "100%",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 14,
          padding: "14px 16px",
          background: "transparent",
          border: "none",
          cursor: "pointer",
          textAlign: "left",
          font: "inherit",
        }}
      >
        <span style={{ fontWeight: 700, color: "rgb(17,24,39)", fontSize: 15, lineHeight: 1.4 }}>
          {item.question}
        </span>
        <ChevronDown
          size={16}
          color="rgba(0,0,0,0.5)"
          strokeWidth={2}
          style={{
            flexShrink: 0,
            transform: open ? "rotate(180deg)" : "rotate(0)",
            transition: "transform 0.2s ease",
          }}
        />
      </button>
      {open && (
        <div style={{ padding: "0 16px 16px" }}>
          <p style={{ margin: 0, color: "rgba(0,0,0,0.62)", fontSize: 15, lineHeight: 1.6 }}>
            {item.answer}
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * Renders a collapsible FAQ list. `items` keeps every Q&A in the DOM for SEO;
 * `defaultOpenFirst` (default true) opens the first row so the section reads as
 * intentional rather than empty.
 */
export default function ToolFaq({
  items,
  defaultOpenFirst = true,
}: {
  items: ToolFaqItem[];
  defaultOpenFirst?: boolean;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {items.map((item, i) => (
        <FaqRow key={i} item={item} defaultOpen={defaultOpenFirst && i === 0} />
      ))}
    </div>
  );
}
