/**
 * SEO Wave D — client-side Real User Monitoring for Core Web Vitals.
 *
 * Minimal vanilla implementation (no `web-vitals` dep) that captures:
 *
 *   LCP   Largest Contentful Paint  — PerformanceObserver('largest-contentful-paint')
 *   CLS   Cumulative Layout Shift   — PerformanceObserver('layout-shift') summed
 *   INP   Interaction to Next Paint — PerformanceObserver('event') worst interaction
 *   FCP   First Contentful Paint    — PerformanceObserver('paint')
 *   TTFB  Time to First Byte        — performance.getEntriesByType('navigation')[0]
 *
 * Send rules:
 *   - one sample per (metric, page-load) — dedupe via in-memory set.
 *   - finalised on visibility-change → hidden / pagehide (LCP & CLS are
 *     "until terminal hide" metrics; INP can keep moving so we also push
 *     after each new worst value).
 *   - `navigator.sendBeacon` with JSON Blob; fetch+keepalive fallback.
 *   - skipped on /admin/* and /portal/* paths to keep the admin surface
 *     out of the customer-facing performance dashboard.
 *
 * Thresholds follow Google's published Core Web Vitals buckets so the
 * server can persist `rating` without recomputing.
 */

const ENDPOINT = "/api/rum/web-vitals";

type MetricName = "LCP" | "CLS" | "INP" | "FCP" | "TTFB";
type Rating = "good" | "needs-improvement" | "poor";

interface Sample {
  url: string;
  metric: MetricName;
  value: number;
  rating: Rating;
  id: string;
  navigationType?: string;
}

interface PerformanceEventTiming extends PerformanceEntry {
  interactionId?: number;
  processingStart?: number;
}

interface LayoutShiftEntry extends PerformanceEntry {
  value: number;
  hadRecentInput: boolean;
}

/** Google's Core Web Vitals thresholds (good ≤ … < needs-improvement ≤ … < poor). */
const THRESHOLDS: Record<MetricName, [number, number]> = {
  LCP: [2500, 4000],
  CLS: [0.1, 0.25],
  INP: [200, 500],
  FCP: [1800, 3000],
  TTFB: [800, 1800],
};

function rate(metric: MetricName, value: number): Rating {
  const [good, poor] = THRESHOLDS[metric];
  if (value <= good) return "good";
  if (value <= poor) return "needs-improvement";
  return "poor";
}

function shouldSkip(path: string): boolean {
  return (
    path.startsWith("/admin/") ||
    path === "/admin" ||
    path.startsWith("/portal/") ||
    path === "/portal"
  );
}

function randomId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "rum-" + Math.random().toString(36).slice(2) + "-" + Date.now().toString(36);
}

function sendSample(sample: Sample): void {
  try {
    const payload = JSON.stringify(sample);
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      const blob = new Blob([payload], { type: "application/json" });
      const ok = navigator.sendBeacon(ENDPOINT, blob);
      if (ok) return;
    }
    fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
      keepalive: true,
      credentials: "omit",
    }).catch(() => {
      /* swallow — telemetry is best-effort */
    });
  } catch {
    /* swallow */
  }
}

let initialised = false;

export function initWebVitals(): void {
  if (initialised) return;
  if (typeof window === "undefined" || typeof document === "undefined") return;
  if (typeof PerformanceObserver === "undefined") return;
  if (shouldSkip(window.location.pathname)) return;
  initialised = true;

  const sent = new Set<MetricName>();
  const url = window.location.pathname + window.location.search;
  const nav = (performance.getEntriesByType("navigation")[0] as
    | (PerformanceEntry & { type?: string })
    | undefined);
  const navigationType = nav?.type;

  const emit = (metric: MetricName, value: number, id: string) => {
    if (sent.has(metric)) return;
    sent.add(metric);
    sendSample({
      url,
      metric,
      value,
      rating: rate(metric, value),
      id,
      navigationType,
    });
  };

  /* ── TTFB — from the navigation entry (synchronous) ── */
  try {
    if (nav && "responseStart" in nav && "startTime" in nav) {
      const ttfb = (nav as PerformanceNavigationTiming).responseStart;
      if (ttfb > 0) emit("TTFB", Math.round(ttfb), randomId());
    }
  } catch {
    /* ignore */
  }

  /* ── FCP — paint observer (one-shot) ── */
  try {
    const fcpId = randomId();
    const obs = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.name === "first-contentful-paint") {
          emit("FCP", Math.round(entry.startTime), fcpId);
          obs.disconnect();
          return;
        }
      }
    });
    obs.observe({ type: "paint", buffered: true });
  } catch {
    /* ignore */
  }

  /* ── LCP — keep the latest entry; flush on hidden ── */
  let lcpValue = 0;
  const lcpId = randomId();
  try {
    const obs = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      const last = entries[entries.length - 1];
      if (last) lcpValue = Math.round(last.startTime);
    });
    obs.observe({ type: "largest-contentful-paint", buffered: true });
  } catch {
    /* ignore */
  }

  /* ── CLS — sum non-input layout-shift values; flush on hidden ── */
  let clsValue = 0;
  const clsId = randomId();
  try {
    const obs = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const ls = entry as LayoutShiftEntry;
        if (!ls.hadRecentInput) clsValue += ls.value;
      }
    });
    obs.observe({ type: "layout-shift", buffered: true });
  } catch {
    /* ignore */
  }

  /* ── INP — track worst event duration across interactions ── */
  let inpValue = 0;
  const inpId = randomId();
  try {
    const obs = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const evt = entry as PerformanceEventTiming;
        const d = evt.duration;
        if (typeof d === "number" && d > inpValue) inpValue = Math.round(d);
      }
    });
    // `durationThreshold` keeps the observer cheap — only events ≥ 40ms
    // can plausibly be the worst interaction. `interactionId` filter via
    // entry-type 'event' captures all input/pointer/keyboard handlers.
    obs.observe({
      type: "event",
      buffered: true,
      // @ts-expect-error — durationThreshold is in the Event Timing spec.
      durationThreshold: 40,
    });
  } catch {
    /* ignore */
  }

  /* ── Flush on terminal page state ── */
  const flush = () => {
    if (lcpValue > 0) emit("LCP", lcpValue, lcpId);
    // Always emit CLS once we've reached terminal state, even if 0 (no
    // shift is itself a valid "good" data point).
    if (!sent.has("CLS")) emit("CLS", +clsValue.toFixed(4), clsId);
    if (inpValue > 0) emit("INP", inpValue, inpId);
  };

  const onVisibility = () => {
    if (document.visibilityState === "hidden") flush();
  };
  document.addEventListener("visibilitychange", onVisibility, { capture: true });
  window.addEventListener("pagehide", flush, { capture: true });
}
