/**
 * /tools/citation-checker — free citation presence check.
 *
 * Runs the SAME directory registry as the paid CiteTrack product
 * (server/services/citationTracker/directories.ts), so this free tool and
 * the paid one can never disagree about what is checkable. Real requests to
 * real directories — no SERP inference — reported in the registry's
 * three-state model: found / not listed / couldn't check.
 *
 * HISTORY (fixed 2026-08-29). This page used to advertise checks against
 * Yelp, Angi, Thumbtack, YellowPages.com, Houzz, HomeAdvisor, MapQuest,
 * Foursquare and Manta, and contacted none of them: the backend ran one
 * search query per directory and reported "Missing" whenever that
 * directory's domain did not appear in the top ten organic results. A
 * business genuinely listed on Yelp was told it was missing. On a public
 * lead magnet, aimed at prospects. Every one of those directories is now
 * either blocked to automated checks or robots-disallowed, and the page
 * says so by name instead of pretending otherwise.
 *
 * Backend: POST /api/tools/citation-checker.
 */
import { useMemo, useState } from "react";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import FreeToolLayout from "@/components/marketing/FreeToolLayout";
import ToolFaq from "@/components/marketing/ToolFaq";
import {
  FreeToolFormField,
  FreeToolFormFieldStyles,
} from "@/components/marketing/FreeToolFormField";
import { PageMeta } from "@/components/seo/PageMeta";
import { useFaqSchema } from "@/lib/useFaqSchema";
import { CheckCircle2, XCircle, MinusCircle, ExternalLink, AlertCircle } from "lucide-react";
import { ToolLeadCapture, ToolUpsellCTA } from "@/components/marketing/ToolLeadCapture";
import { mkt } from "@/theme/tokens";

const TOOL_PATH = "/tools/citation-checker";

const FAQ_ITEMS = [
  {
    question: "What is a citation?",
    answer:
      "A citation is any mention of your business Name, Address, and Phone (NAP) on a third-party website. Citations are one of the top three local-SEO ranking signals, especially for younger businesses — Google triangulates that you're a real, consistently-identified business from how the web describes you.",
  },
  {
    question: "Which directories do you actually check?",
    answer:
      "Google Business Profile first, because it carries more local-ranking weight than every other listing combined. Then BuildZoom for US businesses, and YellowPages.ca and n49 for Canadian ones. OpenStreetMap is supported and enabled per deployment. We contact each one directly and read the answer — we never infer a listing's existence from a search engine.",
  },
  {
    question: "You used to check the Better Business Bureau. What happened?",
    answer:
      "We stopped, on purpose. BBB's robots.txt asks automated clients not to request any URL with a query string, and finding a business on BBB meant searching — a query-string URL. The profile pages BBB does permit are behind a Cloudflare challenge we can't read. So there was no route that was both allowed and readable. We decline other directories for exactly that reason, and it would be incoherent to hold BBB to a softer standard because the workaround happened to function. Your BBB listing still matters; we just can't verify it for you, and we'd rather say so than report a status we didn't check.",
  },
  {
    question: "Why don't you check Yelp, Angi, Thumbtack, Houzz or HomeAdvisor?",
    answer:
      "Because we can't, and neither can anyone else doing it honestly. Yelp's robots.txt is a blanket Disallow and its pages sit behind DataDome. Angi, HomeAdvisor, Manta and YellowPages.com return a Cloudflare block to any non-browser request. MapQuest and Foursquare return a page with no listings in it at all. A tool that reports a status for those is guessing. We'd rather name them and tell you why.",
  },
  {
    question: "What does \"Not listed\" mean?",
    answer:
      "The directory answered us cleanly and your business is not in it. That's a real, actionable gap — go and claim the listing. We only ever say this when the directory gave us a genuine answer.",
  },
  {
    question: "What does \"Couldn't check\" mean?",
    answer:
      "The directory timed out, blocked us, or returned something we couldn't read reliably. It tells us nothing about your listing, so we don't count it as a gap and you shouldn't either. This is deliberately shown as its own status rather than folded into \"not listed\" — that conflation is the single most common way citation tools mislead people.",
  },
  {
    question: "Why is this list shorter than other tools advertise?",
    answer:
      "Because the big coverage numbers are theatre. Most tools advertising fifty-plus directories are counting sources they cannot actually read, and reporting a clean \"not listed\" every time one blocks them. Google Business Profile alone outweighs the rest, so a short verified list beats a long invented one. Every directory we decline is named on this page with the reason.",
  },
  {
    question: "How does this differ from CiteTrack?",
    answer:
      "Same checks, same sources — the difference is time. This page is a one-off snapshot you run yourself. CiteTrack re-runs these checks every day and alerts you when a listing is removed, when a new one appears, or when your name, address or phone drifts out of sync across them. Citations break quietly; that's what monitoring is for.",
  },
];

type CheckStatus = "found" | "confirmed-absent" | "could-not-check";

interface ResultRow {
  id: string;
  label: string;
  url: string;
  category: string;
  markets: string[];
  rationale: string;
  status: CheckStatus;
  listingUrl?: string;
  reason?: string;
  primary: boolean;
}

interface DeclinedRow {
  id: string;
  name: string;
  url: string;
  reason: string;
}

interface CheckResponse {
  results: ResultRow[];
  declined: DeclinedRow[];
  market: "US" | "CA" | null;
  summary: {
    checked: number;
    found: number;
    confirmedAbsent: number;
    couldNotCheck: number;
    declined: number;
  };
}

/* Status presentation. The load-bearing decision on this page is that
 * "couldn't check" is visually its OWN thing — neutral grey, not red —
 * because rendering it like an absence is exactly the lie we removed. */
const STATUS_META: Record<CheckStatus, { label: string; color: string; bg: string }> = {
  found: { label: "Listed", color: "rgb(15,110,52)", bg: "rgba(34,197,94,0.10)" },
  "confirmed-absent": { label: "Not listed", color: "rgb(185,28,28)", bg: "rgba(185,28,28,0.08)" },
  "could-not-check": { label: "Couldn't check", color: "rgba(0,0,0,0.55)", bg: "rgba(0,0,0,0.05)" },
};

function StatusBadge({ status }: { status: CheckStatus }) {
  const meta = STATUS_META[status];
  const Icon = status === "found" ? CheckCircle2 : status === "confirmed-absent" ? XCircle : MinusCircle;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "3px 9px",
        borderRadius: 999,
        background: meta.bg,
        color: meta.color,
        fontWeight: 600,
        fontSize: 12,
        whiteSpace: "nowrap",
      }}
    >
      <Icon size={14} /> {meta.label}
    </span>
  );
}

export default function CitationChecker() {
  const [businessName, setBusinessName] = useState("");
  const [city, setCity] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CheckResponse | null>(null);

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
      setResult({
        results: data.results || [],
        declined: data.declined || [],
        market: data.market ?? null,
        summary: data.summary,
      });
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
          helpText="Add the state or province too — it picks the right regional directories."
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
          helpText="Optional. Lets us confirm a listing really is yours, not a similarly-named business."
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
        {loading ? "Checking directories…" : "Check my listings"}
      </button>
      {error && (
        <div style={{ marginTop: 8, color: "rgb(185,28,28)", fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
          <AlertCircle size={14} /> {error}
        </div>
      )}
    </form>
  );

  const primary = result?.results.find((r) => r.primary) || null;
  const secondary = result ? result.results.filter((r) => !r.primary) : [];
  // Only a CONFIRMED absence is a gap. A directory we couldn't read is not
  // evidence of anything and must never drive the "you have a problem" CTA.
  const gapCount = result ? result.summary.confirmedAbsent : 0;

  const resultPanel = result ? (
    <div
      style={{
        background: "rgb(255,255,255)",
        border: "1px solid rgba(0,0,0,0.08)",
        borderRadius: 18,
        padding: 20,
        boxShadow: "0 10px 30px rgba(0,0,0,0.06)",
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: mkt.accent, marginBottom: 4 }}>
        Citation snapshot
      </div>
      <div data-testid="citation-summary-line" style={{ fontSize: 13, color: "rgba(0,0,0,0.65)", marginBottom: 14, lineHeight: 1.5 }}>
        <strong style={{ color: "rgb(15,110,52)" }}>{result.summary.found} listed</strong>
        {" · "}
        <strong style={{ color: "rgb(185,28,28)" }}>{result.summary.confirmedAbsent} not listed</strong>
        {result.summary.couldNotCheck > 0 && (
          <>
            {" · "}
            <strong style={{ color: "rgba(0,0,0,0.55)" }}>{result.summary.couldNotCheck} couldn't check</strong>
          </>
        )}
        {" "}of {result.summary.checked} directories we can genuinely reach.
      </div>

      {/* Google first, and given its own card — it outweighs everything
          below it, so burying it in a table row would misrepresent the
          result even while every individual row stayed true. */}
      {primary && (
        <div
          data-testid="citation-primary-card"
          style={{
            padding: 16,
            borderRadius: 14,
            border: "1px solid rgba(0,0,0,0.08)",
            background: STATUS_META[primary.status].bg,
            marginBottom: 14,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: "rgb(17,24,39)" }}>{primary.label}</div>
            <StatusBadge status={primary.status} />
          </div>
          <div style={{ fontSize: 13, color: "rgba(0,0,0,0.7)", marginTop: 6, lineHeight: 1.55 }}>
            {primary.status === "found"
              ? "Your profile is live on the index that feeds the Google local pack — the single highest-weight local ranking signal there is."
              : primary.status === "confirmed-absent"
                ? "Google returned no matching profile. This is the highest-value fix on this page by a wide margin: nothing else in local SEO moves the needle as much."
                : primary.reason}
          </div>
          {primary.status === "found" && primary.listingUrl && (
            <a
              href={primary.listingUrl}
              target="_blank"
              rel="noreferrer noopener"
              style={{ display: "inline-flex", alignItems: "center", gap: 4, color: mkt.accent, textDecoration: "none", fontSize: 12, fontWeight: 600, marginTop: 8 }}
            >
              View your profile <ExternalLink size={12} />
            </a>
          )}
        </div>
      )}

      {secondary.length > 0 && (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: "left", color: "rgba(0,0,0,0.62)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em" }}>
              <th style={{ padding: "6px 4px" }}>Directory</th>
              <th style={{ padding: "6px 4px" }}>Result</th>
              <th style={{ padding: "6px 4px" }}>Link</th>
            </tr>
          </thead>
          <tbody>
            {secondary.map((row) => (
              <tr key={row.id} style={{ borderTop: "1px solid rgba(0,0,0,0.05)" }}>
                <td style={{ padding: "10px 4px", verticalAlign: "top" }}>
                  <div style={{ fontWeight: 600, color: "rgb(17,24,39)" }}>{row.label}</div>
                  {row.status === "could-not-check" && row.reason && (
                    <div style={{ fontSize: 12, color: "rgba(0,0,0,0.62)", marginTop: 2, lineHeight: 1.45 }}>{row.reason}</div>
                  )}
                </td>
                <td style={{ padding: "10px 4px", verticalAlign: "top" }}>
                  <StatusBadge status={row.status} />
                </td>
                <td style={{ padding: "10px 4px", verticalAlign: "top" }}>
                  {row.status === "found" && row.listingUrl ? (
                    <a
                      href={row.listingUrl}
                      target="_blank"
                      rel="noreferrer noopener"
                      style={{ display: "inline-flex", alignItems: "center", gap: 4, color: mkt.accent, textDecoration: "none", fontSize: 12 }}
                    >
                      View <ExternalLink size={12} />
                    </a>
                  ) : (
                    <span style={{ color: "rgba(0,0,0,0.35)", fontSize: 12 }}>—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Ambiguous city → we deliberately skipped the region-specific
          directories rather than reporting a meaningless "not listed" on a
          Canadian directory for a Texan plumber. Say so, and say how to fix. */}
      {result.market === null && (
        <div
          data-testid="citation-market-hint"
          style={{
            marginTop: 14,
            padding: "12px 14px",
            borderRadius: 12,
            background: "rgba(245,158,11,0.08)",
            border: "1px solid rgba(245,158,11,0.3)",
            fontSize: 13,
            color: "rgb(146,64,14)",
            lineHeight: 1.55,
          }}
        >
          We couldn't tell which country you're in from the city you entered, so we
          only ran the directories that cover both. Add your state or province
          (&ldquo;Austin, TX&rdquo; or &ldquo;Barrie, ON&rdquo;) and re-run to include the regional ones.
        </div>
      )}

      {result.declined.length > 0 && (
        <details data-testid="citation-declined" style={{ marginTop: 14 }}>
          <summary style={{ cursor: "pointer", fontSize: 13, fontWeight: 700, color: "rgb(17,24,39)" }}>
            The {result.declined.length} directories we don't check — and why
          </summary>
          <div style={{ fontSize: 12, color: "rgba(0,0,0,0.6)", lineHeight: 1.6, marginTop: 8 }}>
            <p style={{ marginTop: 0 }}>
              We evaluated these and can't read them honestly today. Rather than
              report a status we didn't verify, we name them. Every reason below
              came from a live probe, not an assumption.
            </p>
            <ul style={{ paddingLeft: 18, margin: 0, listStyle: "disc" }}>
              {result.declined.map((d) => (
                <li key={d.id} style={{ marginBottom: 8 }}>
                  <strong style={{ color: "rgb(17,24,39)" }}>{d.name}</strong> — {d.reason}
                </li>
              ))}
            </ul>
          </div>
        </details>
      )}

      {gapCount > 0 ? (
        <ToolUpsellCTA
          sourceTool="citation-checker"
          tone="fix"
          eyebrow="Next step"
          headline={`${gapCount} confirmed ${gapCount === 1 ? "gap" : "gaps"} to close`}
          body="We'll claim the listings you're missing and make your name, address and phone match exactly across every directory we check — so Google sees one consistent business, not several near-identical ones."
          serviceId="mapguard-setup"
          ctaLabel="Fix my citations + NAP"
        />
      ) : (
        <ToolUpsellCTA
          sourceTool="citation-checker"
          tone="audit"
          eyebrow="Nothing missing today"
          headline="Listings look good — the risk is drift"
          body="Citations break quietly: a listing gets merged, an address auto-updates, a phone number changes on one site and not the others. CiteTrack re-runs these exact checks every day and tells you the moment one moves."
          href="/citation-tracker"
          ctaLabel="See how CiteTrack monitors this"
        />
      )}

      <ToolLeadCapture sourceTool="citation-checker" sourcePage={TOOL_PATH} businessName={businessName} />
    </div>
  ) : null;

  return (
    <MarketingLayout>
      <PageMeta
        title="Free Citation Checker — is your business listed where it counts?"
        description="Check your business against the citation directories that can actually be verified — Google Business Profile, BuildZoom, YellowPages.ca and n49. Real checks, three honest results: listed, not listed, or couldn't check. We name what we can't check, and why."
        canonical={TOOL_PATH}
        keywords={["citation checker", "local citations", "nap consistency", "google business profile checker", "trade business citations"]}
      />
      <FreeToolLayout
        eyebrow="Free Tool"
        title="Citation Checker"
        subtitle="See whether your business is actually listed where it counts — starting with Google Business Profile. Real checks against real directories, and an honest answer when one can't be checked."
        path={TOOL_PATH}
        breadcrumbLabel="Citation Checker"
        form={form}
        result={resultPanel}
        /* heroMedia (the demo video) is deliberately NOT used. The existing
           /videos/citationchecker-tool.* clips were captured against the old
           UI: they show a ten-row grid lighting up "Found" on Yelp, Angi,
           Thumbtack, Houzz, MapQuest and Manta — results this tool never
           verified and cannot verify. Honest alt text on a dishonest video is
           still a dishonest video. Restore heroMedia once a clip of the real
           result panel exists.

           The static preview below fills the hero slot meanwhile. Without a
           visual FreeToolLayout collapses to a single narrow centred column,
           which left ~420px of dead space either side at 1440. The image is
           regenerated from scripts/generate-free-tool-previews.ts and shows
           the real three-state vocabulary, Yelp included as "Can't check". */
        heroImageSrc="/free-tools/previews/citation-checker.png"
        heroImageAlt="Citation Checker result — Google Business Profile and YellowPages.ca listed, BuildZoom not listed, and Yelp marked can't check rather than reported as missing."
      >
        <h2 style={{ fontSize: 22, fontWeight: 800, color: "#1E1E1E", marginTop: 0 }}>What is a business citation?</h2>
        <p>
          A citation is any third-party web page that lists your business
          Name, Address, and Phone (NAP). Citations are one of the top three
          local-SEO ranking signals for Google — they tell Google your
          business is real, established, and consistently identified across
          the web.
        </p>

        <h2 style={{ fontSize: 22, fontWeight: 800, color: "#1E1E1E" }}>Why citations matter for trades</h2>
        <p>
          For service-area businesses (plumbers, electricians, HVAC, etc.),
          citations carry even more weight than for storefront businesses,
          because Google can't verify a service-area business with a physical
          inspection. The directory ecosystem is the proxy.
        </p>

        <h2 style={{ fontSize: 22, fontWeight: 800, color: "#1E1E1E" }}>What we check</h2>
        <p>
          We contact each directory directly and read what it returns. No
          search-engine guesswork:
        </p>
        <ul style={{ paddingLeft: 20 }}>
          <li>
            <strong>Google Business Profile</strong> — checked against Google's
            public Places index, the same data that feeds the local pack. On its
            own it carries more local-ranking weight than every other listing
            here combined, which is why it's the first thing we check and the
            first thing you see.
          </li>
          <li><strong>BuildZoom</strong> (US) — contractor-specific, built on permit records. Lead relevance rather than ranking weight.</li>
          <li><strong>YellowPages.ca and n49</strong> (Canada) — the two Canadian general directories that still serve readable pages.</li>
        </ul>

        <h2 style={{ fontSize: 22, fontWeight: 800, color: "#1E1E1E" }}>What we don't check, and why</h2>
        <p>
          Most citation tools advertise fifty-plus directories. Very few of those can
          actually be read in 2026, and a tool that can't read a directory but
          reports a status anyway is telling you your listing is missing when
          it may be perfectly fine. We'd rather name the gaps:
        </p>
        <ul style={{ paddingLeft: 20 }}>
          <li><strong>Yelp</strong> — blanket <code>Disallow</code> in robots.txt, pages behind DataDome, and the API starts at $229/month.</li>
          <li><strong>Angi, HomeAdvisor, Manta, YellowPages.com</strong> — Cloudflare returns a block to any non-browser request.</li>
          <li><strong>Houzz, Thumbtack</strong> — blocked from datacenter traffic. They answer a laptop and not a server, which is worse than an outright block: the check would fail silently in the direction of &ldquo;not listed&rdquo;.</li>
          <li><strong>MapQuest, Foursquare</strong> — return a page with no listings in it. MapQuest sends 244KB of HTML containing zero businesses; count the results and you'd &ldquo;confirm&rdquo; an absence that was never checked.</li>
          <li><strong>Apple Maps, Bing Places, Facebook, Nextdoor</strong> — no public way to read a business's listing at all.</li>
        </ul>
        <p>
          Run the check and the full list appears underneath your results, each
          with its reason.
        </p>

        <h2 style={{ fontSize: 22, fontWeight: 800, color: "#1E1E1E" }}>What to do with a confirmed gap</h2>
        <ul style={{ paddingLeft: 20 }}>
          <li><strong>Google Business Profile first, always.</strong> If that one says "not listed", nothing else on this page matters until it's fixed.</li>
          <li><strong>YellowPages.ca, n49, BuildZoom</strong>: free claim flows, roughly ten minutes each.</li>
          <li><strong>NAP must match exactly</strong>: same phone format, same street name, no typos. Mismatched NAP is worse than no listing.</li>
        </ul>

        <h2 style={{ fontSize: 22, fontWeight: 800, color: "#1E1E1E" }}>Want this watched, not just checked?</h2>
        <p>
          This page is a snapshot. <a href="/citation-tracker" style={{ color: mkt.accent, textDecoration: "underline" }}>CiteTrack</a>{" "}
          runs these same checks every day and alerts you when a listing is
          removed, a new one appears, or your NAP drifts out of sync — the
          failures you'd otherwise find months later.
        </p>

        <h2 style={{ fontSize: 22, fontWeight: 800, color: "#1E1E1E" }}>Frequently asked questions</h2>
        <ToolFaq items={FAQ_ITEMS} />
      </FreeToolLayout>
    </MarketingLayout>
  );
}
