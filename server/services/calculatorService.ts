/**
 * Calculator service (Wave AJ-6).
 *
 * Thin user-scoped CRUD layer over the `calculators` table. Used by the
 * public API v1 routes so business-logic (slug generation, soft-delete,
 * pause/resume, tier-limit counting) lives in one place. The internal
 * portal routes still go through `storage` directly — they pre-date this
 * service and use slug/token auth instead of user-scoping.
 *
 * Soft-delete model: `status` lives in `calculator_settings.publish.status`
 * (existing convention). Adding a third state `archived` to represent the
 * API-layer "deleted" so submissions referencing the row stay valid. The
 * cron / public lookup paths already treat anything ≠ 'published' as
 * not-live.
 */
import { db } from "../db";
import { calculators, deploymentStatus } from "@shared/schema";
import type { Calculator } from "@shared/schema";
import { and, count, desc, eq, sql } from "drizzle-orm";
import { randomBytes } from "crypto";
import { slugify, isValidSlug, buildSubdomain, HOSTING_DOMAIN } from "@shared/slugUtils";

export type CalcStatus = "active" | "paused" | "archived";

/** Read the logical status from a calculator row. */
export function readStatus(calc: Calculator): CalcStatus {
  const publish = (calc.calculator_settings as any)?.publish || {};
  const raw = String(publish.status || "draft");
  if (raw === "archived") return "archived";
  if (raw === "paused") return "paused";
  // 'published' | 'draft' both surface as 'active' to API consumers.
  return "active";
}

function generateToken(): string {
  return randomBytes(24).toString("hex");
}

async function generateUniqueSlug(businessName: string): Promise<string> {
  const base = slugify(businessName) || randomBytes(6).toString("hex");
  // Try base, then base-2..20, then base-<hex>.
  const tryFree = async (s: string): Promise<boolean> => {
    const [hit] = await db
      .select({ id: calculators.id })
      .from(calculators)
      .where(eq(calculators.slug, s))
      .limit(1);
    return !hit;
  };
  if (await tryFree(base)) return base;
  for (let i = 2; i <= 20; i++) {
    const cand = `${base}-${i}`;
    if (await tryFree(cand)) return cand;
  }
  return `${base}-${randomBytes(3).toString("hex")}`;
}

/** Count non-archived calculators owned by a user — feeds the tier gate. */
export async function countActiveCalculators(userId: number): Promise<number> {
  const [row] = await db
    .select({ n: count(calculators.id).as("n") })
    .from(calculators)
    .where(
      and(
        eq(calculators.user_id, userId),
        sql`COALESCE((${calculators.calculator_settings}::jsonb -> 'publish' ->> 'status'), 'published') <> 'archived'`,
      ),
    );
  return Number(row?.n ?? 0);
}

export interface ListOptions {
  userId: number;
  limit: number;
  offset: number;
  status?: CalcStatus;
}

export interface ListResult {
  data: Calculator[];
  total: number;
  has_more: boolean;
}

/** List calculators owned by a user, optionally filtered by logical status. */
export async function listCalculators(opts: ListOptions): Promise<ListResult> {
  const baseFilter = eq(calculators.user_id, opts.userId);
  // Hide archived by default; if status filter is given, narrow further.
  let where = and(
    baseFilter,
    sql`COALESCE((${calculators.calculator_settings}::jsonb -> 'publish' ->> 'status'), 'published') <> 'archived'`,
  );
  if (opts.status === "archived") {
    where = and(
      baseFilter,
      sql`(${calculators.calculator_settings}::jsonb -> 'publish' ->> 'status') = 'archived'`,
    );
  } else if (opts.status === "paused") {
    where = and(
      baseFilter,
      sql`(${calculators.calculator_settings}::jsonb -> 'publish' ->> 'status') = 'paused'`,
    );
  } else if (opts.status === "active") {
    where = and(
      baseFilter,
      sql`COALESCE((${calculators.calculator_settings}::jsonb -> 'publish' ->> 'status'), 'published') NOT IN ('archived', 'paused')`,
    );
  }

  const rows = await db
    .select()
    .from(calculators)
    .where(where)
    .orderBy(desc(calculators.id))
    .limit(opts.limit)
    .offset(opts.offset);

  const [totalRow] = await db
    .select({ n: count(calculators.id).as("n") })
    .from(calculators)
    .where(where);
  const total = Number(totalRow?.n ?? 0);

  return {
    data: rows,
    total,
    has_more: opts.offset + rows.length < total,
  };
}

/** Fetch one calculator iff owned by the user. */
export async function getCalculatorForUser(
  userId: number,
  calculatorId: number,
): Promise<Calculator | undefined> {
  const [row] = await db
    .select()
    .from(calculators)
    .where(and(eq(calculators.id, calculatorId), eq(calculators.user_id, userId)))
    .limit(1);
  return row;
}

export interface CreateCalculatorInput {
  userId: number;
  name: string;
  business_name: string;
  template_id?: string;
  calculator_settings?: Record<string, unknown> | null;
  trade_type?: string;
  pricing_config?: Record<string, unknown>;
}

/** Create a new calculator owned by the user. */
export async function createCalculatorForUser(
  input: CreateCalculatorInput,
): Promise<Calculator> {
  const slug = await generateUniqueSlug(input.business_name || input.name);
  const editToken = generateToken();
  const tokenExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const baseSettings = (input.calculator_settings as Record<string, unknown>) || {};
  const settings: Record<string, unknown> = {
    ...baseSettings,
    publish: {
      ...((baseSettings as any).publish || {}),
      status: "published",
      slug,
      subdomain: buildSubdomain(slug, HOSTING_DOMAIN),
      published_at: Date.now(),
    },
    ...(input.template_id ? { _api_template_id: input.template_id } : {}),
  };

  const [calc] = await db
    .insert(calculators)
    .values({
      user_id: input.userId,
      slug,
      business_name: input.business_name || input.name,
      trade_type: input.trade_type || "general",
      pricing_config: input.pricing_config || {},
      calculator_settings: settings as any,
      edit_token: editToken,
      token_expires_at: tokenExpiresAt,
    })
    .returning();

  await db
    .insert(deploymentStatus)
    .values({
      calculator_id: calc.id,
      status: "live",
      last_published_at: new Date(),
      auto_republish: true,
    })
    .onConflictDoNothing();

  return calc;
}

export interface UpdateCalculatorInput {
  name?: string;
  business_name?: string;
  calculator_settings?: Record<string, unknown> | null;
}

/** Patch a calculator owned by the user. */
export async function updateCalculatorForUser(
  userId: number,
  calculatorId: number,
  patch: UpdateCalculatorInput,
): Promise<Calculator | undefined> {
  const existing = await getCalculatorForUser(userId, calculatorId);
  if (!existing) return undefined;

  const updates: Record<string, unknown> = {};
  if (typeof patch.business_name === "string" && patch.business_name.length) {
    updates.business_name = patch.business_name;
  } else if (typeof patch.name === "string" && patch.name.length) {
    updates.business_name = patch.name;
  }
  if (patch.calculator_settings) {
    const current = (existing.calculator_settings as Record<string, unknown>) || {};
    updates.calculator_settings = { ...current, ...patch.calculator_settings } as any;
  }
  if (Object.keys(updates).length === 0) return existing;

  const [row] = await db
    .update(calculators)
    .set({ ...updates, updated_at: new Date() })
    .where(and(eq(calculators.id, calculatorId), eq(calculators.user_id, userId)))
    .returning();
  return row;
}

/** Mark a calculator archived (soft-delete) for this user. */
export async function archiveCalculatorForUser(
  userId: number,
  calculatorId: number,
): Promise<Calculator | undefined> {
  const existing = await getCalculatorForUser(userId, calculatorId);
  if (!existing) return undefined;
  const current = (existing.calculator_settings as Record<string, unknown>) || {};
  const publish = ((current as any).publish || {}) as Record<string, unknown>;
  const nextSettings = {
    ...current,
    publish: { ...publish, status: "archived", archived_at: Date.now() },
  };
  const [row] = await db
    .update(calculators)
    .set({ calculator_settings: nextSettings as any, updated_at: new Date() })
    .where(and(eq(calculators.id, calculatorId), eq(calculators.user_id, userId)))
    .returning();
  // Also flip deployment_status so the public hosted page returns 404.
  await db
    .update(deploymentStatus)
    .set({ status: "archived", updated_at: new Date() })
    .where(eq(deploymentStatus.calculator_id, calculatorId));
  return row;
}

/** Toggle pause/resume. `paused: true` → 'paused', false → 'published'. */
export async function setCalculatorPaused(
  userId: number,
  calculatorId: number,
  paused: boolean,
): Promise<Calculator | undefined> {
  const existing = await getCalculatorForUser(userId, calculatorId);
  if (!existing) return undefined;
  const current = (existing.calculator_settings as Record<string, unknown>) || {};
  const publish = ((current as any).publish || {}) as Record<string, unknown>;
  if (publish.status === "archived") return existing; // refuse to un-archive via pause
  const nextStatus = paused ? "paused" : "published";
  const nextSettings = {
    ...current,
    publish: { ...publish, status: nextStatus },
  };
  const [row] = await db
    .update(calculators)
    .set({ calculator_settings: nextSettings as any, updated_at: new Date() })
    .where(and(eq(calculators.id, calculatorId), eq(calculators.user_id, userId)))
    .returning();
  // Mirror to deployment_status: paused → 'paused', resumed → 'live'.
  await db
    .update(deploymentStatus)
    .set({
      status: paused ? "paused" : "live",
      last_published_at: paused ? undefined : new Date(),
      updated_at: new Date(),
    })
    .where(eq(deploymentStatus.calculator_id, calculatorId));
  return row;
}

/** Public-shape projection for API responses — strips edit_token & tokens. */
export function toApiCalculator(calc: Calculator) {
  const settings = (calc.calculator_settings as any) || {};
  const publish = settings.publish || {};
  const subdomain = calc.slug ? buildSubdomain(calc.slug, HOSTING_DOMAIN) : null;
  return {
    id: calc.id,
    name: calc.business_name,
    business_name: calc.business_name,
    slug: calc.slug,
    trade_type: calc.trade_type,
    status: readStatus(calc),
    plan_tier: calc.plan_tier,
    total_views: calc.total_views,
    hosted_url: subdomain ? `https://${subdomain}` : null,
    subdomain,
    primary_color: calc.primary_color,
    template_id: publish.template_id || settings._api_template_id || null,
    calculator_settings: settings,
    created_at: calc.created_at,
    updated_at: calc.updated_at,
  };
}

export function validateSlugInput(input: string): { ok: boolean; reason?: string } {
  const v = isValidSlug(input);
  return v.valid ? { ok: true } : { ok: false, reason: v.reason };
}
