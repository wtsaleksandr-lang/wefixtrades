import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { Link } from "wouter";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { PageMeta } from "@/components/seo/PageMeta";
import { trackEvent } from "@/lib/trackEvent";
import { ga4Event } from "@/lib/ga4";
import { useFaqSchema } from "@/lib/useFaqSchema";
import { useBreadcrumbSchema } from "@/lib/useBreadcrumbSchema";
import TrustStrip from "@/components/marketing/TrustStrip";
import { useIsMobile } from "@/hooks/use-mobile";
import { colors } from "@/theme/tokens";
import { Search, CheckCircle2, Calculator, ArrowRight, ChevronDown } from "lucide-react";
import ReportView from "./ReportView";
import AuditGate from "@/components/marketing/AuditGate";
// BG-2: hero input promoted to the QuoteQuick gold standard. We reuse the
// shared InfoCue (`?` icon + popover with WidgetSchema diagram) from the
// widget editor so the help affordance matches PortalOnboarding. The input
// itself is an inline floating-label adaptation of PortalOnboarding's
// FloatingLabelInput — copied here because that export lives under
// pages/portal/ and crosses a page-domain boundary; an inline copy keeps
// the marketing surface self-contained and matches FreeAudit's inline-style
// pattern (it doesn't use Tailwind utility classes like the portal file).
import InfoCue from "@/components/wizard/elfsight/InfoCue";
import { OptimizedImage } from "@/components/ui/Picture";

type Prediction = {
  place_id: string;
  name: string;
  formatted_address: string;
  rating: number | null;
  user_ratings_total: number;
  photoUrl: string | null;
};
type Business = {
  placeId: string;
  name: string;
  formattedAddress: string;
  addressComponents: Array<{ long_name: string; short_name: string; types: string[] }>;
  types: string[];
  rating: number | null;
  reviewsCount: number;
  website: string;
  phone: string;
  hours: string[];
  photos: string[];
};
async function postJSON<T>(url: string, body: any, timeoutMs = 30000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok || data?.ok === false) {
      console.error(`[Audit] ${url} failed:`, r.status, data);
      throw new Error(data?.error || `Request failed: ${r.status}`);
    }
    return data as T;
  } catch (err: any) {
    if (err.name === "AbortError") {
      throw new Error("Taking longer than expected. Please try again.");
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

function useDebouncedValue<T>(value: T, delayMs: number) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return v;
}

const STEPS = [
  "Fetching business details",
  "Running website speed test",
  "Generating report",
] as const;

function busyStep(busy: string | null): number {
  if (!busy) return 0;
  if (busy.includes("speed")) return 2;
  if (busy.includes("Generating")) return 3;
  return 1;
}

/* ═══ Static SEO Content ═══ */

const AUDIT_SECTIONS = [
  {
    heading: "What Does the Google Business Profile Audit Check?",
    text: "We analyze your Google Business Profile for completeness — categories, business hours, photos, description, and review health. Missing or outdated information hurts your ranking in the local map pack and costs you visibility when customers search for your trade.",
  },
  {
    heading: "Website Speed & Mobile Analysis",
    text: "Your website is tested against Google PageSpeed benchmarks. We check load time, mobile responsiveness, and Core Web Vitals. Slow websites lose customers — 53% of mobile visitors leave if a page takes more than 3 seconds to load.",
  },
  {
    heading: "Competitor Comparison",
    text: "The audit benchmarks your business against nearby competitors in your trade. You'll see how your review count, rating, and profile completeness stack up — so you know exactly where you're falling behind and what to fix first.",
  },
  {
    heading: "Who Is This For?",
    text: "This tool is built for trade businesses — plumbers, electricians, HVAC technicians, roofers, cleaners, painters, landscapers, and more. If your customers find you through Google Maps or local search, this audit shows you what's working and what's not.",
  },
];

const AUDIT_FAQ_ITEMS = [
  {
    question: "How long does the audit take?",
    answer: "About 30 seconds. Search your business name, select it from the dropdown, and the report generates automatically. No signup or account needed.",
  },
  {
    question: "What does the audit check?",
    answer: "The audit evaluates your Google Business Profile completeness (categories, hours, photos, description), review health (count, rating, recency), website speed and mobile performance, and how you compare to nearby competitors in your trade.",
  },
  {
    question: "Is this really free?",
    answer: "Yes, completely free. No credit card, no signup, no hidden upsell wall. You get a full report with scores and recommendations at no cost.",
  },
  {
    question: "Do I need to create an account?",
    answer: "No. Just type your business name and city into the search box. The audit runs instantly without any login or registration.",
  },
  {
    question: "How is my business scored?",
    answer: "Your score is calculated from weighted criteria across three areas: Google Business Profile health (photos, reviews, categories, hours), website performance (speed, mobile-friendliness), and competitive standing (how you rank against nearby businesses in your trade).",
  },
  {
    question: "Can I share my report?",
    answer: "Yes. Every report has a unique shareable URL. You can send it to a business partner, your marketing person, or save it to track improvements over time.",
  },
];

function AuditStaticSections() {
  return (
    <div data-theme="light" style={{
      maxWidth: 480,
      margin: "0 auto",
      marginTop: 48,
      paddingTop: 32,
      borderTop: "1px solid rgba(0,0,0,0.07)",
    }}>
      {AUDIT_SECTIONS.map((section, i) => (
        <div key={i} style={{ marginBottom: 28 }}>
          <h2 style={{
            fontSize: "clamp(18px, 2.5vw, 22px)",
            fontWeight: 700,
            color: "#1E1E1E",
            lineHeight: 1.2,
            letterSpacing: "-0.01em",
            margin: "0 0 8px",
          }}>
            {section.heading}
          </h2>
          <p style={{
            fontSize: 14,
            color: "rgba(0,0,0,0.55)",
            lineHeight: 1.7,
            margin: 0,
          }}>
            {section.text}
          </p>
        </div>
      ))}
    </div>
  );
}

function AuditFaqSection() {
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const faqSchemaItems = useMemo(() => AUDIT_FAQ_ITEMS.map(f => ({ question: f.question, answer: f.answer })), []);
  useFaqSchema(faqSchemaItems);

  return (
    <div style={{
      maxWidth: 480,
      margin: "0 auto",
      marginTop: 36,
      paddingTop: 28,
      borderTop: "1px solid rgba(0,0,0,0.07)",
    }}>
      <h2 style={{
        fontSize: "clamp(20px, 3vw, 26px)",
        fontWeight: 700,
        color: "#1E1E1E",
        letterSpacing: "-0.02em",
        lineHeight: 1.15,
        margin: "0 0 16px",
        textAlign: "center",
      }}>
        Frequently Asked Questions
      </h2>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {AUDIT_FAQ_ITEMS.map((item, i) => {
          const isOpen = openIdx === i;
          return (
            <div key={i} style={{
              background: "rgba(255,255,255,0.78)",
              border: "1px solid rgba(0,0,0,0.08)",
              borderRadius: 12,
              overflow: "clip",
            }}>
              <button
                onClick={() => setOpenIdx(isOpen ? null : i)}
                aria-expanded={isOpen}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  padding: "14px 16px",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: isOpen ? "#111827" : "rgba(0,0,0,0.55)",
                  fontSize: 14,
                  fontWeight: 600,
                  textAlign: "left",
                  lineHeight: 1.4,
                  transition: "color 0.15s",
                }}
              >
                <span>{item.question}</span>
                <ChevronDown
                  size={14}
                  color="rgba(0,0,0,0.3)"
                  style={{
                    flexShrink: 0,
                    transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
                    transition: "transform 0.2s ease",
                  }}
                />
              </button>
              {isOpen && (
                <div style={{
                  padding: "0 16px 14px",
                  fontSize: 13,
                  color: "rgba(0,0,0,0.48)",
                  lineHeight: 1.65,
                }}>
                  {item.answer}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const AUDIT_BASE = "https://wefixtrades.com";

export default function FreeAudit() {
  // Title + meta tags handled by <PageMeta> below.

  const auditBreadcrumbs = useMemo(() => [
    { name: "Home", url: `${AUDIT_BASE}/` },
    { name: "Free Audit", url: `${AUDIT_BASE}/tools/free-audit` },
  ], []);
  useBreadcrumbSchema(auditBreadcrumbs);
  const isMobile = useIsMobile();
  const [query, setQuery] = useState("");
  const debounced = useDebouncedValue(query, 400);

  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [locationHint, setLocationHint] = useState<string | null>(null);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [searchDone, setSearchDone] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [report, setReport] = useState<any>(null);
  const [reportId, setReportId] = useState<string | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const lastPredRef = useRef<Prediction | null>(null);
  const [speedData, setSpeedData] = useState<any>(null);
  const [speedLoading, setSpeedLoading] = useState(false);
  const [websiteAIAnalysis, setWebsiteAIAnalysis] = useState<any>(null);
  const [websiteScreenshot, setWebsiteScreenshot] = useState<string | null>(null);
  const [websiteQualityChecks, setWebsiteQualityChecks] = useState<any>(null);
  const [websiteQualityCheckScore, setWebsiteQualityCheckScore] = useState<number>(0);

  const lastTradeRef = useRef<string>('');
  const [prefillTrade, setPrefillTrade] = useState<string | null>(null);

  // Read ?prefill=<trade> from the URL on mount and seed lastTradeRef so
  // the first audit run uses it as the tradeOverride. The audit form has
  // no explicit trade-selection step (trade is auto-detected from the
  // selected business), so we just plumb the override through — no UI
  // step to skip. The query string is tolerant: missing / empty values
  // are ignored. Validation against TRADE_PRESETS would require an
  // import we'd rather avoid here; the server-side audit pipeline already
  // ignores unknown trades. `source` is also captured for analytics
  // attribution.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const params = new URLSearchParams(window.location.search);
      const prefill = (params.get('prefill') || '').trim().toLowerCase();
      const source = (params.get('source') || '').trim();
      if (prefill && /^[a-z0-9_-]{2,40}$/.test(prefill)) {
        lastTradeRef.current = prefill;
        setPrefillTrade(prefill);
        try { trackEvent('audit_prefill_applied', { trade: prefill, source: source || null }); } catch { /* swallow analytics errors */ }
      }
    } catch {
      /* swallow URL parsing errors */
    }
  }, []);

  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [auditUnlocked, setAuditUnlocked] = useState(false);

  const reportRef = useRef<HTMLDivElement>(null);

  // Browser geolocation for search bias
  const userCoordsRef = useRef<{ lat: number; lng: number } | null>(null);
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => { userCoordsRef.current = { lat: pos.coords.latitude, lng: pos.coords.longitude }; },
        () => { /* silently ignore denial */ },
        { timeout: 5000, maximumAge: 300000 }
      );
    }
  }, []);

  // Autocomplete search: fires after 3+ chars with 400ms debounce
  useEffect(() => {
    setError(null);
    const q = debounced.trim();
    if (q.length < 3) {
      setPredictions([]);
      setDropdownOpen(false);
      setSearchDone(false);
      return;
    }

    setLoadingSearch(true);
    setSearchDone(false);
    trackEvent("audit_search_submitted", { query: q });

    postJSON<{ ok: true; predictions: Prediction[]; locationHint?: string | null }>(
      "/api/audit/search-places",
      { query: q, ...(userCoordsRef.current && { lat: userCoordsRef.current.lat, lng: userCoordsRef.current.lng }) }
    )
      .then((d) => {
        setPredictions(d.predictions || []);
        setLocationHint(d.locationHint || null);
        setSearchDone(true);
        setDropdownOpen(true);
      })
      .catch((e) => {
        console.error("[Audit] Search failed:", e);
        setError(e.message || "Search failed");
        setPredictions([]);
        setSearchDone(true);
        setDropdownOpen(true);
      })
      .finally(() => setLoadingSearch(false));
  }, [debounced]);

  // Dismiss dropdown on outside click
  useEffect(() => {
    if (!dropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (
        dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
        inputRef.current && !inputRef.current.contains(e.target as Node)
      ) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [dropdownOpen]);

  // Dismiss dropdown on Escape
  useEffect(() => {
    if (!dropdownOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setDropdownOpen(false); inputRef.current?.blur(); }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [dropdownOpen]);

  async function runAudit(pred: Prediction, tradeOverride?: string) {
    lastPredRef.current = pred;
    if (tradeOverride) lastTradeRef.current = tradeOverride;
    trackEvent("audit_prediction_selected", { businessName: pred.name });
    const placeId = (pred.place_id || "").trim();
    try {
      setError(null);
      setBusy("Fetching business details\u2026");
      setReport(null);
      setPredictions([]);
      setDropdownOpen(false);

      let details: { ok: true; business: Business };

      const body: any = placeId
        ? { placeId }
        : { query: `${pred.name} ${pred.formatted_address}`.trim() };
      details = await postJSON<{ ok: true; business: Business }>(
        "/api/audit/place-details",
        body
      );
      setBusy("Generating report\u2026");
      // B4 fix (2026-05-20): the post-deploy QA on 2026-05-20 saw a one-off
      // "Setup might have expired. Please try again." surface from a slow
      // /audit/generate run. Raised this call's client-side timeout from
      // the postJSON default (30s) to 60s \u2014 /audit/generate fans out across
      // Outscraper, Serper, DataForSEO and PageSpeed in parallel and can
      // legitimately need ~30\u201345s under load. Server-side, see the
      // [audit/generate] start/end timing log added in server/auditRoutes.ts
      // so future timeouts surface a useful "where did the seconds go"
      // breakdown.
      const rep = await postJSON<{
        ok: true;
        report_json: any;
        reportId?: string;
        fromCache?: boolean;
      }>(
        "/api/audit/generate",
        {
          business: details.business,
          speedData: null,
          trade: (details as any).trade || "",
          city: (details as any).city || "",
          tradeOverride: tradeOverride || null,
        },
        60000
      );
      setReport(rep.report_json);
      if (rep.reportId) setReportId(rep.reportId);
      setFromCache(rep.fromCache === true);
      trackEvent("audit_generated", { businessName: rep.report_json?.business?.name, score: rep.report_json?.scores?.total });
      // GA4 funnel — audit form finished, report rendered. No PII (no name/email).
      ga4Event("audit_completed", {
        score: rep.report_json?.scores?.total ?? null,
        from_cache: rep.fromCache === true ? 1 : 0,
        report_id: rep.reportId ?? null,
      });
      // Check if this report was previously unlocked
      if (rep.reportId) {
        try {
          const wasUnlocked = localStorage.getItem(`audit-unlocked-${rep.reportId}`);
          setAuditUnlocked(wasUnlocked === "1");
        } catch { setAuditUnlocked(false); }
      } else {
        setAuditUnlocked(false);
      }
      setBusy(null);

      // Trigger background speed test then poll for result
      const siteUrl = rep.report_json?.business?.website;
      const rId = rep.reportId;
      if (siteUrl && rId) {
        setSpeedData(null);
        setSpeedLoading(true);

        const fetchSpeedInBackground = async (website: string, reportId: string) => {
          try {
            // Fire the background job (returns immediately)
            await fetch('/api/audit/speed', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ website, reportId }),
            });

            // Poll every 5s for up to 90s
            let attempts = 0;
            const maxAttempts = 18;
            const poll = async () => {
              if (attempts >= maxAttempts) {
                setSpeedLoading(false);
                return;
              }
              attempts++;
              try {
                const r = await fetch(`/api/audit/speed/${reportId}`);
                const data = await r.json();
                if (data.ready && data.speedData) {
                  setSpeedData(data.speedData);
                  if (data.websiteAIAnalysis) setWebsiteAIAnalysis(data.websiteAIAnalysis);
                  if (data.websiteScreenshot) setWebsiteScreenshot(data.websiteScreenshot);
                  if (data.websiteQualityChecks) setWebsiteQualityChecks(data.websiteQualityChecks);
                  if (data.websiteQualityCheckScore != null) setWebsiteQualityCheckScore(data.websiteQualityCheckScore);
                  setSpeedLoading(false);
                  return;
                }
                setTimeout(poll, 5000);
              } catch (err) {
                console.error('[speed] poll error:', err);
                setTimeout(poll, 5000);
              }
            };
            // Wait 10s before first poll to give job time to start
            setTimeout(poll, 10000);
          } catch (err) {
            console.error('[speed] trigger error:', err);
            setSpeedLoading(false);
          }
        };

        fetchSpeedInBackground(siteUrl, rId);
      }

      setTimeout(() => {
        reportRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 100);
    } catch (e: any) {
      setBusy(null);
      setError(e?.message || "Audit failed");
    }
  }

  const currentStep = busyStep(busy);
  const reportReady = !!report;

  return (
    <MarketingLayout>
      <PageMeta
        title="Free Google Maps & website audit"
        description="Get a free instant audit of your Google Business Profile and website. See your score, competitor analysis, and a fix plan — no signup required."
        canonical="/tools/free-audit"
        keywords={["free google business audit", "free website audit", "trades local seo audit"]}
      />
      <style>{`
        .audit-page {
          min-height: 100vh;
          background: radial-gradient(circle, rgba(0,0,0,0.13) 1px, transparent 1px), linear-gradient(180deg, rgba(236,242,244,1) 0%, rgba(248,250,252,1) 55%, rgba(236,242,244,1) 100%);
          background-size: 22px 22px, 100% 100%;
          position: relative;
          margin-top: -92px;
          padding-top: 92px;
          box-sizing: border-box;
        }
        .audit-page::before {
          content: "";
          position: absolute;
          inset: 0;
          opacity: 0.045;
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
          background-size: 200px 200px;
          pointer-events: none;
          z-index: 0;
        }
        .audit-container {
          position: relative;
          z-index: 1;
          max-width: 960px;
          margin: 0 auto;
          padding: 110px 16px 80px;
        }
        @media (max-width: 480px) {
          .audit-container { padding: 110px 10px 80px; }
        }
        @media (min-width: 768px) {
          .audit-container { padding: 120px 24px 80px; }
        }
        .audit-input:focus {
          border-color: #0d3cfc !important;
          box-shadow: 0 0 0 4px rgba(13,60,252,0.16) !important;
        }
        /* BG-2: floating-label hero input — placeholder-shown drops the
         * label down to mimic a normal placeholder; focus / non-empty
         * raises and shrinks it. Mirrors PortalOnboarding.FloatingLabelInput
         * (Tailwind peer pattern) but uses scoped CSS so this page keeps
         * its inline-style discipline. */
        .audit-hero-input__label {
          position: absolute;
          left: 42px;
          pointer-events: none;
          top: 6px;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: #0d3cfc;
          background: #fff;
          padding: 0 2px;
          transition: top 0.15s ease, font-size 0.15s ease,
                      color 0.15s ease, font-weight 0.15s ease,
                      text-transform 0.15s ease, letter-spacing 0.15s ease;
          z-index: 1;
        }
        .audit-hero-input__field:placeholder-shown + .audit-hero-input__label {
          top: 50%;
          transform: translateY(-50%);
          font-size: 15px;
          font-weight: 500;
          color: rgba(0,0,0,0.42);
          text-transform: none;
          letter-spacing: normal;
        }
        .audit-hero-input__field:focus + .audit-hero-input__label {
          top: 6px;
          transform: none;
          font-size: 10px;
          font-weight: 700;
          color: #0d3cfc;
          text-transform: uppercase;
          letter-spacing: 0.06em;
        }
        @media (prefers-color-scheme: dark) {
          /* Help-cue popover handles its own dark variant via InfoCue's
           * data-theme attribute. The floating label is on a white input
           * surface in this page (marketing pages stay light), so no extra
           * dark override is required for the label itself. */
        }
        .audit-suggestion:hover {
          background: rgba(13,60,252,0.06) !important;
        }
        .audit-suggestion:active {
          background: rgba(13,60,252,0.10) !important;
        }
        .audit-shimmer {
          height: 4px;
          border-radius: 4px;
          background: rgba(0,0,0,0.06);
          overflow: hidden;
          position: relative;
        }
        .audit-shimmer::after {
          content: "";
          position: absolute;
          inset: 0;
          border-radius: 4px;
          background: linear-gradient(90deg, transparent, #0d3cfc, transparent);
          animation: audit-shimmer-move 1.4s ease-in-out infinite;
        }
        @keyframes audit-shimmer-move {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>

      <div className="audit-page">
        <div className="audit-container">
          {/* Breadcrumb */}
          <nav aria-label="breadcrumb" style={{ fontSize: 13, color: "#6b7280", marginBottom: 16 }}>
            <Link href="/" style={{ color: "#6b7280", textDecoration: "none" }}>Home</Link>
            <span style={{ margin: "0 6px" }}>/</span>
            <span style={{ color: "#111827" }}>Free Audit</span>
          </nav>

          {/* ─── Header + Search (always visible) ─── */}
          <div style={{ textAlign: "center", marginBottom: reportReady ? 20 : 36 }}>
            <h1
              data-testid="text-audit-title"
              style={{
                fontSize: reportReady ? "clamp(22px, 4vw, 28px)" : "clamp(30px, 5vw, 40px)",
                fontWeight: 900,
                letterSpacing: "-0.02em",
                color: "#1E1E1E",
                marginBottom: reportReady ? 8 : 12,
                lineHeight: 1.05,
                transition: "font-size 0.3s",
              }}
            >
              Free Google Maps &amp; Website Audit
            </h1>
            {!reportReady && (
              <p
                style={{
                  fontSize: 16,
                  color: "rgba(0,0,0,0.62)",
                  maxWidth: "58ch",
                  margin: "0 auto 14px",
                  lineHeight: 1.55,
                }}
              >
                Search your business and get an instant report on your Google
                Business Profile health and website speed.
              </p>
            )}
            {!reportReady && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  fontSize: 13,
                  fontWeight: 500,
                  color: "rgba(0,0,0,0.48)",
                }}
              >
                <span>Instant report</span>
                <span style={{ opacity: 0.4 }}>{"\u00b7"}</span>
                <span>No signup</span>
                <span style={{ opacity: 0.4 }}>{"\u00b7"}</span>
                <span>Takes ~30 seconds</span>
              </div>
            )}
            {/* BE-2: trust strip header \u2014 marketing-tool-appropriate trust line.
                Mirrors the BD-2b pattern used inside the QuoteQuick widget.
                Only renders pre-audit (hidden once busy/report). */}
            {!reportReady && (
              <div
                style={{
                  marginTop: 14,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "6px 12px",
                  borderRadius: 999,
                  background: "rgba(13,60,252,0.06)",
                  border: "1px solid rgba(13,60,252,0.14)",
                  fontSize: 12,
                  fontWeight: 600,
                  color: "#1E1E1E",
                  letterSpacing: "0.005em",
                }}
              >
                <span style={{ color: "#22C55E" }}>{"\u2605\u2605\u2605\u2605\u2605"}</span>
                <span style={{ opacity: 0.65 }}>Trusted by 2,400+ trade businesses</span>
              </div>
            )}
            {/* Prefill confirmation chip \u2014 shown when the user arrived via
                the Missed Call Calculator \u2192 audit funnel. Lets them confirm
                the trade was carried over so they know the next click is
                one step ahead of a cold-start audit. */}
            {!reportReady && prefillTrade && (
              <div
                data-testid="audit-prefill-chip"
                style={{
                  marginTop: 10,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "4px 10px",
                  borderRadius: 999,
                  background: "rgba(34,197,94,0.08)",
                  border: "1px solid rgba(34,197,94,0.22)",
                  fontSize: 11,
                  fontWeight: 600,
                  color: "#166534",
                  letterSpacing: "0.01em",
                }}
              >
                <CheckCircle2 size={12} strokeWidth={2.2} />
                <span>Trade pre-selected: {prefillTrade.replace(/[-_]/g, " ")}</span>
              </div>
            )}
          </div>

          {!busy && (
            <div
              style={{
                background: "rgba(255,255,255,0.78)",
                border: "1px solid rgba(0,0,0,0.08)",
                borderRadius: 18,
                boxShadow: "0 18px 50px rgba(0,0,0,0.08)",
                padding: 16,
                position: "relative",
                maxWidth: 960,
                margin: "0 auto",
                width: "100%",
                boxSizing: "border-box",
                overflow: "clip",
              }}
            >
              {/* BG-2: hero input upgraded to QuoteQuick gold standard.
                  - Floating-label pattern (placeholder doubles as the title;
                    no `Search your business` row above per design rule 5).
                  - `?` help-cue top-left via the shared InfoCue (popover
                    includes a WidgetSchema diagram highlighting the
                    step-content region from BD-3h).
                  - Error renders inside the field (red text below).
                  The relative wrapper carries the floating-label peer styles
                  via a scoped class so we don't need Tailwind on this page. */}
              <div className="audit-hero-input" style={{ position: "relative", paddingLeft: 26 }}>
                {/* Help cue — top-left, anchored above the floating label so
                    it never overlaps the input chrome on mobile (44px tap
                    target is preserved by the input itself). */}
                <div
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: 22,
                    height: 22,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    zIndex: 2,
                  }}
                >
                  <InfoCue
                    testid="audit-hero"
                    label="Help: Search your business"
                    region="step-content"
                    text="Enter your business website. We'll scan it for SEO, speed, and conversion issues — free, in about 30 seconds."
                  />
                </div>
                <Search
                  size={18}
                  strokeWidth={1.75}
                  style={{
                    position: "absolute",
                    left: 40,
                    top: "50%",
                    transform: "translateY(-50%)",
                    color: "rgba(0,0,0,0.35)",
                    pointerEvents: "none",
                    zIndex: 1,
                  }}
                />
                <input
                  ref={inputRef}
                  id="audit-hero-input"
                  data-testid="input-audit-search"
                  className="audit-input audit-hero-input__field"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onFocus={() => { if (predictions.length > 0 || (searchDone && predictions.length === 0)) setDropdownOpen(true); }}
                  // Floating label uses :placeholder-shown — needs a single
                  // space so the label can collapse when the input is empty.
                  placeholder=" "
                  aria-label="Search your business name and city"
                  style={{
                    width: "100%",
                    minHeight: 46,
                    height: 46,
                    borderRadius: 14,
                    border: `1px solid ${error ? "rgba(239,68,68,0.55)" : "rgba(0,0,0,0.10)"}`,
                    padding: "16px 14px 6px 42px",
                    fontSize: 15,
                    fontWeight: 500,
                    outline: "none",
                    background: "#fff",
                    transition: "border-color 0.2s, box-shadow 0.2s",
                    color: "#111827",
                    boxSizing: "border-box",
                  }}
                />
                <label
                  htmlFor="audit-hero-input"
                  className="audit-hero-input__label"
                >
                  Type your business name + city…
                </label>
                {loadingSearch && (
                  <div
                    style={{
                      position: "absolute",
                      right: 14,
                      top: "50%",
                      transform: "translateY(-50%)",
                      width: 18,
                      height: 18,
                      border: "2px solid rgba(13,60,252,0.2)",
                      borderTopColor: "#0d3cfc",
                      borderRadius: "50%",
                      animation: "spin 0.7s linear infinite",
                    }}
                  />
                )}
                {error && (
                  <div
                    data-testid="text-audit-error-inline"
                    style={{
                      marginTop: 2,
                      fontSize: 12,
                      color: "#B91C1C",
                      fontWeight: 500,
                      paddingLeft: 4,
                    }}
                  >
                    {error}
                  </div>
                )}
              </div>

              {/* Autocomplete dropdown */}
              {dropdownOpen && !loadingSearch && searchDone && (
                <div
                  ref={dropdownRef}
                  data-testid="list-suggestions"
                  style={{
                    position: "absolute",
                    left: 0,
                    right: 0,
                    top: "100%",
                    // BG-2: tightened to 2px per design-system rule on
                    // input-to-companion gap.
                    marginTop: 2,
                    borderRadius: 14,
                    background: "#fff",
                    border: "1px solid rgba(0,0,0,0.10)",
                    boxShadow: "0 12px 40px rgba(0,0,0,0.12)",
                    zIndex: 50,
                    overflow: "clip",
                  }}
                >
                  {predictions.length === 0 ? (
                    <div style={{
                      padding: "16px 18px",
                      fontSize: 13,
                      color: "rgba(0,0,0,0.50)",
                      textAlign: "center",
                    }}>
                      No businesses found — try adding your city name
                    </div>
                  ) : (
                    <div style={{ maxHeight: 320, overflowY: "auto" }}>
                      {locationHint && (
                        <div style={{
                          padding: "8px 16px",
                          fontSize: 11,
                          color: "rgba(0,0,0,0.40)",
                          borderBottom: "1px solid rgba(0,0,0,0.05)",
                          display: "flex",
                          alignItems: "center",
                          gap: 4,
                        }}>
                          <span style={{ fontSize: 12 }}>📍</span>
                          {locationHint}
                        </div>
                      )}
                      {predictions.map((p, i) => (
                        <button
                          key={p.place_id}
                          data-testid={`button-place-${p.place_id}`}
                          className="audit-suggestion"
                          onClick={() => runAudit(p, lastTradeRef.current || undefined)}
                          style={{
                            width: "100%",
                            textAlign: "left",
                            padding: "10px 16px",
                            background: "transparent",
                            border: "none",
                            borderBottom: i < predictions.length - 1 ? "1px solid rgba(0,0,0,0.05)" : "none",
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                            transition: "background 0.1s",
                          }}
                        >
                          {p.photoUrl ? (
                            <OptimizedImage
                              src={p.photoUrl}
                              alt=""
                              width={36}
                              height={36}
                              style={{ width: 36, height: 36, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }}
                              loading="lazy"
                            />
                          ) : (
                            <div style={{
                              width: 36, height: 36, borderRadius: "50%",
                              background: "rgba(13,60,252,0.08)",
                              display: "flex", alignItems: "center", justifyContent: "center",
                              flexShrink: 0, fontSize: 15, fontWeight: 700, color: "#0d3cfc",
                            }}>
                              {p.name?.charAt(0) || "?"}
                            </div>
                          )}
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={{ fontWeight: 600, fontSize: 14, color: "#111827", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                              {p.name}
                            </div>
                            <div style={{ fontSize: 12, color: "rgba(0,0,0,0.45)", marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                              {p.formatted_address}
                              {p.rating != null && <span style={{ marginLeft: 6 }}>{"\u2605"} {p.rating}</span>}
                              {p.user_ratings_total > 0 && <span> ({p.user_ratings_total})</span>}
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* BG-2: legacy outer error block removed — the inline error
                  beneath the floating-label field now serves as the single
                  validation surface (design rule: error renders inside the
                  field). data-testid="text-audit-error-inline" is the
                  replacement hook for any tests previously hitting the old
                  outer "text-audit-error" id. */}
            </div>
          )}

          {busy && (
            <div
              style={{
                background: "#fff",
                border: "1px solid rgba(0,0,0,0.07)",
                borderRadius: 18,
                boxShadow: "0 6px 24px rgba(0,0,0,0.05)",
                padding: 20,
              }}
            >
              <div
                style={{
                  fontSize: 15,
                  fontWeight: 600,
                  color: "#1E1E1E",
                  marginBottom: 14,
                }}
              >
                Running your audit… (step {currentStep} of 3)
              </div>
              <div className="audit-shimmer" style={{ marginBottom: 16 }} />
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {STEPS.map((label, idx) => {
                  const step = idx + 1;
                  const done = currentStep > step;
                  const active = currentStep === step;
                  return (
                    <div
                      key={idx}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        fontSize: 13,
                        fontWeight: 500,
                        color: done
                          ? "#22C55E"
                          : active
                          ? colors.accent.blue
                          : "rgba(0,0,0,0.35)",
                      }}
                    >
                      {done ? (
                        <CheckCircle2 size={16} />
                      ) : active ? (
                        <div
                          style={{
                            width: 15,
                            height: 15,
                            border: "2px solid rgba(13,60,252,0.3)",
                            borderTopColor: "#0d3cfc",
                            borderRadius: "50%",
                            animation: "spin 0.7s linear infinite",
                          }}
                        />
                      ) : (
                        <div
                          style={{
                            width: 15,
                            height: 15,
                            borderRadius: "50%",
                            border: "2px solid rgba(0,0,0,0.12)",
                          }}
                        />
                      )}
                      {label}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {reportReady && report && (() => {
            return (
              <div ref={reportRef} style={{
                minHeight: '100vh',
                padding: isMobile ? '0 0 48px' : '32px 0 64px',
                margin: '0 -16px',
              }}>
                {fromCache && (
                  <div style={{
                    textAlign: 'center', padding: '6px 0 2px',
                    fontSize: 12, color: '#6B7280',
                  }}>
                    Report generated earlier today — <span style={{ color: '#0d3cfc', cursor: 'pointer' }}
                      onClick={() => { if (lastPredRef.current) runAudit(lastPredRef.current, lastTradeRef.current || undefined); }}>
                      Refresh for latest data
                    </span>
                  </div>
                )}
                <ReportView
                  report={report}
                  business={report.business}
                  reportId={reportId}
                  liveSpeedData={speedData}
                  speedLoading={speedLoading}
                  liveWebsiteAIAnalysis={websiteAIAnalysis}
                  liveWebsiteScreenshot={websiteScreenshot}
                  liveWebsiteQualityCheckScore={websiteQualityCheckScore}
                  unlocked={auditUnlocked}
                  onUnlock={() => { trackEvent("audit_unlocked"); setAuditUnlocked(true); }}
                />
              </div>
            );
          })()}
          {/* ─── Static SEO Content + FAQ (hidden during audit/report) ─── */}
          {!reportReady && !busy && (
            <>
              <AuditStaticSections />
              <TrustStrip theme="light" />
              <AuditFaqSection />
            </>
          )}

          {/* ─── Try QuoteQuick callout ───
              Tools-consolidation: the old "Other free tools" block linked at
              missed-call (deleted) and quote-demo (relocated under products).
              Replaced with a single nudge to the relocated quote demo so the
              cross-sell stays alive without the deprecated surfaces. */}
          <div style={{
            maxWidth: 480,
            margin: "0 auto",
            marginTop: reportReady ? 48 : 56,
            paddingTop: 24,
            borderTop: "1px solid rgba(0,0,0,0.07)",
          }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#1E1E1E", marginBottom: 10 }}>
              Try the QuoteQuick demo
            </div>
            <Link href="/products/quickquotepro/demo" style={{ textDecoration: "none", display: "block", marginBottom: 8 }}>
              <div style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: "12px 14px", borderRadius: 14,
                border: "1px solid rgba(0,0,0,0.07)",
                background: "rgba(255,255,255,0.6)",
                cursor: "pointer", transition: "border-color 0.15s, background 0.15s",
              }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = "rgba(0,0,0,0.13)"; e.currentTarget.style.background = "rgba(255,255,255,0.85)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = "rgba(0,0,0,0.07)"; e.currentTarget.style.background = "rgba(255,255,255,0.6)"; }}
              >
                <div style={{
                  width: 36, height: 36, borderRadius: 10,
                  background: "rgba(13,60,252,0.08)",
                  display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                }}>
                  <Calculator size={16} color="#0d3cfc" strokeWidth={1.8} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 650, color: "#111827" }}>Instant Quote Demo</div>
                  <div style={{ fontSize: 12, color: "rgba(0,0,0,0.45)" }}>Let customers get prices on your website</div>
                </div>
                <ArrowRight size={14} color="rgba(0,0,0,0.25)" style={{ flexShrink: 0 }} />
              </div>
            </Link>
          </div>

        </div>
      </div>
    </MarketingLayout>
  );
}
