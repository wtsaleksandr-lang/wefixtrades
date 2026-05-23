/**
 * Portal CRUD + inbox routes — free-tools batch 2.
 *
 * Authenticated client-only. Two tools live here so they share the auth
 * pattern + resolveClientId helper:
 *
 *   Review-link funnel
 *     GET    /api/portal/free-tools/review-link
 *     PUT    /api/portal/free-tools/review-link
 *     GET    /api/portal/free-tools/review-link/feedback
 *     GET    /api/portal/free-tools/review-link/stats
 *     GET    /api/portal/free-tools/review-card.pdf   — QR business-card PDF
 *
 *   Callback widget
 *     GET    /api/portal/free-tools/callback           — widget config + token
 *     PUT    /api/portal/free-tools/callback           — save config
 *     GET    /api/portal/free-tools/callback/leads     — paginated inbox
 *     PATCH  /api/portal/free-tools/callback/leads/:id — update status
 *     DELETE /api/portal/free-tools/callback/leads/:id
 */

import type { Express, Request, Response } from "express";
import { requireClient } from "../auth";
import { db } from "../db";
import { eq, and, desc, sql } from "drizzle-orm";
import { z } from "zod";
import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import {
  clients,
  reviewLinkConfigs,
  reviewFunnelEvents,
  callbackWidgetConfigs,
  callbackRequests,
} from "@shared/schemas/adminCrm";
import { storage } from "../storage";
import { createLogger } from "../lib/logger";

const log = createLogger("PortalReviewLink");

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,40}[a-z0-9])?$/;

async function resolveClientId(userId: number): Promise<number | null> {
  const [row] = await db
    .select({ id: clients.id })
    .from(clients)
    .where(eq(clients.user_id, userId))
    .limit(1);
  return row?.id ?? null;
}

async function withClientId(req: Request, res: Response): Promise<number | null> {
  const clientId = await resolveClientId(req.user!.id);
  if (!clientId) {
    res.status(403).json({ error: "No client record linked to this account", code: "no_client_linked" });
    return null;
  }
  return clientId;
}

function defaultSlugFromBusinessName(name: string | null): string {
  const base = (name || "review")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30) || "review";
  return base + "-" + Math.random().toString(36).slice(2, 6);
}

async function ensureReviewLinkConfig(clientId: number, businessName: string | null) {
  const [existing] = await db
    .select()
    .from(reviewLinkConfigs)
    .where(eq(reviewLinkConfigs.client_id, clientId))
    .limit(1);
  if (existing) return existing;
  // Mint a unique slug — retry up to 5 times on collision.
  for (let i = 0; i < 5; i++) {
    const candidate = defaultSlugFromBusinessName(businessName);
    try {
      const [row] = await db
        .insert(reviewLinkConfigs)
        .values({ client_id: clientId, slug: candidate, threshold: 4 })
        .returning();
      return row;
    } catch (_e) { /* unique violation — retry */ }
  }
  throw new Error("Failed to mint unique slug");
}

/* ─── Schemas ─── */
const reviewLinkBody = z.object({
  slug: z.string().regex(SLUG_RE, "Slug must be lowercase letters / digits / dashes (2-42 chars)"),
  google_url: z.string().url().max(500).optional().or(z.literal("").transform(() => undefined)),
  facebook_url: z.string().url().max(500).optional().or(z.literal("").transform(() => undefined)),
  yelp_url: z.string().url().max(500).optional().or(z.literal("").transform(() => undefined)),
  threshold: z.number().int().min(1).max(5),
  heading: z.string().max(200).optional().or(z.literal("").transform(() => undefined)),
});

const callbackConfigBody = z.object({
  enabled: z.boolean(),
  heading: z.string().min(1).max(200),
  cta_label: z.string().min(1).max(80),
  fields_json: z.object({
    name: z.boolean(),
    phone: z.boolean(),
    message: z.boolean(),
    best_time: z.boolean(),
  }),
});

const callbackLeadStatus = z.object({
  status: z.enum(["new", "contacted", "spam"]),
});

export function registerPortalReviewLinkRoutes(app: Express): void {
  /* ─────────────── Review link config ─────────────── */
  app.get("/api/portal/free-tools/review-link", requireClient, async (req, res) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;
      const [client] = await db.select().from(clients).where(eq(clients.id, clientId)).limit(1);
      const cfg = await ensureReviewLinkConfig(clientId, client?.business_name ?? null);
      const token = await storage.ensureWidgetToken(clientId);
      res.json({
        slug: cfg.slug,
        google_url: cfg.google_url,
        facebook_url: cfg.facebook_url,
        yelp_url: cfg.yelp_url,
        threshold: cfg.threshold,
        heading: cfg.heading,
        widgetToken: token,
        publicUrl: `${req.protocol}://${req.get("host")}/r/${cfg.slug}`,
      });
    } catch (err: any) {
      log.error("get review-link error", { error: err?.message });
      res.status(500).json({ error: "Failed to load review link" });
    }
  });

  app.put("/api/portal/free-tools/review-link", requireClient, async (req, res) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;
      const parsed = reviewLinkBody.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });

      const slug = parsed.data.slug.toLowerCase();

      // Uniqueness — allow keeping the existing slug; reject if another client owns it.
      const [collision] = await db
        .select({ owner: reviewLinkConfigs.client_id })
        .from(reviewLinkConfigs)
        .where(eq(reviewLinkConfigs.slug, slug))
        .limit(1);
      if (collision && collision.owner !== clientId) {
        return res.status(409).json({ error: "That URL is already taken — try another slug.", code: "slug_taken" });
      }

      const [existing] = await db
        .select()
        .from(reviewLinkConfigs)
        .where(eq(reviewLinkConfigs.client_id, clientId))
        .limit(1);

      if (existing) {
        await db
          .update(reviewLinkConfigs)
          .set({
            slug,
            google_url: parsed.data.google_url ?? null,
            facebook_url: parsed.data.facebook_url ?? null,
            yelp_url: parsed.data.yelp_url ?? null,
            threshold: parsed.data.threshold,
            heading: parsed.data.heading ?? null,
            updated_at: new Date(),
          })
          .where(eq(reviewLinkConfigs.client_id, clientId));
      } else {
        await db.insert(reviewLinkConfigs).values({
          client_id: clientId,
          slug,
          google_url: parsed.data.google_url ?? null,
          facebook_url: parsed.data.facebook_url ?? null,
          yelp_url: parsed.data.yelp_url ?? null,
          threshold: parsed.data.threshold,
          heading: parsed.data.heading ?? null,
        });
      }
      res.json({ ok: true, slug });
    } catch (err: any) {
      log.error("save review-link error", { error: err?.message });
      res.status(500).json({ error: "Failed to save review link" });
    }
  });

  /* ─── Feedback inbox ─── */
  app.get("/api/portal/free-tools/review-link/feedback", requireClient, async (req, res) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;
      const rows = await db
        .select()
        .from(reviewFunnelEvents)
        .where(
          and(
            eq(reviewFunnelEvents.client_id, clientId),
            eq(reviewFunnelEvents.routed_to, "feedback"),
          ),
        )
        .orderBy(desc(reviewFunnelEvents.created_at))
        .limit(100);
      res.json({ items: rows });
    } catch (err: any) {
      log.error("get feedback error", { error: err?.message });
      res.status(500).json({ error: "Failed to load feedback" });
    }
  });

  /* ─── Funnel stats strip ─── */
  app.get("/api/portal/free-tools/review-link/stats", requireClient, async (req, res) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;

      const monthStart = new Date();
      monthStart.setUTCDate(1);
      monthStart.setUTCHours(0, 0, 0, 0);

      const rows = await db
        .select({
          rating: reviewFunnelEvents.rating,
          routed_to: reviewFunnelEvents.routed_to,
        })
        .from(reviewFunnelEvents)
        .where(
          and(
            eq(reviewFunnelEvents.client_id, clientId),
            sql`${reviewFunnelEvents.created_at} >= ${monthStart}`,
          ),
        );

      const stars: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
      let visits = 0;
      let routed = 0;
      let feedback = 0;
      for (const r of rows) {
        visits++;
        if (r.rating && r.rating >= 1 && r.rating <= 5) stars[r.rating]++;
        if (r.routed_to && r.routed_to !== "feedback") routed++;
        if (r.routed_to === "feedback") feedback++;
      }
      res.json({ visits, routed, feedback, stars, monthStart });
    } catch (err: any) {
      log.error("get stats error", { error: err?.message });
      res.status(500).json({ error: "Failed to load stats" });
    }
  });

  /* ─── QR business-card PDF ─── */
  // 3.5×2 inch card → 252×144 pt (72 pt/in).
  app.get("/api/portal/free-tools/review-card.pdf", requireClient, async (req, res) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;
      const [client] = await db.select().from(clients).where(eq(clients.id, clientId)).limit(1);
      const cfg = await ensureReviewLinkConfig(clientId, client?.business_name ?? null);
      const publicUrl = `${req.protocol}://${req.get("host")}/r/${cfg.slug}`;
      const qrDataUrl = await QRCode.toDataURL(publicUrl, {
        margin: 1,
        width: 240,
        color: { dark: "#0f172a", light: "#ffffff" },
      });
      const qrPng = Buffer.from(qrDataUrl.split(",")[1], "base64");

      const doc = new PDFDocument({ size: [252, 144], margin: 10, info: { Title: "Review QR Card" } });
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `inline; filename="review-card-${cfg.slug}.pdf"`,
      );
      doc.pipe(res);

      // Layout: 3 horizontal bands. Left = text. Right = QR.
      // Background card-ish edge.
      doc.lineWidth(0.5).strokeColor("#e2e8f0").roundedRect(2, 2, 248, 140, 6).stroke();

      // Left text block
      const leftX = 14;
      doc.fillColor("#0f172a").font("Helvetica-Bold").fontSize(11);
      const businessName = (client?.business_name ?? "Your business").slice(0, 38);
      doc.text(businessName, leftX, 20, { width: 130 });

      doc.font("Helvetica").fontSize(8).fillColor("#475569");
      doc.text("Rate your experience", leftX, 40, { width: 130 });

      doc.fontSize(9).fillColor("#0f172a").font("Helvetica-Bold");
      doc.text("Scan to leave a review", leftX, 60, { width: 130 });

      doc.fontSize(7).fillColor("#64748b").font("Helvetica");
      doc.text(`/r/${cfg.slug}`, leftX, 88, { width: 130 });

      doc.fontSize(6).fillColor("#94a3b8");
      doc.text("powered by wefixtrades.com", leftX, 120, { width: 140 });

      // QR right side
      doc.image(qrPng, 158, 22, { fit: [80, 80] });
      doc.fontSize(6).fillColor("#64748b").text("scan with phone", 158, 108, { width: 80, align: "center" });

      doc.end();
    } catch (err: any) {
      log.error("pdf error", { error: err?.message });
      if (!res.headersSent) res.status(500).json({ error: "Failed to generate QR card" });
    }
  });

  /* ─────────────── Callback widget ─────────────── */
  app.get("/api/portal/free-tools/callback", requireClient, async (req, res) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;
      const [cfg] = await db
        .select()
        .from(callbackWidgetConfigs)
        .where(eq(callbackWidgetConfigs.client_id, clientId))
        .limit(1);
      const token = await storage.ensureWidgetToken(clientId);
      res.json({
        enabled: cfg?.enabled ?? true,
        heading: cfg?.heading ?? "Request a callback",
        cta_label: cfg?.cta_label ?? "Send request",
        fields_json: cfg?.fields_json ?? { name: true, phone: true, message: true, best_time: true },
        widgetToken: token,
      });
    } catch (err: any) {
      log.error("get callback cfg error", { error: err?.message });
      res.status(500).json({ error: "Failed to load callback config" });
    }
  });

  app.put("/api/portal/free-tools/callback", requireClient, async (req, res) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;
      const parsed = callbackConfigBody.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "Invalid input" });

      const [existing] = await db
        .select()
        .from(callbackWidgetConfigs)
        .where(eq(callbackWidgetConfigs.client_id, clientId))
        .limit(1);
      if (existing) {
        await db
          .update(callbackWidgetConfigs)
          .set({
            enabled: parsed.data.enabled,
            heading: parsed.data.heading,
            cta_label: parsed.data.cta_label,
            fields_json: parsed.data.fields_json,
            updated_at: new Date(),
          })
          .where(eq(callbackWidgetConfigs.client_id, clientId));
      } else {
        await db.insert(callbackWidgetConfigs).values({
          client_id: clientId,
          enabled: parsed.data.enabled,
          heading: parsed.data.heading,
          cta_label: parsed.data.cta_label,
          fields_json: parsed.data.fields_json,
        });
      }
      res.json({ ok: true });
    } catch (err: any) {
      log.error("save callback cfg error", { error: err?.message });
      res.status(500).json({ error: "Failed to save callback config" });
    }
  });

  app.get("/api/portal/free-tools/callback/leads", requireClient, async (req, res) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;
      const status = String(req.query.status || "");
      const where = status && ["new", "contacted", "spam"].includes(status)
        ? and(eq(callbackRequests.client_id, clientId), eq(callbackRequests.status, status))
        : eq(callbackRequests.client_id, clientId);
      const rows = await db
        .select()
        .from(callbackRequests)
        .where(where)
        .orderBy(desc(callbackRequests.created_at))
        .limit(200);
      res.json({ items: rows });
    } catch (err: any) {
      log.error("get callback leads error", { error: err?.message });
      res.status(500).json({ error: "Failed to load leads" });
    }
  });

  app.patch("/api/portal/free-tools/callback/leads/:id", requireClient, async (req, res) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;
      const id = String(req.params.id);
      const parsed = callbackLeadStatus.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "Invalid input" });
      const [row] = await db
        .update(callbackRequests)
        .set({ status: parsed.data.status })
        .where(and(eq(callbackRequests.id, id), eq(callbackRequests.client_id, clientId)))
        .returning();
      if (!row) return res.status(404).json({ error: "Not found" });
      res.json(row);
    } catch (err: any) {
      log.error("update callback lead error", { error: err?.message });
      res.status(500).json({ error: "Failed to update lead" });
    }
  });

  app.delete("/api/portal/free-tools/callback/leads/:id", requireClient, async (req, res) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;
      const id = String(req.params.id);
      const deleted = await db
        .delete(callbackRequests)
        .where(and(eq(callbackRequests.id, id), eq(callbackRequests.client_id, clientId)))
        .returning();
      if (!deleted.length) return res.status(404).json({ error: "Not found" });
      res.json({ ok: true });
    } catch (err: any) {
      log.error("delete callback lead error", { error: err?.message });
      res.status(500).json({ error: "Failed to delete lead" });
    }
  });
}
