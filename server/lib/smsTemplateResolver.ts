/**
 * Wave 82 — SMS template resolver.
 *
 * Layers a per-tenant override row (`sms_template_overrides`) on top of the
 * code-default registry (`shared/sms/templateRegistry.ts`) and returns a
 * single `{ body, enabled, canBeDisabled }` per call.
 *
 * Caller contract:
 *
 *   const r = await resolveSmsTemplate({ templateId, clientId, vars });
 *   if (!r.enabled) return; // skip the send entirely
 *   await sendSmsAsClient({ ..., body: r.body, ... });
 *
 * Notes for migrators:
 *   - When `clientId` is null/undefined (anonymous calculator without a
 *     `clients` row), the resolver short-circuits to the registry default
 *     so legacy / demo flows keep working. Override DB hit is skipped.
 *   - `canBeDisabled` flows through so callers can render the right
 *     portal UI / log warnings if a compliance-required template was
 *     somehow toggled off. The resolver enforces it: a stored override
 *     row with `enabled = false` on a non-disable-able template is
 *     IGNORED — `enabled` returns true.
 *   - `vars` are interpolated with the same `{var}` rule the registry
 *     uses (single-brace, missing vars left literal so prod logs surface
 *     broken templates).
 *
 * In-memory cache: results are memoized per `(clientId, templateId)` for
 * 60s. Most templates fire repeatedly within a minute (Twilio retries,
 * burst sends across a worker tick) and reading the same row on every
 * send is wasteful. Cache key explicitly excludes vars — interpolation
 * happens AFTER the cache hit so dynamic placeholders stay fresh.
 *
 * The cache stores the resolved registry+override shape (body template,
 * enabled flag), NOT the final interpolated body. That way each send
 * still produces the right per-homeowner output even when the cached
 * envelope is reused.
 */

import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { smsTemplateOverrides } from "@shared/schemas/smsTemplateOverrides";
import {
  SMS_TEMPLATE_REGISTRY,
  type SmsTemplate,
  type SmsTemplateId,
  interpolate,
} from "../../shared/sms/templateRegistry";

export interface ResolveSmsTemplateInput {
  templateId: SmsTemplateId;
  /**
   * Tenant id. May be `null`/`undefined` for legacy or anonymous flows
   * (e.g. a calculator without a linked clients row). In that case the
   * resolver returns the registry defaults verbatim.
   */
  clientId?: number | null;
  /** Placeholder values for `{var}` interpolation. */
  vars?: Record<string, string | number | null | undefined>;
}

export interface ResolveSmsTemplateResult {
  body: string;
  enabled: boolean;
  canBeDisabled: boolean;
}

interface CacheEntry {
  bodyTemplate: string;
  enabled: boolean;
  /** ms epoch when this entry becomes invalid. */
  expiresAt: number;
}

const CACHE_TTL_MS = 60_000;
const cache = new Map<string, CacheEntry>();

function cacheKey(templateId: string, clientId: number | null | undefined): string {
  return `${clientId ?? "default"}::${templateId}`;
}

/**
 * Test-only / hot-reload helper. Clears the in-memory cache so a test
 * that just upserted an override row sees fresh data on the next call.
 */
export function __clearSmsTemplateResolverCache(): void {
  cache.clear();
}

/**
 * Resolve a template against an optional per-tenant override.
 *
 * Throws when the `templateId` is not in the registry — callers always
 * pass a `SmsTemplateId` (the union type), so a runtime miss means the
 * registry is out of sync with usage and we want the loud failure.
 */
export async function resolveSmsTemplate(
  input: ResolveSmsTemplateInput,
): Promise<ResolveSmsTemplateResult> {
  const { templateId, clientId } = input;
  const vars = input.vars ?? {};

  const registry: SmsTemplate | undefined = SMS_TEMPLATE_REGISTRY[templateId];
  if (!registry) {
    throw new Error(`Unknown SMS template id: ${templateId}`);
  }

  // Short-circuit for anonymous / no-tenant sends — skip the DB roundtrip.
  if (clientId == null) {
    const enabled = registry.defaultEnabled;
    if (!enabled) {
      return { body: "", enabled: false, canBeDisabled: registry.canBeDisabled };
    }
    return {
      body: interpolate(registry.defaultBody, vars),
      enabled: true,
      canBeDisabled: registry.canBeDisabled,
    };
  }

  // Cache-hit path. The body template + enabled flag are tenant-scoped;
  // the per-call `vars` interpolation runs AFTER the cache lookup so each
  // homeowner still gets the right substituted output.
  const key = cacheKey(templateId, clientId);
  const now = Date.now();
  const cached = cache.get(key);
  if (cached && cached.expiresAt > now) {
    if (!cached.enabled) {
      return { body: "", enabled: false, canBeDisabled: registry.canBeDisabled };
    }
    return {
      body: interpolate(cached.bodyTemplate, vars),
      enabled: true,
      canBeDisabled: registry.canBeDisabled,
    };
  }

  // Cache miss / expired — read the override row.
  const rows = await db
    .select({
      enabled: smsTemplateOverrides.enabled,
      body_override: smsTemplateOverrides.body_override,
    })
    .from(smsTemplateOverrides)
    .where(
      and(
        eq(smsTemplateOverrides.client_id, clientId),
        eq(smsTemplateOverrides.template_id, templateId),
      ),
    )
    .limit(1);
  const override = rows[0];

  // Resolve enabled. Override wins UNLESS the registry marks the template
  // as non-disable-able — in that case we ignore a `false` override so a
  // tenant can't silence a compliance-required send by editing the row
  // directly.
  let enabled: boolean;
  if (override) {
    enabled = registry.canBeDisabled ? override.enabled : true;
  } else {
    enabled = registry.defaultEnabled;
  }

  const bodyTemplate = override?.body_override ?? registry.defaultBody;

  cache.set(key, {
    bodyTemplate,
    enabled,
    expiresAt: now + CACHE_TTL_MS,
  });

  if (!enabled) {
    return { body: "", enabled: false, canBeDisabled: registry.canBeDisabled };
  }
  return {
    body: interpolate(bodyTemplate, vars),
    enabled: true,
    canBeDisabled: registry.canBeDisabled,
  };
}
