import { useEffect, useRef, useState } from "react";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { colors } from "@/theme/tokens";
import { Search, CheckCircle2 } from "lucide-react";
import ReportView from "./ReportView";

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
async function postJSON<T>(url: string, body: any): Promise<T> {
  console.log(`[Audit] POST ${url}`, body);
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || data?.ok === false) {
    console.error(`[Audit] ${url} failed:`, r.status, data);
    throw new Error(data?.error || `Request failed: ${r.status}`);
  }
  return data as T;
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

export default function FreeAudit() {
  const [query, setQuery] = useState("");
  const debounced = useDebouncedValue(query, 400);

  const [predictions, setPredictions] = useState<Prediction[]>([]);
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

  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reportRef = useRef<HTMLDivElement>(null);

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

    console.log("[Audit] Autocomplete → POST /api/audit/search-places", { query: q });

    postJSON<{ ok: true; predictions: Prediction[] }>(
      "/api/audit/search-places",
      { query: q }
    )
      .then((d) => {
        const preds = d.predictions || [];
        console.log("[Audit] Got", preds.length, "predictions:", JSON.stringify(preds.map(p => ({ name: p.name, place_id: p.place_id }))));
        setPredictions(preds);
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

  async function runAudit(pred: Prediction) {
    lastPredRef.current = pred;
    console.log("[Audit] runAudit called:", JSON.stringify({ name: pred.name, place_id: pred.place_id }));
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
      console.log("[Audit] Fetching details with:", body);
      details = await postJSON<{ ok: true; business: Business }>(
        "/api/audit/place-details",
        body
      );
      setBusy("Generating report\u2026");
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
        }
      );
      setReport(rep.report_json);
      if (rep.reportId) setReportId(rep.reportId);
      setFromCache(rep.fromCache === true);
      setBusy(null);

      // Trigger background speed test after report is displayed
      const siteUrl = rep.report_json?.business?.website;
      if (siteUrl) {
        setSpeedData(null);
        setSpeedLoading(true);
        fetch('/api/audit/speed', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ website: siteUrl }),
        })
          .then(r => r.json())
          .then(d => { if (d.speedData) setSpeedData(d.speedData); })
          .catch(err => console.error('[speed] fetch failed:', err))
          .finally(() => setSpeedLoading(false));
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
      <style>{`
        .audit-page {
          min-height: 100vh;
          background: radial-gradient(circle, rgba(0,0,0,0.13) 1px, transparent 1px), linear-gradient(180deg, rgba(236,242,244,1) 0%, rgba(248,250,252,1) 55%, rgba(236,242,244,1) 100%);
          background-size: 22px 22px, 100% 100%;
          position: relative;
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
          border-color: #2F6BFF !important;
          box-shadow: 0 0 0 4px rgba(47,107,255,0.16) !important;
        }
        .audit-suggestion:hover {
          background: rgba(47,107,255,0.06) !important;
        }
        .audit-suggestion:active {
          background: rgba(47,107,255,0.10) !important;
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
          background: linear-gradient(90deg, transparent, #2F6BFF, transparent);
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
          {/* ─── Header + Search (always visible) ─── */}
          <div style={{ textAlign: "center", marginBottom: reportReady ? 20 : 36 }}>
            <h1
              data-testid="text-audit-title"
              style={{
                fontSize: reportReady ? "clamp(22px, 4vw, 28px)" : "clamp(30px, 5vw, 40px)",
                fontWeight: 900,
                letterSpacing: "-0.02em",
                color: "#111827",
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
              }}
            >
              <div style={{ position: "relative" }}>
                <Search
                  size={18}
                  strokeWidth={1.75}
                  style={{
                    position: "absolute",
                    left: 14,
                    top: "50%",
                    transform: "translateY(-50%)",
                    color: "rgba(0,0,0,0.35)",
                    pointerEvents: "none",
                  }}
                />
                <input
                  ref={inputRef}
                  data-testid="input-audit-search"
                  className="audit-input"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onFocus={() => { if (predictions.length > 0 || (searchDone && predictions.length === 0)) setDropdownOpen(true); }}
                  placeholder="Type your business name + city…"
                  style={{
                    width: "100%",
                    height: 46,
                    borderRadius: 14,
                    border: "1px solid rgba(0,0,0,0.10)",
                    padding: "0 14px 0 42px",
                    fontSize: 15,
                    fontWeight: 500,
                    outline: "none",
                    background: "#fff",
                    transition: "border-color 0.2s, box-shadow 0.2s",
                    color: "#111827",
                  }}
                />
                {loadingSearch && (
                  <div
                    style={{
                      position: "absolute",
                      right: 14,
                      top: "50%",
                      transform: "translateY(-50%)",
                      width: 18,
                      height: 18,
                      border: "2px solid rgba(47,107,255,0.2)",
                      borderTopColor: "#2F6BFF",
                      borderRadius: "50%",
                      animation: "spin 0.7s linear infinite",
                    }}
                  />
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
                    marginTop: 4,
                    borderRadius: 14,
                    background: "#fff",
                    border: "1px solid rgba(0,0,0,0.10)",
                    boxShadow: "0 12px 40px rgba(0,0,0,0.12)",
                    zIndex: 50,
                    overflow: "hidden",
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
                      {predictions.map((p, i) => (
                        <button
                          key={p.place_id}
                          data-testid={`button-place-${p.place_id}`}
                          className="audit-suggestion"
                          onClick={() => runAudit(p)}
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
                            <img
                              src={p.photoUrl}
                              alt=""
                              style={{ width: 36, height: 36, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }}
                            />
                          ) : (
                            <div style={{
                              width: 36, height: 36, borderRadius: "50%",
                              background: "rgba(47,107,255,0.08)",
                              display: "flex", alignItems: "center", justifyContent: "center",
                              flexShrink: 0, fontSize: 15, fontWeight: 700, color: "#2F6BFF",
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

              {error && (
                <div
                  data-testid="text-audit-error"
                  style={{
                    marginTop: 12,
                    padding: "10px 14px",
                    borderRadius: 12,
                    background: "rgba(239,68,68,0.06)",
                    border: "1px solid rgba(239,68,68,0.14)",
                    color: "#B91C1C",
                    fontSize: 13,
                    fontWeight: 500,
                  }}
                >
                  {error}
                </div>
              )}
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
                  color: "#111827",
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
                        <CheckCircle2 size={15} />
                      ) : active ? (
                        <div
                          style={{
                            width: 15,
                            height: 15,
                            border: "2px solid rgba(47,107,255,0.3)",
                            borderTopColor: "#2F6BFF",
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
            const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768;
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
                    Report generated earlier today — <span style={{ color: '#00D4C8', cursor: 'pointer' }}
                      onClick={() => { if (lastPredRef.current) runAudit(lastPredRef.current); }}>
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
                />
              </div>
            );
          })()}
        </div>
      </div>
    </MarketingLayout>
  );
}
