/**
 * /tools/local-search-checker — free local SERP visibility check.
 *
 * Enter a keyword + location, see the top-10 organic results and the
 * Google Local Pack from a US-locale search. Cross-links the paid Full
 * Audit (which checks 20 keywords + tracks rank history).
 *
 * Backend: POST /api/tools/local-search-checker (Serper /search + /maps).
 */
import { useMemo, useState } from "react";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import FreeToolLayout from "@/components/marketing/FreeToolLayout";
import { PageMeta } from "@/components/seo/PageMeta";
import { useFaqSchema } from "@/lib/useFaqSchema";
import { Search, MapPin, AlertCircle, Star } from "lucide-react";

const TOOL_PATH = "/tools/local-search-checker";

const FAQ_ITEMS = [
  {
    question: "What is a local search check?",
    answer:
      "A local search check shows you who actually shows up on Google when a customer in a given city searches a keyword like \"emergency plumber Austin\". You see the top organic results and the Local Pack (the 3-result map block at the top of mobile results) — which is where most local-intent traffic actually clicks.",
  },
  {
    question: "Why does location matter?",
    answer:
      "Local SERPs are personalised — searching \"roofer\" from Dallas returns totally different results than searching the same query from Phoenix. Always run the check from the city you serve, not just \"USA\".",
  },
  {
    question: "What's the difference between organic and the Local Pack?",
    answer:
      "Organic results are the standard 10 blue links. The Local Pack is the boxed map + 3 businesses that appears above (or near the top of) most local-intent searches. Ranking in the Local Pack drives 10-20x the clicks of a typical organic position 4-10.",
  },
  {
    question: "How often should I check my rankings?",
    answer:
      "Once a month is fine for most trade businesses. If you're actively running an SEO push or testing changes to your Google Business Profile, weekly. The Full Audit tracks 20 keywords with history so you don't have to remember to check.",
  },
  {
    question: "Why only 10 results?",
    answer:
      "Beyond position 10 the click-through rate collapses (page 2 of Google gets <1% of clicks). The top-10 organic + Local Pack is everything that matters for local SEO decisions.",
  },
];

interface OrganicRow {
  rank: number;
  title: string;
  url: string;
  snippet: string;
  domain: string;
}

interface LocalPackRow {
  rank: number;
  name: string;
  address: string;
  rating: number | null;
  reviewsCount: number | null;
  gbpUrl: string | null;
  phone: string | null;
}

export default function LocalSearchChecker() {
  const [keyword, setKeyword] = useState("");
  const [location, setLocation] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ organic: OrganicRow[]; localPack: LocalPackRow[] } | null>(null);

  const faqSchemaItems = useMemo(() => FAQ_ITEMS.map((f) => ({ question: f.question, answer: f.answer })), []);
  useFaqSchema(faqSchemaItems);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);
    if (!keyword.trim() || !location.trim()) {
      setError("Enter both a keyword and a location (e.g. \"Austin, TX\").");
      return;
    }
    setLoading(true);
    try {
      const r = await fetch("/api/tools/local-search-checker", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyword, location }),
      });
      const data = await r.json();
      if (!r.ok || !data?.ok) throw new Error(data?.error || "Search failed.");
      setResult({ organic: data.organic || [], localPack: data.localPack || [] });
    } catch (err: any) {
      setError(err?.message || "Search failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const form = (
    <form onSubmit={submit}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <input
          type="text"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="Keyword (e.g. emergency plumber)"
          aria-label="Keyword"
          style={{
            padding: "12px 14px",
            borderRadius: 12,
            border: "1px solid rgba(0,0,0,0.10)",
            fontSize: 14,
            background: "rgb(255,255,255)",
            outline: "none",
          }}
          data-testid="input-search-keyword"
        />
        <input
          type="text"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          placeholder="Location (e.g. Austin, TX)"
          aria-label="Location"
          style={{
            padding: "12px 14px",
            borderRadius: 12,
            border: "1px solid rgba(0,0,0,0.10)",
            fontSize: 14,
            background: "rgb(255,255,255)",
            outline: "none",
          }}
          data-testid="input-search-location"
        />
      </div>
      <button
        type="submit"
        disabled={loading}
        data-testid="button-search-submit"
        style={{
          marginTop: 12,
          width: "100%",
          padding: "12px 16px",
          borderRadius: 12,
          background: loading ? "rgba(13,60,252,0.6)" : "#0d3cfc",
          color: "rgb(255,255,255)",
          fontSize: 14,
          fontWeight: 700,
          border: "none",
          cursor: loading ? "default" : "pointer",
        }}
      >
        {loading ? "Checking results…" : "Check local rankings"}
      </button>
      {error && (
        <div style={{ marginTop: 10, color: "#B91C1C", fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
          <AlertCircle size={14} /> {error}
        </div>
      )}
    </form>
  );

  const resultPanel = result ? (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {result.localPack.length > 0 && (
        <div style={{
          background: "rgb(255,255,255)",
          border: "1px solid rgba(0,0,0,0.08)",
          borderRadius: 18,
          padding: 20,
          boxShadow: "0 10px 30px rgba(0,0,0,0.06)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#22C55E", marginBottom: 8 }}>
            <MapPin size={13} /> Google Local Pack
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: "left", color: "rgba(0,0,0,0.5)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                <th style={{ padding: "6px 4px", width: 40 }}>#</th>
                <th style={{ padding: "6px 4px" }}>Business</th>
                <th style={{ padding: "6px 4px" }}>Reviews</th>
              </tr>
            </thead>
            <tbody>
              {result.localPack.map((p) => (
                <tr key={p.rank} style={{ borderTop: "1px solid rgba(0,0,0,0.05)" }}>
                  <td style={{ padding: "10px 4px", fontWeight: 700, color: "#0d3cfc" }}>{p.rank}</td>
                  <td style={{ padding: "10px 4px" }}>
                    <div style={{ fontWeight: 600, color: "#111827" }}>{p.name}</div>
                    <div style={{ fontSize: 12, color: "rgba(0,0,0,0.5)" }}>{p.address}</div>
                  </td>
                  <td style={{ padding: "10px 4px", whiteSpace: "nowrap", color: "rgba(0,0,0,0.65)" }}>
                    {p.rating != null && (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                        <Star size={12} fill="#FBBF24" stroke="#FBBF24" /> {p.rating}
                      </span>
                    )}
                    {p.reviewsCount != null && <span style={{ marginLeft: 6 }}>({p.reviewsCount})</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div style={{
        background: "rgb(255,255,255)",
        border: "1px solid rgba(0,0,0,0.08)",
        borderRadius: 18,
        padding: 20,
        boxShadow: "0 10px 30px rgba(0,0,0,0.06)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#0d3cfc", marginBottom: 8 }}>
          <Search size={13} /> Top 10 Organic Results
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
                <tr key={`${o.rank}-${o.url}`} style={{ borderTop: "1px solid rgba(0,0,0,0.05)" }}>
                  <td style={{ padding: "10px 4px", fontWeight: 700, color: "#0d3cfc", verticalAlign: "top" }}>{o.rank}</td>
                  <td style={{ padding: "10px 4px" }}>
                    <a href={o.url} target="_blank" rel="noreferrer noopener" style={{ fontWeight: 600, color: "#111827", textDecoration: "none" }}>
                      {o.title}
                    </a>
                    <div style={{ fontSize: 11, color: "#22C55E", marginTop: 2 }}>{o.domain}</div>
                    <div style={{ fontSize: 12, color: "rgba(0,0,0,0.55)", marginTop: 4, lineHeight: 1.5 }}>{o.snippet}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  ) : null;

  return (
    <MarketingLayout>
      <PageMeta
        title="Free Local Search Results Checker — see Google Local Pack + Top 10"
        description="See the Google Local Pack and top 10 organic results for any keyword + city. Free tool — no signup. Check who's outranking you in local search and where to focus your SEO."
        canonical={TOOL_PATH}
        keywords={["local search results checker", "google local pack checker", "local seo tool", "serp checker", "local rank checker"]}
      />
      <FreeToolLayout
        eyebrow="Free Tool"
        title="Local Search Results Checker"
        subtitle="See exactly who's ranking in the Google Local Pack and top 10 organic results for any keyword + city."
        path={TOOL_PATH}
        breadcrumbLabel="Local Search Results Checker"
        form={form}
        result={resultPanel}
      >
        <h2 style={{ fontSize: 22, fontWeight: 800, color: "#1E1E1E", marginTop: 0 }}>What this tool shows you</h2>
        <p>
          Type a keyword (the search a customer would actually use — e.g.
          "emergency plumber") and a location (the city you serve), and we'll
          run the search against Google's US-locale SERPs and return two
          things: the Google Local Pack (the boxed map at the top of mobile
          results) and the top 10 organic results. You'll see who's
          outranking you, what their listings look like, and where the gaps
          are.
        </p>

        <h2 style={{ fontSize: 22, fontWeight: 800, color: "#1E1E1E" }}>Why the Local Pack matters more than organic</h2>
        <p>
          For trade businesses, the Local Pack is the prize. It sits above
          almost every organic result on mobile (where ~70% of "near me"
          searches happen), it shows your photos and rating up front, and
          tap-to-call works directly from the result. A business in Local
          Pack position 1 gets roughly 3-5x the calls of a business in
          organic position 4. Ranking in the Local Pack depends almost
          entirely on your Google Business Profile — categories, reviews,
          proximity, citations.
        </p>

        <h2 style={{ fontSize: 22, fontWeight: 800, color: "#1E1E1E" }}>How to read the results</h2>
        <ul style={{ paddingLeft: 20 }}>
          <li><strong>Local Pack rows</strong>: name, address, rating, review count. If you're not in this list, your Google Business Profile is the first thing to fix.</li>
          <li><strong>Organic rows</strong>: title, URL, snippet. If a competitor's website is outranking yours, look at their content depth + page speed.</li>
          <li><strong>Position 1 vs position 4-10</strong>: the click drop-off between #1 and #4 is roughly 5x. Position 8-10 is essentially invisible.</li>
        </ul>

        <h2 style={{ fontSize: 22, fontWeight: 800, color: "#1E1E1E" }}>Want to check 20 keywords + see history?</h2>
        <p>
          This free check is a one-shot snapshot. The <a href="/tools/free-audit" style={{ color: "#0d3cfc", textDecoration: "underline" }}>Full
          WeFixTrades Audit</a> ($9.80) checks 20 keywords for your trade,
          stores them in a rank history, and shows you which keywords are
          worth fighting for — based on actual search volume and the
          competitive gap.
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
