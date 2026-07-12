/**
 * /tools/gbp-post-generator — free AI Google Business Profile post generator.
 *
 * Generates 2-3 ready-to-publish GBP post variants for a trade business.
 * Inputs: business name, trade, post goal (Offer / Update / Event / Tip),
 * optional details. Each variant has a copy-to-clipboard button.
 *
 * Backend: POST /api/tools/gbp-post-generator (server/routes/freeToolsRoutes.ts)
 * → routes through the canonical multi-provider AI engine (chat()); the
 * prompt forbids invented prices/guarantees so the copy stays honest.
 *
 * Conversion layer: shared ToolLeadCapture + ToolUpsellCTA (same as the other
 * free SEO tools). Result-aware cross-sell to MapGuard ("we'll post for you").
 */
import { useMemo, useState } from "react";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import FreeToolLayout from "@/components/marketing/FreeToolLayout";
import ToolFaq from "@/components/marketing/ToolFaq";
import {
  FreeToolFormField,
  FreeToolFormSelect,
  FreeToolFormTextarea,
  FreeToolFormFieldStyles,
  firstEmptyRequired,
  focusFieldById,
} from "@/components/marketing/FreeToolFormField";
import { PageMeta } from "@/components/seo/PageMeta";
import { useFaqSchema } from "@/lib/useFaqSchema";
import { Copy, CheckCircle2, AlertCircle } from "lucide-react";
import { ToolLeadCapture, ToolUpsellCTA } from "@/components/marketing/ToolLeadCapture";

const TOOL_PATH = "/tools/gbp-post-generator";

const GOAL_OPTIONS = [
  { value: "offer", label: "Offer / Promotion" },
  { value: "update", label: "Business Update" },
  { value: "event", label: "Event" },
  { value: "tip", label: "Helpful Tip" },
];

const FAQ_ITEMS = [
  {
    question: "What is a Google Business Profile post?",
    answer:
      "A GBP post is a short update that appears on your Google Business Profile in Search and Maps. Posting regularly keeps your profile active, gives customers a reason to engage, and is a small but real local-ranking signal.",
  },
  {
    question: "How long should a GBP post be?",
    answer:
      "Google allows up to ~1,500 characters, but the first sentence is what shows before the 'read more' fold. This tool keeps each post short and leads with the key message so it reads well in the preview.",
  },
  {
    question: "Does this make up offers or prices?",
    answer:
      "No. The generator is deliberately constrained to honest, generic copy — it will never invent a specific price, discount, guarantee, or claim. If you want exact figures in a post, add them in the optional details field and they'll be used as-is.",
  },
  {
    question: "How often should I post to my GBP?",
    answer:
      "Roughly weekly is a good cadence for most trade businesses. Consistency matters more than volume — a fresh profile signals an active, trustworthy business to both customers and Google.",
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
      aria-label="Copy post"
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

export default function GbpPostGenerator() {
  const [businessName, setBusinessName] = useState("");
  const [trade, setTrade] = useState("");
  const [goal, setGoal] = useState("update");
  const [details, setDetails] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [posts, setPosts] = useState<string[] | null>(null);

  const faqSchemaItems = useMemo(
    () => FAQ_ITEMS.map((f) => ({ question: f.question, answer: f.answer })),
    [],
  );
  useFaqSchema(faqSchemaItems);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPosts(null);
    const missing = firstEmptyRequired([
      { value: businessName, id: "gbp-business", label: "your business name" },
      { value: trade, id: "gbp-trade", label: "your trade / business type" },
    ]);
    if (missing) {
      setError(`Please enter ${missing.label} to generate posts.`);
      focusFieldById(missing.id);
      return;
    }
    setLoading(true);
    try {
      const r = await fetch("/api/tools/gbp-post-generator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessName: businessName.trim(),
          trade: trade.trim(),
          goal,
          details: details.trim(),
        }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || !data?.ok) throw new Error(data?.error || "Couldn't generate posts.");
      setPosts(Array.isArray(data.posts) ? data.posts : []);
    } catch (err: any) {
      setError(err?.message || "Couldn't generate posts. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const form = (
    <form onSubmit={submit} noValidate>
      <FreeToolFormFieldStyles />
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <FreeToolFormField
          id="gbp-business"
          label="Business name"
          value={businessName}
          onChange={setBusinessName}
          required
          autoComplete="organization"
          placeholder="e.g. Smith Plumbing"
          testId="input-gbp-business"
          helpText="Your business name exactly as it appears on your Google Business Profile."
        />
        <FreeToolFormField
          id="gbp-trade"
          label="Trade / business type"
          value={trade}
          onChange={setTrade}
          required
          placeholder="e.g. Plumber, HVAC, Electrician"
          testId="input-gbp-trade"
          helpText="What you do — this shapes the tone and the example services in the post."
        />
        <FreeToolFormSelect
          id="gbp-goal"
          label="Post goal"
          value={goal}
          onChange={setGoal}
          testId="select-gbp-goal"
          helpText="What this post is for. Offer keeps claims generic (no invented prices); Tip positions you as the expert."
        >
          {GOAL_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </FreeToolFormSelect>
        <FreeToolFormTextarea
          id="gbp-details"
          label="Details (optional)"
          value={details}
          onChange={setDetails}
          rows={3}
          placeholder="e.g. We now cover the north side of town; emergency callouts available."
          testId="input-gbp-details"
          helpText="Anything specific to work in — a service, an area, a real date. Only facts you put here will be stated as specific."
        />
      </div>
      <button
        type="submit"
        disabled={loading}
        data-testid="button-gbp-submit"
        style={{
          marginTop: 2,
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
        {loading ? "Writing your posts…" : "Generate posts"}
      </button>
      {error && (
        <div style={{ marginTop: 8, color: "rgb(185,28,28)", fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
          <AlertCircle size={14} /> {error}
        </div>
      )}
    </form>
  );

  const resultPanel = posts ? (
    <div
      style={{
        background: "rgb(255,255,255)",
        border: "1px solid rgba(0,0,0,0.08)",
        borderRadius: 18,
        padding: 20,
        boxShadow: "0 10px 30px rgba(0,0,0,0.06)",
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "rgb(13,60,252)", marginBottom: 10 }}>
        {posts.length} post {posts.length === 1 ? "variant" : "variants"} ready
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {posts.map((p, i) => (
          <div
            key={i}
            data-testid={`gbp-post-${i}`}
            style={{
              border: "1px solid rgba(0,0,0,0.10)",
              borderRadius: 12,
              padding: "14px 16px",
              background: "rgba(13,60,252,0.02)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "rgba(0,0,0,0.45)" }}>
                Variant {i + 1}
              </div>
              <CopyButton value={p} />
            </div>
            <div style={{ fontSize: 14, lineHeight: 1.6, color: "rgb(17,24,39)", whiteSpace: "pre-wrap" }}>{p}</div>
          </div>
        ))}
      </div>

      <ToolUpsellCTA
        sourceTool="gbp-post-generator"
        tone="fix"
        eyebrow="Next step"
        headline="Never run out of fresh GBP posts again"
        body="MapGuard plans your Google Business Profile posts and publishes them for you on a steady weekly cadence — so your profile stays active and ranking without you writing a thing."
        serviceId="mapguard-ongoing"
        ctaLabel="Let us post for you weekly"
      />

      <ToolLeadCapture
        sourceTool="gbp-post-generator"
        sourcePage={TOOL_PATH}
        businessName={businessName.trim() || undefined}
        title="Email me these posts"
        subtitle="Get all the post variants in your inbox so you can schedule them whenever you're ready. No spam."
      />
    </div>
  ) : null;

  return (
    <MarketingLayout>
      <PageMeta
        title="Free Google Business Profile Post Generator — AI GBP posts for trades"
        description="Generate ready-to-publish Google Business Profile posts in seconds. Enter your business name, trade, and goal — get 3 honest, on-brand GBP post variants with copy-to-clipboard."
        canonical={TOOL_PATH}
        keywords={["google business profile post generator", "gbp post ideas", "google business posts", "local seo post generator", "gbp content for trades"]}
      />
      <FreeToolLayout
        eyebrow="Free Tool"
        title="Google Business Profile Post Generator"
        subtitle="Get 3 ready-to-publish GBP post variants for your trade business in seconds — honest copy, no invented prices."
        path={TOOL_PATH}
        breadcrumbLabel="GBP Post Generator"
        form={form}
        result={resultPanel}
      >
        <h2 style={{ fontSize: 22, fontWeight: 800, color: "rgb(30,30,30)", marginTop: 0 }}>Why post to your Google Business Profile?</h2>
        <p>
          A Google Business Profile that posts regularly looks active and
          trustworthy — to customers scrolling your listing and to Google's
          local algorithm. Fresh posts keep your profile in front of people
          searching for your trade in your area, and give them a reason to call.
          The hard part is finding the time and the words every week. This tool
          writes the words for you.
        </p>

        <h2 style={{ fontSize: 22, fontWeight: 800, color: "rgb(30,30,30)" }}>How this tool works</h2>
        <p>
          Enter your business name, your trade, and what the post is for — an
          offer, an update, an event, or a helpful tip. Our AI writes three
          short, distinct variants tuned for a local trade audience, each with a
          soft call-to-action. Pick the one you like, copy it, and paste it into
          your Google Business Profile. No signup, no fabricated claims.
        </p>

        <h2 style={{ fontSize: 22, fontWeight: 800, color: "rgb(30,30,30)" }}>Frequently asked questions</h2>
        <ToolFaq items={FAQ_ITEMS} />
      </FreeToolLayout>
    </MarketingLayout>
  );
}
