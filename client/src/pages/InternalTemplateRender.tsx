// InternalTemplateRender — Playwright snapshot target.
//
// Mounted ONLY in dev (`import.meta.env.MODE === 'development'`) or when the
// build is explicitly opted in via `VITE_ENABLE_TEMPLATE_RENDER=true`. The
// production marketing/portal build does NOT register this route, so it is
// fully unreachable in prod (see route registration in `App.tsx`).
//
// Purpose: render a single `<AdvancedCalculator>` for a given template id at
// a fixed 560×700 viewport with no chrome, no scrollbars, no animation —
// exactly the surface Playwright screenshots into
// `client/public/template-thumbnails/<templateId>@2x.png`. Mirrors Elfsight's
// `<uuid>@2x.png` thumbnail pattern.

import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { useParams, useSearch } from "wouter";
import AdvancedCalculator from "@/components/quote-widget/AdvancedCalculator";
// Dev/test-only: optionally mount the floating "Builder" badge so Playwright
// can verify the circular draggable launcher (item 11). Lazy so it never
// weighs on the normal thumbnail render.
const AIBubble = lazy(() => import("@/components/wizard/elfsight/AIBubble"));
import {
  TEMPLATE_PRESETS,
  toAdvancedConfig,
  type TemplateConfig,
} from "@shared/templatePresets";
import { INITIAL_SHELL_STATE } from "@/components/wizard/elfsight/types";

const RENDER_WIDTH = 560;
const RENDER_HEIGHT = 700;

/**
 * Inline CSS that disables animations / transitions for the render page so
 * the Playwright screenshot is deterministic. Cheaper than threading
 * `prefers-reduced-motion` through every animated component.
 */
const STATIC_CSS = `
  *, *::before, *::after {
    animation-duration: 0s !important;
    animation-delay: 0s !important;
    transition-duration: 0s !important;
    transition-delay: 0s !important;
  }
  html, body, #root {
    margin: 0 !important;
    padding: 0 !important;
    overflow: hidden !important;
    background: #f6f8fa !important;
  }
`;

export default function InternalTemplateRender() {
  const params = useParams<{ templateId: string }>();
  const search = useSearch();
  const templateId = params?.templateId;

  const template: TemplateConfig | undefined = useMemo(
    () => TEMPLATE_PRESETS.find((t) => t.id === templateId),
    [templateId],
  );

  const advanced = useMemo(() => {
    if (!template) return null;
    try {
      const base = toAdvancedConfig(template);
      // Dev/test-only overrides driven by query params so Playwright can
      // exercise the preview-fidelity surfaces (booking, deposit, business
      // profile, step layout) without standing up the full editor + DB. This
      // route is unreachable in prod (see App.tsx gate), so these flags never
      // ship. They mirror the shapes buildAdvancedConfig produces.
      const q = new URLSearchParams(search);
      const next: typeof base = { ...base, style: { ...(base.style ?? {}) } };
      if (q.get("booking") === "1") {
        (next.style as Record<string, unknown>).booking = {
          enabled: true,
          source: "wefixtrades-default",
        };
      }
      if (q.get("deposit") === "1") {
        (next.style as Record<string, unknown>).deposit = {
          enabled: true,
          amount: 150,
          label: "Deposit required to schedule",
        };
      }
      if (q.get("profile") === "1") {
        next.businessProfile = {
          googleRating: 4.8,
          googleReviewCount: 2134,
          licenseNumber: "ROC123456",
          insuredAmount: "Insured up to $2M",
          yearsInBusiness: 15,
          serviceArea: "Phoenix",
          bbbRating: "A+",
        };
      }
      const sl = q.get("stepLayout");
      if (sl === "stepper" || sl === "single") next.stepLayout = sl;
      return next;
    } catch {
      return null;
    }
  }, [template, search]);

  // `ready` flips to true after a short settle so layout + fonts finish.
  // Playwright waits on `[data-render-ready="true"]` to take the screenshot.
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!advanced) return;
    const t = setTimeout(() => setReady(true), 500);
    return () => clearTimeout(t);
  }, [advanced]);

  // Allow callers to override the wrapper background via `?bg=#fff` etc. so
  // the snapshot pipeline can tweak the surface without code changes.
  const bg = new URLSearchParams(search).get("bg") ?? "#f6f8fa";

  if (!template || !advanced) {
    return (
      <div
        data-render-ready={String(ready || true)}
        style={{ padding: 24, fontFamily: "system-ui, sans-serif" }}
      >
        Template not found: {templateId}
      </div>
    );
  }

  // Dev/test: `?tall=1` lets the wrapper grow to its natural height so a
  // full-page screenshot captures the whole widget (result panel + booking
  // grid sit below the fold at the default fixed 700px thumbnail height).
  const tall = new URLSearchParams(search).get("tall") === "1";

  return (
    <>
      <style>{STATIC_CSS}</style>
      <div
        data-render-ready={String(ready)}
        data-testid="internal-template-render"
        style={{
          width: RENDER_WIDTH,
          height: tall ? "auto" : RENDER_HEIGHT,
          background: bg,
          padding: 24,
          boxSizing: "border-box",
          overflow: tall ? "visible" : "hidden",
        }}
      >
        <AdvancedCalculator businessName="Preview" advanced={advanced} />
      </div>
      {new URLSearchParams(search).get("aibubble") === "1" && (
        <Suspense fallback={null}>
          <AIBubble
            conversationId="render-harness"
            state={INITIAL_SHELL_STATE}
            setFields={() => {}}
            setCalculations={() => {}}
            setHeader={() => {}}
            setResults={() => {}}
            setStyle={() => {}}
            setSettings={() => {}}
            setLogo={() => {}}
            setBusinessName={() => {}}
            applyTemplatePreset={() => {}}
            replaceTemplate={() => {}}
          />
        </Suspense>
      )}
    </>
  );
}
