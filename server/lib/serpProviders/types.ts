/**
 * Shared types + errors for SERP provider modules (Wave 6.5).
 *
 * Each provider under `serpProviders/` implements `SerpProviderCall` and
 * throws `ProviderUnavailableError` / `QuotaExhaustedError` for the
 * orchestrator's fall-through path.
 */

import type { SerpRequest, SerpResult } from "../serpOrchestrator";

export type SerpEngine = "google_web" | "google_maps" | "bing_equivalent";

export type SerpProviderCall = (req: SerpRequest, timeoutMs: number) => Promise<SerpResult>;

/** Throw from a provider when env vars are missing or its monthly quota
 *  is exhausted. The orchestrator catches and falls through. */
export class ProviderUnavailableError extends Error {
  constructor(public providerId: string, reason: string) {
    super(`${providerId} unavailable: ${reason}`);
    this.name = "ProviderUnavailableError";
  }
}

export class QuotaExhaustedError extends Error {
  constructor(public providerId: string) {
    super(`${providerId} monthly quota exhausted`);
    this.name = "QuotaExhaustedError";
  }
}

/** Thrown by `searchSerp()` when EVERY provider in the priority chain
 *  failed or was unavailable. */
export class SerpOrchestratorAllProvidersFailed extends Error {
  constructor(public engine: SerpEngine, public providerErrors: Array<{ provider: string; error: string }>) {
    super(
      `All SERP providers failed for engine "${engine}": ${providerErrors
        .map((p) => `${p.provider} (${p.error.slice(0, 80)})`)
        .join(", ")}`,
    );
    this.name = "SerpOrchestratorAllProvidersFailed";
  }
}

export async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export function envPresent(name: string): boolean {
  const v = process.env[name];
  return typeof v === "string" && v.trim().length > 0;
}

export function safeHostname(link: string): string {
  try {
    return new URL(link).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}
