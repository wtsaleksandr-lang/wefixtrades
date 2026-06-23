/**
 * BI-1 — Anonymous calculator demo: upload page.
 *
 * Routes (tools-consolidation: relocated under the QuoteQuick product
 * family because the demo generates a QuoteQuick calculator):
 *   /products/quickquotepro/build-with-ai           → this page (upload)
 *   /products/quickquotepro/build-with-ai/preview   → BuildWithAiPreview.tsx
 *                                                     (renders the generated
 *                                                     calculator + signup gate)
 *
 * Legacy /tools/build-with-ai* paths 301 to the new locations.
 *
 * Flow:
 *   1. Visitor drops or picks one pricing doc (PNG/JPG/WEBP/PDF/XLSX/email).
 *   2. We POST it to /api/ai/demo/image-to-template-anonymous.
 *   3. On success we get back { template, demoSessionId }; we stash the
 *      template in sessionStorage (so a hard refresh on the preview page
 *      doesn't lose it) and navigate to the preview route with the
 *      session id in the query string.
 *
 * Rate limit lives SERVER-side (1 / IP / 24h) — there's no client-side
 * gate beyond optimistic-disable while the upload is in flight.
 *
 * Wave 67 polish:
 *   - Header + dropzone copy broadened beyond images (PDF/XLSX/email now
 *     ship per Wave 64). "AI" wording dropped from headline + subcopy.
 *   - WeFixTrades branded chip top-left of the dropzone card.
 *   - Marching-ants animated dashed border around the dropzone (CSS
 *     keyframes on an SVG overlay; respects prefers-reduced-motion).
 *   - "+ NEW QUOTE" reset button (state-aware: hidden until a file is
 *     selected).
 *   - Sample thumbnails row (drag-to-try placeholders — wiring is a
 *     Wave 67.5 follow-up; see TODO below).
 *   - 5-stat hero+grid (KpiGauge + 4 micro-cards) replaces the old
 *     3 sample-output text cards.
 */
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { PageMeta } from "@/components/seo/PageMeta";
import { mkt, colors } from "@/theme/tokens";
import { useBreadcrumbSchema } from "@/lib/useBreadcrumbSchema";
import { KpiGauge } from "@/components/ui/visual-primitives";
import type { DemoImageTemplate } from "@shared/aiDemoTemplate";
import {
  UploadCloud,
  Sparkles,
  Clock,
  ShieldCheck,
  AlertTriangle,
  FileText,
  FileSpreadsheet,
  Mail,
  Image as ImageIcon,
  Check,
  Plus,
  Zap,
} from "lucide-react";

const BASE = "https://wefixtrades.com";

/* Wave 64 — multi-format upload. Per-MIME size caps match the server
 *  (server/routes/aiDemoRoutes.ts).  Images: 3 MB · PDFs: 10 MB ·
 *  Excel: 5 MB · text/email: 1 MB. */
const MAX_BYTES_IMAGE = 3 * 1024 * 1024;
const MAX_BYTES_PDF = 10 * 1024 * 1024;
const MAX_BYTES_EXCEL = 5 * 1024 * 1024;
const MAX_BYTES_TEXT = 1 * 1024 * 1024;

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
const PDF_TYPES = ["application/pdf"];
const EXCEL_TYPES = [
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
];
const TEXT_TYPES = ["text/plain", "message/rfc822"];
const ACCEPTED = [...IMAGE_TYPES, ...PDF_TYPES, ...EXCEL_TYPES, ...TEXT_TYPES];

/** Native <input accept> string — mixes MIME types and extensions because
 *  browsers don't reliably know the MIME for .eml / .xls picked from disk. */
const ACCEPT_ATTR =
  "image/png,image/jpeg,image/webp,application/pdf," +
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet," +
  "application/vnd.ms-excel,.xlsx,.xls," +
  "text/plain,message/rfc822,.eml,.txt";

type FileKind = "image" | "pdf" | "excel" | "email" | null;

function classifyFile(file: File | null): FileKind {
  if (!file) return null;
  const t = (file.type || "").toLowerCase();
  if (IMAGE_TYPES.includes(t)) return "image";
  if (PDF_TYPES.includes(t)) return "pdf";
  if (EXCEL_TYPES.includes(t)) return "excel";
  if (TEXT_TYPES.includes(t)) return "email";
  // Fall back to extension if the browser didn't set a useful MIME (common
  // for .eml + older .xls). Keep names lower-case for the suffix test.
  const name = file.name.toLowerCase();
  if (name.endsWith(".pdf")) return "pdf";
  if (name.endsWith(".xlsx") || name.endsWith(".xls")) return "excel";
  if (name.endsWith(".eml") || name.endsWith(".txt")) return "email";
  return null;
}

function maxBytesFor(kind: FileKind): number {
  switch (kind) {
    case "image": return MAX_BYTES_IMAGE;
    case "pdf": return MAX_BYTES_PDF;
    case "excel": return MAX_BYTES_EXCEL;
    case "email": return MAX_BYTES_TEXT;
    default: return MAX_BYTES_IMAGE;
  }
}

function tooLargeMessage(kind: FileKind): string {
  switch (kind) {
    case "image": return "Image is too large — keep it under 3 MB.";
    case "pdf": return "PDF is too large — keep it under 10 MB.";
    case "excel": return "Spreadsheet is too large — keep it under 5 MB.";
    case "email": return "Email/text file is too large — keep it under 1 MB.";
    default: return "File is too large.";
  }
}

/** Session-storage key the preview page reads on mount. */
export const BI1_DEMO_STORAGE_KEY = "wfx_bi1_demo";

// Wave 67.5 — wired sample chips. Each chip loads a canned DemoImageTemplate
// locally (no AI call, no rate limit), stashes it in sessionStorage, and
// navigates to the preview route — same post-generation flow as a real upload.
interface SampleThumb {
  id: string;
  title: string;
  iconKind: "image" | "pdf" | "email";
  template: DemoImageTemplate;
}

/* ─── Canned sample templates ─────────────────────────────────────────────
 * Realistic small templates for three common trades.  Modifiers default ON
 * via the demo converter's constant-coefficient formula (no toggle fields).
 * ──────────────────────────────────────────────────────────────────────── */

const SAMPLE_JUNK_REMOVAL: DemoImageTemplate = {
  title: "Junk Removal Invoice",
  basePrice: 149,
  currency: "USD",
  addons: [
    { label: "Extra large item (mattress, sofa)", price: 45, type: "checkbox" },
    { label: "Appliance disposal (fridge, washer)", price: 60, type: "checkbox" },
    { label: "Additional load (per truck load)", price: 99, type: "quantity" },
  ],
  modifiers: [
    { label: "Fuel & disposal surcharge", type: "percent", value: 8, appliesTo: "total" },
  ],
  notes: "Same-day service available. Price includes standard haul-away. Hazardous materials not accepted.",
};

const SAMPLE_HVAC: DemoImageTemplate = {
  title: "HVAC Service Estimate",
  basePrice: 89,
  currency: "USD",
  addons: [
    { label: "AC unit service (per unit)", price: 120, type: "quantity" },
    { label: "Furnace tune-up", price: 95, type: "checkbox" },
    { label: "Air quality test & report", price: 75, type: "checkbox" },
    { label: "Filter replacement (per unit)", price: 35, type: "quantity" },
  ],
  modifiers: [
    { label: "HST / Sales tax (13%)", type: "percent", value: 13, appliesTo: "total" },
  ],
  notes: "Service call fee applied toward repair cost if work is performed same day. 90-day labour warranty.",
};

const SAMPLE_LAWN_CARE: DemoImageTemplate = {
  title: "Lawn Care Service",
  basePrice: 55,
  currency: "USD",
  addons: [
    { label: "Edging & trimming", price: 20, type: "checkbox" },
    { label: "Fertiliser application", price: 40, type: "checkbox" },
    { label: "Aeration (per 1,000 sq ft)", price: 50, type: "quantity" },
    { label: "Weed control treatment", price: 35, type: "checkbox" },
  ],
  modifiers: [
    { label: "Large yard surcharge (>5,000 sq ft)", type: "fixed", value: 25, appliesTo: "base" },
  ],
  notes: "Bi-weekly and monthly maintenance plans available at a 10% discount. Fully insured.",
};

const SAMPLE_THUMBS: SampleThumb[] = [
  { id: "junk-removal", title: "Junk removal invoice", iconKind: "image", template: SAMPLE_JUNK_REMOVAL },
  { id: "hvac-pricing",  title: "HVAC pricing PDF",    iconKind: "pdf",   template: SAMPLE_HVAC },
  { id: "lawn-care",    title: "Lawn-care email",      iconKind: "email", template: SAMPLE_LAWN_CARE },
];

export default function BuildWithAi() {
  // Title + meta tags handled by <PageMeta> below.

  const breadcrumbs = useMemo(
    () => [
      { name: "Home", url: `${BASE}/` },
      { name: "QuoteQuick", url: `${BASE}/products/quickquotepro` },
      { name: "Build with AI", url: `${BASE}/products/quickquotepro/build-with-ai` },
    ],
    [],
  );
  useBreadcrumbSchema(breadcrumbs);

  const [, navigate] = useLocation();
  const inputRef = useRef<HTMLInputElement | null>(null);
  // Scoped keyframe id for CSS animations on this page instance.
  const scopeId = useId().replace(/:/g, "");

  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [dropzoneHover, setDropzoneHover] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // prefers-reduced-motion gate for the marching-ants border.
  const [reducedMotion, setReducedMotion] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handler = () => setReducedMotion(mq.matches);
    handler();
    if (mq.addEventListener) {
      mq.addEventListener("change", handler);
      return () => mq.removeEventListener("change", handler);
    }
    mq.addListener(handler);
    return () => mq.removeListener(handler);
  }, []);

  // Scroll-into-view trigger for the proven-by-the-numbers section. Used so
  // the hero gauge animates from 0 -> 70 once it enters the viewport (matches
  // the demo animation flow).
  const statsRef = useRef<HTMLDivElement | null>(null);
  const [statsVisible, setStatsVisible] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !("IntersectionObserver" in window)) {
      setStatsVisible(true);
      return;
    }
    const node = statsRef.current;
    if (!node) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setStatsVisible(true);
            io.disconnect();
            break;
          }
        }
      },
      { threshold: 0.25 },
    );
    io.observe(node);
    return () => io.disconnect();
  }, []);

  const handlePicked = useCallback((picked: File | null) => {
    setError(null);
    if (!picked) {
      setFile(null);
      setPreviewUrl(null);
      return;
    }
    const kind = classifyFile(picked);
    if (!kind) {
      setError("Use a photo (PNG/JPG/WEBP), PDF, Excel sheet, or email.");
      return;
    }
    const cap = maxBytesFor(kind);
    if (picked.size > cap) {
      setError(tooLargeMessage(kind));
      return;
    }
    setFile(picked);
    // Revoke any prior object URL to keep memory tidy.
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    // Object URLs are only useful for images — for PDFs / Excel / email we
    // show a typed icon card instead of an inline preview.
    setPreviewUrl(kind === "image" ? URL.createObjectURL(picked) : null);
  }, [previewUrl]);

  const handleReset = useCallback(() => {
    setFile(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setError(null);
    setSubmitting(false);
    if (inputRef.current) {
      // Reset the underlying input so re-picking the same file fires onChange.
      inputRef.current.value = "";
    }
  }, [previewUrl]);

  const handleSubmit = useCallback(async () => {
    if (!file || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("image", file);
      const res = await fetch("/api/ai/demo/image-to-template-anonymous", {
        method: "POST",
        body: fd,
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(
          body?.message ||
            (res.status === 429
              ? "You've already used your free demo today. Sign up to keep going."
              : "Something went wrong. Try a sharper photo."),
        );
        setSubmitting(false);
        return;
      }
      // Stash the result so the preview page can render synchronously on
      // first paint (avoids a flash of empty state while the GET fires).
      try {
        sessionStorage.setItem(
          BI1_DEMO_STORAGE_KEY,
          JSON.stringify({
            template: body.template,
            demoSessionId: body.demoSessionId,
            ts: Date.now(),
          }),
        );
      } catch {
        /* private mode / disabled — preview page will GET from server */
      }
      navigate(`/products/quickquotepro/build-with-ai/preview?session=${encodeURIComponent(body.demoSessionId)}`);
    } catch (err: any) {
      setError(err?.message || "Network error. Try again in a moment.");
      setSubmitting(false);
    }
  }, [file, submitting, navigate]);

  // B5 — load a canned sample template into the preview without an AI call.
  const handleSampleClick = useCallback(
    (thumb: SampleThumb) => {
      const sessionId = `sample-${thumb.id}`;
      try {
        sessionStorage.setItem(
          BI1_DEMO_STORAGE_KEY,
          JSON.stringify({
            template: thumb.template,
            demoSessionId: sessionId,
            ts: Date.now(),
          }),
        );
      } catch {
        /* private mode — preview will not find storage; navigate anyway */
      }
      navigate(`/products/quickquotepro/build-with-ai/preview?session=${encodeURIComponent(sessionId)}`);
    },
    [navigate],
  );

  const onDrop = useCallback(
    (e: React.DragEvent<HTMLLabelElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setDragActive(false);
      const picked = e.dataTransfer.files?.[0] || null;
      handlePicked(picked);
    },
    [handlePicked],
  );

  // Marching-ants animation parameters. We use CSS keyframes on the SVG rect
  // (stroke-dashoffset 0 → -14). Speed up + recolor on drag-over for an
  // affordance that mirrors the cursor's intent.
  // A2: hover brightens the border toward the accent colour (partial opacity).
  const antsDuration = dragActive ? "0.6s" : "1.6s";
  const antsStroke = dragActive
    ? mkt.accent
    : dropzoneHover
    ? "rgba(13,60,252,0.55)"
    : "rgba(255,255,255,0.28)";

  return (
    <MarketingLayout>
      <PageMeta
        title="From any pricing doc to a working calculator — free demo"
        description="Drop a photo, PDF, Excel sheet, or email of your pricing and we build a live calculator your customers can use to book and pay. Free, no signup, no credit card."
        canonical="/products/quickquotepro/build-with-ai"
        keywords={["build calculator from pdf", "quote builder", "excel to calculator", "image to calculator"]}
      />
      {/* Keyframes — self-contained in this file. Scoped by scopeId to avoid
          collisions when multiple instances mount. prefers-reduced-motion
          guards strip motion while preserving colour transitions. */}
      <style>{`
        @keyframes wfx-marching-ants {
          to { stroke-dashoffset: -14; }
        }
        /* A2 — cloud icon nudge on dropzone hover */
        @keyframes wfx-cloud-nudge-${scopeId} {
          0%   { transform: translateY(0); }
          50%  { transform: translateY(-2px); }
          100% { transform: translateY(0); }
        }
        /* A3 — gauge count-up is driven by the KpiGauge component itself
           (value prop animates 0→70 via statsVisible). */
        /* A3 — 24/7 clock rotation */
        @keyframes wfx-clock-spin-${scopeId} {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        /* A3 — lightning double-flash + jolt */
        @keyframes wfx-lightning-flash-${scopeId} {
          0%,100%  { opacity: 1; filter: brightness(1); transform: translateX(0); }
          15%      { opacity: 0.35; filter: brightness(2.2); transform: translateX(1px); }
          25%      { opacity: 1; filter: brightness(1.6); transform: translateX(-1px); }
          45%      { opacity: 0.35; filter: brightness(2.2); transform: translateX(1px); }
          60%      { opacity: 1; filter: brightness(1); transform: translateX(0); }
        }
        @media (prefers-reduced-motion: reduce) {
          .wfx-marching-ants-rect { animation: none !important; }
          .wfx-cloud-nudge-${scopeId} { animation: none !important; }
          .wfx-clock-anim-${scopeId} { animation: none !important; }
          .wfx-lightning-anim-${scopeId} { animation: none !important; }
        }
      `}</style>
      <section
        style={{
          background: mkt.bg,
          minHeight: "100vh",
          padding: "clamp(100px, 12vw, 140px) clamp(16px, 5vw, 40px) clamp(48px, 8vw, 80px)",
        }}
      >
        <div style={{ maxWidth: 1080, margin: "0 auto", position: "relative" }}>
          {/* A1 — eyebrow pinned to top-left of the content container.
              Uses absolute positioning so it doesn't push the H1 down and
              sits clear of the nav at all widths (nav is outside this section).
              A sensible clamp ensures it never clips at 375px. */}
          <div
            aria-label="Free Demo — No Signup"
            style={{
              position: "absolute",
              top: "clamp(-56px, -4vw, -40px)",
              left: 0,
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              color: mkt.accent,
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              whiteSpace: "nowrap",
            }}
          >
            <Sparkles size={14} strokeWidth={2} />
            <span>✦ FREE DEMO · NO SIGNUP</span>
          </div>

          {/* Hero — Wave 67 copy: no "AI" wording, broader formats. */}
          <h1
            style={{
              fontSize: "clamp(28px, 5vw, 44px)",
              fontWeight: 700,
              color: colors.effortel.n300,
              lineHeight: 1.1,
              letterSpacing: "-0.025em",
              margin: "0 0 16px",
              textAlign: "center",
            }}
          >
            From any pricing doc to a{" "}
            <span style={{ color: mkt.accent }}>working calculator</span>.
          </h1>
          <p
            style={{
              fontSize: "clamp(15px, 2vw, 17px)",
              color: mkt.onDarkMuted,
              lineHeight: 1.55,
              textAlign: "center",
              maxWidth: 620,
              margin: "0 auto 28px",
            }}
          >
            Drop a photo, PDF, Excel sheet, or email of your pricing — we
            build a live calculator your customers can use to book and pay.
            Free, no signup, no credit card.
          </p>

          {/* Trust pills */}
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              flexWrap: "wrap",
              gap: 10,
              marginBottom: "clamp(32px, 5vw, 40px)",
            }}
          >
            {[
              { icon: <Sparkles size={14} strokeWidth={2} />, label: "Free" },
              { icon: <Clock size={14} strokeWidth={2} />, label: "60 seconds" },
              { icon: <ShieldCheck size={14} strokeWidth={2} />, label: "No credit card" },
            ].map((pill) => (
              <span
                key={pill.label}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "6px 12px",
                  borderRadius: 999,
                  fontSize: 12,
                  fontWeight: 600,
                  color: mkt.onDark,
                  background: "rgba(255,255,255,0.05)",
                  border: `1px solid ${mkt.onDarkBorder}`,
                  letterSpacing: "0.02em",
                }}
              >
                {pill.icon}
                {pill.label}
              </span>
            ))}
          </div>

          {/* Upload card (centred — keeps the dropzone at a comfortable
              reading width even though the parent container is now wider
              to host the stats grid below). */}
          <div style={{ maxWidth: 760, margin: "0 auto" }}>
            <div
              style={{
                position: "relative",
                background: "rgba(255,255,255,0.03)",
                border: `1px solid ${mkt.onDarkBorder}`,
                borderRadius: 18,
                padding: "clamp(20px, 4vw, 32px)",
                boxShadow: "0 24px 60px rgba(0,0,0,0.35)",
              }}
            >
              {/* A2 — WeFixTrades branded chip top-left. Mirrors the demo
                  animation's "this is a future WeFixTrades dashboard" hint. */}
              <div
                aria-hidden="true"
                style={{
                  position: "absolute",
                  top: 12,
                  left: 16,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: 12,
                  fontWeight: 700,
                  color: mkt.onDark,
                  letterSpacing: "0.01em",
                  lineHeight: 1,
                }}
              >
                <Check size={14} strokeWidth={2.5} color={mkt.accent} />
                <span>
                  We<span style={{ color: mkt.accent }}>Fix</span>Trades
                </span>
              </div>

              {/* A5 — state-aware "+ NEW QUOTE" reset button. Hidden in
                  the initial empty state. */}
              {file && (
                <button
                  type="button"
                  onClick={handleReset}
                  data-testid="build-with-ai-new-quote-button"
                  style={{
                    position: "absolute",
                    top: 10,
                    right: 12,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    padding: "6px 10px",
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: "0.06em",
                    color: mkt.accent,
                    background: "transparent",
                    border: `1px solid ${mkt.accent}`,
                    borderRadius: 999,
                    cursor: "pointer",
                    transition: "background 160ms ease",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = mkt.accentTint;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "transparent";
                  }}
                >
                  <Plus size={12} strokeWidth={2.5} />
                  <span>NEW QUOTE</span>
                </button>
              )}

              {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions */}
              <label
                htmlFor="bi1-upload"
                onMouseEnter={() => setDropzoneHover(true)}
                onMouseLeave={() => setDropzoneHover(false)}
                onDragEnter={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setDragActive(true);
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                onDragLeave={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setDragActive(false);
                }}
                onDrop={onDrop}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    inputRef.current?.click();
                  }
                }}
                tabIndex={0}
                role="button"
                aria-label="Upload pricing document"
                style={{
                  position: "relative",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 12,
                  // Reserve top padding so the branded chip + new-quote
                  // button never collide with the dropzone copy.
                  padding: "clamp(40px, 6vw, 52px) 20px clamp(28px, 6vw, 40px)",
                  borderRadius: 14,
                  // A2: hover tint lifts the background; drag-over is stronger.
                  // Border colour brightens on hover via the SVG stroke (antsStroke).
                  background: dragActive
                    ? mkt.accentTint
                    : dropzoneHover
                    ? "rgba(13,60,252,0.045)"
                    : "rgba(255,255,255,0.02)",
                  cursor: "pointer",
                  transition: "background 160ms ease",
                  textAlign: "center",
                  // Prevent text-selection caret from appearing on click/focus —
                  // the label contains text nodes and some browsers paint a
                  // blinking text cursor when the element is activated.
                  userSelect: "none",
                  WebkitUserSelect: "none",
                  // Suppress the default focus outline on this div-like label;
                  // the SVG marching-ants border already provides a visible
                  // focus indicator (stroke brightens on drag-over / active).
                  outline: "none",
                }}
              >
                {/* A3 — marching-ants animated border. SVG overlay sits on
                    top of the label, ignores pointer events, and animates
                    its stroke-dashoffset via CSS keyframes. Disabled by
                    @media (prefers-reduced-motion). */}
                <svg
                  aria-hidden="true"
                  preserveAspectRatio="none"
                  style={{
                    position: "absolute",
                    inset: 0,
                    width: "100%",
                    height: "100%",
                    pointerEvents: "none",
                    overflow: "visible",
                  }}
                >
                  <rect
                    className="wfx-marching-ants-rect"
                    x="0"
                    y="0"
                    width="100%"
                    height="100%"
                    rx="14"
                    ry="14"
                    fill="none"
                    stroke={antsStroke}
                    strokeWidth="2"
                    strokeDasharray="8 6"
                    vectorEffect="non-scaling-stroke"
                    style={{
                      animation: reducedMotion
                        ? undefined
                        : `wfx-marching-ants ${antsDuration} linear infinite`,
                      transition: "stroke 160ms ease",
                    }}
                  />
                </svg>

                {/* File input is intentionally non-focusable: the label (with
                    tabIndex=0 + onKeyDown) handles keyboard activation by
                    calling inputRef.current?.click(). Using the visually-hidden
                    clip pattern (not display:none) keeps the input in the DOM
                    so inputRef.current?.click() works, while caret-color:transparent
                    + tabIndex={-1} prevents any caret from painting. */}
                <input
                  id="bi1-upload"
                  ref={inputRef}
                  type="file"
                  accept={ACCEPT_ATTR}
                  tabIndex={-1}
                  aria-hidden="true"
                  style={{
                    position: "absolute",
                    width: 1,
                    height: 1,
                    overflow: "hidden",
                    opacity: 0,
                    pointerEvents: "none",
                    clipPath: "inset(50%)",
                    whiteSpace: "nowrap",
                    caretColor: "transparent",
                  }}
                  onChange={(e) => handlePicked(e.target.files?.[0] || null)}
                />
                {/* A2 — cloud nudges up on hover (~160ms ease, reduced-motion: keep colour only) */}
                <span
                  className={`wfx-cloud-nudge-${scopeId}`}
                  style={{
                    display: "inline-flex",
                    animation: dropzoneHover && !reducedMotion
                      ? `wfx-cloud-nudge-${scopeId} 160ms ease forwards`
                      : undefined,
                    transition: "filter 160ms ease",
                    filter: dropzoneHover ? `drop-shadow(0 0 4px ${mkt.accent}55)` : undefined,
                  }}
                >
                  <UploadCloud size={32} strokeWidth={1.5} color={mkt.accent} />
                </span>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 600, color: mkt.onDark }}>
                    {file ? file.name : "Drop your pricing doc here"}
                  </div>
                  <div style={{ fontSize: 13, color: mkt.onDarkMuted, marginTop: 4 }}>
                    or tap to pick · PNG, JPG, PDF, XLSX, email — up to 15 MB
                  </div>
                </div>
                {/* Wave 64 — per-file-kind preview. Images keep the inline
                    thumbnail. PDF / Excel / email render a typed icon card
                    with the filename and a one-line caption. */}
                {file && previewUrl && classifyFile(file) === "image" && (
                  <img
                    src={previewUrl}
                    alt="Selected invoice preview"
                    style={{
                      maxWidth: "100%",
                      maxHeight: 160,
                      marginTop: 8,
                      borderRadius: 8,
                      border: `1px solid ${mkt.onDarkBorder}`,
                    }}
                  />
                )}
                {file && classifyFile(file) !== "image" && classifyFile(file) !== null && (
                  <div
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 10,
                      marginTop: 8,
                      padding: "10px 14px",
                      borderRadius: 10,
                      background: "rgba(255,255,255,0.04)",
                      border: `1px solid ${mkt.onDarkBorder}`,
                    }}
                  >
                    {(() => {
                      const k = classifyFile(file);
                      if (k === "pdf") return <FileText size={20} strokeWidth={1.75} color={mkt.accent} />;
                      if (k === "excel") return <FileSpreadsheet size={20} strokeWidth={1.75} color={mkt.accent} />;
                      if (k === "email") return <Mail size={20} strokeWidth={1.75} color={mkt.accent} />;
                      return <ImageIcon size={20} strokeWidth={1.75} color={mkt.accent} />;
                    })()}
                    <div style={{ textAlign: "left" }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: mkt.onDark }}>
                        {file.name}
                      </div>
                      <div style={{ fontSize: 11, color: mkt.onDarkMuted, marginTop: 2 }}>
                        {(() => {
                          const k = classifyFile(file);
                          const kb = Math.round(file.size / 1024);
                          const label =
                            k === "pdf" ? "PDF" :
                            k === "excel" ? "Spreadsheet" :
                            k === "email" ? "Email / text" :
                            "File";
                          return `${label} · ${kb.toLocaleString()} KB`;
                        })()}
                      </div>
                    </div>
                  </div>
                )}
              </label>

              {/* Help cue — top-left positioned via marginLeft on a wrapped
                  paragraph (single help-cue pattern per surface, per the
                  recurring-UI rules). */}
              <p
                style={{
                  fontSize: 12,
                  color: mkt.onDarkFaint,
                  margin: "12px 4px 0",
                  lineHeight: 1.5,
                }}
              >
                Tip: clear photos of clear print + handwriting work best for
                handwritten quotes. We don't store your file — it's deleted
                as soon as extraction finishes.
              </p>

              {error && (
                <div
                  role="alert"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    marginTop: 16,
                    padding: "10px 14px",
                    background: "rgba(239,68,68,0.10)",
                    border: "1px solid rgba(239,68,68,0.4)",
                    borderRadius: 10,
                    color: "#fca5a5",
                    fontSize: 13,
                  }}
                >
                  <AlertTriangle size={14} strokeWidth={2} />
                  <span>{error}</span>
                </div>
              )}

              {/* Big CTA */}
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!file || submitting}
                style={{
                  marginTop: 20,
                  width: "100%",
                  padding: "16px 0",
                  fontSize: 15,
                  fontWeight: 700,
                  letterSpacing: "0.02em",
                  color: "#D5E1E7",
                  background: !file || submitting ? "rgba(13,60,252,0.45)" : "#0D3CFC",
                  border: "none",
                  borderRadius: 12,
                  cursor: !file || submitting ? "not-allowed" : "pointer",
                  transition: "background 160ms ease, transform 160ms ease",
                }}
              >
                {submitting ? "Generating your calculator…" : "Generate my calculator"}
              </button>
            </div>

            {/* A4 — sample thumbnails (drag-to-try placeholders). Wave 67.5
                will wire these to seed the upload flow from real fixtures. */}
            <div style={{ marginTop: 20 }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: mkt.onDarkFaint,
                  textAlign: "center",
                  marginBottom: 10,
                }}
              >
                Or try with a sample
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3, 1fr)",
                  gap: 10,
                }}
              >
                {SAMPLE_THUMBS.map((thumb) => {
                  const Icon =
                    thumb.iconKind === "image" ? ImageIcon :
                    thumb.iconKind === "pdf" ? FileText : Mail;
                  return (
                    // B5 — wired: clicking loads a canned DemoImageTemplate
                    // into sessionStorage and navigates to the preview, same
                    // as the real AI upload flow.
                    <button
                      key={thumb.id}
                      type="button"
                      onClick={() => handleSampleClick(thumb)}
                      title={`Try a sample — ${thumb.title}`}
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "flex-start",
                        gap: 8,
                        padding: "14px 10px",
                        borderRadius: 10,
                        background: "rgba(255,255,255,0.03)",
                        border: `1px dashed ${mkt.onDarkBorder}`,
                        cursor: "pointer",
                        textAlign: "center",
                        minHeight: 90,
                        transition: "background 160ms ease, border-color 160ms ease",
                        // Reset button defaults
                        fontFamily: "inherit",
                        color: "inherit",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = "rgba(13,60,252,0.07)";
                        e.currentTarget.style.borderColor = "rgba(13,60,252,0.4)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = "rgba(255,255,255,0.03)";
                        e.currentTarget.style.borderColor = mkt.onDarkBorder;
                      }}
                    >
                      <Icon size={20} strokeWidth={1.75} color={mkt.accent} />
                      <div
                        style={{
                          fontSize: 11,
                          color: mkt.onDarkMuted,
                          lineHeight: 1.35,
                          textWrap: "balance",
                          maxWidth: 90,
                        } as React.CSSProperties}
                      >
                        {thumb.title}
                      </div>
                      {/* Small 'sample' tag to label these as demo data */}
                      <span
                        style={{
                          fontSize: 9,
                          fontWeight: 700,
                          letterSpacing: "0.06em",
                          textTransform: "uppercase",
                          color: mkt.onDarkFaint,
                          border: `1px solid ${mkt.onDarkBorder}`,
                          borderRadius: 4,
                          padding: "1px 4px",
                          lineHeight: 1.5,
                        }}
                      >
                        sample
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Section C — Proven by the numbers (5-stat hero + 2×2 grid). */}
          <div
            ref={statsRef}
            style={{ marginTop: "clamp(56px, 8vw, 80px)" }}
            data-testid="build-with-ai-stats-section"
          >
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                color: mkt.onDarkFaint,
                textAlign: "center",
                marginBottom: 24,
                fontFamily:
                  "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
              }}
            >
              Proven by the numbers
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                gap: 16,
                alignItems: "stretch",
              }}
            >
              {/* A3 — Hero stat: radial gauge. On hover: card lift/border +
                  gauge animates 0→70 + number counts up.
                  On scroll-in: same animation fires once (statsVisible). */}
              <GaugeCard
                reducedMotion={reducedMotion}
                scopeId={scopeId}
              />

              {/* 2×2 grid of micro-stat cards. */}
              <div
                style={{
                  flex: "1 1 58%",
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                  gap: 8,
                }}
              >
                {/* Card A — 2-4× more leads (bar comparison).
                    A3: on hover bars animate from zero; lower bar goes red. */}
                <StatCard
                  number="2-4×"
                  caption="more leads"
                  sub="vs static contact form"
                  source="— CRO industry research"
                  renderVisual={(hovered) => (
                    <BarComparison
                      animate={statsVisible || hovered}
                      hovered={hovered}
                      rows={[
                        { label: "Static form", multiple: 1 },
                        { label: "Calculator", multiple: 3 },
                      ]}
                    />
                  )}
                />

                {/* Card B — 4× higher conversion.
                    A3: on hover bars animate + lower bar goes red. */}
                <StatCard
                  number="4×"
                  caption="higher conversion"
                  sub="when deposit captured at quote-time"
                  source="— Stripe service-business data"
                  renderVisual={(hovered) => (
                    <BarComparison
                      animate={statsVisible || hovered}
                      hovered={hovered}
                      rows={[
                        { label: "Quote only", multiple: 1 },
                        { label: "Quote + deposit", multiple: 4 },
                      ]}
                    />
                  )}
                />

                {/* Card C — 24/7: clock rotates 360° on hover (~1.2s). */}
                <StatCard
                  number="24 / 7"
                  caption="Lead capture while you're on a job"
                  renderVisual={(hovered) => (
                    <div style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", height: 36 }}>
                      <span
                        className={`wfx-clock-anim-${scopeId}`}
                        style={{
                          display: "inline-flex",
                          animation: hovered && !reducedMotion
                            ? `wfx-clock-spin-${scopeId} 1.2s cubic-bezier(0.4,0,0.2,1) forwards`
                            : undefined,
                        }}
                      >
                        <Clock size={32} strokeWidth={1.5} color={mkt.accent} />
                      </span>
                    </div>
                  )}
                />

                {/* Card D — 5 seconds: lightning double-flash + micro jolt on hover. */}
                <StatCard
                  number="5 seconds"
                  caption="Setup time — no coding, no integrations"
                  renderVisual={(hovered) => (
                    <div style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", height: 36 }}>
                      <span
                        className={`wfx-lightning-anim-${scopeId}`}
                        style={{
                          display: "inline-flex",
                          animation: hovered && !reducedMotion
                            ? `wfx-lightning-flash-${scopeId} 500ms ease forwards`
                            : undefined,
                        }}
                      >
                        <Zap size={32} strokeWidth={1.5} color={mkt.accent} />
                      </span>
                    </div>
                  )}
                />
              </div>
            </div>
          </div>
        </div>
      </section>
    </MarketingLayout>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * Inline micro-primitives — kept local to this page until the pattern is
 * validated. If reused elsewhere we'll graduate them into
 * client/src/components/ui/visual-primitives/.
 * ──────────────────────────────────────────────────────────────────────── */

/** A3 — Large gauge hero card. Separate component so it can own its own
 *  hover state and force-remount the KpiGauge on hover to retrigger the
 *  boot animation (0→70 count-up). On reduced-motion: shows final state,
 *  no count animation. */
function GaugeCard({
  reducedMotion,
  scopeId: _scopeId,
}: {
  reducedMotion: boolean;
  scopeId: string;
}) {
  const [hovered, setHovered] = useState(false);
  // `bootKey` forces KpiGauge to remount on hover → retriggers boot anim.
  // On reduced-motion we skip the remount (just show the final state).
  const [bootKey, setBootKey] = useState(0);

  const handleMouseEnter = useCallback(() => {
    setHovered(true);
    if (!reducedMotion) setBootKey((k) => k + 1);
  }, [reducedMotion]);
  const handleMouseLeave = useCallback(() => {
    setHovered(false);
  }, []);

  return (
    <div
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      style={{
        flex: "1 1 38%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "28px 20px",
        borderRadius: 14,
        background: "rgba(255,255,255,0.03)",
        border: `1px solid ${hovered ? "rgba(13,60,252,0.35)" : mkt.onDarkBorder}`,
        minHeight: 280,
        boxShadow: hovered ? "0 8px 32px rgba(0,0,0,0.30)" : "none",
        transition: "box-shadow 200ms ease, border-color 200ms ease",
        cursor: "default",
      }}
    >
      {/* Always render the real value (70). The KpiGauge owns its own
          mount/boot count-up (min→max→value), and remounts via `bootKey`
          on hover to replay it. Previously this gated the value on
          `statsVisible`, so before the section scrolled into view the gauge
          sat at a bare "0%" — a broken-looking placeholder the trust audit
          flagged. `statsVisible` is unused here now. */}
      <KpiGauge
        key={bootKey}
        value={70}
        min={0}
        max={100}
        label=""
        unit="%"
        size="lg"
        palette="sapphire"
        animate={true}
      />
      <div
        style={{
          marginTop: 4,
          fontSize: 14,
          fontWeight: 600,
          color: mkt.onDark,
          textAlign: "center",
          lineHeight: 1.4,
          maxWidth: 240,
        }}
      >
        of homeowners want self-serve quotes
      </div>
      <div
        style={{
          marginTop: 6,
          fontSize: 11,
          color: mkt.onDarkFaint,
          textAlign: "center",
          lineHeight: 1.4,
        }}
      >
        — industry research (HomeAdvisor, Houzz)
      </div>
    </div>
  );
}

interface StatCardProps {
  number: string;
  caption: string;
  sub?: string;
  source?: string;
  /** A3: render prop so hover state is accessible to the visual. */
  renderVisual?: (hovered: boolean) => React.ReactNode;
  /** Legacy: static visual (back-compat). */
  visual?: React.ReactNode;
}

function StatCard({ number, caption, sub, source, renderVisual, visual }: StatCardProps) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        padding: "16px 16px 14px",
        borderRadius: 12,
        background: "rgba(255,255,255,0.03)",
        border: `1px solid ${hovered ? "rgba(13,60,252,0.30)" : mkt.onDarkBorder}`,
        boxShadow: hovered ? "0 8px 24px rgba(0,0,0,0.28)" : "none",
        transition: "box-shadow 200ms ease, border-color 200ms ease",
        minHeight: 132,
        cursor: "default",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <div
          style={{
            fontSize: 28,
            fontWeight: 800,
            color: mkt.onDark,
            letterSpacing: "-0.02em",
            lineHeight: 1,
          }}
        >
          {number}
        </div>
        <div style={{ flex: "0 0 auto" }}>
          {renderVisual ? renderVisual(hovered) : visual}
        </div>
      </div>
      <div style={{ fontSize: 13, color: mkt.onDark, fontWeight: 600, lineHeight: 1.35 }}>
        {caption}
      </div>
      {sub && (
        <div style={{ fontSize: 11, color: mkt.onDarkMuted, lineHeight: 1.4 }}>
          {sub}
        </div>
      )}
      {source && (
        <div style={{ fontSize: 10, color: mkt.onDarkFaint, lineHeight: 1.4 }}>
          {source}
        </div>
      )}
    </div>
  );
}

interface BarRow {
  label: string;
  multiple: number;
}
interface BarComparisonProps {
  rows: BarRow[];
  animate: boolean;
  /** A3: when true, the LOWER (first/comparison) bar transitions to a red tint. */
  hovered?: boolean;
}

/** Tiny horizontal-bar comparison. On scroll-in: bars animate from 0.
 *  On hover (A3): bars re-animate from zero and lower bar turns red.
 *  Inline-only for now — if it earns its keep across 2+ pages we'll
 *  graduate it into the visual-primitives lib. */
function BarComparison({ rows, animate, hovered = false }: BarComparisonProps) {
  const maxMul = Math.max(...rows.map((r) => r.multiple), 1);
  // Track the last `animate` value so we can re-trigger the width transition
  // by briefly passing 0% when the card is hovered (resetting, then re-growing).
  const [localAnimate, setLocalAnimate] = useState(animate);
  const prevHoveredRef = useRef(false);
  useEffect(() => {
    if (hovered && !prevHoveredRef.current) {
      // Rising edge: reset to 0 for one paint, then re-grow.
      setLocalAnimate(false);
      const raf = requestAnimationFrame(() => {
        requestAnimationFrame(() => setLocalAnimate(true));
      });
      return () => cancelAnimationFrame(raf);
    }
    if (!hovered && prevHoveredRef.current) {
      // Falling edge: let bars stay at their widths (no reset on unhover).
      setLocalAnimate(true);
    }
    prevHoveredRef.current = hovered;
  }, [hovered]);

  // Sync with external animate (scroll-in trigger).
  useEffect(() => {
    if (animate) setLocalAnimate(true);
  }, [animate]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 4,
        width: 96,
      }}
      aria-hidden="true"
    >
      {rows.map((r, i) => {
        const widthPct = (r.multiple / maxMul) * 100;
        // A3: the LOWER bar (index 0 = the comparison / "1×" row) turns red on hover.
        const isComparisonBar = i === 0;
        const barColor = hovered && isComparisonBar ? "#ef4444" : mkt.accent;
        return (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <div
              style={{
                position: "relative",
                flex: 1,
                height: 6,
                borderRadius: 3,
                background: "rgba(255,255,255,0.06)",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  width: `${localAnimate ? widthPct : 0}%`,
                  background: barColor,
                  borderRadius: 3,
                  transition: "width 700ms cubic-bezier(0.16, 1, 0.3, 1), background 200ms ease",
                }}
              />
            </div>
            <div
              style={{
                fontSize: 9,
                color: mkt.onDarkMuted,
                width: 16,
                textAlign: "right",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {r.multiple}×
            </div>
          </div>
        );
      })}
    </div>
  );
}
