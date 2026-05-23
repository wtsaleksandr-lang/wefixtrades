/**
 * NapConsistencyTab — Free-Audit tab #3: directory NAP (name / address /
 * phone) consistency check. Backend: GET /api/audit/nap-consistency.
 *
 * UI: directory table with rows per source (Google / Facebook / Yelp /
 * BBB / YellowPages) and columns for Name / Address / Phone. Color-coded
 * cells (green match, red mismatch, grey unknown). Plain-English summary
 * above. "Fix these → MapGuard" CTA below.
 */

import { useEffect, useMemo, useState } from "react";
import { Check, X, Minus, MapPin, Phone, Building2, Search } from "lucide-react";
import AuditTabFrame, { staggerDelay } from "./AuditTabFrame";
import AuditTabHelpModal from "./AuditTabHelpModal";

type NapField = "match" | "mismatch" | "missing" | "unknown";

interface NapRow {
  source: string;
  label: string;
  status: "found" | "not-found" | "unable-to-check";
  name?: string;
  nameMatch: NapField;
  address?: string;
  addressMatch: NapField;
  phone?: string;
  phoneMatch: NapField;
  note?: string;
}

interface NapResponse {
  ok: boolean;
  sources: NapRow[];
  summary: string;
  mismatchCount: number;
}

const INK = "#0d1514";
const GREY = "#6B7280";
const GREEN = "#22C55E";
const RED = "#EF4444";

function fieldBg(f: NapField): { bg: string; color: string; icon: JSX.Element; label: string } {
  if (f === "match") return { bg: "#DCFCE7", color: "#166534", icon: <Check size={12} />, label: "match" };
  if (f === "mismatch") return { bg: "#FEE2E2", color: "#991B1B", icon: <X size={12} />, label: "mismatch" };
  if (f === "missing") return { bg: "#F3F4F6", color: "#374151", icon: <Minus size={12} />, label: "missing" };
  return { bg: "#F3F4F6", color: GREY, icon: <Minus size={12} />, label: "—" };
}

function Cell({ field, value }: { field: NapField; value?: string }) {
  const s = fieldBg(field);
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 4,
        padding: "8px 10px",
        background: s.bg,
        color: s.color,
        borderRadius: 8,
        minWidth: 0,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>
        {s.icon} {s.label}
      </div>
      {value && (
        <div
          style={{
            fontSize: 11,
            color: INK,
            opacity: 0.85,
            lineHeight: 1.35,
            wordBreak: "break-word",
            overflow: "hidden",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
          }}
        >
          {value}
        </div>
      )}
    </div>
  );
}

function DirRow({ row, index }: { row: NapRow; index: number }) {
  const delay = staggerDelay(index);
  return (
    <div
      data-theme="light"
      data-testid={`audit-nap-row-${row.source}`}
      className="motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-1"
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(110px, 0.6fr) repeat(3, 1fr)",
        gap: 8,
        padding: "10px 12px",
        background: "#fff",
        border: "1px solid #E5E7EB",
        borderRadius: 12,
        animationDelay: `${delay}ms`,
        animationDuration: "350ms",
        animationFillMode: "backwards",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center" }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: INK }}>{row.label}</div>
        {row.note && (
          <div style={{ fontSize: 10, color: GREY, marginTop: 2, lineHeight: 1.4 }}>{row.note}</div>
        )}
        {row.status === "not-found" && !row.note && (
          <div style={{ fontSize: 10, color: GREY, marginTop: 2 }}>not listed</div>
        )}
      </div>
      <Cell field={row.nameMatch} value={row.name} />
      <Cell field={row.addressMatch} value={row.address} />
      <Cell field={row.phoneMatch} value={row.phone} />
    </div>
  );
}

export interface NapConsistencyTabProps {
  reportId?: string | null;
}

export default function NapConsistencyTab({ reportId }: NapConsistencyTabProps) {
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [data, setData] = useState<NapResponse | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (!reportId) {
      setState("error");
      setErrorMsg("This tool needs a saved report.");
      return;
    }
    const cacheKey = `nap-consistency:${reportId}`;
    try {
      const cached = sessionStorage.getItem(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        setData(parsed);
        setState("ready");
        return;
      }
    } catch { /* noop */ }

    let cancelled = false;
    fetch(`/api/audit/nap-consistency?reportId=${encodeURIComponent(reportId)}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((json: NapResponse) => {
        if (cancelled) return;
        if (!json.ok) throw new Error("API error");
        setData(json);
        setState("ready");
        try { sessionStorage.setItem(cacheKey, JSON.stringify(json)); } catch { /* noop */ }
      })
      .catch((e) => {
        if (cancelled) return;
        setErrorMsg(e?.message || "Failed to load NAP report.");
        setState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [reportId]);

  const helpSections = useMemo(
    () => [
      {
        icon: <Search size={20} />,
        title: "What this is",
        body: "We look up your business on five major directories (Google, Facebook, Yelp, BBB, YellowPages) and compare the Name / Address / Phone each one shows.",
      },
      {
        icon: <Building2 size={20} />,
        title: "How to read it",
        body: "Each row is a directory. Green = matches what's on file. Red = different from what's on file (a mismatch). Grey = couldn't check or no listing found.",
      },
      {
        icon: <Phone size={20} />,
        title: "Why it matters",
        body: "Search engines cross-reference your NAP across the web. Inconsistencies make Google less confident your business is legit — which means lower local-pack rankings.",
      },
      {
        icon: <MapPin size={20} />,
        title: "How to improve it",
        body: "Pick one canonical version of your NAP and update every directory to match. MapGuard does this for you and re-checks every week.",
      },
    ],
    [],
  );

  return (
    <AuditTabFrame
      testid="audit-tab-nap-consistency"
      title="NAP Consistency across the web"
      insight={data?.summary || null}
      state={state}
      errorMessage={errorMsg}
      helpTrigger={
        <AuditTabHelpModal
          testid="audit-nap-help"
          triggerLabel="What is NAP consistency?"
          title="Understanding NAP consistency"
          sections={helpSections}
          cta={{ label: "Get MapGuard", href: "/products/mapguard?utm_source=audit&utm_medium=help-modal&utm_campaign=nap" }}
        />
      }
      cta={
        data
          ? {
              eyebrow: data.mismatchCount > 0 ? "Fix the mismatches" : "Keep it locked in",
              pitch: "MapGuard monitors your listings every week and auto-flags any directory drift before it hurts rankings.",
              label: "Get MapGuard",
              href: "/products/mapguard?utm_source=audit&utm_medium=tab-cta&utm_campaign=nap",
            }
          : undefined
      }
    >
      {data && (
        <>
          {/* Column headers */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(110px, 0.6fr) repeat(3, 1fr)",
              gap: 8,
              padding: "0 12px 6px",
              fontSize: 11,
              fontWeight: 700,
              color: GREY,
              letterSpacing: "0.05em",
              textTransform: "uppercase",
            }}
          >
            <div>Directory</div>
            <div>Name</div>
            <div>Address</div>
            <div>Phone</div>
          </div>
          <div style={{ display: "grid", gap: 8 }}>
            {data.sources.map((r, i) => (
              <DirRow key={r.source} row={r} index={i} />
            ))}
          </div>

          {/* Mismatch banner */}
          {data.mismatchCount > 0 && (
            <div
              style={{
                marginTop: 14,
                padding: "12px 14px",
                background: "#FEF2F2",
                border: "1px solid #FECACA",
                borderRadius: 12,
                display: "flex",
                gap: 10,
                alignItems: "flex-start",
              }}
            >
              <X size={16} color={RED} style={{ flexShrink: 0, marginTop: 2 }} />
              <div style={{ fontSize: 12.5, color: INK, lineHeight: 1.55 }}>
                <strong>{data.mismatchCount} mismatch{data.mismatchCount === 1 ? "" : "es"} found.</strong> Inconsistent NAP across directories signals "shaky business" to Google — and to customers comparing listings.
              </div>
            </div>
          )}
          {data.mismatchCount === 0 && (
            <div
              style={{
                marginTop: 14,
                padding: "12px 14px",
                background: "#F0FDF4",
                border: "1px solid #BBF7D0",
                borderRadius: 12,
                display: "flex",
                gap: 10,
                alignItems: "flex-start",
              }}
            >
              <Check size={16} color={GREEN} style={{ flexShrink: 0, marginTop: 2 }} />
              <div style={{ fontSize: 12.5, color: INK, lineHeight: 1.55 }}>
                <strong>NAP is consistent across the directories we checked.</strong> Strong local-SEO foundation.
              </div>
            </div>
          )}
        </>
      )}
    </AuditTabFrame>
  );
}
