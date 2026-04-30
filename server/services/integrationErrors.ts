/**
 * Integration error logger — sanitized writer for integration_error_logs.
 *
 * Every write goes through logIntegrationError(). The function never
 * throws (it catches its own DB errors), so callers can fire-and-forget
 * inside their existing failure paths without altering control flow.
 *
 * SECURITY: All string inputs are sanitized before insertion. We strip
 * common secret patterns (Bearer tokens, x-api-key values, sk_/pk_
 * Stripe keys, etc.) defensively — but callers should still avoid
 * passing raw request/response bodies. Pass small, structured context
 * via the `metadata` field instead.
 */
import { storage } from "../storage";
import type { IntegrationErrorSeverity } from "@shared/schema";

export interface IntegrationErrorContext {
  integration: string;
  /** Sub-area within the integration (e.g. "signature_verification", "publish") */
  area?: string;
  severity: IntegrationErrorSeverity;
  /** Short human-readable description. Will be truncated + sanitized. */
  message: string;
  /** Provider-specific code (e.g. "invalid_signature", "rate_limited"). */
  errorCode?: string;
  /** HTTP status code, if relevant. */
  statusCode?: number;
  /** Provider request id (Stripe event id, Vapi call id, etc.). */
  requestId?: string;
  clientId?: number;
  serviceId?: number;
  /** Extra structured context. Sanitized before insertion. */
  metadata?: Record<string, unknown>;
}

const MAX_MESSAGE_LEN = 1000;
const MAX_METADATA_DEPTH = 4;

/**
 * Strip likely-secret substrings from a string. Defense-in-depth only —
 * callers should avoid passing secrets in the first place.
 */
function sanitizeString(input: string): string {
  if (typeof input !== "string" || input.length === 0) return input;
  let s = input;
  // Bearer / token headers
  s = s.replace(/Bearer\s+[A-Za-z0-9_\-\.]+/gi, "Bearer [REDACTED]");
  s = s.replace(/(authorization|x-api-key|x-vapi-signature|stripe-signature)\s*[:=]\s*[^\s,;}"]+/gi, "$1: [REDACTED]");
  // Stripe keys
  s = s.replace(/\b(sk|pk|rk|whsec)_(live|test)_[A-Za-z0-9]+/g, "$1_$2_[REDACTED]");
  // AWS / GCP-shaped keys
  s = s.replace(/\bAKIA[0-9A-Z]{16}\b/g, "AKIA[REDACTED]");
  s = s.replace(/\bAIza[0-9A-Za-z_\-]{35}\b/g, "AIza[REDACTED]");
  // Twilio account SID (AC + 32 hex)
  s = s.replace(/\bAC[0-9a-f]{32}\b/g, "AC[REDACTED]");
  // Generic long opaque tokens (>=32 chars of base64-ish content) when
  // immediately preceded by a key-like word
  s = s.replace(
    /\b(token|secret|password|api_key|apikey)\s*[:=]\s*[A-Za-z0-9_\-\.]{16,}/gi,
    "$1=[REDACTED]",
  );
  return s;
}

function sanitizeUnknown(value: unknown, depth = 0): unknown {
  if (depth > MAX_METADATA_DEPTH) return "[max-depth]";
  if (value == null) return value;
  if (typeof value === "string") {
    const cleaned = sanitizeString(value);
    return cleaned.length > MAX_MESSAGE_LEN
      ? cleaned.slice(0, MAX_MESSAGE_LEN) + "…"
      : cleaned;
  }
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) {
    return value.slice(0, 50).map((v) => sanitizeUnknown(v, depth + 1));
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    let count = 0;
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (count++ >= 30) break;
      const lower = k.toLowerCase();
      if (
        lower.includes("token") ||
        lower.includes("secret") ||
        lower.includes("password") ||
        lower === "authorization" ||
        lower === "cookie" ||
        lower.endsWith("api_key") ||
        lower.endsWith("apikey")
      ) {
        out[k] = "[REDACTED]";
      } else {
        out[k] = sanitizeUnknown(v, depth + 1);
      }
    }
    return out;
  }
  return String(value);
}

/**
 * Persist an integration failure. Never throws; logs a console warning
 * if the DB insert itself fails, so the caller's flow is unaffected.
 */
export async function logIntegrationError(ctx: IntegrationErrorContext): Promise<void> {
  try {
    const message = sanitizeString(ctx.message ?? "").slice(0, MAX_MESSAGE_LEN);
    const metadata =
      ctx.metadata && typeof ctx.metadata === "object"
        ? (sanitizeUnknown(ctx.metadata) as Record<string, unknown>)
        : null;

    await storage.logIntegrationError({
      integration_name: ctx.integration.slice(0, 64),
      area: ctx.area ? ctx.area.slice(0, 64) : null,
      severity: ctx.severity,
      message: message || "(no message)",
      error_code: ctx.errorCode ? sanitizeString(ctx.errorCode).slice(0, 64) : null,
      status_code: typeof ctx.statusCode === "number" ? ctx.statusCode : null,
      request_id: ctx.requestId ? sanitizeString(ctx.requestId).slice(0, 128) : null,
      client_id: typeof ctx.clientId === "number" ? ctx.clientId : null,
      service_id: typeof ctx.serviceId === "number" ? ctx.serviceId : null,
      metadata,
    });
  } catch (err: any) {
    // Never let logging failures break the calling flow.
    console.error(
      `[integration-error-log] failed to persist (${ctx.integration}/${ctx.area ?? "-"}):`,
      err?.message ?? err,
    );
  }
}

/**
 * Convenience helper for catch blocks. Captures Error objects, normalizes
 * to logIntegrationError, and never re-throws.
 */
export async function logIntegrationCatch(
  integration: string,
  area: string,
  err: unknown,
  extra?: Partial<IntegrationErrorContext>,
): Promise<void> {
  const message = err instanceof Error ? err.message : String(err);
  await logIntegrationError({
    integration,
    area,
    severity: extra?.severity ?? "error",
    message,
    ...extra,
    metadata: {
      ...(extra?.metadata ?? {}),
      ...(err instanceof Error && err.stack
        ? { stack: err.stack.split("\n").slice(0, 6).join("\n") }
        : {}),
    },
  });
}
