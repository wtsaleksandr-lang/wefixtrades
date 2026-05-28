/**
 * /tools/citation-checker — free citation presence sweep.
 *
 * Quick site:<directory> "<business>" check across 10 popular citation
 * sources (Yelp, BBB, Angi, Thumbtack, YellowPages, Houzz, HomeAdvisor,
 * MapQuest, Foursquare, Manta). Returns a Found / Missing / Unable-to-check
 * row per source, with a clear disclaimer that the paid audit checks 50+.
 *
 * Backend: POST /api/tools/citation-checker (Serper `site:` queries).
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
import { CheckCircle2, XCircle, HelpCircle, ExternalLink, AlertCircle } from "lucide-react";
import {
  BarComparisonCard,
  DonutChart,
} from "@/components/ui/visual-primitives";

const TOOL_PATH = "/tools/citation-checker";

const FAQ_ITEMS = [
  {
    question: "What is a citation?",
    answer:
      "A citation is any mention of your business Name, Address, and Phone (NAP) on a third-party website — Yelp, BBB, Angi, YellowPages, etc. Citations are one of the top three local-SEO ranking signals, especially for younger businesses.",
  },
  {
    question: "Why do citations matter?",
    answer:
      "Google triangulates business legitimacy from cross-referencing citations across the web. The more high-quality directories carry consistent NAP for your business, the more trust your Google Business Profile accumulates — which lifts your Local Pack ranking.",
  },
  {
    question: "What does \"Missing\" mean?",
    answer:
      "We searched the directory for your business by name and didn't find a match. It may genuinely not be listed, or your listing may be under a different name spelling. Click through to the directory and confirm before assuming.",
  },
  {
    question: "What does \"Unable to check\" mean?",
    answer:
      "The directory's search response failed, timed out, or rate-limited us during this run. Try the check again in a minute, or run the Full Audit for a deeper sweep.",
  },
  {
    question: "How does this differ from the Full Audit?",
    answer:
      "This free check covers 10 of the most popular directories. The Full WeFixTrades Audit ($9.80) checks 50+ citation sources, flags NAP inconsistencies (where your phone or address doesn't match across sites), and prioritises which fixes will move the needle.",
  },
];

interface ResultRow {
  source: string;
  label: string;
  status: "found" | "missing" | "unable-to-check";
  url?: string;
}

function StatusBadge({ status }: { status: ResultRow["status"] }) {
  if (status === "found") {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "#22C55E", fontWeight: 600, fontSize: 12 }}>
        <CheckCircle2 size={14} /> Found
      </span>
    );
  }
  if (status === "missing") {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "#B91C1C", fontWeight: 600, fontSize: 12 }}>
        <XCircle size={14} /> Missing
      </span>
    );
  }
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "rgba(0,0,0,0.45)", fontWeight: 600, fontSize: 12 }}>
      <HelpCircle size={14} /> Unable to check
    </span>
  );
}

export default function CitationChecker() {
  const [businessName, setBusinessName] = useState("");
  const [city, setCity] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ results: ResultRow[]; summary: { checked: number; found: number; missing: number } } | null>(null);

  const faqSchemaItems = useMemo(() => FAQ_ITEMS.map((f) => ({ question: f.question, answer: f.answer })), []);
  useFaqSchema(faqSchemaItems);

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
      const r = await fetch("/api/tools/citation-checker", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessName, city, phone }),
      });
      const data = await r.json();
      if (!r.ok || !data?.ok) throw new Error(data?.error || "Check failed.");
      setResult({ results: data.results || [], summary: data.summary });
    } catch (err: any) {
      setError(err?.message || "Check failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const form = (
    <form onSubmit={submit}>
      <FreeToolFormFieldStyles />
      {/* DESIGN-SYSTEM compliance (2026-05-25 audit):
          - title-in-field via floating label
          - help cue top-left per component
          - 2px gap between stacked inputs
          - 52px input height, fontSize 15 */}
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <FreeToolFormField
          id="citation-business"
          label="Business name"
          value={businessName}
          onChange={setBusinessName}
          required
          autoComplete="organization"
          testId="input-citation-business"
          helpText="Your registered business name as it appears on Google."
        />
        <FreeToolFormField
          id="citation-city"
          label="City"
          value={city}
          onChange={setCity}
          autoComplete="address-level2"
          testId="input-citation-city"
          helpText="City where your business operates."
        />
        <FreeToolFormField
          id="citation-phone"
          label="Phone (optional)"
          type="tel"
          inputMode="tel"
          value={phone}
          onChange={setPhone}
          autoComplete="tel"
          testId="input-citation-phone"
          helpText="Helps match against directories that list phone numbers."
        />
      </div>
      <button
        type="submit"
        disabled={loading}
        data-testid="button-citation-submit"
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
        {loading ? "Checking 10 directories…" : "Check citations"}
      </button>
      {error && (
        <div style={{ marginTop: 8, color: "rgb(185,28,28)", fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
          <AlertCircle size={14} /> {error}
        </div>
      )}
    </form>
  );

  // Wave 73b — derive 3-way segment counts from the raw status list
  // (server's `summary.missing` lumps missing + unable-to-check together).
  const foundCount = result ? result.results.filter((r) => r.status === "found").length : 0;
  const missingCount = result ? result.results.filter((r) => r.status === "missing").length : 0;
  const unableCount = result ? result.results.filter((r) => r.status === "unable-to-check").length : 0;
  // Clean = listed correctly (found). Flagged = missing or unable-to-check.
  const cleanCount = foundCount;
  const flaggedCount = missingCount + unableCount;

  const resultPanel = result ? (
    <div style={{
      background: "rgb(255,255,255)",
      border: "1px solid rgba(0,0,0,0.08)",
      borderRadius: 18,
      padding: 20,
      boxShadow: "0 10px 30px rgba(0,0,0,0.06)",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#0d3cfc" }}>
          Citation snapshot
        </div>
        <div style={{ fontSize: 13, color: "rgba(0,0,0,0.65)" }}>
          <strong style={{ color: "#22C55E" }}>{result.summary.found}</strong> found · <strong style={{ color: "#B91C1C" }}>{result.summary.missing}</strong> missing of {result.summary.checked}
        </div>
      </div>

      {/* Wave 73b — KPI primitives above the directory table. */}
      <div
        data-testid="citation-kpi-cards"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          gap: 14,
          marginBottom: 16,
        }}
      >
        <div style={{ padding: 14, border: "1px solid rgba(0,0,0,0.06)", borderRadius: 12, background: "rgb(255,255,255)" }}>
          <DonutChart
            title="Listing breakdown"
            centerLabel={String(result.summary.checked)}
            centerSub="directories"
            segments={[
              { label: "Listed", value: foundCount, color: "emerald" },
              { label: "Missing", value: missingCount, color: "crimson" },
              { label: "Unable to check", value: unableCount, color: "amber" },
            ]}
          />
        </div>
        <div style={{ padding: 14, border: "1px solid rgba(0,0,0,0.06)", borderRadius: 12, background: "rgb(255,255,255)" }}>
          <BarComparisonCard
            title="Clean vs flagged"
            items={[
              { label: "Clean (listed)", value: cleanCount, color: "emerald" },
              { label: "Flagged (missing / errored)", value: flaggedCount, color: "crimson" },
            ]}
          />
        </div>
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ textAlign: "left", color: "rgba(0,0,0,0.5)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em" }}>
            <th style={{ padding: "6px 4px" }}>Directory</th>
            <th style={{ padding: "6px 4px" }}>Status</th>
            <th style={{ padding: "6px 4px" }}>Link</th>
          </tr>
        </thead>
        <tbody>
          {result.results.map((row) => (
            <tr key={row.source} style={{ borderTop: "1px solid rgba(0,0,0,0.05)" }}>
              <td style={{ padding: "10px 4px", fontWeight: 600, color: "#111827" }}>{row.label}</td>
              <td style={{ padding: "10px 4px" }}><StatusBadge status={row.status} /></td>
              <td style={{ padding: "10px 4px" }}>
                {row.url ? (
                  <a href={row.url} target="_blank" rel="noreferrer noopener" style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "#0d3cfc", textDecoration: "none", fontSize: 12 }}>
                    View <ExternalLink size={11} />
                  </a>
                ) : (
                  <span style={{ color: "rgba(0,0,0,0.35)", fontSize: 12 }}>—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ marginTop: 12, fontSize: 12, color: "rgba(0,0,0,0.5)", lineHeight: 1.5 }}>
        Quick check of 10 popular directories. The Full Audit checks 50+ citation sources and flags NAP inconsistencies.
      </div>
    </div>
  ) : null;

  return (
    <MarketingLayout>
      <PageMeta
        title="Free Citation Checker — see if your business is listed on Yelp, BBB, Angi + more"
        description="Quick free check of 10 popular citation directories — Yelp, BBB, Angi, Thumbtack, YellowPages, Houzz, HomeAdvisor, MapQuest, Foursquare, Manta. See where you're listed and where you're missing."
        canonical={TOOL_PATH}
        keywords={["citation checker", "local citations", "nap consistency", "yelp listing checker", "bbb listing checker", "trade business citations"]}
      />
      <FreeToolLayout
        eyebrow="Free Tool"
        title="Citation Checker"
        subtitle="See if your business is listed on the 10 most important citation directories — Yelp, BBB, Angi, Thumbtack, YellowPages + more."
        path={TOOL_PATH}
        breadcrumbLabel="Citation Checker"
        heroImageSrc="/ai-thumbnails/tools/citation-checker-hero.png"
        heroImageAlt="Illustration of directory listings being scanned for business citations"
        form={form}
        result={resultPanel}
      >
        <h2 style={{ fontSize: 22, fontWeight: 800, color: "#1E1E1E", marginTop: 0 }}>What is a business citation?</h2>
        <p>
          A citation is any third-party web page that lists your business
          Name, Address, and Phone (NAP). Yelp listing? That's a citation.
          BBB profile? Citation. YellowPages entry? Citation. Citations are
          one of the top three local-SEO ranking signals for Google — they
          tell Google your business is real, established, and consistently
          identified across the web.
        </p>

        <h2 style={{ fontSize: 22, fontWeight: 800, color: "#1E1E1E" }}>Why citations matter for trades</h2>
        <p>
          For service-area businesses (plumbers, electricians, HVAC, etc.),
          citations carry even more weight than for storefront businesses,
          because Google can't verify a service-area business with a physical
          inspection. The directory ecosystem is the proxy. A trade business
          with 20+ consistent citations across the major directories almost
          always outranks a competitor with 2-3.
        </p>

        <h2 style={{ fontSize: 22, fontWeight: 800, color: "#1E1E1E" }}>The 10 directories we check</h2>
        <p>
          We check the same 10 directories that BrightLocal, Whitespark, and
          Moz consistently rank as the highest-impact for trade businesses
          in the US: <strong>Yelp, Better Business Bureau, Angi, Thumbtack,
          YellowPages, Houzz, HomeAdvisor, MapQuest, Foursquare, and
          Manta</strong>. If you're missing from any of these, that's a free
          ranking lift waiting to happen.
        </p>

        <h2 style={{ fontSize: 22, fontWeight: 800, color: "#1E1E1E" }}>What to do with missing listings</h2>
        <ul style={{ paddingLeft: 20 }}>
          <li><strong>Yelp, BBB, Angi</strong>: claim a free listing directly on each site. Takes ~10 minutes each.</li>
          <li><strong>YellowPages, Foursquare, MapQuest</strong>: same — free claim flow.</li>
          <li><strong>Houzz, HomeAdvisor, Thumbtack</strong>: paid lead-gen sites; free basic profile, paid leads.</li>
          <li><strong>NAP must match exactly</strong>: same phone format, same street name, no typos. Mismatched NAP is worse than no listing.</li>
        </ul>

        <h2 style={{ fontSize: 22, fontWeight: 800, color: "#1E1E1E" }}>Want the full picture?</h2>
        <p>
          This free check covers 10 directories. The <a href="/tools/free-audit" style={{ color: "#0d3cfc", textDecoration: "underline" }}>Full
          WeFixTrades Audit</a> ($9.80) checks 50+ citation sources,
          surfaces NAP inconsistencies, and prioritises which fixes will
          move your ranking fastest.
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
