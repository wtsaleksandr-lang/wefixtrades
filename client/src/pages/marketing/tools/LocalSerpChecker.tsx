/**
 * /tools/local-serp-checker — free Google + Google Maps SERP viewer
 * (Wave 6E, BrightLocal-parity replacement for the older /tools/local-search-checker
 * thin placeholder).
 *
 * Enter a search term + location + country + language + engine (Google Search
 * or Google Maps) and see exactly what a real customer in that locale sees:
 * ~10 organic results (or 3-pack of Local Pack businesses for Maps), with
 * honest provider attribution at the bottom — the orchestrator may have used
 * Google CSE, Serper, Brave, or any of the other 6 free-tier providers
 * shipped in Wave 6.5 (PR #820).
 *
 * No fabricated social proof. No "Used by 15,000+ marketers". The honest pitch
 * is in the marketing copy below: it's free because we route through 6
 * free-tier providers at $0 marginal cost.
 *
 * Backend: POST /api/tools/local-serp-check (server/routes/freeToolsRoutes.ts)
 *   → calls searchSerp() from server/lib/serpOrchestrator.ts (Wave 6.5).
 */
import { useMemo, useState } from "react";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import FreeToolLayout from "@/components/marketing/FreeToolLayout";
import {
  FreeToolFormField,
  FreeToolFormSelect,
  FreeToolFormFieldStyles,
} from "@/components/marketing/FreeToolFormField";
import { PageMeta } from "@/components/seo/PageMeta";
import { useFaqSchema } from "@/lib/useFaqSchema";
import { Search, MapPin, AlertCircle, Star, Globe } from "lucide-react";

const TOOL_PATH = "/tools/local-serp-checker";

/** ISO-3166 top 20 countries that Serper / CSE / Brave reliably target. */
const COUNTRIES: Array<{ code: string; label: string }> = [
  { code: "us", label: "United States" },
  { code: "gb", label: "United Kingdom" },
  { code: "ca", label: "Canada" },
  { code: "au", label: "Australia" },
  { code: "de", label: "Germany" },
  { code: "fr", label: "France" },
  { code: "it", label: "Italy" },
  { code: "es", label: "Spain" },
  { code: "nl", label: "Netherlands" },
  { code: "be", label: "Belgium" },
  { code: "mx", label: "Mexico" },
  { code: "br", label: "Brazil" },
  { code: "in", label: "India" },
  { code: "jp", label: "Japan" },
  { code: "kr", label: "South Korea" },
  { code: "sg", label: "Singapore" },
  { code: "nz", label: "New Zealand" },
  { code: "ie", label: "Ireland" },
  { code: "za", label: "South Africa" },
  { code: "ae", label: "United Arab Emirates" },
];

/** BCP-47 top languages the orchestrator passes through to each provider. */
const LANGUAGES: Array<{ code: string; label: string }> = [
  { code: "en", label: "English" },
  { code: "es", label: "Spanish" },
  { code: "fr", label: "French" },
  { code: "de", label: "German" },
  { code: "it", label: "Italian" },
  { code: "pt", label: "Portuguese" },
  { code: "nl", label: "Dutch" },
  { code: "ja", label: "Japanese" },
  { code: "ko", label: "Korean" },
  { code: "zh", label: "Chinese" },
];

type Engine = "search" | "maps";

const FAQ_ITEMS = [
  {
    question: "What is a local SERP check?",
    answer:
      "A local SERP check shows you the actual Google (or Google Maps) results for a keyword in a specific country, city, or ZIP — without spoofing your own IP. SERPs are personalized by location, so the only honest way to see what a customer sees is to ask Google directly from that locale.",
  },
  {
    question: "What's the difference between Google Search and Google Maps?",
    answer:
      "Google Search returns the standard 10 blue links (organic results). Google Maps returns the Local Pack — the box of businesses with map pins, ratings, and review counts. For local-intent queries (\"plumber near me\", \"emergency electrician\"), the Local Pack drives 10-20x the clicks of an organic position 4-10.",
  },
  {
    question: "Which providers does this tool use?",
    answer:
      "We route each query through a chain of 6 free-tier SERP providers — Google Custom Search, Serper, Brave Search, ScaleSerp, SerpStack, and DataForSEO as a paid fallback. The orchestrator picks whichever has free-tier capacity left this month, falls through on failure, and caches identical queries for 1 hour. Marginal cost: $0.",
  },
  {
    question: "How accurate are the results?",
    answer:
      "Every provider hits Google directly (or in Brave's case, the Bing-equivalent index). Results match what an unauthenticated browser in that locale would see — the same data professional SEO tools pay $0.0015-$0.003 per query for. We just route through free tiers first.",
  },
  {
    question: "Are there rate limits?",
    answer:
      "10 requests per minute per IP to keep things fair. If you need higher volume, run the Full WeFixTrades Audit ($9.80) — it batches 20 keywords across all your target locations in one shot.",
  },
];

interface OrganicRow {
  position: number;
  title: string;
  link: string;
  snippet?: string;
  displayedLink?: string;
}

interface LocalPackRow {
  position: number;
  title: string;
  rating?: number;
  reviewCount?: number;
  address?: string;
}

interface SerpResponse {
  organic: OrganicRow[];
  localPack?: LocalPackRow[];
  provider: string;
  cached: boolean;
  country: string;
  language: string;
  engine: Engine;
  totalResults?: number;
}

export default function LocalSerpChecker() {
  const [query, setQuery] = useState("");
  const [location, setLocation] = useState("");
  const [country, setCountry] = useState("us");
  const [language, setLanguage] = useState("en");
  const [engine, setEngine] = useState<Engine>("search");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SerpResponse | null>(null);

  const faqSchemaItems = useMemo(
    () => FAQ_ITEMS.map((f) => ({ question: f.question, answer: f.answer })),
    [],
  );
  useFaqSchema(faqSchemaItems);

  const jsonLd = useMemo(
    () => ({
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: "Local SERP Checker",
      applicationCategory: "SEOApplication",
      operatingSystem: "Web",
      description:
        "Free tool to check Google search and Google Maps results from any country, city, or ZIP code. View localized SERPs and the Local Pack without spoofing your IP.",
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    }),
    [],
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);
    if (!query.trim() || !location.trim()) {
      setError("Enter both a search term and a location.");
      return;
    }
    setLoading(true);
    try {
      const r = await fetch("/api/tools/local-serp-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, location, country, language, engine }),
      });
      const data = await r.json();
      if (!r.ok || !data?.ok) throw new Error(data?.error || "Search failed.");
      setResult({
        organic: data.organic || [],
        localPack: data.localPack || [],
        provider: data.provider || "unknown",
        cached: !!data.cached,
        country: data.country || country,
        language: data.language || language,
        engine: data.engine || engine,
        totalResults: data.totalResults,
      });
    } catch (err: any) {
      setError(err?.message || "Search failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const countryLabel =
    COUNTRIES.find((c) => c.code === (result?.country || country))?.label || "—";
  const languageLabel =
    LANGUAGES.find((l) => l.code === (result?.language || language))?.label || "—";
  const resultCount =
    (result?.engine === "maps"
      ? result?.localPack?.length
      : result?.organic.length) ?? 0;

  /* ─── Engine pill toggle (DESIGN-SYSTEM rule 5: selected = outline + 4% tint, NOT bright fill) ── */
  const EnginePill = ({ value, label, icon }: { value: Engine; label: string; icon: React.ReactNode }) => {
    const selected = engine === value;
    return (
      <button
        type="button"
        onClick={() => setEngine(value)}
        data-testid={`engine-pill-${value}`}
        style={{
          flex: 1,
          padding: "11px 14px",
          borderRadius: 12,
          fontSize: 14,
          fontWeight: 600,
          cursor: "pointer",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          transition: "background 0.15s, border-color 0.15s",
          background: selected ? "rgba(13,60,252,0.04)" : "rgb(255,255,255)",
          border: selected ? "1.5px solid rgb(13,60,252)" : "1px solid rgba(0,0,0,0.12)",
          color: selected ? "rgb(13,60,252)" : "rgba(0,0,0,0.65)",
        }}
      >
        {icon}
        {label}
      </button>
    );
  };

  const form = (
    <form onSubmit={submit}>
      <FreeToolFormFieldStyles />
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <FreeToolFormField
          id="serp-query"
          label="Search term"
          value={query}
          onChange={setQuery}
          required
          placeholder="emergency plumber"
          testId="input-serp-query"
          helpText="The exact phrase a customer would type into Google — e.g. 'emergency plumber', 'roof repair Chicago'."
        />
        <FreeToolFormField
          id="serp-location"
          label="Search location"
          value={location}
          onChange={setLocation}
          required
          placeholder="Enter a search location (e.g. Chicago, IL; 90219 CA)"
          testId="input-serp-location"
          helpText="City + state, a ZIP/postcode, or any locality string. SERPs are personalised by location."
        />
        <FreeToolFormSelect
          id="serp-country"
          label="Country"
          value={country}
          onChange={setCountry}
          required
          testId="input-serp-country"
          helpText="ISO country code passed to Google. Affects which TLD + localized index serves the result."
        >
          {COUNTRIES.map((c) => (
            <option key={c.code} value={c.code}>{c.label}</option>
          ))}
        </FreeToolFormSelect>
        <FreeToolFormSelect
          id="serp-language"
          label="Language"
          value={language}
          onChange={setLanguage}
          required
          testId="input-serp-language"
          helpText="BCP-47 language code. Most SERP providers honour this for snippet locale + UI strings."
        >
          {LANGUAGES.map((l) => (
            <option key={l.code} value={l.code}>{l.label}</option>
          ))}
        </FreeToolFormSelect>
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 10 }} role="tablist" aria-label="Search engine">
        <EnginePill value="search" label="Google Search" icon={<Search size={14} />} />
        <EnginePill value="maps" label="Google Maps" icon={<MapPin size={14} />} />
      </div>

      <button
        type="submit"
        disabled={loading}
        data-testid="button-serp-submit"
        style={{
          marginTop: 12,
          width: "100%",
          padding: "14px 16px",
          borderRadius: 12,
          background: loading ? "rgba(34,197,94,0.6)" : "rgb(34,197,94)",
          color: "rgb(255,255,255)",
          fontSize: 15,
          fontWeight: 700,
          border: "none",
          cursor: loading ? "default" : "pointer",
        }}
      >
        {loading ? "Checking results…" : "Check search results"}
      </button>
      {error && (
        <div style={{ marginTop: 8, color: "rgb(185,28,28)", fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
          <AlertCircle size={14} /> {error}
        </div>
      )}
    </form>
  );

  const resultPanel = result ? (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Count banner */}
      <div
        data-testid="result-count-banner"
        style={{
          background: "rgba(13,60,252,0.04)",
          border: "1px solid rgba(13,60,252,0.18)",
          borderRadius: 12,
          padding: "12px 16px",
          fontSize: 14,
          color: "rgb(13,60,252)",
          fontWeight: 600,
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <Globe size={14} />
        {resultCount} {result.engine === "maps" ? "local pack" : "organic"} results in {countryLabel} · {languageLabel}
        {result.cached && (
          <span style={{ marginLeft: "auto", fontSize: 11, fontWeight: 500, opacity: 0.7 }}>cached</span>
        )}
      </div>

      {/* Local Pack (Maps engine) */}
      {result.engine === "maps" && (
        <div style={{
          background: "rgb(255,255,255)",
          border: "1px solid rgba(0,0,0,0.08)",
          borderRadius: 18,
          padding: 20,
          boxShadow: "0 10px 30px rgba(0,0,0,0.06)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "rgb(34,197,94)", marginBottom: 8 }}>
            <MapPin size={14} /> Google Local Pack
          </div>
          {(result.localPack?.length ?? 0) === 0 ? (
            <div style={{ fontSize: 13, color: "rgba(0,0,0,0.55)" }}>No Local Pack results returned for this query.</div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: "left", color: "rgba(0,0,0,0.5)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  <th style={{ padding: "6px 4px", width: 40 }}>#</th>
                  <th style={{ padding: "6px 4px" }}>Business</th>
                  <th style={{ padding: "6px 4px" }}>Reviews</th>
                </tr>
              </thead>
              <tbody>
                {result.localPack!.map((p) => (
                  <tr key={`${p.position}-${p.title}`} style={{ borderTop: "1px solid rgba(0,0,0,0.05)" }}>
                    <td style={{ padding: "10px 4px", fontWeight: 700, color: "rgb(13,60,252)" }}>{p.position}</td>
                    <td style={{ padding: "10px 4px" }}>
                      <div style={{ fontWeight: 600, color: "rgb(17,24,39)" }}>{p.title}</div>
                      {p.address && <div style={{ fontSize: 12, color: "rgba(0,0,0,0.5)" }}>{p.address}</div>}
                    </td>
                    <td style={{ padding: "10px 4px", whiteSpace: "nowrap", color: "rgba(0,0,0,0.65)" }}>
                      {p.rating != null && (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                          <Star size={12} fill="rgb(251,191,36)" stroke="rgb(251,191,36)" /> {p.rating}
                        </span>
                      )}
                      {p.reviewCount != null && <span style={{ marginLeft: 6 }}>({p.reviewCount})</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Organic results (Search engine) */}
      {result.engine === "search" && (
        <div style={{
          background: "rgb(255,255,255)",
          border: "1px solid rgba(0,0,0,0.08)",
          borderRadius: 18,
          padding: 20,
          boxShadow: "0 10px 30px rgba(0,0,0,0.06)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "rgb(13,60,252)", marginBottom: 8 }}>
            <Search size={14} /> Organic results
          </div>
          {result.organic.length === 0 ? (
            <div style={{ fontSize: 13, color: "rgba(0,0,0,0.55)" }}>No organic results returned.</div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: "left", color: "rgba(0,0,0,0.5)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  <th style={{ padding: "6px 4px", width: 40 }}>#</th>
                  <th style={{ padding: "6px 4px" }}>Result</th>
                </tr>
              </thead>
              <tbody>
                {result.organic.map((o) => (
                  <tr key={`${o.position}-${o.link}`} style={{ borderTop: "1px solid rgba(0,0,0,0.05)" }}>
                    <td style={{ padding: "10px 4px", fontWeight: 700, color: "rgb(13,60,252)", verticalAlign: "top" }}>{o.position}</td>
                    <td style={{ padding: "10px 4px" }}>
                      <a href={o.link} target="_blank" rel="noreferrer noopener" style={{ fontWeight: 600, color: "rgb(17,24,39)", textDecoration: "none" }}>
                        {o.title}
                      </a>
                      <div style={{ fontSize: 11, color: "rgb(34,197,94)", marginTop: 2 }}>
                        {o.displayedLink || (() => { try { return new URL(o.link).hostname.replace(/^www\./, ""); } catch { return o.link; } })()}
                      </div>
                      {o.snippet && <div style={{ fontSize: 12, color: "rgba(0,0,0,0.55)", marginTop: 4, lineHeight: 1.5 }}>{o.snippet}</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Honest provider attribution */}
      <div
        data-testid="provider-attribution"
        style={{ fontSize: 12, color: "rgba(0,0,0,0.45)", textAlign: "center", marginTop: 4 }}
      >
        Powered by {result.provider} {result.cached ? "(cached)" : ""} · 6-provider free-tier rotation (Wave 6.5)
      </div>
    </div>
  ) : null;

  return (
    <MarketingLayout>
      <PageMeta
        title="Local SERP Checker — Free Google + Google Maps results viewer"
        description="Free tool to check Google search results from any location, country, and language. See exactly what your customers see — including the local pack."
        canonical={TOOL_PATH}
        keywords={["local serp checker", "google serp tool", "google maps results checker", "localized search checker", "free serp tool"]}
        jsonLd={jsonLd}
      />
      <FreeToolLayout
        eyebrow="Free Tool"
        title="Local SERP Checker"
        subtitle="Check Google SERPs for any keyword. View localized search results for any country, city, or ZIP code on Google and Google Maps."
        path={TOOL_PATH}
        breadcrumbLabel="Local SERP Checker"
        form={form}
        result={resultPanel}
      >
        <h2 style={{ fontSize: 22, fontWeight: 800, color: "rgb(30,30,30)", marginTop: 0 }}>What this tool does</h2>
        <p>
          Pick a keyword, a location, a country, and a language — then choose
          Google Search or Google Maps. The tool routes your query through our
          6-provider SERP orchestrator (Wave 6.5, shipped 2026-05-25), returns
          the top-10 organic results or the Local Pack, and tells you exactly
          which provider answered. No IP spoofing, no VPN — Google sees the
          query as coming from the locale you specified.
        </p>

        <h2 style={{ fontSize: 22, fontWeight: 800, color: "rgb(30,30,30)" }}>Why "localized" matters</h2>
        <p>
          Google's local SERPs change <em>per neighbourhood</em>. Searching
          "emergency plumber" from 90210 (Beverly Hills) returns completely
          different businesses than searching from 90019 (Mid-City LA), 7 miles
          away. If you're optimising for a service area, the only honest signal
          is what someone in that area actually sees. This tool gives you that.
        </p>

        <h2 style={{ fontSize: 22, fontWeight: 800, color: "rgb(30,30,30)" }}>How we keep it free</h2>
        <p>
          Built on the same APIs Google uses + your queries route through 6
          providers for $0 marginal cost. The orchestrator tries Google Custom
          Search first (10K/mo free), then Serper (2.5K/mo free), then Brave,
          ScaleSerp, SerpStack, and finally falls back to paid DataForSEO only
          when every free tier is exhausted. See the implementation in our
          open repo at <code>server/lib/serpOrchestrator.ts</code>.
        </p>

        <h2 style={{ fontSize: 22, fontWeight: 800, color: "rgb(30,30,30)" }}>Want to check 20 keywords + see history?</h2>
        <p>
          This is a one-shot check. The{" "}
          <a href="/tools/free-audit" style={{ color: "rgb(13,60,252)", textDecoration: "underline" }}>
            Full WeFixTrades Audit
          </a>{" "}
          ($9.80) batches 20 keywords for your trade, stores them in a rank
          history, and tells you which keywords are worth fighting for based
          on actual search volume and the competitive gap.
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
