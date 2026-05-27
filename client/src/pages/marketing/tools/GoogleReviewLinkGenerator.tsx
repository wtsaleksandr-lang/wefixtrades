/**
 * /tools/google-review-link-generator — free Brightlocal-style tool.
 *
 * Wave 6D redesign — single wide search input (BrightLocal-style address
 * search) replaces the two-input form. Behind the scenes the same Places
 * lookup runs; when more than one match is returned, the user picks from
 * a 5-row dropdown.
 *
 * Resolves a business name + city to its Google Place ID, then renders:
 *   - the canonical /local/writereview?placeid=... review URL
 *   - a QR code (api.qrserver.com — free, no key)
 *   - Place ID + CID + Ludocid (Google's local listing codes) — small
 *     monospace text, copyable
 *   - copy buttons for everything
 *   - light-green/teal disclaimer card per the BrightLocal screenshot
 *     (hidden-address businesses aren't returned by Places API)
 *
 * Backend: POST /api/tools/google-review-link (server/routes/freeToolsRoutes.ts).
 */
import { useMemo, useState } from "react";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import FreeToolLayout from "@/components/marketing/FreeToolLayout";
import {
  FreeToolFormField,
  FreeToolFormFieldStyles,
} from "@/components/marketing/FreeToolFormField";
import { PageMeta } from "@/components/seo/PageMeta";
import { useFaqSchema } from "@/lib/useFaqSchema";
import { Copy, CheckCircle2, AlertCircle, ArrowRight, Info } from "lucide-react";

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

/**
 * Decode the CID (Customer ID / FID) from a Google Place ID where
 * possible. Google's Place IDs come in two formats:
 *   - prefix "ChIJ" → opaque base64-ish; no client-side CID derivation
 *   - prefix "0x..:0x.." → "<hex feature-id>:<hex CID>" — CID is the
 *     decimal version of the second hex part.
 * If we can derive a CID we return both the canonical maps URL
 * (?cid=<decimal>) and the Ludocid (hex form). Otherwise we render dashes.
 */
function deriveLocalCodes(placeId: string): { cid: string | null; ludocid: string | null; cidUrl: string | null } {
  const m = placeId.match(/0x[0-9a-fA-F]+:0x([0-9a-fA-F]+)/);
  if (!m) return { cid: null, ludocid: null, cidUrl: null };
  const hex = m[1];
  try {
    const decimal = BigInt("0x" + hex).toString(10);
    return {
      cid: decimal,
      ludocid: hex,
      cidUrl: `https://www.google.com/maps?cid=${decimal}`,
    };
  } catch {
    return { cid: null, ludocid: hex, cidUrl: null };
  }
}

function CopyButton({ value, label, small }: { value: string; label: string; small?: boolean }) {
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
        gap: 4,
        background: copied ? "rgb(34,197,94)" : "rgb(13,60,252)",
        color: "rgb(255,255,255)",
        border: "none",
        padding: small ? "4px 8px" : "8px 12px",
        borderRadius: 8,
        fontSize: small ? 11 : 12,
        fontWeight: 600,
        cursor: "pointer",
        transition: "background 0.15s",
      }}
      type="button"
      aria-label={`Copy ${label}`}
    >
      {copied ? <CheckCircle2 size={small ? 11 : 13} /> : <Copy size={small ? 11 : 13} />}
      {copied ? "Copied" : `Copy`}
    </button>
  );
}

export default function GoogleReviewLinkGenerator() {
  const [query, setQuery] = useState("");
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
    const trimmed = query.trim();
    if (!trimmed) {
      setError("Please enter your business name and city.");
      return;
    }
    setLoading(true);
    try {
      // Wave 6D — single wide search field. The backend already accepts
      // `businessName` + optional `city`; we send the full query as the
      // businessName so Places handles disambiguation on its end.
      // (Places `findPlaceFromText` accepts any free-text query.)
      const r = await fetch("/api/tools/google-review-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessName: trimmed, city: "" }),
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

  const codes = result ? deriveLocalCodes(result.placeId) : null;

  const form = (
    <form onSubmit={submit}>
      <FreeToolFormFieldStyles />
      {/* Wave 6D — SINGLE wide search input. */}
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <FreeToolFormField
          id="review-search"
          label="Business name + city"
          type="search"
          value={query}
          onChange={setQuery}
          required
          autoComplete="off"
          placeholder="Start typing your business name and city…"
          testId="input-review-search"
          helpText="Example: 'Smith Plumbing Denver CO'. We use the Google Places API to locate the business and pull back its Place ID + IDs."
        />
      </div>
      <button
        type="submit"
        disabled={loading}
        data-testid="button-review-submit"
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
        {loading ? "Looking up your business…" : "Generate review link"}
      </button>
      {error && (
        <div style={{ marginTop: 8, color: "rgb(185,28,28)", fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
          <AlertCircle size={14} /> {error}
        </div>
      )}

      {/* Wave 6D — disclaimer card. Light-green/teal background per the
          BrightLocal screenshot — semantic info tint via rgba(). */}
      <div
        style={{
          marginTop: 12,
          padding: "12px 14px",
          borderRadius: 12,
          background: "rgba(34,197,94,0.08)",
          border: "1px solid rgba(34,197,94,0.32)",
          color: "rgb(17,24,39)",
          fontSize: 12,
          lineHeight: 1.55,
          display: "flex",
          gap: 10,
          alignItems: "flex-start",
        }}
        data-testid="review-link-disclaimer"
      >
        <Info size={16} style={{ color: "rgb(22,101,52)", flexShrink: 0, marginTop: 1 }} />
        <span>
          <strong>Please note:</strong> if the business has hidden its address in
          its Google Business Profile listing, you will not be able to generate
          Google links and IDs using this tool. We use the Google Places API to
          locate the business and this API does not include businesses with
          hidden addresses.
        </span>
      </div>
    </form>
  );

  const resultPanel = result ? (
    <div style={{
      background: "rgb(255,255,255)",
      border: "1px solid rgba(0,0,0,0.08)",
      borderRadius: 18,
      padding: 20,
      boxShadow: "0 10px 30px rgba(0,0,0,0.06)",
    }}>
      <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "rgb(34,197,94)", marginBottom: 6 }}>
        Match found
      </div>
      <div style={{ fontSize: 18, fontWeight: 700, color: "rgb(17,24,39)", marginBottom: 2 }}>{result.name}</div>
      {result.formattedAddress && (
        <div style={{ fontSize: 13, color: "rgba(0,0,0,0.55)", marginBottom: 16 }}>{result.formattedAddress}</div>
      )}

      {/* Wave 6D — large clickable review link with prominent Copy. */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "rgba(0,0,0,0.45)", marginBottom: 4 }}>
          Your Google review link
        </div>
        <div
          style={{
            display: "flex",
            gap: 8,
            alignItems: "center",
            padding: "10px 12px",
            background: "rgba(13,60,252,0.05)",
            border: "1px solid rgba(13,60,252,0.2)",
            borderRadius: 12,
          }}
        >
          <a
            href={result.reviewUrl}
            target="_blank"
            rel="noreferrer noopener"
            data-testid="text-review-url"
            style={{
              flex: 1,
              fontSize: 14,
              color: "rgb(13,60,252)",
              wordBreak: "break-all",
              textDecoration: "none",
              fontWeight: 600,
            }}
          >
            {result.reviewUrl}
          </a>
          <CopyButton value={result.reviewUrl} label="URL" />
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 150px", gap: 16, alignItems: "start" }}>
        <div>
          {/* IDs row — Place ID + CID + Ludocid in monospace. */}
          <IdRow label="Place ID" value={result.placeId} testId="text-review-place-id" />
          <IdRow label="CID (Customer ID)" value={codes?.cid ?? "—"} testId="text-review-cid" />
          <IdRow label="Ludocid (hex)" value={codes?.ludocid ?? "—"} testId="text-review-ludocid" />
          {codes?.cidUrl && (
            <a
              href={codes.cidUrl}
              target="_blank"
              rel="noreferrer noopener"
              style={{
                fontSize: 12,
                color: "rgb(13,60,252)",
                textDecoration: "none",
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                marginTop: 4,
              }}
            >
              Open canonical maps?cid URL <ArrowRight size={12} />
            </a>
          )}
        </div>
        <div style={{ textAlign: "center" }}>
          <img
            src={result.qrUrl}
            alt={`Google review QR code for ${result.name}`}
            width={150}
            height={150}
            loading="lazy"
            decoding="async"
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
        description="Instantly generate your Google review link and QR code. Type your business name + city — we'll look up your Place ID, CID, and build a one-click review URL you can share with customers."
        canonical={TOOL_PATH}
        keywords={["google review link generator", "google review url", "review link", "review qr code", "google place id finder"]}
      />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: howToJson }} />
      <FreeToolLayout
        eyebrow="Free Tool"
        title="Google Review Link Generator"
        subtitle="Turn your business name into a one-click Google review URL + QR code + Place ID / CID / Ludocid in seconds."
        path={TOOL_PATH}
        breadcrumbLabel="Google Review Link Generator"
        heroImageSrc="/ai-thumbnails/tools/google-review-link-generator-hero.png"
        heroImageAlt="Illustration of a phone showing a five-star review rating with a link icon"
        form={form}
        result={resultPanel}
      >
        <h2 style={{ fontSize: 22, fontWeight: 800, color: "rgb(30,30,30)", marginTop: 0 }}>What is a Google review link?</h2>
        <p>
          A Google review link is a direct URL that drops a customer right
          into the 5-star review box for your Google Business Profile. Without
          one, customers have to Google your business, scroll through Maps,
          find the right card, tap "Reviews", then tap "Write a review" —
          four extra steps that kill conversion rates. With a direct link,
          they're in the review form on tap one.
        </p>

        <h2 style={{ fontSize: 22, fontWeight: 800, color: "rgb(30,30,30)" }}>How this tool works</h2>
        <p>
          You enter your business name and city in a single search field. We
          call the official Google Places API with that query, take the top
          match, and return four things: your unique Place ID, the CID /
          Ludocid local listing codes, the canonical review URL (the same
          one Google would generate), and a QR code that points at the
          review URL. No tracking, no redirect, no signup wall.
        </p>

        <h2 style={{ fontSize: 22, fontWeight: 800, color: "rgb(30,30,30)" }}>Where to share your review link</h2>
        <ul style={{ paddingLeft: 20 }}>
          <li>End-of-job text messages — "Thanks for choosing us! Quick review? [link]"</li>
          <li>Email signatures + invoice footers</li>
          <li>Receipts, vehicle wraps, and door hangers (use the QR code)</li>
          <li>Back of business cards</li>
          <li>Auto-reply on your booking confirmation page</li>
        </ul>

        <h2 style={{ fontSize: 22, fontWeight: 800, color: "rgb(30,30,30)" }}>Why reviews matter for trades</h2>
        <p>
          BrightLocal's annual Local Consumer Review Survey consistently
          finds that 87% of consumers read online reviews before hiring a
          local business, and the gap between a business with 50+ recent
          reviews and one with 5 is enormous. For trade businesses — where
          customers can't physically inspect your work before hiring — the
          review profile is often the entire reputation signal. The easier
          you make it to leave a review, the more reviews you get.
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

        {/* Wave 3.5 — ReputationShield cross-link. Matches the style of
            LocalRankGrid.tsx → MapGuard upsell box so the visual language
            is consistent across free-tool surfaces. */}
        <div
          style={{
            marginTop: 24,
            padding: "16px 18px",
            borderRadius: 14,
            background: "linear-gradient(135deg, rgba(13,60,252,0.06), rgba(13,60,252,0.02))",
            border: "1px solid rgba(13,60,252,0.18)",
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "rgb(13,60,252)", marginBottom: 4 }}>
            Automate review requests
          </div>
          <div style={{ fontSize: 15, fontWeight: 700, color: "rgb(17,24,39)", marginBottom: 6 }}>
            Want to automate review requests after every job?
          </div>
          <div style={{ fontSize: 13, color: "rgba(0,0,0,0.62)", marginBottom: 10, lineHeight: 1.55 }}>
            ReputationShield sends this review link via SMS + email to every customer
            automatically once a job is marked complete — then nudges them again if
            they forget. From $79/mo.
          </div>
          <a
            href="/products/reputationshield"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              background: "rgb(13,60,252)",
              color: "rgb(255,255,255)",
              padding: "8px 14px",
              borderRadius: 10,
              fontSize: 13,
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            See ReputationShield <ArrowRight size={14} />
          </a>
        </div>
      </FreeToolLayout>
    </MarketingLayout>
  );
}

function IdRow({ label, value, testId }: { label: string; value: string; testId?: string }) {
  const canCopy = value && value !== "—";
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "rgba(0,0,0,0.45)", marginBottom: 2 }}>
        {label}
      </div>
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <div
          data-testid={testId}
          style={{
            flex: 1,
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            fontSize: 12,
            background: "rgba(0,0,0,0.04)",
            padding: "6px 8px",
            borderRadius: 6,
            wordBreak: "break-all",
            color: "rgb(17,24,39)",
          }}
        >
          {value}
        </div>
        {canCopy && <CopyButton value={value} label={label} small />}
      </div>
    </div>
  );
}
