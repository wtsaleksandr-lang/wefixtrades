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
import { withClientIdOrPreview } from "../../middleware/adminPreviewSafe";

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

/**
 * Wave 12C: admin users without a linked clients row receive 200 with
 * `{previewMode:true, persisted:false, ...previewShape}` instead of 403.
 */
async function withClientId(
  req: Request,
  res: Response,
  previewShape: Record<string, unknown> = {},
): Promise<number | null> {
  return withClientIdOrPreview(req, res, { previewShape });
}

/**
 * Shared finalization for a submitted onboarding form. Flips the submission to
 * `submitted` and runs the product-specific post-hooks (TradeLine config map +
 * assistant build; ContentFlow brand-profile seed + routing). Used by both the
 * template-driven PUT /:id flow and the self-serve POST /submit flow.
 */
async function applyOnboardingSubmit(
  clientId: number,
  submission: typeof onboardingSubmissions.$inferSelect,
  responses: Record<string, unknown>,
): Promise<{ next_url: string | null }> {
  await db
    .update(onboardingSubmissions)
    .set({ responses, status: "submitted", submitted_at: new Date(), updated_at: new Date() })
    .where(eq(onboardingSubmissions.id, submission.id));

  let nextUrl: string | null = null;
  if (submission.client_service_id) {
    try {
      const cs = await storage.getClientServiceById(submission.client_service_id);
      if (cs && cs.service_id.startsWith("tradeline")) {
        const config = await storage.getTradeLineConfig(cs.id);
        if (config) {
          const updates = mapOnboardingToTradeLineConfig(responses, config.variant);
          if (updates.setupStage) {
            updates.setupStage = advanceSetupStage(config.setupStage, updates.setupStage);
          }
          if (Object.keys(updates).length > 0) {
            await storage.updateTradeLineConfig(cs.id, updates);
          }
        }
        import("../../services/vapiService").then(({ provisionTradeLineAssistant }) => {
          provisionTradeLineAssistant(cs.id).catch(err =>
            log.warn(`[tradeline] Auto-build assistant failed for service #${cs.id}:`, err.message),
          );
        });
      }

      if (cs && cs.service_id.startsWith("contentflow")) {
        try {
          const patch = mapContentFlowOnboardingToBrandProfile(responses);
          if (Object.keys(patch).length > 0) {
            const existingClient = await storage.getClientById(clientId);
            const existing = readBrandProfile(existingClient);
            const merged = mergeContentFlowOnboarding(existing, patch);
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
      log.warn("Portal onboarding: failed to map product config:", { error: String(err) });
    }
  }
  return { next_url: nextUrl };
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
        // Final submit — shared finalization (status flip + product hooks).
        const { next_url } = await applyOnboardingSubmit(clientId, submission, responses);
        res.json({ ok: true, status: "submitted", mode: "submit", next_url });
      }
    } catch (err) {
      log.error("Portal onboarding PUT error:", { error: String(err) });
      res.status(500).json({ error: "Failed to save onboarding" });
    }
  });

  /**
   * POST /api/portal/onboarding/submit
   * Self-serve setup-wizard finish. Resolves the authenticated client's
   * service for `product`, resolves-or-creates its onboarding submission, then
   * persists `responses` and marks it submitted (running the same product
   * hooks as PUT /:id). Unlike PUT /:id this does not require the caller to
   * know the submission id — the Wave-33 wizards only know their product slug.
   *
   * Auth: requireClient + clientId resolved server-side; the service lookup is
   * scoped to the caller's client_id, so there is no cross-tenant write path.
   */
  app.post("/api/portal/onboarding/submit", requireClient, async (req: Request, res: Response) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;

      const { product, responses } = req.body ?? {};
      if (typeof product !== "string" || !product.trim()) {
        return res.status(400).json({ error: "product is required" });
      }
      if (!responses || typeof responses !== "object" || Array.isArray(responses)) {
        return res.status(400).json({ error: "responses object is required" });
      }

      // Resolve the caller's service for this product (most recent). service_id
      // is the catalog id, prefixed by the product slug (e.g. "mapguard",
      // "tradeline-complete"). Scoped to client_id → no IDOR.
      const slug = product.trim().toLowerCase();
      const [cs] = await db
        .select()
        .from(clientServices)
        .where(and(
          eq(clientServices.client_id, clientId),
          sql`lower(${clientServices.service_id}) LIKE ${slug + "%"}`,
        ))
        .orderBy(desc(clientServices.created_at))
        .limit(1);
      if (!cs) {
        return res.status(404).json({ error: `No active ${slug} service found for your account.` });
      }

      // Resolve or create the onboarding submission for that service. Products
      // without a seeded onboarding template never get a row at checkout, so we
      // create one on demand (template_id null — responses are still stored).
      let [submission] = await db
        .select()
        .from(onboardingSubmissions)
        .where(and(
          eq(onboardingSubmissions.client_id, clientId),
          eq(onboardingSubmissions.client_service_id, cs.id),
        ))
        .orderBy(desc(onboardingSubmissions.created_at))
        .limit(1);

      if (submission && (submission.status === "submitted" || submission.status === "approved")) {
        return res.status(409).json({ error: "This setup has already been submitted." });
      }

      if (!submission) {
        const tmpl = await storage.getOnboardingTemplate(cs.service_id);
        submission = await storage.createOnboardingSubmission({
          client_service_id: cs.id,
          client_id: clientId,
          template_id: tmpl?.id ?? null,
          status: "not_sent",
          actor_type: "system",
        });
      }

      const { next_url } = await applyOnboardingSubmit(clientId, submission, responses as Record<string, unknown>);
      res.json({ ok: true, status: "submitted", next_url });
    } catch (err) {
      log.error("Portal onboarding submit error:", { error: String(err) });
      res.status(500).json({ error: "Failed to submit onboarding" });
    }
  });
}
