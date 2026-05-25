/**
 * /tools/google-review-link-generator — free Brightlocal-style tool.
 *
 * Resolves a business name + city to its Google Place ID, then renders:
 *   - the canonical /local/writereview?placeid=... review URL
 *   - a QR code (api.qrserver.com — free, no key)
 *   - copy buttons for the URL + Place ID
 *
 * Backend: POST /api/tools/google-review-link (server/routes/freeToolsRoutes.ts).
 */
import { useMemo, useState } from "react";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import FreeToolLayout from "@/components/marketing/FreeToolLayout";
import { PageMeta } from "@/components/seo/PageMeta";
import { useFaqSchema } from "@/lib/useFaqSchema";
import { Copy, CheckCircle2, AlertCircle } from "lucide-react";

const TOOL_PATH = "/tools/google-review-link-generator";

const FAQ_ITEMS = [
  {
    question: "What is a Google review link?",
    answer:
      "A Google review link is a short URL that drops customers directly into the 5-star review form for your Google Business Profile. Instead of asking customers to search for you, hunt through Maps, and find the review button, you send them straight to the form — which roughly triples completion rates.",
  },
  {
    question: "How does this tool find my Place ID?",
    answer:
      "We use the Google Places API to look up your business by name + city. If we find a match, you'll see your Place ID, a one-click review URL, and a QR code you can print on receipts, business cards, or invoices.",
  },
  {
    question: "Is the review link safe to share?",
    answer:
      "Yes. The URL format (search.google.com/local/writereview) is the official Google-hosted review form. We don't add tracking, redirects, or anything custom — it's the same link Google would build internally.",
  },
  {
    question: "Why use a QR code?",
    answer:
      "QR codes work great on physical surfaces: receipts, vehicle wraps, door hangers, invoices, the back of business cards. Customers point a phone camera, tap the popup, and land on your review form in two seconds.",
  },
  {
    question: "What if my business doesn't show up?",
    answer:
      "Add your city or street to the search — \"Smith Plumbing\" alone is too generic. If you still don't see results, your Google Business Profile may not be claimed or may be hidden by a duplicate listing. Run the Full Audit to diagnose.",
  },
];

interface ResultPayload {
  placeId: string;
  reviewUrl: string;
  qrUrl: string;
  name: string;
  formattedAddress?: string | null;
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const onClick = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — UI just stays in idle state */
    }
  };
  return (
    <button
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        background: copied ? "#22C55E" : "#0d3cfc",
        color: "#fff",
        border: "none",
        padding: "8px 12px",
        borderRadius: 10,
        fontSize: 12,
        fontWeight: 600,
        cursor: "pointer",
        transition: "background 0.15s",
      }}
      type="button"
      aria-label={`Copy ${label}`}
    >
      {copied ? <CheckCircle2 size={13} /> : <Copy size={13} />}
      {copied ? "Copied" : `Copy ${label}`}
    </button>
  );
}

export default function GoogleReviewLinkGenerator() {
  const [businessName, setBusinessName] = useState("");
  const [city, setCity] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ResultPayload | null>(null);

  const faqSchemaItems = useMemo(
    () => FAQ_ITEMS.map((f) => ({ question: f.question, answer: f.answer })),
    [],
  );
  useFaqSchema(faqSchemaItems);

  // HowTo JSON-LD — the tool is literally a 3-step "how to get your
  // Google review link" instruction. Drops a HowTo rich-result block
  // crawlers can promote.
  const howToJson = useMemo(
    () => JSON.stringify({
      "@context": "https://schema.org",
      "@type": "HowTo",
      name: "How to get your Google review link",
      step: [
        { "@type": "HowToStep", position: 1, name: "Enter your business name + city", text: "Type your Google Business Profile name and the city where you're listed." },
        { "@type": "HowToStep", position: 2, name: "We look up your Place ID", text: "We query the Google Places API for your business and pull back your unique Place ID." },
        { "@type": "HowToStep", position: 3, name: "Share the review link or QR code", text: "Copy the review URL and paste it into emails, invoices, or texts — or print the QR code." },
      ],
    }),
    [],
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);
    if (!businessName.trim()) {
      setError("Please enter your business name.");
      return;
    }
    setLoading(true);
    try {
      const r = await fetch("/api/tools/google-review-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessName, city }),
      });
      const data = await r.json();
      if (!r.ok || !data?.ok) throw new Error(data?.error || "Lookup failed.");
      setResult({
        placeId: data.placeId,
        reviewUrl: data.reviewUrl,
        qrUrl: data.qrUrl,
        name: data.name,
        formattedAddress: data.formattedAddress,
      });
    } catch (err: any) {
      setError(err?.message || "Lookup failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const form = (
    <form onSubmit={submit}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <input
          type="text"
          value={businessName}
          onChange={(e) => setBusinessName(e.target.value)}
          placeholder="Business name"
          aria-label="Business name"
          style={{
            padding: "12px 14px",
            borderRadius: 12,
            border: "1px solid rgba(0,0,0,0.10)",
            fontSize: 14,
            background: "#fff",
            outline: "none",
          }}
          data-testid="input-review-business"
        />
        <input
          type="text"
          value={city}
          onChange={(e) => setCity(e.target.value)}
          placeholder="City (optional)"
          aria-label="City"
          style={{
            padding: "12px 14px",
            borderRadius: 12,
            border: "1px solid rgba(0,0,0,0.10)",
            fontSize: 14,
            background: "#fff",
            outline: "none",
          }}
          data-testid="input-review-city"
        />
      </div>
      <button
        type="submit"
        disabled={loading}
        data-testid="button-review-submit"
        style={{
          marginTop: 12,
          width: "100%",
          padding: "12px 16px",
          borderRadius: 12,
          background: loading ? "rgba(13,60,252,0.6)" : "#0d3cfc",
          color: "#fff",
          fontSize: 14,
          fontWeight: 700,
          border: "none",
          cursor: loading ? "default" : "pointer",
        }}
      >
        {loading ? "Looking up your business…" : "Generate review link"}
      </button>
      {error && (
        <div style={{ marginTop: 10, color: "#B91C1C", fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
          <AlertCircle size={14} /> {error}
        </div>
      )}
    </form>
  );

  const resultPanel = result ? (
    <div style={{
      background: "#fff",
      border: "1px solid rgba(0,0,0,0.08)",
      borderRadius: 18,
      padding: 20,
      boxShadow: "0 10px 30px rgba(0,0,0,0.06)",
    }}>
      <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#22C55E", marginBottom: 6 }}>
        Match found
      </div>
      <div style={{ fontSize: 18, fontWeight: 700, color: "#111827", marginBottom: 2 }}>{result.name}</div>
      {result.formattedAddress && (
        <div style={{ fontSize: 13, color: "rgba(0,0,0,0.55)", marginBottom: 16 }}>{result.formattedAddress}</div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 160px", gap: 16, alignItems: "start" }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "rgba(0,0,0,0.45)", marginBottom: 4 }}>
            Place ID
          </div>
          <div style={{
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            fontSize: 12,
            background: "rgba(0,0,0,0.04)",
            padding: "8px 10px",
            borderRadius: 8,
            wordBreak: "break-all",
            marginBottom: 8,
          }} data-testid="text-review-place-id">{result.placeId}</div>
          <CopyButton value={result.placeId} label="Place ID" />

          <div style={{ height: 16 }} />

          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "rgba(0,0,0,0.45)", marginBottom: 4 }}>
            Review URL
          </div>
          <a
            href={result.reviewUrl}
            target="_blank"
            rel="noreferrer noopener"
            style={{
              fontSize: 12,
              color: "#0d3cfc",
              wordBreak: "break-all",
              display: "block",
              marginBottom: 8,
              textDecoration: "none",
            }}
            data-testid="text-review-url"
          >
            {result.reviewUrl}
          </a>
          <div style={{ display: "flex", gap: 8 }}>
            <CopyButton value={result.reviewUrl} label="URL" />
            <a
              href={result.reviewUrl}
              target="_blank"
              rel="noreferrer noopener"
              style={{
                display: "inline-flex",
                alignItems: "center",
                background: "transparent",
                color: "#0d3cfc",
                border: "1px solid rgba(13,60,252,0.3)",
                padding: "8px 12px",
                borderRadius: 10,
                fontSize: 12,
                fontWeight: 600,
                textDecoration: "none",
              }}
            >
              Open in new tab
            </a>
          </div>
        </div>
        <div style={{ textAlign: "center" }}>
          <img
            src={result.qrUrl}
            alt={`Google review QR code for ${result.name}`}
            width={150}
            height={150}
            style={{ borderRadius: 12, border: "1px solid rgba(0,0,0,0.08)" }}
            data-testid="img-review-qr"
          />
          <div style={{ fontSize: 11, color: "rgba(0,0,0,0.45)", marginTop: 6 }}>Scan to review</div>
        </div>
      </div>
    </div>
  ) : null;

  return (
    <MarketingLayout>
      <PageMeta
        title="Free Google Review Link Generator — get your review URL + QR code"
        description="Instantly generate your Google review link and QR code. Enter your business name and city — we'll look up your Place ID and build a one-click review URL you can share with customers."
        canonical={TOOL_PATH}
        keywords={["google review link generator", "google review url", "review link", "review qr code", "google place id finder"]}
      />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: howToJson }} />
      <FreeToolLayout
        eyebrow="Free Tool"
        title="Google Review Link Generator"
        subtitle="Turn your business name into a one-click Google review URL + QR code in seconds."
        path={TOOL_PATH}
        breadcrumbLabel="Google Review Link Generator"
        form={form}
        result={resultPanel}
      >
        <h2 style={{ fontSize: 22, fontWeight: 800, color: "#1E1E1E", marginTop: 0 }}>What is a Google review link?</h2>
        <p>
          A Google review link is a direct URL that drops a customer right
          into the 5-star review box for your Google Business Profile. Without
          one, customers have to Google your business, scroll through Maps,
          find the right card, tap "Reviews", then tap "Write a review" —
          four extra steps that kill conversion rates. With a direct link,
          they're in the review form on tap one.
        </p>

        <h2 style={{ fontSize: 22, fontWeight: 800, color: "#1E1E1E" }}>How this tool works</h2>
        <p>
          You enter your business name and (optionally) the city you operate
          in. We call the official Google Places API with that query, take
          the top match, and return three things: your unique Place ID, the
          canonical review URL (the same one Google would generate), and a
          QR code that points at the review URL. No tracking, no redirect,
          no signup wall.
        </p>

        <h2 style={{ fontSize: 22, fontWeight: 800, color: "#1E1E1E" }}>Where to share your review link</h2>
        <ul style={{ paddingLeft: 20 }}>
          <li>End-of-job text messages — "Thanks for choosing us! Quick review? [link]"</li>
          <li>Email signatures + invoice footers</li>
          <li>Receipts, vehicle wraps, and door hangers (use the QR code)</li>
          <li>Back of business cards</li>
          <li>Auto-reply on your booking confirmation page</li>
        </ul>

        <h2 style={{ fontSize: 22, fontWeight: 800, color: "#1E1E1E" }}>Why reviews matter for trades</h2>
        <p>
          BrightLocal's annual Local Consumer Review Survey consistently
          finds that 87% of consumers read online reviews before hiring a
          local business, and the gap between a business with 50+ recent
          reviews and one with 5 is enormous. For trade businesses — where
          customers can't physically inspect your work before hiring — the
          review profile is often the entire reputation signal. The easier
          you make it to leave a review, the more reviews you get.
        </p>

        <h2 style={{ fontSize: 22, fontWeight: 800, color: "#1E1E1E" }}>Frequently asked questions</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {FAQ_ITEMS.map((item, i) => (
            <div key={i}>
              <div style={{ fontWeight: 700, color: "#111827", marginBottom: 4 }}>{item.question}</div>
              <div style={{ color: "rgba(0,0,0,0.62)" }}>{item.answer}</div>
            </div>
          ))}
        </div>
      </FreeToolLayout>
    </MarketingLayout>
  );
}
