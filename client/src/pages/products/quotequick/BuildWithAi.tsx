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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { PageMeta } from "@/components/seo/PageMeta";
import { mkt, colors } from "@/theme/tokens";
import { useBreadcrumbSchema } from "@/lib/useBreadcrumbSchema";
import { KpiGauge } from "@/components/ui/visual-primitives";
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

// Wave 67 — sample thumbnails (drag-to-try). The actual wiring to seed the
// extraction flow from these is a Wave 67.5 follow-up; for now they render
// as visual placeholders so the hero composition matches the demo animation.
// TODO(wave-67.5): expose fixtures from tests/fixtures/ai-extraction/ via
// client/public/samples/ (or a tiny server route) + wire drag onto the
// dropzone to setFile() with the fetched blob.
interface SampleThumb {
  title: string;
  iconKind: "image" | "pdf" | "email";
}
const SAMPLE_THUMBS: SampleThumb[] = [
  { title: "Junk removal invoice", iconKind: "image" },
  { title: "HVAC pricing PDF", iconKind: "pdf" },
  { title: "Lawn-care email", iconKind: "email" },
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

  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
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
  const antsDuration = dragActive ? "0.6s" : "1.6s";
  const antsStroke = dragActive ? mkt.accent : "rgba(255,255,255,0.28)";

  return (
    <MarketingLayout>
      <PageMeta
        title="From any pricing doc to a working calculator — free demo"
        description="Drop a photo, PDF, Excel sheet, or email of your pricing and we build a live calculator your customers can use to book and pay. Free, no signup, no credit card."
        canonical="/products/quickquotepro/build-with-ai"
        keywords={["build calculator from pdf", "quote builder", "excel to calculator", "image to calculator"]}
      />
      {/* Marching-ants keyframes — kept inline so the animation is fully
          self-contained in this file. The :root override below disables it
          when the user prefers reduced motion. */}
      <style>{`
        @keyframes wfx-marching-ants {
          to { stroke-dashoffset: -14; }
        }
        @media (prefers-reduced-motion: reduce) {
          .wfx-marching-ants-rect { animation: none !important; }
        }
      `}</style>
      <section
        style={{
          background: mkt.bg,
          minHeight: "100vh",
          padding: "clamp(100px, 12vw, 140px) clamp(16px, 5vw, 40px) clamp(48px, 8vw, 80px)",
        }}
      >
        <div style={{ maxWidth: 1080, margin: "0 auto" }}>
          {/* Trust-strip header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              marginBottom: 16,
              color: mkt.accent,
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            <Sparkles size={14} strokeWidth={2} />
            <span>Free Demo · No Signup</span>
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

              <label
                htmlFor="bi1-upload"
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
                  // Background tint when dragging; border is rendered by the
                  // SVG overlay below so we can animate the dash offset.
                  background: dragActive ? mkt.accentTint : "rgba(255,255,255,0.02)",
                  cursor: "pointer",
                  transition: "background 160ms ease",
                  textAlign: "center",
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

                <input
                  id="bi1-upload"
                  ref={inputRef}
                  type="file"
                  accept={ACCEPT_ATTR}
                  style={{ display: "none" }}
                  onChange={(e) => handlePicked(e.target.files?.[0] || null)}
                />
                <UploadCloud size={32} strokeWidth={1.5} color={mkt.accent} />
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
                  display: "flex",
                  gap: 12,
                  justifyContent: "center",
                  flexWrap: "wrap",
                }}
              >
                {SAMPLE_THUMBS.map((thumb) => {
                  const Icon =
                    thumb.iconKind === "image" ? ImageIcon :
                    thumb.iconKind === "pdf" ? FileText : Mail;
                  return (
                    <div
                      key={thumb.title}
                      // TODO(wave-67.5): make draggable + wire onto dropzone.
                      draggable={false}
                      title={`${thumb.title} — sample drag-to-try (Wave 67.5)`}
                      style={{
                        width: 80,
                        minHeight: 100,
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 6,
                        padding: "10px 8px",
                        borderRadius: 10,
                        background: "rgba(255,255,255,0.03)",
                        border: `1px dashed ${mkt.onDarkBorder}`,
                        // Placeholder cursor — switches to grab once wired.
                        cursor: "not-allowed",
                        textAlign: "center",
                      }}
                    >
                      <Icon size={24} strokeWidth={1.75} color={mkt.accent} />
                      <div
                        style={{
                          fontSize: 10,
                          color: mkt.onDarkMuted,
                          lineHeight: 1.3,
                        }}
                      >
                        {thumb.title}
                      </div>
                    </div>
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
              {/* Hero stat — radial gauge at 70%. Animates in once the
                  section scrolls into view. */}
              <div
                style={{
                  flex: "1 1 38%",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "28px 20px",
                  borderRadius: 14,
                  background: "rgba(255,255,255,0.03)",
                  border: `1px solid ${mkt.onDarkBorder}`,
                  minHeight: 280,
                }}
              >
                <KpiGauge
                  value={statsVisible ? 70 : 0}
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

              {/* 2×2 grid of micro-stat cards. */}
              <div
                style={{
                  flex: "1 1 58%",
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                  gap: 8,
                }}
              >
                {/* Card A — 2-4× more leads (bar comparison). */}
                <StatCard
                  number="2-4×"
                  caption="more leads"
                  sub="vs static contact form"
                  source="— CRO industry research"
                  visual={
                    <BarComparison
                      animate={statsVisible}
                      rows={[
                        { label: "Static form", multiple: 1 },
                        { label: "Calculator", multiple: 3 },
                      ]}
                    />
                  }
                />

                {/* Card B — 4× higher conversion. */}
                <StatCard
                  number="4×"
                  caption="higher conversion"
                  sub="when deposit captured at quote-time"
                  source="— Stripe service-business data"
                  visual={
                    <BarComparison
                      animate={statsVisible}
                      rows={[
                        { label: "Quote only", multiple: 1 },
                        { label: "Quote + deposit", multiple: 4 },
                      ]}
                    />
                  }
                />

                {/* Card C — 24 / 7. */}
                <StatCard
                  number="24 / 7"
                  caption="Lead capture while you're on a job"
                  visual={
                    <div style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", height: 36 }}>
                      <Clock size={32} strokeWidth={1.5} color={mkt.accent} />
                    </div>
                  }
                />

                {/* Card D — 5 seconds. */}
                <StatCard
                  number="5 seconds"
                  caption="Setup time — no coding, no integrations"
                  visual={
                    <div style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", height: 36 }}>
                      <Zap size={32} strokeWidth={1.5} color={mkt.accent} />
                    </div>
                  }
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

interface StatCardProps {
  number: string;
  caption: string;
  sub?: string;
  source?: string;
  visual: React.ReactNode;
}

function StatCard({ number, caption, sub, source, visual }: StatCardProps) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        padding: "16px 16px 14px",
        borderRadius: 12,
        background: "rgba(255,255,255,0.03)",
        border: `1px solid ${mkt.onDarkBorder}`,
        transition: "box-shadow 200ms ease",
        minHeight: 132,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow = "0 8px 24px rgba(0,0,0,0.28)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = "none";
      }}
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
        <div style={{ flex: "0 0 auto" }}>{visual}</div>
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
}

/** Tiny horizontal-bar comparison. Inline-only for now — if it earns its
 *  keep across 2+ pages we'll graduate it into the visual-primitives lib. */
function BarComparison({ rows, animate }: BarComparisonProps) {
  const maxMul = Math.max(...rows.map((r) => r.multiple), 1);
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
                  width: `${animate ? widthPct : 0}%`,
                  background: mkt.accent,
                  borderRadius: 3,
                  transition: "width 700ms cubic-bezier(0.16, 1, 0.3, 1)",
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
