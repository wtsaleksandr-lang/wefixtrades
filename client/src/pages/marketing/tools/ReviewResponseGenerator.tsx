/**
 * /tools/review-response-generator — free AI review-response generator.
 *
 * Generates 2-3 professional, on-brand replies to a customer review.
 * Inputs: business name, trade, star rating (1-5), the review text, tone
 * (Warm / Professional / Apologetic). Output is rating-appropriate: gracious
 * for 5★, de-escalating + solution-oriented for 1-2★, never defensive.
 *
 * Backend: POST /api/tools/review-response-generator (freeToolsRoutes.ts) →
 * canonical multi-provider AI engine (chat()); prompt forbids fabricated
 * facts/discounts.
 *
 * Conversion layer: shared ToolLeadCapture + ToolUpsellCTA. Result-aware
 * cross-sell to ReputationShield.
 */
import { useMemo, useState } from "react";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import FreeToolLayout from "@/components/marketing/FreeToolLayout";
import {
  FreeToolFormField,
  FreeToolFormSelect,
  FreeToolFormTextarea,
  FreeToolFormFieldStyles,
} from "@/components/marketing/FreeToolFormField";
import { PageMeta } from "@/components/seo/PageMeta";
import { useFaqSchema } from "@/lib/useFaqSchema";
import { Copy, CheckCircle2, AlertCircle, Star } from "lucide-react";
import { ToolLeadCapture, ToolUpsellCTA } from "@/components/marketing/ToolLeadCapture";

const TOOL_PATH = "/tools/review-response-generator";

const TONE_OPTIONS = [
  { value: "warm", label: "Warm" },
  { value: "professional", label: "Professional" },
  { value: "apologetic", label: "Apologetic (for negative reviews)" },
];

const FAQ_ITEMS = [
  {
    question: "Should I reply to every Google review?",
    answer:
      "Yes — replying to reviews (good and bad) is one of the clearest trust signals for both customers and Google. A thoughtful reply to a negative review often does more for your reputation than the original complaint did damage.",
  },
  {
    question: "How should I respond to a 1-star review?",
    answer:
      "Stay calm and never defensive. Thank them for the feedback, take ownership where appropriate, apologise sincerely, and invite them to get in touch directly to make it right. Arguing or blaming the customer in public almost always backfires. This tool defaults to that de-escalating approach for low-star reviews.",
  },
  {
    question: "Does it make up facts or offers?",
    answer:
      "No. The generator will never fabricate discounts, refunds, names, or details that aren't in the review. It writes a genuine, human reply you can edit before posting.",
  },
  {
    question: "Can I change the tone?",
    answer:
      "Yes — pick Warm, Professional, or Apologetic. For 1-2★ reviews the tool leans apologetic and solution-oriented by default, but you can override it.",
  },
];

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          /* clipboard blocked — stays idle */
        }
      }}
      aria-label="Copy reply"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        background: copied ? "rgb(34,197,94)" : "rgba(13,60,252,0.10)",
        color: copied ? "rgb(255,255,255)" : "rgb(13,60,252)",
        border: copied ? "1px solid rgba(34,197,94,0.4)" : "1px solid rgba(13,60,252,0.25)",
        padding: "6px 11px",
        borderRadius: 9,
        fontSize: 12,
        fontWeight: 700,
        cursor: "pointer",
        flexShrink: 0,
      }}
    >
      {copied ? <CheckCircle2 size={14} /> : <Copy size={14} />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

/* Star-rating chooser. Selected state = subtle brand-blue OUTLINE + tint, per
   DESIGN-SYSTEM hard rule 4 (never a bright fill). Help cue lives top-left. */
function RatingPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div style={{ paddingLeft: 26, position: "relative" }}>
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: "rgb(13,60,252)",
          marginBottom: 6,
        }}
      >
        Star rating
      </div>
      <div style={{ display: "flex", gap: 2 }} role="radiogroup" aria-label="Star rating">
        {[1, 2, 3, 4, 5].map((n) => {
          const selected = value === n;
          return (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={`${n} star${n > 1 ? "s" : ""}`}
              data-testid={`rating-${n}`}
              onClick={() => onChange(n)}
              style={{
                flex: 1,
                minHeight: 44,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 4,
                border: selected ? "1.5px solid rgb(13,60,252)" : "1px solid rgba(0,0,0,0.12)",
                background: selected ? "rgba(13,60,252,0.06)" : "rgb(255,255,255)",
                color: selected ? "rgb(13,60,252)" : "rgba(0,0,0,0.55)",
                borderRadius: 10,
                fontSize: 13,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              <Star
                size={14}
                fill={n <= value ? "rgb(245,158,11)" : "none"}
                color={n <= value ? "rgb(245,158,11)" : "rgba(0,0,0,0.35)"}
              />
              {n}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function ReviewResponseGenerator() {
  const [businessName, setBusinessName] = useState("");
  const [trade, setTrade] = useState("");
  const [rating, setRating] = useState(5);
  const [reviewText, setReviewText] = useState("");
  const [tone, setTone] = useState("professional");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [replies, setReplies] = useState<string[] | null>(null);

  const faqSchemaItems = useMemo(
    () => FAQ_ITEMS.map((f) => ({ question: f.question, answer: f.answer })),
    [],
  );
  useFaqSchema(faqSchemaItems);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setReplies(null);
    if (!businessName.trim() || !trade.trim() || !reviewText.trim()) {
      setError("Please fill in your business name, trade, and the review text.");
      return;
    }
    setLoading(true);
    try {
      const r = await fetch("/api/tools/review-response-generator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessName: businessName.trim(),
          trade: trade.trim(),
          rating,
          reviewText: reviewText.trim(),
          tone,
        }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || !data?.ok) throw new Error(data?.error || "Couldn't generate replies.");
      setReplies(Array.isArray(data.replies) ? data.replies : []);
    } catch (err: any) {
      setError(err?.message || "Couldn't generate replies. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const negative = rating <= 2;

  const form = (
    <form onSubmit={submit}>
      <FreeToolFormFieldStyles />
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <FreeToolFormField
          id="rr-business"
          label="Business name"
          value={businessName}
          onChange={setBusinessName}
          required
          autoComplete="organization"
          placeholder="e.g. Smith Plumbing"
          testId="input-rr-business"
          helpText="Your business name — used to sign off the reply naturally."
        />
        <FreeToolFormField
          id="rr-trade"
          label="Trade / business type"
          value={trade}
          onChange={setTrade}
          required
          placeholder="e.g. Plumber, HVAC, Electrician"
          testId="input-rr-trade"
          helpText="What you do — shapes the tone of the reply."
        />
        <RatingPicker value={rating} onChange={setRating} />
        <FreeToolFormTextarea
          id="rr-review"
          label="The customer's review"
          value={reviewText}
          onChange={setReviewText}
          required
          rows={4}
          placeholder="Paste the review you want to reply to…"
          testId="input-rr-review"
          helpText="Paste the exact review text. We acknowledge the customer's specific feedback in the reply."
        />
        <FreeToolFormSelect
          id="rr-tone"
          label="Tone"
          value={tone}
          onChange={setTone}
          testId="select-rr-tone"
          helpText="How the reply should sound. For 1-2★ reviews we lean apologetic and solution-oriented automatically."
        >
          {TONE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </FreeToolFormSelect>
      </div>
      {negative && (
        <div
          style={{
            marginTop: 8,
            padding: "10px 12px",
            borderRadius: 10,
            background: "rgba(245,158,11,0.08)",
            border: "1px solid rgba(245,158,11,0.3)",
            color: "rgb(17,24,39)",
            fontSize: 12,
            lineHeight: 1.5,
          }}
          data-testid="rr-negative-note"
        >
          For a low-star review we'll write calm, de-escalating replies that take
          ownership and invite the customer to get in touch — never defensive.
        </div>
      )}
      <button
        type="submit"
        disabled={loading}
        data-testid="button-rr-submit"
        style={{
          marginTop: 8,
          width: "100%",
          padding: "14px 16px",
          borderRadius: 12,
          background: loading ? "rgba(13,60,252,0.6)" : "rgb(13,60,252)",
          color: "rgb(255,255,255)",
          fontSize: 15,
          fontWeight: 700,
          border: "none",
          cursor: loading ? "default" : "pointer",
        }}
      >
        {loading ? "Drafting replies…" : "Generate replies"}
      </button>
      {error && (
        <div style={{ marginTop: 8, color: "rgb(185,28,28)", fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
          <AlertCircle size={14} /> {error}
        </div>
      )}
    </form>
  );

  const resultPanel = replies ? (
    <div
      style={{
        background: "rgb(255,255,255)",
        border: "1px solid rgba(0,0,0,0.08)",
        borderRadius: 18,
        padding: 20,
        boxShadow: "0 10px 30px rgba(0,0,0,0.06)",
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "rgb(34,197,94)", marginBottom: 10 }}>
        {replies.length} reply {replies.length === 1 ? "option" : "options"} ready
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {replies.map((p, i) => (
          <div
            key={i}
            data-testid={`rr-reply-${i}`}
            style={{
              border: "1px solid rgba(0,0,0,0.10)",
              borderRadius: 12,
              padding: "14px 16px",
              background: "rgba(13,60,252,0.02)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "rgba(0,0,0,0.45)" }}>
                Option {i + 1}
              </div>
              <CopyButton value={p} />
            </div>
            <div style={{ fontSize: 14, lineHeight: 1.6, color: "rgb(17,24,39)", whiteSpace: "pre-wrap" }}>{p}</div>
          </div>
        ))}
      </div>

      <ToolUpsellCTA
        sourceTool="review-response-generator"
        tone="fix"
        eyebrow="Next step"
        headline="Reply to every review — automatically"
        body="ReputationShield drafts an AI reply to each new Google review the moment it lands, flags negative reviews before they do damage, and keeps your response rate at 100% without the daily grind."
        serviceId="reputationshield"
        ctaLabel="Automate your review replies"
      />

      <ToolLeadCapture
        sourceTool="review-response-generator"
        sourcePage={TOOL_PATH}
        businessName={businessName.trim() || undefined}
        title="Email me these replies"
        subtitle="Get the reply options in your inbox so you can post them whenever you're ready. No spam."
      />
    </div>
  ) : null;

  return (
    <MarketingLayout>
      <PageMeta
        title="Free Review Response Generator — AI replies to Google reviews for trades"
        description="Generate professional, on-brand replies to customer reviews in seconds. Gracious for 5-star, calm and solution-oriented for negative reviews — never defensive, never fabricated."
        canonical={TOOL_PATH}
        keywords={["review response generator", "reply to google reviews", "negative review response", "review reply template", "ai review reply"]}
      />
      <FreeToolLayout
        eyebrow="Free Tool"
        title="Review Response Generator"
        subtitle="Paste any customer review and get 3 professional, on-brand reply options — gracious for praise, calm and constructive for criticism."
        path={TOOL_PATH}
        breadcrumbLabel="Review Response Generator"
        form={form}
        result={resultPanel}
      >
        <h2 style={{ fontSize: 22, fontWeight: 800, color: "rgb(30,30,30)", marginTop: 0 }}>Why replying to reviews matters</h2>
        <p>
          Responding to reviews — good and bad — is one of the strongest trust
          signals a local business can send. Customers read your replies to see
          how you handle feedback, and Google treats an active, engaged profile
          as a positive local signal. A calm, professional reply to a tough
          review often wins back the customer and impresses everyone reading it.
        </p>

        <h2 style={{ fontSize: 22, fontWeight: 800, color: "rgb(30,30,30)" }}>How this tool works</h2>
        <p>
          Enter your business name and trade, set the star rating, paste the
          review, and choose a tone. Our AI writes three distinct reply options
          tuned to the rating: warm and grateful for positive reviews, calm and
          solution-oriented for negative ones. It never argues, never blames the
          customer, and never makes up facts or offers. Copy the one you like and
          post it.
        </p>

        <h2 style={{ fontSize: 22, fontWeight: 800, color: "rgb(30,30,30)" }}>Frequently asked questions</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {FAQ_ITEMS.map((item, i) => (
            <div key={i}>
              <div style={{ fontWeight: 700, color: "rgb(17,24,39)", marginBottom: 4 }}>{item.question}</div>
              <div style={{ color: "rgba(0,0,0,0.62)" }}>{item.answer}</div>
            </div>
          ))}
        </div>
      </FreeToolLayout>
    </MarketingLayout>
  );
}
