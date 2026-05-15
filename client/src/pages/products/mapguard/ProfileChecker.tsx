import { useState, useEffect, useRef } from "react";
import { Link } from "wouter";
import { trackEvent } from "@/lib/trackEvent";
import NextStepSuggestions from "@/components/marketing/NextStepSuggestions";
import {
  Search, ArrowRight, Star, Image, Clock, Globe, MessageSquare,
  CheckCircle2, XCircle, AlertTriangle,
} from "lucide-react";
import { mkt } from "@/theme/tokens";
import { BODY_FONT, GLASS } from "./styles";

/* ─── Types ─── */

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
  rating: number | null;
  reviewsCount: number;
  website: string;
  phone: string;
  hours: string[];
  photos: string[];
  businessPhotoUrl: string | null;
};

type HealthCheck = {
  label: string;
  pass: boolean;
  detail: string;
  icon: typeof Image;
};

/* ─── Helpers ─── */

function useDebouncedValue<T>(value: T, delayMs: number) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return v;
}

async function postJSON<T>(url: string, body: any): Promise<T> {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data?.error || `Request failed: ${r.status}`);
  return data as T;
}

function deriveGrade(biz: Business): { grade: string; color: string; gapCount: number } {
  let score = 0;
  const max = 10;

  // Reviews: 0-4 points (strong penalty when low)
  if (biz.reviewsCount >= 50) score += 4;
  else if (biz.reviewsCount >= 20) score += 3;
  else if (biz.reviewsCount >= 10) score += 2;
  else if (biz.reviewsCount >= 3) score += 1;

  // Website: 0-2 points
  if (biz.website) score += 2;

  // Hours: 0-2 points
  if (biz.hours && biz.hours.length > 0) score += 2;

  // Photos: 0-2 points
  if (biz.photos && biz.photos.length >= 3) score += 2;
  else if (biz.photos && biz.photos.length > 0) score += 1;

  const pct = score / max;
  let gapCount = 0;
  if (biz.reviewsCount < 10) gapCount++;
  if (!biz.website) gapCount++;
  if (!biz.hours || biz.hours.length === 0) gapCount++;
  if (!biz.photos || biz.photos.length < 3) gapCount++;

  if (pct >= 0.8) return { grade: "A", color: "#22C55E", gapCount };
  if (pct >= 0.6) return { grade: "B", color: "#0d3cfc", gapCount };
  if (pct >= 0.4) return { grade: "C", color: "#F59E0B", gapCount };
  return { grade: "D", color: "#EF4444", gapCount };
}

function buildChecks(biz: Business): HealthCheck[] {
  return [
    {
      label: "Photos",
      pass: (biz.photos?.length ?? 0) >= 3,
      detail: (biz.photos?.length ?? 0) >= 3
        ? `${biz.photos.length} photos`
        : biz.photos?.length
          ? `Only ${biz.photos.length} photo${biz.photos.length > 1 ? "s" : ""}`
          : "No photos",
      icon: Image,
    },
    {
      label: "Hours",
      pass: (biz.hours?.length ?? 0) > 0,
      detail: biz.hours?.length > 0 ? "Listed" : "Not listed",
      icon: Clock,
    },
    {
      label: "Website",
      pass: !!biz.website,
      detail: biz.website
        ? biz.website.replace(/^https?:\/\//, "").split("/")[0]
        : "Missing",
      icon: Globe,
    },
    {
      label: "Reviews",
      pass: biz.reviewsCount >= 10,
      detail: biz.reviewsCount >= 10
        ? `${biz.reviewsCount} reviews`
        : biz.reviewsCount > 0
          ? `Only ${biz.reviewsCount} review${biz.reviewsCount > 1 ? "s" : ""}`
          : "No reviews",
      icon: MessageSquare,
    },
  ];
}

/* ─── Component ─── */

export default function ProfileChecker() {
  const [query, setQuery] = useState("");
  const debounced = useDebouncedValue(query, 400);
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchDone, setSearchDone] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const [business, setBusiness] = useState<Business | null>(null);
  const [fetching, setFetching] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Autocomplete search
  useEffect(() => {
    const q = debounced.trim();
    if (q.length < 3) {
      setPredictions([]);
      setDropdownOpen(false);
      setSearchDone(false);
      return;
    }
    setLoading(true);
    setSearchDone(false);
    postJSON<{ ok: true; predictions: Prediction[] }>("/api/audit/search-places", { query: q })
      .then((d) => {
        setPredictions(d.predictions || []);
        setSearchDone(true);
        setDropdownOpen(true);
      })
      .catch(() => {
        setPredictions([]);
        setSearchDone(true);
        setDropdownOpen(true);
      })
      .finally(() => setLoading(false));
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

  // Dismiss on Escape
  useEffect(() => {
    if (!dropdownOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setDropdownOpen(false); inputRef.current?.blur(); }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [dropdownOpen]);

  async function selectBusiness(pred: Prediction) {
    setDropdownOpen(false);
    setPredictions([]);
    setQuery(pred.name);
    setFetching(true);
    setBusiness(null);

    try {
      const body: any = pred.place_id
        ? { placeId: pred.place_id }
        : { query: `${pred.name} ${pred.formatted_address}`.trim() };
      const d = await postJSON<{ ok: true; business: Business }>("/api/audit/place-details", body);
      setBusiness(d.business);
      trackEvent("profile_checked", { name: d.business.name, rating: d.business.rating, reviews: d.business.reviewsCount });
    } catch {
      // Silently fail — user can try again
    } finally {
      setFetching(false);
    }
  }

  const checks = business ? buildChecks(business) : [];
  const gradeInfo = business ? deriveGrade(business) : null;
  const hasGaps = gradeInfo ? gradeInfo.gapCount > 0 : false;

  return (
    <div style={{ marginTop: 32, maxWidth: 520 }}>
      {/* Label */}
      <div style={{
        fontSize: 13, fontWeight: 600, color: mkt.textMuted,
        marginBottom: 10, letterSpacing: "0.01em",
        fontFamily: BODY_FONT,
      }}>
        Check your Google Maps profile in seconds
      </div>

      {/* Search input */}
      <div style={{ position: "relative" }}>
        <Search
          size={16} strokeWidth={1.8}
          style={{
            position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)",
            color: "rgba(255,255,255,0.3)", pointerEvents: "none",
          }}
        />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => { setQuery(e.target.value); setBusiness(null); }}
          onFocus={() => { if (predictions.length > 0 || (searchDone && predictions.length === 0)) setDropdownOpen(true); }}
          placeholder="Your business name + city…"
          style={{
            width: "100%", height: 46, borderRadius: 12,
            border: `1px solid ${mkt.border}`,
            padding: "0 14px 0 42px",
            fontSize: 14, fontWeight: 500, fontFamily: BODY_FONT,
            outline: "none",
            background: "rgba(255,255,255,0.05)",
            color: mkt.onDark,
            boxSizing: "border-box",
            transition: "border-color 0.2s, box-shadow 0.2s",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.15)"; }}
          onMouseLeave={(e) => { if (document.activeElement !== e.currentTarget) e.currentTarget.style.borderColor = mkt.border; }}
          onFocusCapture={(e) => { e.currentTarget.style.borderColor = mkt.accent; e.currentTarget.style.boxShadow = `0 0 0 3px ${mkt.accentTint}`; }}
          onBlurCapture={(e) => { e.currentTarget.style.borderColor = mkt.border; e.currentTarget.style.boxShadow = "none"; }}
        />
        {loading && (
          <div style={{
            position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)",
            width: 16, height: 16,
            border: "2px solid rgba(13,60,252,0.2)",
            borderTopColor: mkt.accent,
            borderRadius: "50%",
            animation: "mgSpinner 0.7s linear infinite",
          }} />
        )}
      </div>

      {/* Dropdown */}
      {dropdownOpen && !loading && searchDone && (
        <div
          ref={dropdownRef}
          style={{
            position: "absolute", zIndex: 50,
            marginTop: 4, borderRadius: 14,
            background: "#1c2325",
            border: `1px solid ${mkt.border}`,
            boxShadow: "0 12px 40px rgba(0,0,0,0.4)",
            overflow: "hidden",
            width: "100%", maxWidth: 520,
          }}
        >
          {predictions.length === 0 ? (
            <div style={{ padding: "14px 16px", fontSize: 13, color: mkt.textFaint, textAlign: "center" }}>
              No businesses found — try adding your city
            </div>
          ) : (
            <div style={{ maxHeight: 260, overflowY: "auto" }}>
              {predictions.map((p, i) => (
                <button
                  key={p.place_id}
                  onClick={() => selectBusiness(p)}
                  style={{
                    width: "100%", textAlign: "left",
                    padding: "10px 16px", background: "transparent",
                    border: "none",
                    borderBottom: i < predictions.length - 1 ? `1px solid ${mkt.borderLight}` : "none",
                    cursor: "pointer",
                    display: "flex", alignItems: "center", gap: 10,
                    transition: "background 0.1s",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.05)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                >
                  {p.photoUrl ? (
                    <img src={p.photoUrl} alt="" style={{ width: 32, height: 32, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />
                  ) : (
                    <div style={{
                      width: 32, height: 32, borderRadius: "50%",
                      background: mkt.accentTint,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      flexShrink: 0, fontSize: 13, fontWeight: 700, color: mkt.accent,
                    }}>
                      {p.name?.charAt(0) || "?"}
                    </div>
                  )}
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, color: mkt.onDark, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {p.name}
                    </div>
                    <div style={{ fontSize: 11, color: mkt.textFaint, marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {p.formatted_address}
                      {p.rating != null && <span style={{ marginLeft: 6 }}>★ {p.rating}</span>}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Loading state */}
      {fetching && (
        <div style={{
          ...GLASS, marginTop: 16, padding: "24px 20px",
          display: "flex", alignItems: "center", gap: 12,
        }}>
          <div style={{
            width: 20, height: 20,
            border: "2px solid rgba(13,60,252,0.2)",
            borderTopColor: mkt.accent,
            borderRadius: "50%",
            animation: "mgSpinner 0.7s linear infinite",
          }} />
          <span style={{ fontSize: 13, color: mkt.textMuted, fontFamily: BODY_FONT }}>
            Checking your profile…
          </span>
        </div>
      )}

      {/* Result card */}
      {business && !fetching && (
        <div style={{ ...GLASS, marginTop: 16, padding: "20px", overflow: "hidden" }}>
          {/* Business header */}
          <div style={{ display: "flex", gap: 14, alignItems: "flex-start", marginBottom: 16 }}>
            {business.businessPhotoUrl ? (
              <img src={business.businessPhotoUrl} alt={business.name} style={{
                width: 52, height: 52, borderRadius: 12, objectFit: "cover",
                border: `2px solid ${mkt.accent}33`, flexShrink: 0,
              }} />
            ) : (
              <div style={{
                width: 52, height: 52, borderRadius: 12,
                background: mkt.accentTint,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 20, fontWeight: 700, color: mkt.accent, flexShrink: 0,
              }}>
                {business.name.charAt(0)}
              </div>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: mkt.onDark, lineHeight: 1.2, marginBottom: 4 }}>
                {business.name}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                {business.rating != null && (
                  <>
                    <Star size={13} color="#F59E0B" fill="#F59E0B" />
                    <span style={{ fontSize: 13, fontWeight: 600, color: mkt.onDark }}>{business.rating}</span>
                  </>
                )}
                <span style={{ fontSize: 12, color: mkt.textFaint }}>
                  ({business.reviewsCount} review{business.reviewsCount !== 1 ? "s" : ""})
                </span>
              </div>
            </div>
            {/* Grade badge */}
            {gradeInfo && (
              <div style={{
                width: 44, height: 44, borderRadius: 12,
                background: `${gradeInfo.color}18`,
                border: `1.5px solid ${gradeInfo.color}44`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 20, fontWeight: 800, color: gradeInfo.color,
                flexShrink: 0,
              }}>
                {gradeInfo.grade}
              </div>
            )}
          </div>

          {/* Health checks */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {checks.map((check) => {
              const Icon = check.icon;
              return (
                <div key={check.label} style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "8px 10px", borderRadius: 10,
                  background: check.pass ? "rgba(34,197,94,0.06)" : "rgba(239,68,68,0.06)",
                  border: `1px solid ${check.pass ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.12)"}`,
                }}>
                  {check.pass ? (
                    <CheckCircle2 size={14} color="#22C55E" style={{ flexShrink: 0 }} />
                  ) : (
                    <XCircle size={14} color="#EF4444" style={{ flexShrink: 0 }} />
                  )}
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: mkt.textFaint, letterSpacing: "0.02em" }}>
                      {check.label}
                    </div>
                    <div style={{
                      fontSize: 12, fontWeight: 500,
                      color: check.pass ? "rgba(34,197,94,0.9)" : "rgba(239,68,68,0.9)",
                      whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                    }}>
                      {check.detail}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Contextual message */}
          <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${mkt.border}` }}>
            {hasGaps ? (
              <>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 10 }}>
                  <AlertTriangle size={14} color="#F59E0B" style={{ flexShrink: 0, marginTop: 2 }} />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: mkt.onDark, lineHeight: 1.3 }}>
                      You're losing visibility because of these gaps.
                    </div>
                    <div style={{ fontSize: 12, color: mkt.textFaint, marginTop: 3, lineHeight: 1.5 }}>
                      MapGuard fixes them automatically so you rank higher and get more calls.
                      Competitors with stronger profiles are getting those calls.
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: mkt.onDark, lineHeight: 1.3 }}>
                  Your profile looks strong — but competitors can still outrank you.
                </div>
                <div style={{ fontSize: 12, color: mkt.textFaint, marginTop: 3, lineHeight: 1.5 }}>
                  MapGuard keeps your listing optimized so you stay ahead.
                </div>
              </div>
            )}

            {/* Cross-tool suggestions */}
            <NextStepSuggestions context="mapguard" theme="dark" />

            {/* CTAs */}
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <Link href="/pricing" onClick={() => trackEvent("mapguard_primary_cta_clicked", { target: "/pricing" })} style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "10px 20px", borderRadius: 10,
                background: mkt.accent, color: "#FFFFFF",
                fontSize: 13, fontWeight: 700, textDecoration: "none",
                transition: "box-shadow 0.2s, transform 0.2s",
              }}
                onMouseEnter={(e) => { const el = e.currentTarget as HTMLElement; el.style.boxShadow = "0 0 20px rgba(13,60,252,0.25)"; el.style.transform = "translateY(-1px)"; }}
                onMouseLeave={(e) => { const el = e.currentTarget as HTMLElement; el.style.boxShadow = "none"; el.style.transform = "translateY(0)"; }}
              >
                Start My Optimization
                <ArrowRight size={14} />
              </Link>
              <Link href="/tools/free-audit" onClick={() => trackEvent("mapguard_secondary_cta_clicked", { target: "/tools/free-audit" })} style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "10px 16px", borderRadius: 10,
                background: "transparent", color: mkt.textMuted,
                fontSize: 13, fontWeight: 600, textDecoration: "none",
                border: `1px solid ${mkt.border}`,
                transition: "border-color 0.2s, color 0.2s",
              }}
                onMouseEnter={(e) => { const el = e.currentTarget as HTMLElement; el.style.borderColor = "rgba(255,255,255,0.15)"; el.style.color = mkt.onDark; }}
                onMouseLeave={(e) => { const el = e.currentTarget as HTMLElement; el.style.borderColor = mkt.border; el.style.color = mkt.textMuted; }}
              >
                Get full detailed audit
              </Link>
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes mgSpinner { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
