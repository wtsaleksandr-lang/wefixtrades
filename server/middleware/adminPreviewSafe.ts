/**
 * Admin-preview-mode safe helpers for portal routes.
 *
 * Wave 12C — sweep follow-up to Wave 11B (PR #828).
 *
 * Background
 * ──────────
 * `requireClient` lets BOTH role="client" AND role="admin" through to the
 * portal so admins can preview the customer surface. The actual client_id
 * is resolved via a separate `clients.user_id = users.id` lookup. Admins
 * have no `clients` row of their own, so that lookup returns null. Before
 * this wave, every read endpoint that hit a null clientId returned 403
 * `{ error: "No client record linked to this account", code: "no_client_linked" }`,
 * which the UI surfaced as a red "Failed to load" boundary even though the
 * admin is legitimately just previewing.
 *
 * Wave 11B fixed this for one endpoint (PATCH brand-profile). Wave 12C
 * applies the same pattern across the whole portal surface via this shared
 * helper.
 *
 * Security
 * ────────
 *   • Only role="admin" benefits from the bypass.
 *   • Regular role="client" still 403s if the clients row is missing — that
 *     is a real account-broken condition customers must see.
 *   • Admin impersonation sessions (req.adminImpersonating set) DO get a
 *     real clientId resolution because the impersonation middleware swaps
 *     req.user.id to the target client's user_id; nothing changes for them.
 *   • Write endpoints get an explicit `previewMode:true, persisted:false`
 *     response so the UI knows the change wasn't saved, plus an audit log
 *     line for ops visibility — but the database is untouched.
 *
 * Usage (read endpoint)
 * ─────────────────────
 *   const clientId = await withClientIdOrPreview(req, res, {
 *     previewShape: { articles: [], count: 0 },
 *   });
 *   if (!clientId) return; // Response already sent (either 200 preview or 403)
 *
 * Usage (write endpoint)
 * ──────────────────────
 *   const clientId = await withClientIdOrPreview(req, res, {
 *     previewShape: { ok: true, persisted: false },
 *     mode: "write",
 *     action: "contentflow.brand-profile.patch",
 *   });
 *   if (!clientId) return;
 *
 * The helper centralises the role/clients-row check, the empty-shape
 * response, and the "log the would-be mutation" telemetry. Routes that
 * still want a custom 403 message (e.g. requireClientStrict callers) can
 * keep their existing inline branch — this helper is opt-in per route.
 */

import type { Request, Response } from "express";
import { db } from "../db";
import { clients } from "@shared/schema";
import { eq } from "drizzle-orm";
import { createLogger } from "../lib/logger";

const log = createLogger("AdminPreviewSafe");

export interface AdminPreviewOptions<T extends Record<string, unknown> = Record<string, unknown>> {
  /**
   * Shape returned in the 200 admin-preview response. Should be the
   * "empty but valid" form the page expects (e.g. `{ articles: [] }` for
   * a list endpoint, `{ ok: true, persisted: false }` for a mutation).
   * `previewMode: true` and `persisted: false` are merged in automatically.
   */
  previewShape: T;
  /**
   * "read" (default) — admin preview returns the empty shape immediately.
   * "write" — admin preview also writes an audit log line noting the
   * would-be mutation, so ops can see what an admin tried to do under
   * preview mode without anything actually persisting.
   */
  mode?: "read" | "write";
  /** Short identifier for the action, used by the audit log line ("write" mode). */
  action?: string;
}

/**
 * Resolve the authenticated user's client_id. Returns the id or null;
 * if null, the response has already been sent (200 preview for admins,
 * 403 no_client_linked for regular clients).
 */
export async function withClientIdOrPreview<T extends Record<string, unknown>>(
  req: Request,
  res: Response,
  opts: AdminPreviewOptions<T>,
): Promise<number | null> {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ error: "Authentication required" });
    return null;
  }

  // Look up the clients row (admin impersonation already swapped req.user.id
  // to the target customer, so this also "just works" for impersonation).
  const [row] = await db
    .select({ id: clients.id })
    .from(clients)
    .where(eq(clients.user_id, userId))
    .limit(1);
  const clientId = row?.id ?? null;
  if (clientId) return clientId;

  // No client row. Branch on role:
  if (req.user?.role === "admin") {
    if (opts.mode === "write") {
      log.info("[admin-preview] no-op write", {
        action: opts.action ?? "unknown",
        admin_user_id: userId,
        path: req.path,
        method: req.method,
      });
    }
    res.status(200).json({
      previewMode: true,
      persisted: false,
      ...opts.previewShape,
    });
    return null;
  }

  // Regular client without a linked row → real account error. Keep 403.
  res.status(403).json({
    error: "No client record linked to this account",
    code: "no_client_linked",
  });
  return null;
}

/**
 * Lightweight check — returns true if the authenticated user is an admin
 * who has no linked client row (i.e. is in preview mode). Useful when a
 * route wants to skip side-effects (queue jobs, external webhook calls,
 * etc.) without going through `withClientIdOrPreview`.
 */
export async function isAdminPreviewMode(req: Request): Promise<boolean> {
  if (req.user?.role !== "admin") return false;
  const userId = req.user?.id;
  if (!userId) return false;
  const [row] = await db
    .select({ id: clients.id })
    .from(clients)
    .where(eq(clients.user_id, userId))
    .limit(1);
  return !row?.id;
}
