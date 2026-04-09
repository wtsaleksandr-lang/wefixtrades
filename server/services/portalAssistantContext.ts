/**
 * Portal assistant context assembler.
 *
 * Loads user profile, services, billing, and onboarding data from DB
 * and normalizes into a PortalContext for prompt injection.
 * Reuses the same query patterns as portalRoutes.ts.
 */

import { db } from "../db";
import { eq, and, sql } from "drizzle-orm";
import {
  clients,
  clientServices,
  serviceCatalog,
  clientPayments,
  onboardingSubmissions,
  onboardingTemplates,
  supportTickets,
} from "@shared/schema";
import type { PortalContext, PortalBehaviorMode } from "./promptBuilder";

/* ─── Mode derivation ─── */
function deriveMode(pageHint?: string): PortalBehaviorMode {
  switch (pageHint) {
    case "onboarding": return "portal_onboarding";
    case "billing": return "portal_billing";
    case "help": return "portal_support";
    default: return "portal_general";
  }
}

/* ─── Resolve client_id from user_id ─── */
async function resolveClientId(userId: number): Promise<number | null> {
  const [row] = await db
    .select({ id: clients.id })
    .from(clients)
    .where(eq(clients.user_id, userId))
    .limit(1);
  return row?.id ?? null;
}

/* ─── Main context assembler ─── */
export async function assemblePortalContext(
  userId: number,
  pageHint?: string,
  onboardingId?: number,
  clientHints?: { currentResponses?: Record<string, any> },
): Promise<PortalContext | undefined> {
  const clientId = await resolveClientId(userId);
  if (!clientId) return undefined;

  const mode = deriveMode(pageHint);

  // Load client profile
  const [client] = await db
    .select({
      business_name: clients.business_name,
      trade_type: clients.trade_type,
    })
    .from(clients)
    .where(eq(clients.id, clientId))
    .limit(1);

  if (!client) return undefined;

  // Load services summary
  const services = await db
    .select({
      name: serviceCatalog.name,
      status: clientServices.status,
      category: serviceCatalog.category,
    })
    .from(clientServices)
    .leftJoin(serviceCatalog, eq(clientServices.service_id, serviceCatalog.id))
    .where(eq(clientServices.client_id, clientId));

  const ctx: PortalContext = {
    page: pageHint || "overview",
    mode,
    businessName: client.business_name,
    tradeType: client.trade_type ?? undefined,
    services: services.map((s) => ({
      name: s.name ?? "Unknown",
      status: s.status,
      category: s.category ?? "general",
    })),
  };

  // Load mode-specific context (catch per-section so partial context is still returned)
  try {
    switch (mode) {
      case "portal_general":
        await loadGeneralContext(clientId, ctx);
        break;
      case "portal_onboarding":
        await loadOnboardingContext(clientId, ctx, onboardingId, clientHints?.currentResponses);
        break;
      case "portal_billing":
        await loadBillingContext(clientId, ctx);
        break;
      case "portal_support":
        await loadSupportContext(clientId, ctx);
        break;
    }
  } catch (err) {
    console.error("[portalContext] Mode context error:", err);
  }

  return ctx;
}

/* ─── General mode: counts + balance ─── */
async function loadGeneralContext(clientId: number, ctx: PortalContext): Promise<void> {
  const [activeCount, onboardingCount, balance] = await Promise.all([
    db.select({ count: sql<number>`count(*)::int` })
      .from(clientServices)
      .where(and(eq(clientServices.client_id, clientId), sql`${clientServices.status} IN ('active', 'onboarding')`)),
    db.select({ count: sql<number>`count(*)::int` })
      .from(onboardingSubmissions)
      .where(and(eq(onboardingSubmissions.client_id, clientId), sql`${onboardingSubmissions.status} IN ('not_sent', 'sent', 'viewed')`)),
    db.select({ total: sql<number>`coalesce(sum(${clientPayments.amount_cents}), 0)::int` })
      .from(clientPayments)
      .where(and(eq(clientPayments.client_id, clientId), eq(clientPayments.status, "pending"))),
  ]);

  ctx.activeServices = activeCount[0]?.count ?? 0;
  ctx.pendingOnboarding = onboardingCount[0]?.count ?? 0;
  ctx.outstandingBalanceCents = balance[0]?.total ?? 0;
}

/* ─── Onboarding mode: form fields + responses ─── */
async function loadOnboardingContext(
  clientId: number,
  ctx: PortalContext,
  onboardingId?: number,
  clientResponses?: Record<string, any>,
): Promise<void> {
  // Find the onboarding submission — by ID if provided, or the most recent pending one
  let submissions;
  if (onboardingId) {
    submissions = await db
      .select()
      .from(onboardingSubmissions)
      .where(and(eq(onboardingSubmissions.id, onboardingId), eq(onboardingSubmissions.client_id, clientId)))
      .limit(1);
  } else {
    submissions = await db
      .select()
      .from(onboardingSubmissions)
      .where(and(
        eq(onboardingSubmissions.client_id, clientId),
        sql`${onboardingSubmissions.status} IN ('not_sent', 'sent', 'viewed')`,
      ))
      .limit(1);
  }

  if (!submissions.length) return;
  const sub = submissions[0];

  // Load template steps
  let fields: Array<{ key: string; label: string; required: boolean }> = [];
  if (sub.template_id) {
    const [template] = await db
      .select({ steps: onboardingTemplates.steps })
      .from(onboardingTemplates)
      .where(eq(onboardingTemplates.id, sub.template_id))
      .limit(1);
    if (template?.steps && Array.isArray(template.steps)) {
      fields = (template.steps as Array<{ key: string; label: string; required: boolean }>)
        .map((s) => ({ key: s.key, label: s.label, required: s.required ?? false }));
    }
  }

  // Resolve service name
  let serviceName = "Unknown service";
  let serviceId = "";
  if (sub.client_service_id) {
    const [cs] = await db
      .select({ service_id: clientServices.service_id })
      .from(clientServices)
      .where(eq(clientServices.id, sub.client_service_id))
      .limit(1);
    if (cs?.service_id) {
      serviceId = cs.service_id;
      const [cat] = await db
        .select({ name: serviceCatalog.name })
        .from(serviceCatalog)
        .where(eq(serviceCatalog.id, cs.service_id))
        .limit(1);
      if (cat?.name) serviceName = cat.name;
    }
  }

  // Merge saved responses with client-provided current responses (unsaved form state)
  const savedResponses = (sub.responses as Record<string, { value: any }>) || {};
  const mergedResponses: Record<string, any> = {};
  for (const [key, val] of Object.entries(savedResponses)) {
    mergedResponses[key] = val?.value ?? val;
  }
  if (clientResponses) {
    Object.assign(mergedResponses, clientResponses);
  }

  const completedCount = fields.filter((f) => {
    const v = mergedResponses[f.key];
    if (v === undefined || v === null || v === false) return false;
    if (typeof v === "string") return v.trim().length > 0;
    return true;
  }).length;

  ctx.onboarding = {
    serviceName,
    serviceId,
    onboardingStatus: sub.status,
    fields,
    currentResponses: mergedResponses,
    completedCount,
    totalCount: fields.length,
  };
}

/* ─── Billing mode: summary ─── */
async function loadBillingContext(clientId: number, ctx: PortalContext): Promise<void> {
  const [[summary], [nextDue]] = await Promise.all([
    db.select({
      total_paid: sql<number>`coalesce(sum(case when ${clientPayments.status} = 'paid' then ${clientPayments.amount_cents} else 0 end), 0)::int`,
      total_pending: sql<number>`coalesce(sum(case when ${clientPayments.status} = 'pending' then ${clientPayments.amount_cents} else 0 end), 0)::int`,
    }).from(clientPayments).where(eq(clientPayments.client_id, clientId)),
    db.select({
      due_at: clientPayments.due_at,
      amount_cents: clientPayments.amount_cents,
    }).from(clientPayments)
      .where(and(eq(clientPayments.client_id, clientId), eq(clientPayments.status, "pending")))
      .orderBy(clientPayments.due_at)
      .limit(1),
  ]);

  ctx.billing = {
    totalPaidCents: summary?.total_paid ?? 0,
    totalPendingCents: summary?.total_pending ?? 0,
    nextDueAt: nextDue?.due_at ? nextDue.due_at.toISOString().split("T")[0] : null,
    nextDueAmountCents: nextDue?.amount_cents ?? null,
  };
}

/* ─── Support mode: open ticket count ─── */
async function loadSupportContext(clientId: number, ctx: PortalContext): Promise<void> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(supportTickets)
    .where(and(eq(supportTickets.client_id, clientId), eq(supportTickets.status, "open")));

  ctx.openTickets = row?.count ?? 0;
}
