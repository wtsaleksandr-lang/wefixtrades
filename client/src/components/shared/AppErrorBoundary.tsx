import { Component, type ErrorInfo, type ReactNode } from "react";
import * as Sentry from "@sentry/react";

/**
 * AppErrorBoundary — global top-level boundary.
 *
 * Wraps the entire SPA. When a render exception escapes any route component
 * (and isn't caught by a more specific boundary like PortalErrorBoundary
 * or WidgetErrorBoundary), this stops the white-screen-of-death and shows
 * a recoverable fallback. Bridges into Sentry via captureException with a
 * `surface: 'app-root'` tag for triage.
 *
 * Uses plain inline styles + the existing `qq-spin`/brand tokens so it
 * works even if Tailwind/CSS has failed to load (which is itself a common
 * cause of crashes here).
 *
 * Audit reference: docs/operations/error-boundaries-audit-2026-05-24.md
 */

interface State {
  error: Error | null;
}

export default class AppErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Bridge to Sentry (PR #716 already inits Sentry in main.tsx) so
    // top-level crashes surface in monitoring with a useful tag.
    try {
      Sentry.captureException(error, {
        tags: { surface: "app-root" },
        extra: { componentStack: info.componentStack },
      });
    } catch {
      // Sentry not initialized (dev without DSN) — fall through.
    }
    if (typeof console !== "undefined") {
      // eslint-disable-next-line no-console
      console.error("[AppErrorBoundary]", error, info);
    }
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleHome = () => {
    window.location.assign("/");
  };

  render() {
    if (!this.state.error) return this.props.children;

    return (
      // data-theme="dark" — this fallback is intentionally a dark crash
      // screen (so it renders legibly even if Tailwind/CSS failed to load,
      // which is itself a common crash cause). Marking the scope lets the
      // hardcoded-color guard correctly treat the white/dark-slate inline
      // styles below as theme-scoped, not theme-naive.
      <div
        role="alert"
        data-theme="dark"
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "24px",
          background: "#0b1220",
          color: "#e2e8f0",
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        }}
      >
        <div style={{ maxWidth: 440, textAlign: "center" }}>
          <p
            style={{
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: "#94a3b8",
              margin: "0 0 12px",
            }}
          >
            Something went wrong
          </p>
          <h1
            style={{
              fontSize: 24,
              fontWeight: 600,
              letterSpacing: "-0.02em",
              margin: "0 0 8px",
            }}
          >
            This page crashed unexpectedly
          </h1>
          <p
            style={{
              fontSize: 14,
              lineHeight: 1.5,
              color: "#cbd5e1",
              margin: "0 0 24px",
            }}
          >
            The error has been logged. Try reloading the page — if it keeps
            happening, head back to the home page or contact support.
          </p>
          <div
            style={{
              display: "flex",
              gap: 8,
              justifyContent: "center",
              flexWrap: "wrap",
            }}
          >
            <button
              type="button"
              onClick={this.handleReload}
              style={{
                fontSize: 14,
                fontWeight: 500,
                padding: "10px 18px",
                borderRadius: 8,
                border: "none",
                background: "#3b82f6",
                color: "white",
                cursor: "pointer",
              }}
            >
              Reload page
            </button>
            <button
              type="button"
              onClick={this.handleHome}
              style={{
                fontSize: 14,
                fontWeight: 500,
                padding: "10px 18px",
                borderRadius: 8,
                border: "1px solid rgba(148, 163, 184, 0.4)",
                background: "transparent",
                color: "#e2e8f0",
                cursor: "pointer",
              }}
            >
              Go home
            </button>
          </div>
        </div>
      </div>
    );
  }
}
