/**
 * Meta Data Deletion Request callback.
 *
 *   POST /api/meta/data-deletion         — Meta calls this when a user
 *                                          requests deletion of their data
 *                                          (or removes the app) from their
 *                                          Facebook settings.
 *   GET  /api/meta/data-deletion/status  — human-readable status page; the
 *                                          URL we return to Meta, keyed by
 *                                          ?code=<confirmation_code>.
 *
 * Contract (verified against Meta's spec on 2026-06-10,
 * https://developers.facebook.com/docs/development/create-an-app/app-dashboard/data-deletion-callback):
 *   - Meta POSTs a form-encoded `signed_request` parameter:
 *     `<base64url(signature)>.<base64url(json payload)>`, where signature is
 *     the raw HMAC-SHA256 of the encoded payload keyed with the app secret,
 *     and the payload carries `{ algorithm, user_id, issued_at, expires }`.
 *   - We must respond with JSON `{ url, confirmation_code }` where `url` is
 *     a page the user can visit to check the status of their request.
 *
 * What deletion means here: SocialSync stores (a) the user's encrypted
 * Facebook OAuth token, (b) the app-scoped user id, and (c) discovered
 * page/IG metadata, all in `socialsync_platform_connections` (plus derived
 * Instagram rows whose tokens come from the same Facebook login). Given the
 * app-scoped `user_id` we scrub every matching facebook row AND the sibling
 * instagram rows of the same client. Aggregate post insights are anonymous
 * counts and contain no user data.
 *
 * Security posture mirrors metaMessagingWebhookRoutes.ts:
 *   - 503 when the app secret is not configured
 *   - 400 when `signed_request` is missing
 *   - 401 when signature verification fails (parseSignedRequest → null)
 */
import type { Express, Request, Response } from "express";
import { randomBytes } from "crypto";
import { createLogger } from "../lib/logger";
import { db } from "../db";
import { auditLog } from "@shared/schema";
import { and, desc, eq } from "drizzle-orm";
import { storage } from "../storage";
import { getMetaAppSecret } from "../services/socialSync/facebookService";
import { parseSignedRequest } from "../services/socialSync/metaSignedRequest";

const log = createLogger("MetaDataDeletion");

const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL?.replace(/\/$/, "") || "https://wefixtrades.com";

/** Audit-log namespace for deletion requests (status page queries by it). */
const AUDIT_ENTITY_TYPE = "meta_data_deletion_request";

/** Confirmation codes are lowercase hex with a fixed prefix — easy to
 * validate strictly on the status page (no HTML-escaping concerns). */
const CONFIRMATION_CODE_RE = /^wftdel-[0-9a-f]{20}$/;

function newConfirmationCode(): string {
  return `wftdel-${randomBytes(10).toString("hex")}`;
}

export function registerMetaDataDeletionRoutes(app: Express): void {
  /**
   * POST /api/meta/data-deletion
   *
   * Body: `signed_request=<sig>.<payload>` (application/x-www-form-urlencoded;
   * the global urlencoded + json parsers both leave it on req.body).
   */
  app.post("/api/meta/data-deletion", async (req: Request, res: Response) => {
    const appSecret = getMetaAppSecret();
    if (!appSecret) {
      log.warn("Meta app secret not configured — refusing data-deletion callback");
      return res.status(503).json({ error: "callback_not_configured" });
    }

    const signedRequest =
      typeof req.body?.signed_request === "string" ? req.body.signed_request : null;
    if (!signedRequest) {
      log.warn("data-deletion callback missing signed_request parameter");
      return res.status(400).json({ error: "missing_signed_request" });
    }

    const payload = parseSignedRequest(signedRequest, appSecret);
    if (!payload) {
      log.warn("data-deletion callback signature verification failed");
      return res.status(401).json({ error: "invalid_signed_request" });
    }

    const userId = payload.user_id ? String(payload.user_id) : null;
    if (!userId) {
      log.warn("data-deletion signed_request verified but carries no user_id");
      return res.status(400).json({ error: "missing_user_id" });
    }

    const confirmationCode = newConfirmationCode();
    const deletedAt = new Date().toISOString();
    const erasedConnectionIds: number[] = [];
    const affectedClientIds: number[] = [];

    try {
      // 1. Every facebook connection bound to this app-scoped user id,
      //    regardless of connection_status (expired rows still hold tokens).
      const fbConnections = await storage.listSocialSyncConnectionsByExternalAccountId(
        "facebook",
        userId,
      );

      const replacementMetadata = {
        deleted_via: "meta_data_deletion_callback",
        deleted_at: deletedAt,
        confirmation_code: confirmationCode,
      };

      for (const fbConn of fbConnections) {
        affectedClientIds.push(fbConn.client_id);

        // 2. Sibling instagram rows of the same client — their tokens are
        //    derived from this user's Facebook login (see instagramService).
        const clientConnections = await storage.listSocialSyncConnections(fbConn.client_id);
        const toErase = clientConnections.filter(
          (c) => c.id === fbConn.id || c.platform === "instagram",
        );

        for (const conn of toErase) {
          await storage.eraseSocialSyncConnectionData(conn.id, replacementMetadata);
          erasedConnectionIds.push(conn.id);
        }

        await storage.createSocialSyncLog({
          client_id: fbConn.client_id,
          entity_type: "connection",
          entity_id: fbConn.id,
          action: "facebook.data_deletion_request",
          status: "success",
          details: {
            confirmation_code: confirmationCode,
            erased_connection_ids: toErase.map((c) => c.id),
          },
        });
      }
    } catch (err: any) {
      // Still answer Meta with a confirmation — the audit row below records
      // the failure so ops can finish the scrub manually, and the status
      // page keys off that row.
      log.error("data-deletion scrub failed", {
        error: err?.message ?? String(err),
        confirmationCode,
      });
    }

    // 3. Durable record keyed by confirmation code — the status page reads
    //    this row. Direct insert (not fire-and-forget writeAudit) because
    //    the status lookup depends on it; failure is logged, never thrown.
    try {
      await db.insert(auditLog).values({
        actor_id: "meta",
        actor_type: "system",
        action: "delete",
        entity_type: AUDIT_ENTITY_TYPE,
        entity_id: confirmationCode,
        after: {
          // Never store the app-scoped user id beyond what deletion needs —
          // record only aggregate facts about what was erased.
          erased_connection_count: erasedConnectionIds.length,
          erased_connection_ids: erasedConnectionIds,
          affected_client_count: affectedClientIds.length,
          requested_at: deletedAt,
          issued_at: payload.issued_at ?? null,
        },
        metadata: { source: "meta_data_deletion_callback" },
      });
    } catch (err: any) {
      log.error("Failed to persist data-deletion confirmation row", {
        error: err?.message ?? String(err),
        confirmationCode,
      });
    }

    log.info("Processed Meta data-deletion request", {
      confirmationCode,
      erased: erasedConnectionIds.length,
      clients: affectedClientIds.length,
    });

    // Exact response contract Meta expects: { url, confirmation_code }.
    return res.status(200).json({
      url: `${PUBLIC_BASE_URL}/api/meta/data-deletion/status?code=${confirmationCode}`,
      confirmation_code: confirmationCode,
    });
  });

  /**
   * GET /api/meta/data-deletion/status?code=<confirmation_code>
   *
   * Human-readable status page (Meta requires the returned `url` to explain
   * the request's status to the user). Plain server-rendered HTML — this is
   * a compliance utility page, not part of the portal SPA.
   */
  app.get("/api/meta/data-deletion/status", async (req: Request, res: Response) => {
    const code = String(req.query.code || "");
    res.type("html");

    if (!CONFIRMATION_CODE_RE.test(code)) {
      return res.status(400).send(statusPageHtml(
        "Invalid confirmation code",
        "The confirmation code in this link is not valid. Please use the exact link " +
          "provided when the deletion request was made, or email " +
          `<a href="mailto:support@wefixtrades.com">support@wefixtrades.com</a> for help.`,
      ));
    }

    let row: { after: unknown; created_at: Date } | undefined;
    try {
      const rows = await db
        .select({ after: auditLog.after, created_at: auditLog.created_at })
        .from(auditLog)
        .where(and(
          eq(auditLog.entity_type, AUDIT_ENTITY_TYPE),
          eq(auditLog.entity_id, code),
        ))
        .orderBy(desc(auditLog.created_at))
        .limit(1);
      row = rows[0];
    } catch (err: any) {
      log.error("data-deletion status lookup failed", { error: err?.message ?? String(err) });
      return res.status(500).send(statusPageHtml(
        "Status temporarily unavailable",
        "We could not look up your deletion request right now. Please try again shortly or email " +
          `<a href="mailto:support@wefixtrades.com">support@wefixtrades.com</a>.`,
      ));
    }

    if (!row) {
      return res.status(404).send(statusPageHtml(
        "Deletion request not found",
        `We have no record of a deletion request with confirmation code <code>${code}</code>. ` +
          "If you believe this is an error, email " +
          `<a href="mailto:support@wefixtrades.com">support@wefixtrades.com</a> and include this code.`,
      ));
    }

    const requestedAt = row.created_at ? new Date(row.created_at).toUTCString() : "unknown date";
    return res.status(200).send(statusPageHtml(
      "Deletion request completed",
      `Your data deletion request (confirmation code <code>${code}</code>) was received on ` +
        `<strong>${requestedAt}</strong> and has been completed. The Facebook/Instagram connection ` +
        "data WeFixTrades held for your account — including access tokens and connected page " +
        "details — has been deleted. " +
        `See our <a href="${PUBLIC_BASE_URL}/privacy#data-deletion">privacy policy, section 10 — ` +
        "Deleting your data</a> for what we delete and the few records the law requires us to keep. " +
        "Questions? Email " +
        `<a href="mailto:support@wefixtrades.com">support@wefixtrades.com</a>.`,
    ));
  });
}

/** Minimal, dependency-free HTML shell for the status page. */
function statusPageHtml(title: string, bodyHtml: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${title} — WeFixTrades</title>
<style>
  body { font-family: system-ui, -apple-system, "Segoe UI", sans-serif; background: #0b1020; color: #e7eaf3; margin: 0; padding: 24px; display: flex; min-height: 100vh; align-items: center; justify-content: center; }
  main { max-width: 560px; background: #131a31; border: 1px solid #2a3354; border-radius: 16px; padding: 32px; }
  h1 { font-size: 20px; margin: 0 0 12px; }
  p { font-size: 15px; line-height: 1.7; color: #b9c0d4; margin: 0; }
  a { color: #7da2ff; }
  code { background: #0b1020; border-radius: 6px; padding: 2px 6px; font-size: 13px; }
</style>
</head>
<body>
<main>
<h1>${title}</h1>
<p>${bodyHtml}</p>
</main>
</body>
</html>`;
}
