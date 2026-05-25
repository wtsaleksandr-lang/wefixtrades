/**
 * ContentFlow — pre-publish AI-detector gate (Layer 4 of the AI-detection-
 * resistance pipeline).
 *
 * Calls ZeroGPT's public detection endpoint to get an external, ground-truth
 * "AI-likelihood" score before the article is allowed to publish. ZeroGPT
 * is the same tool the audit (audits/detector-validation-2026-05-25.md)
 * used to measure the 93% baseline, so this gate closes the loop: we now
 * know whether the Layer 1-3 transforms actually moved the score.
 *
 * Decision bands:
 *   aiScore <  40   → strict pass — publish
 *   aiScore <  60   → acceptable — publish but log
 *   aiScore >= 60   → fail — caller runs an extra-aggressive humanization
 *                    pass before re-checking
 *
 * Failure-mode behavior — DO NOT BLOCK CUSTOMERS:
 *   - Provider timeout / 5xx / network error → return passed=true,
 *     aiScore=-1, provider="zerogpt:error:<reason>". The caller treats
 *     this as a soft-pass and continues. We are not willing to block
 *     customer content on a detector outage.
 *   - Feature flag CONTENTFLOW_DETECTOR_GATE_ENABLED=false → bypass with
 *     passed=true, aiScore=-1, provider="bypassed".
 *
 * Caching: ZeroGPT's free tier is generous but we still cache by sha256
 * of the input text for 5 minutes to avoid duplicate calls during
 * back-to-back retries (e.g. when Layer 3 fails and we re-run Layer 1-2
 * with the same body).
 *
 * Pipeline position:
 *   humanizeArticle → applyAlgorithmicHumanization → verifyCadence
 *   → checkDetectorScore (this) → articleQualityGate
 */

import crypto from "crypto";
import { createLogger } from "../../../lib/logger";

const log = createLogger("ContentFlow:DetectorGate");

/* ─── Feature flag ──────────────────────────────────────────────────── */

export function detectorGateEnabled(): boolean {
  const raw = process.env.CONTENTFLOW_DETECTOR_GATE_ENABLED;
  if (raw === undefined || raw === null || raw === "") return true;
  return !/^(false|0|off|no)$/i.test(raw.trim());
}

/* ─── Constants ─────────────────────────────────────────────────────── */

const ZEROGPT_ENDPOINT = "https://api.zerogpt.com/api/detect/detectText";
export const DETECTOR_STRICT_THRESHOLD = 40; // < 40 → great
export const DETECTOR_PASS_THRESHOLD = 60; // < 60 → acceptable
const REQUEST_TIMEOUT_MS = 5_000;
const CACHE_TTL_MS = 5 * 60_000;
/** Cap input size to keep the HTTP call snappy. ZeroGPT accepts long input
 *  but the marginal signal beyond ~5k chars is small. */
const MAX_DETECTOR_INPUT_CHARS = 6_000;

/* ─── Types ─────────────────────────────────────────────────────────── */

export interface DetectorResult {
  /** 0-100 (% AI). -1 on provider error / bypass. */
  aiScore: number;
  /** Identifier for the detector backend that produced the score. */
  provider: string;
  /** True when aiScore < DETECTOR_PASS_THRESHOLD, OR the call failed and
   *  we soft-passed to avoid blocking customer content. */
  passed: boolean;
  /** True when the result is strong (< DETECTOR_STRICT_THRESHOLD). */
  strict?: boolean;
  /** Set when the call failed and we soft-passed. */
  softPassReason?: string;
}

/* ─── Cache ─────────────────────────────────────────────────────────── */

interface CacheEntry {
  result: DetectorResult;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

function cacheKey(text: string): string {
  return crypto.createHash("sha256").update(text).digest("hex");
}

function cacheGet(key: string): DetectorResult | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    cache.delete(key);
    return null;
  }
  return entry.result;
}

function cachePut(key: string, result: DetectorResult): void {
  cache.set(key, { result, expiresAt: Date.now() + CACHE_TTL_MS });
  // Light bound on entries — drop the oldest if we ever blow past 500.
  if (cache.size > 500) {
    const oldestKey = cache.keys().next().value as string | undefined;
    if (oldestKey) cache.delete(oldestKey);
  }
}

/** Exposed for tests only. */
export function _clearDetectorCache(): void {
  cache.clear();
}

/* ─── HTTP helper ───────────────────────────────────────────────────── */

async function fetchZeroGptScore(text: string, signal: AbortSignal): Promise<number> {
  const body = JSON.stringify({ input_text: text });
  const res = await fetch(ZEROGPT_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // Browser-style headers — ZeroGPT's public endpoint rejects bare
      // server-side requests in some regions.
      "Origin": "https://www.zerogpt.com",
      "Referer": "https://www.zerogpt.com/",
      "Accept": "application/json, text/plain, */*",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    },
    body,
    signal,
  });
  if (!res.ok) {
    throw new Error(`zerogpt http ${res.status}`);
  }
  const json: any = await res.json();
  // The endpoint returns { data: { fakePercentage, ... } } in current shape.
  // Be defensive about both flat and nested layouts.
  const raw =
    json?.data?.fakePercentage ??
    json?.fakePercentage ??
    json?.data?.aiPercentage ??
    json?.aiPercentage;
  if (typeof raw !== "number" || !Number.isFinite(raw)) {
    throw new Error("zerogpt: missing fakePercentage in response");
  }
  // Clamp 0-100 just in case the upstream returns weird values.
  return Math.max(0, Math.min(100, raw));
}

/* ─── Public API ────────────────────────────────────────────────────── */

/**
 * Check the text against ZeroGPT. Never throws. On any failure (timeout,
 * 5xx, network) returns a soft-pass result (`passed: true, aiScore: -1`)
 * so detector outages cannot block customer content.
 */
export async function checkDetectorScore(text: string): Promise<DetectorResult> {
  if (!detectorGateEnabled()) {
    return { aiScore: -1, provider: "bypassed", passed: true, softPassReason: "flag_disabled" };
  }

  if (!text || text.trim().length < 100) {
    // Too short to meaningfully score — soft-pass.
    return { aiScore: -1, provider: "bypassed", passed: true, softPassReason: "input_too_short" };
  }

  const sample = text.length > MAX_DETECTOR_INPUT_CHARS
    ? text.slice(0, MAX_DETECTOR_INPUT_CHARS)
    : text;

  const key = cacheKey(sample);
  const cached = cacheGet(key);
  if (cached) return cached;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const score = await fetchZeroGptScore(sample, controller.signal);
    const passed = score < DETECTOR_PASS_THRESHOLD;
    const strict = score < DETECTOR_STRICT_THRESHOLD;
    const result: DetectorResult = {
      aiScore: score,
      provider: "zerogpt",
      passed,
      strict,
    };
    cachePut(key, result);
    log.info(`[detector] zerogpt aiScore=${score.toFixed(1)} passed=${passed} strict=${strict}`);
    return result;
  } catch (err: any) {
    const reason = err?.name === "AbortError" ? "timeout" : (err?.message || String(err)).slice(0, 80);
    log.warn(`[detector] zerogpt soft-pass: ${reason}`);
    return {
      aiScore: -1,
      provider: `zerogpt:error`,
      passed: true,
      softPassReason: reason,
    };
  } finally {
    clearTimeout(timer);
  }
}
