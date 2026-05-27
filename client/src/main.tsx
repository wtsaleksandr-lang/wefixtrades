import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

/**
 * Wave 45 — defer non-critical bootstrap.
 *
 * Sentry, PostHog (initAnalytics), and the Core-Web-Vitals RUM reporter
 * all add main-thread work + network requests before LCP. None of them
 * are needed for the first paint — they're observability layers. We
 * defer their init to the next idle frame so the React render + LCP
 * paint own the critical-path main-thread budget.
 *
 * `requestIdleCallback` with a 2s timeout guarantees the deferred work
 * still happens on slow devices that never go idle. Safari (which has
 * no rIC) falls back to a setTimeout.
 */
function whenIdle(cb: () => void): void {
  if (typeof window === "undefined") return;
  const rIC = (window as any).requestIdleCallback as
    | ((cb: IdleRequestCallback, opts?: IdleRequestOptions) => number)
    | undefined;
  if (rIC) {
    rIC(() => cb(), { timeout: 2000 });
  } else {
    setTimeout(cb, 1);
  }
}

createRoot(document.getElementById("root")!).render(<App />);

whenIdle(() => {
  // Sentry — error reporter. Loads its own ~80 KiB vendor chunk on demand.
  if (import.meta.env.VITE_SENTRY_DSN) {
    void import("@sentry/react").then((Sentry) => {
      Sentry.init({
        dsn: import.meta.env.VITE_SENTRY_DSN as string,
        environment: import.meta.env.MODE,
        tracesSampleRate: 0.1,
      });
    });
  }

  // PostHog — analytics. ~66 KiB vendor chunk.
  void import("./lib/analytics").then((m) => m.initAnalytics());

  // SEO Wave D — RUM Core Web Vitals. Tiny but pulls web-vitals lib.
  void import("./lib/rum/webVitals").then((m) => m.initWebVitals());
});
