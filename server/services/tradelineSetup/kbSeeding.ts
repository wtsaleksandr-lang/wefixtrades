/**
 * TradeLine day-one knowledge seeding.
 *
 * Closes both launch audits' #1 gap: a brand-new TradeLine assistant knew
 * almost nothing about the business at go-live. On TradeLine activation we now:
 *
 *   PART A — write a per-trade STARTER FAQ set (server/services/tradelineSetup/
 *     starterFaqs.ts) so the receptionist can answer the universal first-call
 *     questions (hours, area, estimates, licensing, emergencies, booking,
 *     payment, response time) from minute one. Answers are generic-safe
 *     defaults templated from the owner's actual onboarding answers, never
 *     fabricated specifics — unknowns DEFER to a callback.
 *
 *   PART B — persist the richer onboarding answers the owner gave (hours,
 *     service area, services, booking preference, …) as their OWN KB rows that
 *     OVERRIDE the matching starter default for the same question.
 *
 * Both halves are IDEMPOTENT: rows use deterministic ids keyed by
 * (clientId, question key), so re-running setup upserts in place rather than
 * duplicating. The id PREFIX encodes provenance (the tradeline_knowledge_base
 * schema has no source column):
 *
 *   kbd:<clientId>:<key>  → starter_default   (Part A)
 *   kbo:<clientId>:<key>  → owner_onboarding  (Part B; overrides the kbd row)
 *
 * OVERRIDE: when an owner onboarding answer exists for a key, its kbo row is
 * written ACTIVE at a higher priority AND the matching kbd starter row is
 * archived — so the active customer knowledge carries exactly one answer per
 * question, and it's the owner's.
 *
 * ALL rows are CUSTOMER audience tier: kind='faq' (never an "internal*" kind),
 * so they flow through clientKnowledge's customer-tier filter unchanged. They
 * reach the LIVE assistant via the existing path —
 * clientKnowledge.assembleClientKnowledge({audience:'customer'}) loads
 * tradeline_knowledge_base (loadKbEntries) and renders it into the customer
 * business-knowledge block that both voice (vapiService) and chat
 * (tradelineWidgetRoutes) prompts inject. No prompt/voice file is touched here.
 */

import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "../../db";
import { tradelineKnowledgeBase } from "@shared/schema";
import { createLogger } from "../../lib/logger";
import { summarizeBusinessHours } from "../clientKnowledge";
import { pullString, pullList } from "../onboardingMappers";
import {
  buildStarterFaqs,
  STARTER_FAQ_KEYS,
  type StarterFaqFacts,
  type StarterFaqKey,
} from "./starterFaqs";

const log = createLogger("TradelineKbSeeding");

/* ─── Provenance / priority constants ────────────────────────────────────── */

/** Row-id prefix → provenance. The prefix IS the source marker + idempotency key. */
export const STARTER_ID_PREFIX = "kbd"; // starter_default
export const OWNER_ID_PREFIX = "kbo"; // owner_onboarding

/** Starter defaults rank low; owner-provided answers rank high (priority desc). */
export const STARTER_PRIORITY = 10;
export const OWNER_PRIORITY = 100;

export type KbSource = "starter_default" | "owner_onboarding";

export function starterRowId(clientId: number, key: string): string {
  return `${STARTER_ID_PREFIX}:${clientId}:${key}`;
}
export function ownerRowId(clientId: number, key: string): string {
  return `${OWNER_ID_PREFIX}:${clientId}:${key}`;
}

/** Classify a KB row id back to its seeding provenance (null = owner-authored). */
export function sourceOfRowId(id: string): KbSource | null {
  if (id.startsWith(`${STARTER_ID_PREFIX}:`)) return "starter_default";
  if (id.startsWith(`${OWNER_ID_PREFIX}:`)) return "owner_onboarding";
  return null;
}

/* ─── Row shape + injectable persistence seam (DB-free testable) ─────────── */

export interface SeedKbRow {
  id: string;
  client_id: number;
  kind: string;
  title: string;
  content: string;
  priority: number;
  status: "active" | "archived";
}

/**
 * Persistence dependency. Production binds the drizzle-backed default
 * (createDefaultKbSeedingDeps); the test injects an in-memory map to prove
 * idempotency + override without a database.
 */
export interface KbSeedingDeps {
  /** Upsert rows by primary-key id (insert or overwrite in place). */
  upsertRows(rows: SeedKbRow[]): Promise<void>;
  /** Archive specific starter rows by id (override of a starter default). */
  archiveRows(clientId: number, ids: string[]): Promise<void>;
}

/* ─── Fact extraction from onboarding responses + client row ─────────────── */

export interface SeedingInputs {
  clientId: number;
  /** From the clients row. */
  businessName?: string | null;
  tradeType?: string | null;
  /** Raw onboarding responses (mixed raw/object shapes — pullString handles both). */
  responses?: Record<string, unknown> | null;
  /** clients.business_hours jsonb — rendered to readable text when present. */
  businessHours?: unknown;
}

/**
 * Which onboarding answers map to which starter-FAQ override key, and how to
 * render the owner's answer into a customer-facing sentence. Only keys present
 * AND non-empty in the responses produce an owner (kbo) row — everything else
 * keeps its starter default. Honest by construction: we only ever restate what
 * the owner actually typed.
 */
type OwnerAnswerBuilder = (
  responses: Record<string, unknown>,
  facts: StarterFaqFacts,
  businessHours: unknown,
) => string | null;

const OWNER_ANSWER_BUILDERS: Partial<Record<StarterFaqKey, OwnerAnswerBuilder>> = {
  service_area: (r) => {
    const area = pullString(r, "service_area") ?? pullString(r, "primary_service_area");
    return area ? `We serve ${area}. If you're near the edge of that, share your address or ZIP and I'll check whether we can reach you.` : null;
  },
  hours: (r, _facts, businessHours) => {
    const typed = pullString(r, "business_hours") ?? pullString(r, "hours");
    if (typed) {
      return `Our hours are ${typed}. You can leave a message or request a callback any time and we'll get back to you.`;
    }
    // Fall back to structured clients.business_hours when no free-text answer.
    const rendered = summarizeBusinessHours(businessHours);
    if (rendered) {
      // summarizeBusinessHours returns "Business hours: Mon 8–5, …" — restate plainly.
      const hoursOnly = rendered.replace(/^Business hours:\s*/, "");
      return `Our hours are ${hoursOnly}. You can leave a message or request a callback any time and we'll get back to you.`;
    }
    return null;
  },
  services_offered: (r) => {
    const list = pullList(r, "services_offered").concat(pullList(r, "services"));
    if (list.length > 0) {
      return `We offer: ${list.join(", ")}. If you're not sure whether we cover what you need, just ask and I'll confirm.`;
    }
    const free = pullString(r, "services_description");
    return free ? `${free} If you're not sure whether we cover what you need, just ask and I'll confirm.` : null;
  },
  how_to_book: (r, facts) => {
    const raw = pullString(r, "booking_enabled");
    if (raw && /^(yes|true|on)$/i.test(raw)) {
      return `I can book you right now — tell me what you need and your preferred day or time, and I'll find an available slot and confirm before we lock it in.`;
    }
    if (raw && /^(no|false|off)$/i.test(raw)) {
      const label = facts.businessName?.trim() || "our team";
      return `I'll take what you need plus your name, number, and preferred time, and make sure ${label} reaches out to get you scheduled.`;
    }
    return null;
  },
  emergencies: (r) => {
    const policy = pullString(r, "emergency_policy") ?? pullString(r, "emergencies");
    if (!policy) return null;
    if (/^(no|none|false)$/i.test(policy.trim())) {
      return `We focus on scheduled work and don't offer emergency service. If it's urgent, I can still take your details and have the team reach out as soon as possible.`;
    }
    return `${policy} If you smell gas, see smoke or flames, or someone's in danger, hang up and call 911 first.`;
  },
};

function buildFacts(inputs: SeedingInputs): StarterFaqFacts {
  const r = (inputs.responses as Record<string, unknown>) || {};
  const bookingRaw = pullString(r, "booking_enabled");
  const bookingEnabled =
    bookingRaw == null ? null : /^(yes|true|on)$/i.test(bookingRaw) ? true : /^(no|false|off)$/i.test(bookingRaw) ? false : null;

  const hoursText =
    pullString(r, "business_hours") ??
    pullString(r, "hours") ??
    (() => {
      const rendered = summarizeBusinessHours(inputs.businessHours);
      return rendered ? rendered.replace(/^Business hours:\s*/, "") : null;
    })();

  const servicesList = pullList(r, "services_offered").concat(pullList(r, "services"));
  const servicesText =
    servicesList.length > 0 ? servicesList.join(", ") : pullString(r, "services_description");

  return {
    businessName: inputs.businessName ?? pullString(r, "business_name"),
    tradeType: inputs.tradeType ?? pullString(r, "trade_type") ?? pullString(r, "trade"),
    serviceArea: pullString(r, "service_area") ?? pullString(r, "primary_service_area"),
    hoursText,
    bookingEnabled,
    servicesText,
  };
}

/* ─── Core seeder (pure, dependency-injected) ────────────────────────────── */

export interface SeedingResult {
  /** Total active rows written (starter + owner). */
  written: number;
  /** Owner (kbo) rows written — these overrode a starter default. */
  ownerRows: number;
  /** Starter (kbd) rows archived because an owner answer superseded them. */
  starterArchived: number;
}

/**
 * Seed day-one knowledge for one TradeLine client. Idempotent: deterministic
 * row ids mean re-running upserts in place. Pure given its deps — the test
 * drives this directly with an in-memory store.
 */
export async function seedTradelineKnowledgeCore(
  deps: KbSeedingDeps,
  inputs: SeedingInputs,
): Promise<SeedingResult> {
  const { clientId } = inputs;
  const facts = buildFacts(inputs);
  const responses = (inputs.responses as Record<string, unknown>) || {};

  /* ── PART B first: which keys does the owner actually have an answer for? ── */
  const ownerRows: SeedKbRow[] = [];
  const overriddenKeys = new Set<StarterFaqKey>();
  for (const key of STARTER_FAQ_KEYS) {
    const builder = OWNER_ANSWER_BUILDERS[key];
    if (!builder) continue;
    let content: string | null = null;
    try {
      content = builder(responses, facts, inputs.businessHours);
    } catch (err) {
      log.warn("owner-answer builder threw — keeping starter default", {
        clientId,
        key,
        error: (err as Error).message,
      });
      content = null;
    }
    if (!content) continue;
    overriddenKeys.add(key);
    ownerRows.push({
      id: ownerRowId(clientId, key),
      client_id: clientId,
      kind: "faq",
      title: starterTitle(key),
      content,
      priority: OWNER_PRIORITY,
      status: "active",
    });
  }

  /* ── PART A: starter defaults for every key NOT overridden by the owner. ── */
  const allStarters = buildStarterFaqs(facts);
  const starterRows: SeedKbRow[] = allStarters.map((row) => {
    const overridden = overriddenKeys.has(row.key);
    return {
      id: starterRowId(clientId, row.key),
      client_id: clientId,
      kind: "faq",
      title: row.title,
      content: row.content,
      priority: STARTER_PRIORITY,
      // A starter whose key the owner answered is archived (owner wins). It's
      // still upserted (not deleted) so the owner can un-answer and we'd
      // re-activate on the next run — but as archived it never reaches the
      // customer prompt while the owner row is active.
      status: overridden ? "archived" : "active",
    };
  });

  const rows = [...starterRows, ...ownerRows];
  await deps.upsertRows(rows);

  // Belt-and-suspenders: explicitly archive starter ids the owner overrode, in
  // case a prior run had written them active (the upsert above already sets
  // status, but archiveRows keeps the override correct even if a caller swaps
  // in a partial-upsert dep).
  const archiveIds = Array.from(overriddenKeys).map((key) => starterRowId(clientId, key));
  if (archiveIds.length > 0) {
    await deps.archiveRows(clientId, archiveIds);
  }

  const activeWritten = rows.filter((r) => r.status === "active").length;
  return {
    written: activeWritten,
    ownerRows: ownerRows.length,
    starterArchived: archiveIds.length,
  };
}

function starterTitle(key: StarterFaqKey): string {
  // Single source of truth for titles lives in starterFaqs; rebuild and read.
  const row = buildStarterFaqs({}).find((r) => r.key === key);
  return row?.title ?? key;
}

/* ─── Default DB-backed deps ─────────────────────────────────────────────── */

export function createDefaultKbSeedingDeps(): KbSeedingDeps {
  return {
    upsertRows: async (rows) => {
      if (rows.length === 0) return;
      const now = new Date();
      await db
        .insert(tradelineKnowledgeBase)
        .values(
          rows.map((r) => ({
            id: r.id,
            client_id: r.client_id,
            kind: r.kind,
            title: r.title,
            content: r.content,
            priority: r.priority,
            status: r.status,
            created_at: now,
            updated_at: now,
          })),
        )
        .onConflictDoUpdate({
          target: tradelineKnowledgeBase.id,
          set: {
            // Refresh from the INCOMING row (excluded.*) — provenance (id) and
            // created_at are preserved; this is the idempotency mechanism.
            kind: sql`excluded.kind`,
            title: sql`excluded.title`,
            content: sql`excluded.content`,
            priority: sql`excluded.priority`,
            status: sql`excluded.status`,
            updated_at: now,
          },
        });
    },
    archiveRows: async (clientId, ids) => {
      if (ids.length === 0) return;
      await db
        .update(tradelineKnowledgeBase)
        .set({ status: "archived", updated_at: new Date() })
        .where(
          and(
            eq(tradelineKnowledgeBase.client_id, clientId),
            inArray(tradelineKnowledgeBase.id, ids),
          ),
        );
    },
  };
}

/**
 * Production entry point: seed day-one knowledge for a TradeLine client.
 * Safe-fail — a seeding failure must NEVER block activation, so this swallows
 * its own errors (logged) and returns null. Callers fire it best-effort.
 */
export async function seedTradelineKnowledge(inputs: SeedingInputs): Promise<SeedingResult | null> {
  try {
    return await seedTradelineKnowledgeCore(createDefaultKbSeedingDeps(), inputs);
  } catch (err) {
    log.warn("TradeLine KB seeding failed (non-blocking)", {
      clientId: inputs.clientId,
      error: (err as Error).message,
    });
    return null;
  }
}
