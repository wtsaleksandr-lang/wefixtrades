/**
 * SiteLaunch — HTTP surface.
 *
 * Two audiences:
 *
 *   ADMIN (requireAdmin) — the operator tooling this product has never had.
 *     Before this, SiteLaunch's only admin surface was an orders table whose
 *     own copy said "SiteLaunch is fulfilled by a third-party supplier"
 *     (client/src/pages/admin/SiteLaunchOpsPage.tsx) — while the supplier row
 *     is a disabled `design@example.com` placeholder. There was no way to
 *     build, review, edit or approve anything.
 *
 *   PUBLIC PREVIEW (token) — a noindex render of an unpublished draft, for
 *     the contractual "revision round before launch"
 *     (client/src/config/products.ts:307).
 *
 * HONEST-STATUS DISCIPLINE, enforced here:
 *   - Publishing is ALWAYS an explicit admin action. Nothing auto-publishes.
 *   - `GET /api/admin/sitelaunch/sites/:id` reports `domain_provisioning`
 *     straight from gate.domainProvisioningState(), which hard-codes
 *     `implemented: false` in phase 1. No endpoint can report a domain as
 *     live unless an operator recorded that they verified it.
 *   - "published" here means the document is frozen and served by this app.
 *     It does NOT mean a domain resolves to it. The two are separate fields
 *     because they are separate facts.
 */

import type { Express, Request, Response } from "express";
import { z } from "zod";
import { requireAdmin } from "../auth";
import { createLogger } from "../lib/logger";
import { storage } from "../storage";
import {
  assembleDocument,
  createSite,
  getPageBySlug,
  getSiteById,
  getSiteByPreviewToken,
  getSiteWithPages,
  listSites,
  pageCounts,
  recordGeneration,
  reserveSlug,
  saveDocument,
  setStatus,
  updateDomain,
} from "../storage/sitelaunch";
import {
  SITELAUNCH_THEMES,
  SECTION_LABELS,
  parseSiteDocument,
  recommendedTheme,
  type SiteDocument,
} from "@shared/sitelaunch/document";
import {
  SITELAUNCH_DOMAIN_STATUSES,
  SITELAUNCH_HOSTING_MODES,
  SITELAUNCH_SITE_STATUSES,
} from "@shared/schemas/sitelaunch";
import { renderPage } from "../services/sitelaunch/renderer";
import { generateDraft, type SiteLaunchIntake } from "../services/sitelaunch/draftGenerator";
import { resolveSiteBrand } from "../services/sitelaunch/brandResolver";
import { checkSiteLaunchGate, domainProvisioningState } from "../services/sitelaunch/gate";

const log = createLogger("SiteLaunch:Routes");

/* ────────────────────────────────────────────────────────────────────────
 * Request schemas
 * ──────────────────────────────────────────────────────────────────────── */

const intakeSchema = z.object({
  business_name: z.string().min(1).max(160),
  trade_type: z.string().max(80).optional(),
  tagline: z.string().max(160).optional(),
  phone: z.string().max(40).optional(),
  email: z.string().max(160).optional(),
  street: z.string().max(160).optional(),
  city: z.string().max(80).optional(),
  region: z.string().max(80).optional(),
  postal_code: z.string().max(20).optional(),
  country: z.string().max(2).optional(),
  services: z.array(z.string().max(80)).max(12).optional(),
  service_areas: z.array(z.string().max(80)).max(60).optional(),
  hours: z.array(z.string().max(80)).max(7).optional(),
  years_in_business: z.string().max(10).optional(),
  license_number: z.string().max(60).optional(),
  tone: z.string().max(60).optional(),
  unique_selling_points: z.string().max(600).optional(),
  target_audience: z.string().max(300).optional(),
  existing_site_url: z.string().max(400).optional(),
  photos: z.array(z.object({ url: z.string().max(1000), alt: z.string().max(200).optional() })).max(24).optional(),
  calculator_token: z.string().max(120).optional(),
  callback_widget_token: z.string().max(120).optional(),
  theme_id: z.enum(["trade-classic", "trade-bold", "trade-clean", "trade-pro"]).optional(),
  allow_generated_hero: z.boolean().optional(),
});

const createSiteSchema = z.object({
  client_id: z.number().int().positive().optional(),
  client_service_id: z.number().int().positive().optional(),
  slug: z.string().max(80).optional(),
  intake: intakeSchema,
  /** Set false to build the structural draft with no AI spend at all. */
  generate_copy: z.boolean().optional(),
});

const domainPatchSchema = z.object({
  hosting_mode: z.enum(SITELAUNCH_HOSTING_MODES).optional(),
  custom_domain: z.string().max(253).nullable().optional(),
  domain_status: z.enum(SITELAUNCH_DOMAIN_STATUSES).optional(),
  domain_status_note: z.string().max(2000).nullable().optional(),
});

const statusPatchSchema = z.object({ status: z.enum(SITELAUNCH_SITE_STATUSES) });

/* ────────────────────────────────────────────────────────────────────────
 * Helpers
 * ──────────────────────────────────────────────────────────────────────── */

function platformOrigin(req: Request): string {
  const configured = (process.env.PUBLIC_BASE_URL || "").replace(/\/+$/, "");
  if (configured) return configured;
  const proto = (req.headers["x-forwarded-proto"] as string) || req.protocol || "https";
  const host = req.get("host") || "";
  return host ? `${proto}://${host}` : "";
}

function previewBase(req: Request, token: string): string {
  return `${platformOrigin(req)}/sitelaunch/preview/${token}`;
}

/** Everything the admin UI needs about one site, without the sections blob. */
function siteSummary(site: Awaited<ReturnType<typeof getSiteById>>, pages?: number) {
  if (!site) return null;
  return {
    id: site.id,
    slug: site.slug,
    business_name: site.business_name,
    theme_id: site.theme_id,
    status: site.status,
    client_id: site.client_id,
    client_service_id: site.client_service_id,
    hosting_mode: site.hosting_mode,
    custom_domain: site.custom_domain,
    domain_status: site.domain_status,
    domain_status_note: site.domain_status_note,
    page_count: pages,
    published_at: site.published_at,
    approved_at: site.approved_at,
    last_generated_at: site.last_generated_at,
    last_generation_error: site.last_generation_error,
    updated_at: site.updated_at,
    created_at: site.created_at,
  };
}

export function registerSiteLaunchRoutes(app: Express): void {
  /* ──────────────────────────────────────────────────────────────────────
   * Admin — catalogue metadata
   * ────────────────────────────────────────────────────────────────────── */

  app.get("/api/admin/sitelaunch/meta", requireAdmin, (_req: Request, res: Response) => {
    const gate = checkSiteLaunchGate();
    const domain = domainProvisioningState();
    res.json({
      themes: SITELAUNCH_THEMES,
      section_labels: SECTION_LABELS,
      statuses: SITELAUNCH_SITE_STATUSES,
      hosting_modes: SITELAUNCH_HOSTING_MODES,
      domain_statuses: SITELAUNCH_DOMAIN_STATUSES,
      /* Honest capability report — the UI renders these verbatim. */
      generation: { enabled: gate.allowed, reason: gate.reason ?? null },
      domain_provisioning: {
        automated: domain.flagEnabled && domain.implemented,
        message: domain.message,
      },
    });
  });

  /* ──────────────────────────────────────────────────────────────────────
   * Admin — sites
   * ────────────────────────────────────────────────────────────────────── */

  app.get("/api/admin/sitelaunch/sites", requireAdmin, async (req: Request, res: Response) => {
    try {
      const status = typeof req.query.status === "string" ? req.query.status : undefined;
      const sites = await listSites({
        status: SITELAUNCH_SITE_STATUSES.includes(status as never) ? (status as never) : undefined,
      });
      const counts = await pageCounts(sites.map((s) => s.id));
      res.json({ sites: sites.map((s) => siteSummary(s, counts[s.id] ?? 0)) });
    } catch (err: any) {
      log.error("list sites failed", { error: err?.message });
      res.status(500).json({ error: "Failed to list sites" });
    }
  });

  app.get("/api/admin/sitelaunch/sites/:id", requireAdmin, async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid id" });
      const found = await getSiteWithPages(id);
      if (!found) return res.status(404).json({ error: "Site not found" });

      const assembled = assembleDocument(found.site, found.pages);
      const domain = domainProvisioningState();
      res.json({
        site: siteSummary(found.site, found.pages.length),
        document: assembled.ok ? assembled.doc : null,
        document_error: assembled.ok ? null : assembled.error,
        preview_url: previewBase(req, found.site.preview_token),
        domain_provisioning: {
          automated: domain.flagEnabled && domain.implemented,
          message: domain.message,
        },
      });
    } catch (err: any) {
      log.error("get site failed", { error: err?.message });
      res.status(500).json({ error: "Failed to load site" });
    }
  });

  /**
   * Create a site from intake and land an editable DRAFT.
   * Never publishes. Never provisions a domain.
   */
  app.post("/api/admin/sitelaunch/sites", requireAdmin, async (req: Request, res: Response) => {
    try {
      const body = createSiteSchema.safeParse(req.body);
      if (!body.success) {
        return res.status(400).json({ error: "Invalid request", detail: body.error.issues[0]?.message });
      }
      const { intake, client_id, client_service_id } = body.data;

      let client: { metadata?: unknown; user_id?: number | null } | null = null;
      if (client_id) {
        try {
          client = (await storage.getClientById(client_id)) as never;
        } catch (err: any) {
          // A missing client must not block building the site — the brand
          // resolver simply falls through to theme defaults.
          log.warn("client lookup failed — using theme default brand", {
            client_id,
            error: err?.message,
          });
        }
      }

      const brand = await resolveSiteBrand({
        userId: (client as { user_id?: number | null } | null)?.user_id ?? null,
        client,
      });

      const draft = await generateDraft(intake as SiteLaunchIntake, {
        brand,
        skipAi: body.data.generate_copy === false,
      });

      const slug = await reserveSlug(body.data.slug || intake.business_name);
      const created = await createSite({
        clientId: client_id ?? null,
        clientServiceId: client_service_id ?? null,
        slug,
        document: draft.document,
      });
      if (draft.aiError) await recordGeneration(created.site.id, draft.aiError);

      res.status(201).json({
        site: siteSummary(created.site, created.pages.length),
        preview_url: previewBase(req, created.site.preview_token),
        ai_copy_used: draft.aiCopyUsed,
        ai_error: draft.aiError ?? null,
        missing_facts: draft.missingFacts,
        recommended_theme: recommendedTheme(intake.trade_type),
      });
    } catch (err: any) {
      log.error("create site failed", { error: err?.message });
      res.status(500).json({ error: "Failed to create site" });
    }
  });

  /** Regenerate the draft in place from a fresh intake. Still a draft. */
  app.post("/api/admin/sitelaunch/sites/:id/generate", requireAdmin, async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid id" });
      const site = await getSiteById(id);
      if (!site) return res.status(404).json({ error: "Site not found" });
      if (site.status === "published") {
        return res.status(409).json({
          error: "This site is published. Move it back to draft before regenerating.",
        });
      }

      const parsed = z.object({ intake: intakeSchema, generate_copy: z.boolean().optional() }).safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid request", detail: parsed.error.issues[0]?.message });
      }

      let client: { metadata?: unknown; user_id?: number | null } | null = null;
      if (site.client_id) {
        try {
          client = (await storage.getClientById(site.client_id)) as never;
        } catch (err: any) {
          log.warn("client lookup failed during regenerate", { error: err?.message });
        }
      }
      const brand = await resolveSiteBrand({
        userId: (client as { user_id?: number | null } | null)?.user_id ?? null,
        client,
      });

      const draft = await generateDraft(parsed.data.intake as SiteLaunchIntake, {
        brand,
        skipAi: parsed.data.generate_copy === false,
      });
      const saved = await saveDocument(id, draft.document);
      await recordGeneration(id, draft.aiError ?? null);

      res.json({
        site: siteSummary(saved?.site ?? site, saved?.pages.length),
        ai_copy_used: draft.aiCopyUsed,
        ai_error: draft.aiError ?? null,
        missing_facts: draft.missingFacts,
      });
    } catch (err: any) {
      log.error("regenerate failed", { error: err?.message });
      res.status(500).json({ error: "Failed to regenerate site" });
    }
  });

  /** Save an operator's edits to the document. */
  app.put("/api/admin/sitelaunch/sites/:id/document", requireAdmin, async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid id" });
      const site = await getSiteById(id);
      if (!site) return res.status(404).json({ error: "Site not found" });

      let doc: SiteDocument;
      try {
        doc = parseSiteDocument(req.body?.document);
      } catch (err: any) {
        return res.status(400).json({ error: "Invalid site document", detail: err?.issues?.[0]?.message });
      }

      const saved = await saveDocument(id, doc);
      if (!saved) return res.status(404).json({ error: "Site not found" });
      res.json({ site: siteSummary(saved.site, saved.pages.length) });
    } catch (err: any) {
      log.error("save document failed", { error: err?.message });
      res.status(500).json({ error: "Failed to save site" });
    }
  });

  /**
   * Move a site through the lifecycle. Publishing is only ever reachable
   * from `approved`, so a draft cannot be published by accident and no
   * background job can publish at all.
   */
  app.post("/api/admin/sitelaunch/sites/:id/status", requireAdmin, async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid id" });
      const body = statusPatchSchema.safeParse(req.body);
      if (!body.success) return res.status(400).json({ error: "Invalid status" });

      const site = await getSiteById(id);
      if (!site) return res.status(404).json({ error: "Site not found" });

      if (body.data.status === "published" && site.status !== "approved") {
        return res.status(409).json({
          error: "A site must be approved before it can be published.",
          current_status: site.status,
        });
      }

      const updated = await setStatus(id, body.data.status, (req.user as { id?: number } | undefined)?.id ?? null);
      try {
        await storage.logAdminActivity({
          actor_type: "human",
          actor_id: (req.user as { id?: number } | undefined)?.id,
          actor_name: (req.user as { name?: string; email?: string } | undefined)?.name,
          action: `sitelaunch.status.${body.data.status}`,
          entity_type: "sitelaunch_site",
          entity_id: id,
          summary: `SiteLaunch site #${id} moved to ${body.data.status}`,
          metadata: { from: site.status, to: body.data.status },
        });
      } catch (err: any) {
        // Audit logging must never block the state change, but it must not
        // vanish either.
        log.warn("admin activity log failed", { error: err?.message, siteId: id });
      }

      res.json({
        site: siteSummary(updated),
        /* Publishing serves the document. It does NOT point a domain at it. */
        note:
          body.data.status === "published"
            ? "Published — the site is now served by this app. Pointing a domain at it is still a manual step."
            : undefined,
      });
    } catch (err: any) {
      log.error("status change failed", { error: err?.message });
      res.status(500).json({ error: "Failed to change status" });
    }
  });

  /** Record what an operator actually did about DNS/hosting. */
  app.post("/api/admin/sitelaunch/sites/:id/domain", requireAdmin, async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid id" });
      const body = domainPatchSchema.safeParse(req.body);
      if (!body.success) return res.status(400).json({ error: "Invalid request" });
      const updated = await updateDomain(id, body.data);
      if (!updated) return res.status(404).json({ error: "Site not found" });
      const domain = domainProvisioningState();
      res.json({ site: siteSummary(updated), provisioning_note: domain.message });
    } catch (err: any) {
      log.error("domain update failed", { error: err?.message });
      res.status(500).json({ error: "Failed to update domain details" });
    }
  });

  /**
   * Export every page as standalone HTML. Satisfies the "you own the
   * website… you take it with you" promise (products.ts:304). Returned as
   * JSON files rather than a binary archive so no new dependency is added;
   * the admin UI offers per-file download.
   */
  app.get("/api/admin/sitelaunch/sites/:id/export", requireAdmin, async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid id" });
      const found = await getSiteWithPages(id);
      if (!found) return res.status(404).json({ error: "Site not found" });
      const assembled = assembleDocument(found.site, found.pages);
      if (!assembled.ok) return res.status(422).json({ error: assembled.error });

      const origin = found.site.custom_domain ? `https://${found.site.custom_domain}` : "";
      const files = assembled.doc.pages.map((page) => {
        const rendered = renderPage(assembled.doc, page, {
          origin,
          basePath: "",
          preview: false,
          platformOrigin: platformOrigin(req),
        });
        return {
          filename: page.slug ? `${page.slug}.html` : "index.html",
          bytes: Buffer.byteLength(rendered.html, "utf8"),
          html: rendered.html,
        };
      });
      res.json({ site: siteSummary(found.site, found.pages.length), files });
    } catch (err: any) {
      log.error("export failed", { error: err?.message });
      res.status(500).json({ error: "Failed to export site" });
    }
  });

  /* ──────────────────────────────────────────────────────────────────────
   * Preview — token-gated, always noindex
   * ────────────────────────────────────────────────────────────────────── */

  const servePreview = async (req: Request, res: Response) => {
    try {
      const token = String(req.params.token || "");
      if (token.length < 16) return res.status(404).type("text/plain").send("Not found");
      const site = await getSiteByPreviewToken(token);
      if (!site) return res.status(404).type("text/plain").send("Not found");

      const wanted = String(req.params.pageSlug || "").replace(/^\/+|\/+$/g, "");
      const page = await getPageBySlug(site.id, wanted);
      if (!page) return res.status(404).type("text/plain").send("Page not found");

      const found = await getSiteWithPages(site.id);
      if (!found) return res.status(404).type("text/plain").send("Not found");
      const assembled = assembleDocument(found.site, found.pages);
      if (!assembled.ok) {
        log.error("preview document invalid", { siteId: site.id, error: assembled.error });
        return res.status(500).type("text/plain").send(`Site document is invalid: ${assembled.error}`);
      }

      const docPage = assembled.doc.pages.find((p) => p.slug === wanted);
      if (!docPage) return res.status(404).type("text/plain").send("Page not found");

      const rendered = renderPage(assembled.doc, docPage, {
        origin: "",
        basePath: `/sitelaunch/preview/${token}`,
        preview: true,
        platformOrigin: platformOrigin(req),
      });

      // A preview must never be indexed and must never be cached publicly.
      res.setHeader("X-Robots-Tag", "noindex, nofollow");
      res.setHeader("Cache-Control", "private, no-store");
      res.setHeader("Referrer-Policy", "no-referrer");
      res.type("html").send(rendered.html);
    } catch (err: any) {
      log.error("preview render failed", { error: err?.message });
      res.status(500).type("text/plain").send("Preview failed");
    }
  };

  app.get("/sitelaunch/preview/:token", (req, res) => {
    (req.params as Record<string, string>).pageSlug = "";
    return servePreview(req, res);
  });
  app.get("/sitelaunch/preview/:token/:pageSlug", servePreview);
}
