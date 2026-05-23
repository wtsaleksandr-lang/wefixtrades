/**
 * BI-1 — Anonymous AI calculator demo: upload page.
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
 *   1. Visitor drops or picks one quote/invoice image (PNG/JPG/WEBP, ≤3 MB).
 *   2. We POST it to /api/ai/demo/image-to-template-anonymous.
 *   3. On success we get back { template, demoSessionId }; we stash the
 *      template in sessionStorage (so a hard refresh on the preview page
 *      doesn't lose it) and navigate to the preview route with the
 *      session id in the query string.
 *
 * Rate limit lives SERVER-side (1 / IP / 24h) — there's no client-side
 * gate beyond optimistic-disable while the upload is in flight.
 */
import { useCallback, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { mkt, colors } from "@/theme/tokens";
import { usePageMeta } from "@/lib/usePageMeta";
import { useBreadcrumbSchema } from "@/lib/useBreadcrumbSchema";
import { UploadCloud, Sparkles, Clock, ShieldCheck, AlertTriangle } from "lucide-react";

const BASE = "https://wefixtrades.com";
const MAX_BYTES = 3 * 1024 * 1024;
const ACCEPTED = ["image/png", "image/jpeg", "image/jpg", "image/webp"];

/** Session-storage key the preview page reads on mount. */
export const BI1_DEMO_STORAGE_KEY = "wfx_bi1_demo";

interface SamplePair {
  title: string;
  caption: string;
}

const SAMPLE_PAIRS: SamplePair[] = [
  {
    title: "Junk removal invoice",
    caption: "$249 base · 4 add-ons · stairs surcharge — built in 38s",
  },
  {
    title: "Plumbing estimate",
    caption: "Service-call fee + 3 line items extracted, formula intact",
  },
  {
    title: "Window-install quote",
    caption: "Per-window pricing + storm-glass upgrade modifier captured",
  },
];

export default function BuildWithAi() {
  usePageMeta({
    title: "Build a Calculator from a Photo — Free AI Demo | WeFixTrades",
    description:
      "Upload a photo of any quote or invoice and watch AI build a working quote calculator in seconds. Free, no signup, no credit card.",
    canonicalPath: "/products/quickquotepro/build-with-ai",
  });

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

  const handlePicked = useCallback((picked: File | null) => {
    setError(null);
    if (!picked) {
      setFile(null);
      setPreviewUrl(null);
      return;
    }
    if (!ACCEPTED.includes(picked.type.toLowerCase())) {
      setError("Use a PNG, JPG, or WEBP image.");
      return;
    }
    if (picked.size > MAX_BYTES) {
      setError("Image is too large — keep it under 3 MB.");
      return;
    }
    setFile(picked);
    // Revoke any prior object URL to keep memory tidy.
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(picked));
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
              ? "You've already used your free AI demo today. Sign up to keep going."
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

  return (
    <MarketingLayout>
      <section
        style={{
          background: mkt.bg,
          minHeight: "100vh",
          padding: "clamp(100px, 12vw, 140px) clamp(16px, 5vw, 40px) clamp(48px, 8vw, 80px)",
        }}
      >
        <div style={{ maxWidth: 760, margin: "0 auto" }}>
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
            <span>Free AI Demo · No Signup</span>
          </div>

          {/* Hero */}
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
            See AI build your calculator from a{" "}
            <span style={{ color: mkt.accent }}>photo of your invoice</span>.
          </h1>
          <p
            style={{
              fontSize: "clamp(15px, 2vw, 17px)",
              color: mkt.onDarkMuted,
              lineHeight: 1.55,
              textAlign: "center",
              maxWidth: 560,
              margin: "0 auto 28px",
            }}
          >
            Drop in a quote, estimate, or invoice. Our AI extracts the pricing
            structure and shows you a live calculator you can try right now —
            free, no signup, no credit card.
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

          {/* Upload card (sticky shell pattern) */}
          <div
            style={{
              background: "rgba(255,255,255,0.03)",
              border: `1px solid ${mkt.onDarkBorder}`,
              borderRadius: 18,
              padding: "clamp(20px, 4vw, 32px)",
              boxShadow: "0 24px 60px rgba(0,0,0,0.35)",
            }}
          >
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
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 12,
                padding: "clamp(28px, 6vw, 40px) 20px",
                borderRadius: 14,
                border: `2px dashed ${
                  dragActive ? mkt.accent : "rgba(255,255,255,0.16)"
                }`,
                background: dragActive ? mkt.accentTint : "rgba(255,255,255,0.02)",
                cursor: "pointer",
                transition: "border-color 160ms ease, background 160ms ease",
                textAlign: "center",
              }}
            >
              <input
                id="bi1-upload"
                ref={inputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                style={{ display: "none" }}
                onChange={(e) => handlePicked(e.target.files?.[0] || null)}
              />
              <UploadCloud size={32} strokeWidth={1.5} color={mkt.accent} />
              <div>
                <div style={{ fontSize: 16, fontWeight: 600, color: mkt.onDark }}>
                  {file ? file.name : "Drop your invoice or quote here"}
                </div>
                <div style={{ fontSize: 13, color: mkt.onDarkMuted, marginTop: 4 }}>
                  or tap to pick a photo · PNG, JPG, WEBP up to 3 MB
                </div>
              </div>
              {previewUrl && (
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
            </label>

            {/* Help cue */}
            <p
              style={{
                fontSize: 12,
                color: mkt.onDarkFaint,
                margin: "12px 4px 0",
                lineHeight: 1.5,
              }}
            >
              Tip: a clear photo with prices, line items, and the service name
              works best. We don't store your image — it's deleted as soon as
              extraction finishes.
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

          {/* Social proof — sample input/output pairs */}
          <div style={{ marginTop: "clamp(40px, 6vw, 56px)" }}>
            <h2
              style={{
                fontSize: 14,
                fontWeight: 600,
                color: mkt.onDarkMuted,
                textAlign: "center",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                margin: "0 0 16px",
              }}
            >
              Sample outputs from real trades
            </h2>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: 12,
              }}
            >
              {SAMPLE_PAIRS.map((pair) => (
                <div
                  key={pair.title}
                  style={{
                    padding: "14px 16px",
                    borderRadius: 12,
                    background: "rgba(255,255,255,0.03)",
                    border: `1px solid ${mkt.onDarkBorder}`,
                  }}
                >
                  <div style={{ fontSize: 13, fontWeight: 600, color: mkt.onDark }}>
                    {pair.title}
                  </div>
                  <div style={{ fontSize: 12, color: mkt.onDarkMuted, marginTop: 4, lineHeight: 1.5 }}>
                    {pair.caption}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </MarketingLayout>
  );
}
