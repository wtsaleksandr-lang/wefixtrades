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

import { useEffect, useMemo, useState } from "react";
import { useParams, useSearch } from "wouter";
import AdvancedCalculator from "@/components/quote-widget/AdvancedCalculator";
import {
  TEMPLATE_PRESETS,
  toAdvancedConfig,
  type TemplateConfig,
} from "@shared/templatePresets";

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
      return toAdvancedConfig(template);
    } catch {
      return null;
    }
  }, [template]);

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

  return (
    <>
      <style>{STATIC_CSS}</style>
      <div
        data-render-ready={String(ready)}
        data-testid="internal-template-render"
        style={{
          width: RENDER_WIDTH,
          height: RENDER_HEIGHT,
          background: bg,
          padding: 24,
          boxSizing: "border-box",
          overflow: "hidden",
        }}
      >
        <AdvancedCalculator businessName="Preview" advanced={advanced} />
      </div>
    </>
  );
}
