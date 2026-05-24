/**
 * Product / service-catalog storage helpers extracted from server/storage.ts.
 *
 * Pure functions over `db` — no `this`, no cross-method calls (one internal
 * call between upsertProductDraft → getLatestProductDraft, both in this
 * module, is fine). The DatabaseStorage class re-exports these through thin
 * wrappers so the public API stays byte-identical.
 *
 * Tables touched: serviceCatalog, clientServices (read-only for stats),
 * productDrafts.
 *
 * Not extracted (cross-call Stripe sync services + tiers-mirror): the large
 * publishProductDraft method stays on DatabaseStorage because it calls
 * ./services/stripeProductSync and reads the live catalog before/after.
 */

import { db } from "../db";
import {
  serviceCatalog,
  clientServices,
  productDrafts,
  type ServiceCatalogRow,
  type InsertServiceCatalog,
  type ProductDraft,
  type InsertProductDraft,
} from "@shared/schema";
import { desc, eq, sql } from "drizzle-orm";

/* Q-shell: per-product KPI rollup returned by getProductStats(). Drives the
   4-card KPI strip on <AdminProductPageShell>. Aggregations come from
   client_services rows filtered by service_id. churn_rate_30d is
   cancellations / (active + cancellations) over the last 30 days. */
export interface ProductStats {
  mrr_cents: number;
  active_subs: number;
  paused_subs: number;
  cancelled_30d: number;
  new_subs_30d: number;
  churn_rate_30d: number;
}

// ─── Service Catalog ───

export async function listServiceCatalog(): Promise<ServiceCatalogRow[]> {
  return db.select().from(serviceCatalog).orderBy(serviceCatalog.sort_order);
}

export async function upsertServiceCatalog(data: InsertServiceCatalog): Promise<ServiceCatalogRow> {
  const [row] = await db.insert(serviceCatalog).values(data)
    .onConflictDoUpdate({ target: serviceCatalog.id, set: { ...data, updated_at: new Date() } })
    .returning();
  return row;
}

export async function updateServiceCatalog(
  id: string,
  updates: Partial<InsertServiceCatalog>,
): Promise<ServiceCatalogRow | undefined> {
  const [row] = await db.update(serviceCatalog)
    .set({ ...updates, updated_at: new Date() })
    .where(eq(serviceCatalog.id, id))
    .returning();
  return row;
}

export async function getServiceById(serviceId: string): Promise<ServiceCatalogRow | undefined> {
  const [row] = await db.select().from(serviceCatalog).where(eq(serviceCatalog.id, serviceId)).limit(1);
  return row;
}

export async function listServicesWithClientCounts(): Promise<(ServiceCatalogRow & { active_client_count: number })[]> {
  const rows = await db.select({
    id: serviceCatalog.id,
    name: serviceCatalog.name,
    tagline: serviceCatalog.tagline,
    description: serviceCatalog.description,
    category: serviceCatalog.category,
    default_price: serviceCatalog.default_price,
    billing_period: serviceCatalog.billing_period,
    delivery_pattern: serviceCatalog.delivery_pattern,
    is_active: serviceCatalog.is_active,
    hidden: serviceCatalog.hidden,
    stripe_product_id: serviceCatalog.stripe_product_id,
    stripe_price_id: serviceCatalog.stripe_price_id,
    stripe_yearly_price_id: serviceCatalog.stripe_yearly_price_id,
    cost_amount: serviceCatalog.cost_amount,
    cost_type: serviceCatalog.cost_type,
    sort_order: serviceCatalog.sort_order,
    created_at: serviceCatalog.created_at,
    updated_at: serviceCatalog.updated_at,
    active_client_count: sql<number>`count(case when ${clientServices.status} = 'active' then 1 end)::int`,
  })
  .from(serviceCatalog)
  .leftJoin(clientServices, eq(serviceCatalog.id, clientServices.service_id))
  .groupBy(serviceCatalog.id)
  .orderBy(serviceCatalog.sort_order);
  return rows as any;
}

/* Q-shell: per-product KPI rollup. Aggregated from client_services where
   service_id matches. enabled=false rows are excluded from MRR / active
   counts so admins toggling a single subscription off don't inflate
   paused. churn_rate_30d denominator is active + cancelled_30d to avoid
   division-by-zero and produce a meaningful "of customers who could have
   churned, this many did" ratio. */
export async function getProductStats(serviceId: string): Promise<ProductStats> {
  /* Regression-fix (PR fix/admin-stats-cards-loading): service_catalog rows
     are seeded at tier granularity (e.g. "adflow-starter", "adflow-growth",
     "adflow-pro") — there is no bare "adflow" row. The shell pages pass the
     product-family id ("adflow", "contentflow", etc.). Aggregate over any
     client_services row whose service_id equals the bare id OR starts with
     `${id}-`. LIKE-escape the bare id so a future product literal like
     "ad_flow" wouldn't blow up. */
  const escaped = serviceId.replace(/[%_\\]/g, "\\$&");
  const prefixPattern = `${escaped}-%`;
  const result = await db.execute(sql`
    SELECT
      COALESCE(SUM(price_cents) FILTER (WHERE status != 'cancelled' AND enabled), 0) AS mrr_cents,
      COUNT(*) FILTER (WHERE status = 'active' AND enabled) AS active_subs,
      COUNT(*) FILTER (WHERE status = 'paused' AND enabled) AS paused_subs,
      COUNT(*) FILTER (WHERE cancelled_at IS NOT NULL AND cancelled_at > NOW() - INTERVAL '30 days') AS cancelled_30d,
      COUNT(*) FILTER (WHERE started_at IS NOT NULL AND started_at > NOW() - INTERVAL '30 days') AS new_subs_30d
    FROM client_services
    WHERE service_id = ${serviceId}
       OR service_id LIKE ${prefixPattern} ESCAPE '\\'
  `);
  const row: any = (result as any).rows?.[0] ?? {};
  const mrr_cents = Number(row.mrr_cents ?? 0);
  const active_subs = Number(row.active_subs ?? 0);
  const paused_subs = Number(row.paused_subs ?? 0);
  const cancelled_30d = Number(row.cancelled_30d ?? 0);
  const new_subs_30d = Number(row.new_subs_30d ?? 0);
  const denom = active_subs + cancelled_30d;
  const churn_rate_30d = denom > 0 ? cancelled_30d / denom : 0;
  return { mrr_cents, active_subs, paused_subs, cancelled_30d, new_subs_30d, churn_rate_30d };
}

// ─── Product Drafts (Q28) ───

export async function getLatestProductDraft(serviceId: string): Promise<ProductDraft | undefined> {
  const [row] = await db.select().from(productDrafts)
    .where(eq(productDrafts.service_id, serviceId))
    .orderBy(desc(productDrafts.created_at))
    .limit(1);
  return row;
}

export async function upsertProductDraft(data: Omit<InsertProductDraft, "status">): Promise<ProductDraft> {
  // If there's an existing draft (status='draft'), update it. Otherwise insert new.
  // Published or rejected drafts are immutable history — a new draft creates a new row.
  const existing = await getLatestProductDraft(data.service_id);
  if (existing && existing.status === "draft") {
    const [row] = await db.update(productDrafts)
      .set({
        draft_data: data.draft_data,
        notes: data.notes ?? null,
        created_by: data.created_by ?? null,
        created_by_email: data.created_by_email ?? null,
        updated_at: new Date(),
      })
      .where(eq(productDrafts.id, existing.id))
      .returning();
    return row;
  }
  const [row] = await db.insert(productDrafts).values({
    ...data,
    status: "draft",
  }).returning();
  return row;
}

/** Multi-approver workflow: idempotent add of an approver to a draft.
 *  Returns the updated draft. If the user is already in the approvers
 *  list, the existing entry is preserved (no duplicate). */
export async function addProductDraftApprover(
  draftId: number,
  userId: number,
  email: string | null,
): Promise<ProductDraft | undefined> {
  const [existing] = await db.select().from(productDrafts).where(eq(productDrafts.id, draftId)).limit(1);
  if (!existing) return undefined;
  const current = (existing.approvers as Array<{ user_id: number; email: string | null; approved_at: string }> | null) ?? [];
  if (current.some((a) => a.user_id === userId)) return existing;
  const next = [...current, { user_id: userId, email, approved_at: new Date().toISOString() }];
  const [row] = await db.update(productDrafts)
    .set({ approvers: next, updated_at: new Date() })
    .where(eq(productDrafts.id, draftId))
    .returning();
  return row;
}

export async function rejectProductDraft(
  draftId: number,
  rejectedBy: number | null,
  reason: string | null,
): Promise<ProductDraft> {
  const [row] = await db.update(productDrafts)
    .set({ status: "rejected", rejected_by: rejectedBy, rejected_at: new Date(), rejection_reason: reason, updated_at: new Date() })
    .where(eq(productDrafts.id, draftId))
    .returning();
  return row;
}
