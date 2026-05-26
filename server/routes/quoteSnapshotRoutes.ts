/**
 * Quote Snapshot Routes — Wave R3 — live, shareable quote URLs.
 *
 *   POST   /api/q/create   — create a snapshot from a completed widget run.
 *                            Returns { url, snapshot_slug, owner_edit_token,
 *                            expires_at }. The owner_edit_token is the
 *                            contractor's proof-of-ownership for future
 *                            edits / deletes — it is returned exactly ONCE
 *                            and only ever to the creating client.
 *   GET    /api/q/:slug    — public viewer payload. No auth. Increments
 *                            view_count + last_viewed_at. Strips the
 *                            owner_edit_token before responding.
 *   PATCH  /api/q/:slug    — contractor-only edit. Requires
 *                            { owner_edit_token } in the body. Updates
 *                            inputs and/or computed.
 *   DELETE /api/q/:slug    — contractor revokes the link (hard-delete).
 *
 * Security notes:
 *   - owner_edit_token NEVER appears in any GET response. The Sanitize
 *     helper strips it before serialising.
 *   - The customer-facing /q/:slug page learns its own edit privilege from
 *     localStorage on the contractor's device — not from the API.
 *   - Snapshots default to a 60-day TTL. Expired snapshots return 404.
 */

import type { Express, Request, Response } from "express";
import { randomBytes } from "crypto";
import { db } from "../db";
import { quoteSnapshots, calculators } from "@shared/schema";
import { eq } from "drizzle-orm";
import {
  generateSnapshotSlug,
  isValidSnapshotSlug,
  computeSnapshotExpiry,
  buildSnapshotPath,
  OWNER_EDIT_TOKEN_BYTES,
} from "@shared/quoteSnapshot";
import { createLogger } from "../lib/logger";
import { publishQuoteUpdate } from "./portal/quotequick/liveStream";

const log = createLogger("QuoteSnapshot");

const MAX_SLUG_RETRIES = 5;

/** Per-IP rate-limit for snapshot creation. */
const createRateMap = new Map<string, { count: number; resetAt: number }>();
const CREATE_RATE_WINDOW_MS = 10 * 60 * 1000;
const CREATE_RATE_MAX = 30;

function rateLimitCreate(ip: string): boolean {
  const now = Date.now();
  let rl = createRateMap.get(ip);
  if (!rl || now > rl.resetAt) {
    rl = { count: 0, resetAt: now + CREATE_RATE_WINDOW_MS };
    createRateMap.set(ip, rl);
  }
  rl.count++;
  return rl.count <= CREATE_RATE_MAX;
}

/**
 * Trim a snapshot row to the public-safe shape — removes the owner edit
 * token. The internal numeric `id` is also dropped: customers don't need
 * it, and exposing it makes guessing other rows easier.
 */
function toPublicSnapshot(row: typeof quoteSnapshots.$inferSelect) {
  const { owner_edit_token: _et, id: _id, ...rest } = row;
  return rest;
}

/**
 * Public-safe calculator slice — only the branding fields the viewer page
 * needs. We deliberately omit pricing_config / edit_token / owner_phone /
 * subscription IDs / anything else that's not appearance-related.
 */
function toPublicCalculator(row: typeof calculators.$inferSelect) {
  return {
    id: row.id,
    slug: row.slug,
    business_name: row.business_name,
    trade_type: row.trade_type,
    tagline: row.tagline,
    logo_url: row.logo_url,
    primary_color: row.primary_color,
    theme_overrides: row.theme_overrides,
    appearance: (row.calculator_settings as any)?.appearance ?? null,
    pricing_config: row.pricing_config,
    calculator_settings: row.calculator_settings,
  };
}

export function registerQuoteSnapshotRoutes(app: Express): void {

  /* ─── POST /api/q/create ─── */
  app.post("/api/q/create", async (req: Request, res: Response) => {
    try {
      const ip = req.ip || req.socket.remoteAddress || "unknown";
      if (!rateLimitCreate(ip)) {
        return res.status(429).json({ error: "Too many quote snapshots. Try again later." });
      }

      const {
        slug,
        inputs,
        computed,
        customer_name,
        customer_email,
        lead_id,
      } = req.body || {};

      if (!slug || typeof slug !== "string") {
        return res.status(400).json({ error: "Missing calculator slug" });
      }
      if (!inputs || typeof inputs !== "object") {
        return res.status(400).json({ error: "Missing inputs" });
      }
      if (!computed || typeof computed !== "object") {
        return res.status(400).json({ error: "Missing computed result" });
      }

      const [calc] = await db
        .select()
        .from(calculators)
        .where(eq(calculators.slug, slug))
        .limit(1);
      if (!calc) {
        return res.status(404).json({ error: "Calculator not found" });
      }
      // Demo calculators (id=0 / negative) don't get persistent snapshots —
      // they're transient previews. The widget should treat this as a
      // soft-fail (no share button shown) but we guard here too.
      if (calc.id <= 0) {
        return res.status(400).json({ error: "Demo calculators cannot create shareable links" });
      }

      // Collision-retry on snapshot_slug. 36^8 = 2.8e12 so retries are
      // effectively never needed, but the unique-violation safety net is
      // cheap and worth having.
      let snapshotSlug: string | null = null;
      let lastError: any = null;
      const ownerEditToken = randomBytes(OWNER_EDIT_TOKEN_BYTES).toString("hex");
      const expiresAt = computeSnapshotExpiry();

      for (let attempt = 0; attempt < MAX_SLUG_RETRIES; attempt++) {
        const candidate = generateSnapshotSlug();
        try {
          const [row] = await db
            .insert(quoteSnapshots)
            .values({
              snapshot_slug: candidate,
              calculator_id: calc.id,
              lead_id: lead_id || null,
              owner_edit_token: ownerEditToken,
              inputs,
              computed,
              customer_name: customer_name || null,
              customer_email: customer_email || null,
              expires_at: expiresAt,
            })
            .returning();
          snapshotSlug = row.snapshot_slug;
          break;
        } catch (err: any) {
          lastError = err;
          // 23505 = unique_violation in Postgres. Anything else, bail.
          if (err?.code !== "23505") throw err;
        }
      }

      if (!snapshotSlug) {
        log.error("Failed to allocate snapshot_slug after retries", { error: lastError?.message });
        return res.status(500).json({ error: "Could not allocate a unique URL — please retry" });
      }

      log.info("Created snapshot", {
        snapshot_slug: snapshotSlug,
        calculator_id: calc.id,
        lead_id: lead_id || null,
      });

      return res.json({
        url: buildSnapshotPath(snapshotSlug),
        snapshot_slug: snapshotSlug,
        owner_edit_token: ownerEditToken,
        expires_at: expiresAt.toISOString(),
      });
    } catch (err: any) {
      log.error("POST /api/q/create failed", { error: err?.message });
      return res.status(500).json({ error: "Failed to save quote snapshot" });
    }
  });

  /* ─── GET /api/q/:slug ─── */
  app.get("/api/q/:slug", async (req: Request, res: Response) => {
    try {
      const slug = String(req.params.slug || "");
      if (!isValidSnapshotSlug(slug)) {
        return res.status(404).json({ error: "Quote not found" });
      }

      const [row] = await db
        .select()
        .from(quoteSnapshots)
        .where(eq(quoteSnapshots.snapshot_slug, slug))
        .limit(1);
      if (!row) {
        return res.status(404).json({ error: "Quote not found" });
      }

      // Expired? treat as 404 — don't leak whether the slug ever existed.
      if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) {
        return res.status(404).json({ error: "Quote not found" });
      }

      // Increment view stats. Fire-and-forget so we don't slow the GET.
      db.update(quoteSnapshots)
        .set({
          view_count: (row.view_count ?? 0) + 1,
          last_viewed_at: new Date(),
        })
        .where(eq(quoteSnapshots.id, row.id))
        .catch((err) => log.warn("view_count update failed", { error: err?.message }));

      const [calc] = await db
        .select()
        .from(calculators)
        .where(eq(calculators.id, row.calculator_id))
        .limit(1);
      if (!calc) {
        // Should never happen given the FK, but the calculator may have
        // been deleted out-of-band; the snapshot is then orphaned.
        return res.status(404).json({ error: "Quote not found" });
      }

      return res.json({
        snapshot: toPublicSnapshot(row),
        calculator: toPublicCalculator(calc),
      });
    } catch (err: any) {
      log.error("GET /api/q/:slug failed", { error: err?.message });
      return res.status(500).json({ error: "Failed to load quote" });
    }
  });

  /* ─── PATCH /api/q/:slug ─── */
  app.patch("/api/q/:slug", async (req: Request, res: Response) => {
    try {
      const slug = String(req.params.slug || "");
      if (!isValidSnapshotSlug(slug)) {
        return res.status(404).json({ error: "Quote not found" });
      }
      const { owner_edit_token, inputs, computed } = req.body || {};
      if (!owner_edit_token || typeof owner_edit_token !== "string") {
        return res.status(401).json({ error: "Edit token required" });
      }

      const [row] = await db
        .select()
        .from(quoteSnapshots)
        .where(eq(quoteSnapshots.snapshot_slug, slug))
        .limit(1);
      if (!row) {
        return res.status(404).json({ error: "Quote not found" });
      }
      if (!row.owner_edit_token || row.owner_edit_token !== owner_edit_token) {
        return res.status(403).json({ error: "Not authorised to edit this quote" });
      }

      const patch: Partial<typeof quoteSnapshots.$inferInsert> = {
        last_edited_at: new Date(),
      };
      if (inputs && typeof inputs === "object") patch.inputs = inputs;
      if (computed && typeof computed === "object") patch.computed = computed;

      const [updated] = await db
        .update(quoteSnapshots)
        .set(patch)
        .where(eq(quoteSnapshots.id, row.id))
        .returning();

      log.info("Edited snapshot", { snapshot_slug: slug });

      // Wave 29 — broadcast a live-edit event to any /q/:slug viewer
      // subscribed via the SSE stream. Non-fatal if the publish throws.
      try {
        publishQuoteUpdate(slug);
      } catch (publishErr: any) {
        log.warn("publishQuoteUpdate failed", {
          snapshot_slug: slug,
          error: publishErr?.message,
        });
      }

      return res.json({ snapshot: toPublicSnapshot(updated) });
    } catch (err: any) {
      log.error("PATCH /api/q/:slug failed", { error: err?.message });
      return res.status(500).json({ error: "Failed to update quote" });
    }
  });

  /* ─── DELETE /api/q/:slug ─── */
  app.delete("/api/q/:slug", async (req: Request, res: Response) => {
    try {
      const slug = String(req.params.slug || "");
      if (!isValidSnapshotSlug(slug)) {
        return res.status(404).json({ error: "Quote not found" });
      }
      const { owner_edit_token } = req.body || {};
      if (!owner_edit_token || typeof owner_edit_token !== "string") {
        return res.status(401).json({ error: "Edit token required" });
      }

      const [row] = await db
        .select()
        .from(quoteSnapshots)
        .where(eq(quoteSnapshots.snapshot_slug, slug))
        .limit(1);
      if (!row) {
        return res.status(404).json({ error: "Quote not found" });
      }
      if (!row.owner_edit_token || row.owner_edit_token !== owner_edit_token) {
        return res.status(403).json({ error: "Not authorised to revoke this quote" });
      }

      await db.delete(quoteSnapshots).where(eq(quoteSnapshots.id, row.id));
      log.info("Revoked snapshot", { snapshot_slug: slug });
      return res.json({ ok: true });
    } catch (err: any) {
      log.error("DELETE /api/q/:slug failed", { error: err?.message });
      return res.status(500).json({ error: "Failed to revoke quote" });
    }
  });
}
