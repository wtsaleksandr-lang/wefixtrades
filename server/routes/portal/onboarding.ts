/**
 * Portal Onboarding routes.
 *
 * Mounted under /api/portal/onboarding/*. Auth: requireClient.
 *
 * Extracted from portalRoutes.ts as the next step of the portal sub-registrar
 * refactor (PR #711 plan; PR #713 quotequick, PR #718 reputation, PR #721
 * billing, PR #722 services+tradeline established the pattern). Pure code
 * move — zero behaviour change. The parent registrar (registerPortalRoutes)
 * invokes registerPortalOnboardingRoutes(app) so the wiring in routes/index.ts
 * is unchanged.
 *
 * Endpoints
 *   GET   /api/portal/onboarding
 *   GET   /api/portal/onboarding/:id
 *   PUT   /api/portal/onboarding/:id
 */

import type { Express, Request, Response } from "express";
import { and, desc, eq, sql } from "drizzle-orm";
import { requireClient } from "../../auth";
import { storage } from "../../storage";
import { db } from "../../db";
import {
  clients,
  clientServices,
  serviceCatalog,
  onboardingSubmissions,
  onboardingTemplates,
  mapOnboardingToTradeLineConfig,
  advanceSetupStage,
} from "@shared/schema";
import {
  readBrandProfile,
  mergeBrandProfile,
} from "../../services/contentflow/brandProfile";
import {
  mapContentFlowOnboardingToBrandProfile,
  mergeContentFlowOnboarding,
  shouldRouteToDeeperWizard,
  extractPrimaryWebsiteUrl,
} from "../../services/contentflow/onboardingMapper";
import { createLogger } from "../../lib/logger";

const log = createLogger("PortalOnboarding");

/** Resolve client_id from the authenticated user's id. Returns null if no client record linked. */
async function resolveClientId(userId: number): Promise<number | null> {
  const [row] = await db
    .select({ id: clients.id })
    .from(clients)
    .where(eq(clients.user_id, userId))
    .limit(1);
  return row?.id ?? null;
}

/** Middleware-style helper: resolve client_id or return 403. */
async function withClientId(req: Request, res: Response): Promise<number | null> {
  const clientId = await resolveClientId(req.user!.id);
  if (!clientId) {
    res.status(403).json({ error: "No client record linked to this account", code: "no_client_linked" });
    return null;
  }
  return clientId;
}

export function registerPortalOnboardingRoutes(app: Express) {
  /**
   * GET /api/portal/onboarding
   * List pending onboarding submissions for the authenticated client.
   * Pending = status in ('not_sent', 'sent', 'viewed', 'needs_followup').
   * Used by the portal dashboard "Complete your setup" card.
   */
  app.get("/api/portal/onboarding", requireClient, async (req: Request, res: Response) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;

      const rows = await db
        .select({
          id: onboardingSubmissions.id,
          client_service_id: onboardingSubmissions.client_service_id,
          service_id: clientServices.service_id,
          service_name: serviceCatalog.name,
          status: onboardingSubmissions.status,
          sent_at: onboardingSubmissions.sent_at,
          created_at: onboardingSubmissions.created_at,
          has_draft: sql<boolean>`
            ${onboardingSubmissions.responses} IS NOT NULL
            AND jsonb_typeof(${onboardingSubmissions.responses}) = 'object'
            AND ${onboardingSubmissions.responses}::text <> '{}'
          `,
        })
        .from(onboardingSubmissions)
        .leftJoin(clientServices, eq(onboardingSubmissions.client_service_id, clientServices.id))
        .leftJoin(serviceCatalog, eq(clientServices.service_id, serviceCatalog.id))
        .where(and(
          eq(onboardingSubmissions.client_id, clientId),
          sql`${onboardingSubmissions.status} IN ('not_sent', 'sent', 'viewed', 'needs_followup')`,
        ))
        .orderBy(desc(onboardingSubmissions.created_at));

      res.json({ submissions: rows });
    } catch (err) {
      log.error("Portal pending-onboarding error:", { error: String(err) });
      res.status(500).json({ error: "Failed to load pending onboarding" });
    }
  });

  /**
   * GET /api/portal/onboarding/:id
   * Returns onboarding submission with template steps, scoped to client.
   */
  app.get("/api/portal/onboarding/:id", requireClient, async (req: Request, res: Response) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;

      const submissionId = parseInt(req.params.id as string);
      if (isNaN(submissionId)) return res.status(400).json({ error: "Invalid onboarding id" });

      // Get submission scoped to client
      const [submission] = await db
        .select()
        .from(onboardingSubmissions)
        .where(and(eq(onboardingSubmissions.id, submissionId), eq(onboardingSubmissions.client_id, clientId)))
        .limit(1);

      if (!submission) return res.status(404).json({ error: "Onboarding not found" });

      // Get template
      const template = submission.template_id
        ? (await db.select().from(onboardingTemplates).where(eq(onboardingTemplates.id, submission.template_id)).limit(1))[0] ?? null
        : null;

      // Get service name
      const [cs] = await db
        .select({ service_id: clientServices.service_id })
        .from(clientServices)
        .where(eq(clientServices.id, submission.client_service_id))
        .limit(1);
      const [svc] = cs
        ? await db.select({ name: serviceCatalog.name }).from(serviceCatalog).where(eq(serviceCatalog.id, cs.service_id)).limit(1)
        : [null];

      // Mark as viewed on first access
      if (submission.status === "not_sent" || submission.status === "sent") {
        await db
          .update(onboardingSubmissions)
          .set({ status: "viewed", updated_at: new Date() })
          .where(eq(onboardingSubmissions.id, submissionId));
      }

      res.json({
        id: submission.id,
        client_service_id: submission.client_service_id,
        status: submission.status === "not_sent" || submission.status === "sent" ? "viewed" : submission.status,
        service_name: svc?.name ?? null,
        service_id: cs?.service_id ?? null,
        steps: (template?.steps ?? []) as { key: string; label: string; type: string; required: boolean }[],
        responses: (submission.responses ?? {}) as Record<string, { value: any; completed_at?: string }>,
        submitted_at: submission.submitted_at,
        approved_at: submission.approved_at,
      });
    } catch (err) {
      log.error("Portal onboarding GET error:", { error: String(err) });
      res.status(500).json({ error: "Failed to load onboarding form" });
    }
  });

  /**
   * PUT /api/portal/onboarding/:id
   * Save/submit onboarding responses, scoped to client.
   */
  app.put("/api/portal/onboarding/:id", requireClient, async (req: Request, res: Response) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;

      const submissionId = parseInt(req.params.id as string);
      if (isNaN(submissionId)) return res.status(400).json({ error: "Invalid onboarding id" });

      const { responses, mode } = req.body;
      if (!responses || typeof responses !== "object") {
        return res.status(400).json({ error: "responses object is required" });
      }

      const isDraft = mode === "draft";

      // Verify ownership
      const [submission] = await db
        .select()
        .from(onboardingSubmissions)
        .where(and(eq(onboardingSubmissions.id, submissionId), eq(onboardingSubmissions.client_id, clientId)))
        .limit(1);

      if (!submission) return res.status(404).json({ error: "Onboarding not found" });

      if (submission.status === "approved") {
        return res.status(400).json({ error: "This form has already been approved and cannot be changed." });
      }

      if (submission.status === "submitted") {
        return res.status(400).json({ error: "This form has already been submitted. Please contact us if you need to make changes." });
      }

      if (isDraft) {
        // Save draft — store responses, keep status as "viewed"
        const newStatus = "viewed";
        await db
          .update(onboardingSubmissions)
          .set({ responses, status: newStatus, updated_at: new Date() })
          .where(eq(onboardingSubmissions.id, submissionId));
        res.json({ ok: true, status: newStatus, mode: "draft" });
      } else {
        // Final submit
        await db
          .update(onboardingSubmissions)
          .set({ responses, status: "submitted", submitted_at: new Date(), updated_at: new Date() })
          .where(eq(onboardingSubmissions.id, submissionId));

        // Map onboarding answers into TradeLine config if applicable
        let nextUrl: string | null = null;
        if (submission.client_service_id) {
          try {
            const cs = await storage.getClientServiceById(submission.client_service_id);
            if (cs && cs.service_id.startsWith("tradeline")) {
              const config = await storage.getTradeLineConfig(cs.id);
              if (config) {
                const updates = mapOnboardingToTradeLineConfig(responses, config.variant);
                // Use safe stage advancement — never regress
                if (updates.setupStage) {
                  updates.setupStage = advanceSetupStage(config.setupStage, updates.setupStage);
                }
                if (Object.keys(updates).length > 0) {
                  await storage.updateTradeLineConfig(cs.id, updates);
                }
              }

              // Trigger assistant build (non-blocking)
              import("../../services/vapiService").then(({ provisionTradeLineAssistant }) => {
                provisionTradeLineAssistant(cs.id).catch(err =>
                  log.warn(`[tradeline] Auto-build assistant failed for service #${cs.id}:`, err.message),
                );
              });
            }

            /* Wave W-AZ-1 — ContentFlow post-checkout onboarding hook.
             *
             * The four-question template gives us just enough to seed the
             * brand profile so the customer doesn't repeat themselves on
             * the deeper /portal/content-preferences wizard. We also
             * persist the website URL to clients.contact_url if missing
             * (canonical site link consumed by article generators) and
             * route the customer either straight into the wizard or
             * schedule a reminder for the 24h email worker. */
            if (cs && cs.service_id.startsWith("contentflow")) {
              try {
                const patch = mapContentFlowOnboardingToBrandProfile(responses);
                if (Object.keys(patch).length > 0) {
                  const existingClient = await storage.getClientById(clientId);
                  const existing = readBrandProfile(existingClient);
                  /* Idempotent merge — don't clobber values the deeper
                   * wizard already filled in if the customer happens to
                   * have completed that first. */
                  const merged = mergeContentFlowOnboarding(existing, patch);
                  /* Diff against existing so we only push fields that
                   * actually changed (mergeBrandProfile is safe either
                   * way, but this keeps the audit trail tight). */
                  const diff: Record<string, unknown> = {};
                  for (const [k, v] of Object.entries(merged)) {
                    if (JSON.stringify((existing as Record<string, unknown>)[k]) !== JSON.stringify(v)) {
                      diff[k] = v;
                    }
                  }
                  if (Object.keys(diff).length > 0) {
                    await mergeBrandProfile(clientId, diff);
                  }
                }

                const websiteUrl = extractPrimaryWebsiteUrl(responses);
                if (websiteUrl) {
                  const c = await storage.getClientById(clientId);
                  if (c && !c.website_url) {
                    await storage.updateClient(clientId, { website_url: websiteUrl } as any);
                  }
                }

                /* Routing decision — yes routes to deeper wizard; no
                 * stamps the client_service so the 24h reminder worker
                 * can pick it up. */
                if (shouldRouteToDeeperWizard(responses)) {
                  nextUrl = "/portal/content-preferences?from=onboarding";
                } else {
                  const meta = (cs.metadata as Record<string, any>) || {};
                  await storage.updateClientService(cs.id, {
                    metadata: {
                      ...meta,
                      contentflow_reminder_due_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
                      contentflow_quick_setup_at: new Date().toISOString(),
                    },
                  } as any);
                  nextUrl = "/portal/services";
                }
              } catch (err) {
                log.warn("Portal onboarding: failed ContentFlow mapper hook:", { error: String(err) });
              }
            }
          } catch (err) {
            log.warn("Portal onboarding: failed to map TradeLine config:", { error: String(err) });
          }
        }

        res.json({ ok: true, status: "submitted", mode: "submit", next_url: nextUrl });
      }
    } catch (err) {
      log.error("Portal onboarding PUT error:", { error: String(err) });
      res.status(500).json({ error: "Failed to save onboarding" });
    }
  });
}
