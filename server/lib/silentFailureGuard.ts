/**
 * Wave 92 — observability primitives for silent-failure prevention.
 *
 * Background: Wave 88 shipped a prerender fix after the build-script
 * swallowed prerender failures as "non-fatal" for weeks (script/build.ts:65).
 * The audit that followed (silent-failure-audit-2026-05-28.md) catalogued
 * dozens of similar silent-swallow patterns across the codebase. These
 * helpers exist so future code has a default-loud option that is roughly
 * as terse as `.catch(() => {})` but never hides an error.
 *
 * Use these for NEW code or when you want to retrofit a known-dangerous
 * call site. They are NOT a wholesale migration target — that would touch
 * hundreds of files for marginal benefit.
 *
 * Helpers
 * -------
 *   noisyCatch(fn, context)          — wraps a fire-and-forget Promise so
 *                                       failures are logged with structured
 *                                       data + the stack is preserved.
 *   assertNonEmpty(value, name)      — throws if a value the caller
 *                                       expected populated is empty.
 *   criticalRouteCheck(dir, routes)  — utility for build scripts to fail
 *                                       loudly if any critical route is
 *                                       missing from dist/public/.
 *
 * Design choices
 * --------------
 *   - All helpers go through `createLogger("SilentFailureGuard")` so
 *     Sentry bridging works out of the box (logger.ts wires `error` to
 *     Sentry already).
 *   - No new dependencies — all primitives use stdlib only.
 *   - `noisyCatch` always returns a Promise<void> so it composes with
 *     `void` / fire-and-forget patterns without changing call shape.
 */

import { existsSync, statSync, readFileSync } from "node:fs";
import path from "node:path";
import { createLogger } from "./logger";

const log = createLogger("SilentFailureGuard");

export interface NoisyCatchContext {
  /** Short identifier for the call site (route name, job name, etc.). */
  op: string;
  /** Optional severity (defaults to "error"). Use "warn" for known-degraded paths. */
  severity?: "error" | "warn";
  /** Optional metadata to attach to the log entry. */
  meta?: Record<string, unknown>;
}

/**
 * Wrap a fire-and-forget Promise so a rejection is logged with full
 * structured context instead of vanishing. Use this in place of
 * `.catch(() => {})` for any call where the result is not awaited but
 * the failure still matters (the prerender bug pattern, contact-form
 * notification emails, etc.).
 *
 * @example
 *   noisyCatch(sendBookingConfirmation(booking, calc), {
 *     op: "booking.confirmation.customer",
 *     meta: { booking_id: booking.id, calculator_id: calc.id },
 *   });
 */
export function noisyCatch<T>(
  promise: Promise<T>,
  context: NoisyCatchContext,
): Promise<void> {
  return promise.then(
    () => undefined,
    (err: unknown) => {
      const errMessage =
        err instanceof Error ? err.message : String(err ?? "unknown");
      const stack = err instanceof Error ? err.stack : undefined;
      const payload = {
        op: context.op,
        error: errMessage,
        stack,
        ...(context.meta ?? {}),
      };
      if (context.severity === "warn") {
        log.warn(`[noisyCatch] ${context.op} failed`, payload);
      } else {
        log.error(`[noisyCatch] ${context.op} failed`, payload);
      }
    },
  );
}

/**
 * Throw if a value the caller expected to be populated is empty. Use
 * after a DB query / external API call when an empty result would
 * indicate a bug rather than a normal "no rows" outcome.
 *
 * @example
 *   const rows = await db.select().from(criticalConfig);
 *   assertNonEmpty(rows, "critical_config");
 *
 * @throws Error if value is null/undefined/empty array/empty string/empty object.
 */
export function assertNonEmpty<T>(
  value: T | null | undefined,
  name: string,
): asserts value is T {
  if (value === null || value === undefined) {
    throw new Error(`assertNonEmpty: ${name} is ${value}`);
  }
  if (Array.isArray(value) && value.length === 0) {
    throw new Error(`assertNonEmpty: ${name} is an empty array`);
  }
  if (typeof value === "string" && value.length === 0) {
    throw new Error(`assertNonEmpty: ${name} is an empty string`);
  }
  if (
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value as Record<string, unknown>).length === 0
  ) {
    throw new Error(`assertNonEmpty: ${name} is an empty object`);
  }
}

export interface CriticalRouteCheckResult {
  /** Routes that passed all assertions. */
  ok: string[];
  /** Per-route failure descriptions for routes that failed. */
  failed: Array<{ route: string; reason: string }>;
}

export interface CriticalRouteRequirement {
  /** Route path as it appears in the URL (e.g. "/", "/pricing"). */
  route: string;
  /** Minimum HTML byte size (default 5000). */
  minBytes?: number;
  /**
   * Optional strings the rendered HTML must contain. Case-insensitive
   * substring check. Useful for asserting per-route `<title>` or
   * canonical link tags actually got injected by prerender.
   */
  mustContain?: string[];
}

/**
 * Utility for build-output smoke tests. Given a dist directory and a
 * list of required routes, verify each route produced a non-trivial
 * `<route>/index.html` and (optionally) contains expected substrings.
 *
 * Returns the per-route verdict instead of throwing so callers can
 * format their own report. The caller is responsible for calling
 * `process.exit(1)` when `result.failed.length > 0`.
 *
 * @example
 *   const result = criticalRouteCheck("dist/public", [
 *     { route: "/", mustContain: ["WeFixTrades"] },
 *     { route: "/pricing", mustContain: ["Pricing"] },
 *   ]);
 *   if (result.failed.length) {
 *     console.error("FAIL", result.failed);
 *     process.exit(1);
 *   }
 */
export function criticalRouteCheck(
  distDir: string,
  routes: CriticalRouteRequirement[],
): CriticalRouteCheckResult {
  const ok: string[] = [];
  const failed: Array<{ route: string; reason: string }> = [];

  for (const req of routes) {
    const minBytes = req.minBytes ?? 5000;
    // "/" maps to dist/public/index.html; other routes map to
    // dist/public/<route>/index.html (matches prerender output layout).
    const relPath =
      req.route === "/"
        ? "index.html"
        : path.join(req.route.replace(/^\/+/, ""), "index.html");
    const fullPath = path.join(distDir, relPath);

    if (!existsSync(fullPath)) {
      failed.push({ route: req.route, reason: `missing: ${relPath}` });
      continue;
    }
    let size = 0;
    try {
      size = statSync(fullPath).size;
    } catch (err: unknown) {
      failed.push({
        route: req.route,
        reason: `stat failed: ${err instanceof Error ? err.message : String(err)}`,
      });
      continue;
    }
    if (size < minBytes) {
      failed.push({
        route: req.route,
        reason: `too small: ${size} bytes (< ${minBytes})`,
      });
      continue;
    }
    if (req.mustContain && req.mustContain.length > 0) {
      let html = "";
      try {
        html = readFileSync(fullPath, "utf-8").toLowerCase();
      } catch (err: unknown) {
        failed.push({
          route: req.route,
          reason: `read failed: ${err instanceof Error ? err.message : String(err)}`,
        });
        continue;
      }
      const missing = req.mustContain.filter(
        (s) => !html.includes(s.toLowerCase()),
      );
      if (missing.length > 0) {
        failed.push({
          route: req.route,
          reason: `missing strings: ${missing.join(", ")}`,
        });
        continue;
      }
    }
    ok.push(req.route);
  }

  return { ok, failed };
}
