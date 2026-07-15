/**
 * KeywordExamplesModal — a small top-right cue on a "target keyword" field that
 * opens a modal of example search terms grouped by trade niche. Helps a business
 * owner enter the phrase a customer would actually type (the #1 thing that makes
 * a rank/SERP scan useful). Shared by the rank/SERP tool pages.
 *
 * Uses the project's shadcn Dialog primitive (focus-trap, esc, backdrop) +
 * light-theme lock so the intentional white surface survives the color guard.
 */
import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Lightbulb } from "lucide-react";

const BRAND_PRIMARY = "#0d3cfc";
const BRAND_INK = "#1E1E1E";

const EXAMPLES: { trade: string; keywords: string[] }[] = [
  { trade: "Plumber", keywords: ["plumber near me", "emergency plumber", "drain cleaning", "water heater repair"] },
  { trade: "Electrician", keywords: ["electrician near me", "emergency electrician", "panel upgrade", "ev charger installation"] },
  { trade: "HVAC", keywords: ["ac repair near me", "furnace repair", "hvac installation", "air conditioning service"] },
  { trade: "Roofer", keywords: ["roof repair near me", "roofing contractor", "roof replacement", "storm damage roof repair"] },
  { trade: "Landscaper", keywords: ["landscaping near me", "lawn care service", "landscape design", "sod installation"] },
  { trade: "Painter", keywords: ["house painter near me", "interior painting", "exterior painting", "cabinet painting"] },
  { trade: "General contractor", keywords: ["general contractor near me", "home remodeling", "kitchen remodel", "bathroom renovation"] },
  { trade: "Pest control", keywords: ["pest control near me", "exterminator", "termite treatment", "rodent control"] },
  { trade: "Garage door", keywords: ["garage door repair near me", "garage door installation", "garage door spring repair"] },
  { trade: "Locksmith", keywords: ["locksmith near me", "emergency locksmith", "car lockout", "rekey locks"] },
];

/** Generate the common local-search keyword patterns for any trade the user
 *  types (works for niches not in the curated list). */
function keywordIdeas(t: string): string[] {
  const s = t.replace(/\s+/g, " ").trim();
  if (!s) return [];
  return [
    `${s} near me`,
    `emergency ${s}`,
    `best ${s} near me`,
    `affordable ${s}`,
    `24 hour ${s}`,
    `local ${s}`,
    `${s} services`,
    `${s} cost`,
    `${s} prices`,
  ];
}

function CueTrigger({ testid }: { testid?: string }) {
  return (
    <button
      type="button"
      aria-label="See example keywords by trade"
      title="See example keywords by trade"
      data-testid={testid}
      style={{
        width: 24,
        height: 24,
        borderRadius: "50%",
        border: "1px solid #e5e7eb",
        background: "#f8fafc",
        color: "#64748b",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 0,
        cursor: "pointer",
        transition: "background 150ms ease, color 150ms ease, border-color 150ms ease",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "#eef2ff";
        e.currentTarget.style.borderColor = "#c7d2fe";
        e.currentTarget.style.color = BRAND_PRIMARY;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "#f8fafc";
        e.currentTarget.style.borderColor = "#e5e7eb";
        e.currentTarget.style.color = "#64748b";
      }}
    >
      <Lightbulb size={16} aria-hidden="true" />
    </button>
  );
}

export interface KeywordExamplesModalProps {
  triggerTestId?: string;
}

export function KeywordExamplesModal({
  triggerTestId = "keyword-examples-trigger",
}: KeywordExamplesModalProps) {
  const [q, setQ] = React.useState("");
  const trade = q.trim();
  const tl = trade.toLowerCase();
  const ideas = trade ? keywordIdeas(tl) : [];
  const filtered = trade
    ? EXAMPLES.filter((e) => e.trade.toLowerCase().includes(tl) || e.keywords.some((k) => k.includes(tl)))
    : EXAMPLES;
  return (
    <Dialog>
      <DialogTrigger asChild>
        <span>
          <CueTrigger testid={triggerTestId} />
        </span>
      </DialogTrigger>
      <DialogContent
        data-theme="light"
        data-testid="keyword-examples-modal"
        className="sm:max-w-[560px] sm:rounded-2xl"
      >
        <DialogHeader>
          <DialogTitle style={{ color: BRAND_INK, fontSize: 20, fontWeight: 700 }}>
            Example keywords by trade
          </DialogTitle>
        </DialogHeader>

        <div>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Enter your trade — e.g. plumber, roofer, mobile mechanic"
            aria-label="Your trade or service"
            data-testid="keyword-search-input"
            style={{
              width: "100%",
              boxSizing: "border-box",
              padding: "11px 13px",
              borderRadius: 10,
              border: "1px solid #dbe3ff",
              fontSize: 14,
              color: BRAND_INK,
              outline: "none",
            }}
          />
          <p style={{ fontSize: 12, color: "#64748b", lineHeight: 1.5, margin: "6px 0 0" }}>
            Type your trade for instant keyword ideas, or browse the examples below.
            Add your city for stronger local intent — e.g. <strong>"plumber Denver"</strong>.
          </p>
        </div>

        <div
          style={{
            display: "grid",
            gap: 12,
            marginTop: 12,
            maxHeight: "50vh",
            overflowY: "auto",
            paddingRight: 4,
          }}
        >
          {trade && (
            <div data-testid="keyword-ideas">
              <div style={{ fontSize: 13, fontWeight: 700, color: BRAND_PRIMARY, marginBottom: 6 }}>
                Keyword ideas for &ldquo;{trade}&rdquo;
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {ideas.map((k) => (
                  <span key={k} style={{ fontSize: 12, fontWeight: 600, color: BRAND_PRIMARY, background: "#eef2ff", border: "1px solid #c7d2fe", borderRadius: 999, padding: "4px 10px" }}>
                    {k}
                  </span>
                ))}
              </div>
            </div>
          )}
          {filtered.map((e) => (
            <div key={e.trade}>
              <div style={{ fontSize: 13, fontWeight: 700, color: BRAND_INK, marginBottom: 6 }}>
                {e.trade}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {e.keywords.map((k) => (
                  <span key={k} style={{ fontSize: 12, fontWeight: 600, color: "#334155", background: "#eef2ff", border: "1px solid #dbe3ff", borderRadius: 999, padding: "4px 10px" }}>
                    {k}
                  </span>
                ))}
              </div>
            </div>
          ))}
          {trade && filtered.length === 0 && (
            <p style={{ fontSize: 12, color: "#64748b", margin: 0 }}>
              No curated examples for that trade — use the ideas above as your starting point.
            </p>
          )}
        </div>

        <p style={{ fontSize: 12, color: "#64748b", lineHeight: 1.5, margin: "10px 0 0", paddingTop: 12, borderTop: "1px solid #f1f5f9" }}>
          Tip: run one scan per core service. Your highest-value keyword is usually
          "<em>[your main service] near me</em>".
        </p>
      </DialogContent>
    </Dialog>
  );
}

export default KeywordExamplesModal;
