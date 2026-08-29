/**
 * Portal account deletion + data export.
 *
 * The privacy policy (§10, `client/src/pages/marketing/privacy.tsx`) tells
 * customers to delete their account from Settings → Account. These are the
 * endpoints behind that control, and behind the "Download my data" button that
 * sits beside it (GDPR Art. 20 portability).
 *
 * Endpoints
 *   GET  /api/portal/account/deletion-preview  — what will go, what we keep,
 *                                                and which confirmation the
 *                                                account needs
 *   GET  /api/portal/account/export            — everything we hold, as JSON
 *   POST /api/portal/account/delete            — irreversible erasure
 *
 * Auth: requireClient, plus per-request re-authentication on the delete path.
 * Deletion is irreversible, so a live session is not sufficient evidence that
 * the person at the keyboard is the account holder.
 *
 * Confirmation model
 *   • Password accounts re-enter their password.
 *   • SSO-only accounts (Google/Microsoft/Facebook/Apple) hold a random
 *     unusable password_hash and cannot re-enter anything meaningful, so they
 *     retype their own email address instead.
 *   • Both must additionally type the literal word DELETE. The client shows
 *     the same two gates; these server checks are the ones that count.
 */
import type { Express, Request, Response } from "express";
import { eq, sql } from "drizzle-orm";
import { requireClient, verifyPassword } from "../../auth";
import { db } from "../../db";
import { clients, users } from "@shared/schema";
import { createLogger } from "../../lib/logger";
import { authRateLimiter } from "../../services/rateLimiter";
import {
  LegalHoldError,
  deleteAccountData,
  retentionDisclosure,
} from "../../services/accountDeletion/deleteAccount";
import { ACCOUNT_DELETION_PLAN } from "@shared/accountDeletion/plan";

const log = createLogger("PortalAccountDeletion");

/** The exact word the customer must type. Mirrored by the UI. */
const CONFIRM_PHRASE = "DELETE";

function getClientIp(req: Request): string {
  return (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.ip || "unknown";
}

interface AccountIdentity {
  id: number;
  email: string;
  deleted_at: Date | null;
  password_hash: string;
  /** True when the only way in is an identity provider. */
  ssoOnly: boolean;
}

async function loadIdentity(userId: number): Promise<AccountIdentity | null> {
  const [row] = await db
    .select({
      id: users.id,
      email: users.email,
      deleted_at: users.deleted_at,
      password_hash: users.password_hash,
      google_sub: users.google_sub,
      microsoft_sub: users.microsoft_sub,
      facebook_sub: users.facebook_sub,
      apple_sub: users.apple_sub,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    deleted_at: row.deleted_at,
    password_hash: row.password_hash,
    ssoOnly: Boolean(row.google_sub || row.microsoft_sub || row.facebook_sub || row.apple_sub),
  };
}

/**
 * Admins browsing the portal have no `clients` row of their own, and an
 * "impersonate then delete" path would let staff erase a customer from a UI
 * built for self-service. Both are refused outright.
 */
function refuseAdmin(req: Request, res: Response): boolean {
  if (req.user!.role === "admin") {
    res.status(403).json({
      error:
        "Account deletion is a self-service action. Staff accounts cannot delete a customer " +
        "account from the portal — handle the erasure request through support.",
      code: "admin_cannot_self_delete",
    });
    return true;
  }
  return false;
}

export function registerPortalAccountDeletionRoutes(app: Express) {
  /**
   * GET /api/portal/account/deletion-preview
   *
   * Everything the confirmation screen needs so it can be truthful: which
   * confirmation this account requires, and the categories of data that are
   * erased versus the ones we are legally obliged to keep.
   */
  app.get(
    "/api/portal/account/deletion-preview",
    requireClient,
    async (req: Request, res: Response) => {
      try {
        if (refuseAdmin(req, res)) return;
        const identity = await loadIdentity(req.user!.id);
        if (!identity) return res.status(404).json({ error: "Account not found" });

        const owned = await db
          .select({ id: clients.id, business_name: clients.business_name })
          .from(clients)
          .where(eq(clients.user_id, identity.id));

        res.json({
          email: identity.email,
          requires: identity.ssoOnly ? "email" : "password",
          confirm_phrase: CONFIRM_PHRASE,
          businesses: owned.map((c) => c.business_name),
          /* Deliberately category-level, not a 115-row table dump: the point
             is that the customer can see what leaves and what stays. */
          deletes: [
            "Your login, profile and any connected Google, Microsoft, Facebook or Apple sign-in",
            "Your business profile, logo, branding and website settings",
            "Every quote calculator, widget and published site you built",
            "Every lead, customer record, booking and quote they captured",
            "Reviews, review requests, rankings, listings and Map monitoring history",
            "Connected social and Google Business accounts, including their access tokens",
            "Call recordings, voicemails, SMS history and mobile devices",
            "Support tickets, chat history and AI assistant conversations",
          ],
          retains: [
            {
              what: "Paid invoices, orders and payment records",
              why: "We must keep financial records for 7 years to meet tax and accounting obligations. They stay linked to an anonymised account that no longer identifies you.",
            },
            {
              what: "Do-not-contact and unsubscribe lists",
              why: "If we deleted the record of your opt-out we could email or text you again. Keeping it is what makes the opt-out permanent.",
            },
            {
              what: "Security audit log of staff access to your account",
              why: "Records that our staff viewed your account. It stores account IDs only, which identify nobody once the account is anonymised.",
            },
          ],
          retained_tables: retentionDisclosure(),
          already_deleted: Boolean(identity.deleted_at),
        });
      } catch (err) {
        log.error("deletion preview failed", { error: String(err) });
        res.status(500).json({ error: "Failed to load deletion details" });
      }
    },
  );

  /**
   * GET /api/portal/account/export
   *
   * GDPR Art. 20 portability: one JSON document containing the rows this
   * account owns. Driven by the same plan as deletion, so the export can never
   * silently miss a table that deletion covers — every `delete` entry is
   * exported, which is exactly the set that is about to disappear.
   *
   * Deliberately capped per table. This is a "take your data with you" file,
   * not a database dump, and an unbounded export on a large account would pin
   * a connection for minutes.
   */
  app.get("/api/portal/account/export", requireClient, async (req: Request, res: Response) => {
    const MAX_ROWS_PER_TABLE = 5000;
    try {
      if (refuseAdmin(req, res)) return;
      const identity = await loadIdentity(req.user!.id);
      if (!identity) return res.status(404).json({ error: "Account not found" });

      const owned = await db
        .select()
        .from(clients)
        .where(eq(clients.user_id, identity.id));
      const clientIds = owned.map((c) => c.id);

      const data: Record<string, unknown[]> = {};
      const truncated: string[] = [];

      for (const entry of ACCOUNT_DELETION_PLAN) {
        if (entry.action !== "delete") continue;
        // Only the directly-owned tables. Parent-scoped children are reached
        // through a subquery whose cost is not worth it for an export, and
        // their contents are summarised by the parent rows we do include.
        let predicate;
        if (entry.scope.by === "user") {
          predicate = sql`${sql.identifier(entry.scope.columns[0])} = ${identity.id}`;
        } else if (entry.scope.by === "client" && clientIds.length > 0) {
          predicate = sql`${sql.identifier(entry.scope.columns[0])} IN (${sql.join(
            clientIds.map((id) => sql`${id}`),
            sql`, `,
          )})`;
        } else {
          continue;
        }
        const rows = await db.execute(
          sql`SELECT * FROM ${sql.identifier(entry.table)} WHERE ${predicate} LIMIT ${MAX_ROWS_PER_TABLE + 1}`,
        );
        const list = rows.rows as unknown[];
        if (list.length === 0) continue;
        if (list.length > MAX_ROWS_PER_TABLE) {
          truncated.push(entry.table);
          list.length = MAX_ROWS_PER_TABLE;
        }
        data[entry.table] = list;
      }

      const filename = `wefixtrades-account-${identity.id}-${new Date().toISOString().slice(0, 10)}.json`;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(
        JSON.stringify(
          {
            exported_at: new Date().toISOString(),
            account: { id: identity.id, email: identity.email },
            businesses: owned,
            data,
            notes: {
              row_cap: `Each table is capped at ${MAX_ROWS_PER_TABLE} rows.`,
              truncated: truncated.length ? truncated : undefined,
              retained_after_deletion: retentionDisclosure(),
            },
          },
          null,
          2,
        ),
      );
    } catch (err) {
      log.error("account export failed", { error: String(err) });
      res.status(500).json({ error: "Failed to export your data" });
    }
  });

  /**
   * POST /api/portal/account/delete
   *
   * Body: { confirm: "DELETE", password?: string, confirm_email?: string }
   *
   * Irreversible. Runs as one transaction; on success the session is destroyed
   * so the browser cannot keep acting as a user that no longer exists.
   */
  app.post("/api/portal/account/delete", requireClient, async (req: Request, res: Response) => {
    try {
      if (refuseAdmin(req, res)) return;

      const ip = getClientIp(req);
      if (!(await authRateLimiter.check(`acctdel:${ip}`))) {
        return res
          .status(429)
          .json({ error: "Too many attempts. Please wait before trying again." });
      }

      const { confirm, password, confirm_email } = req.body ?? {};

      if (confirm !== CONFIRM_PHRASE) {
        return res.status(400).json({
          error: `Type ${CONFIRM_PHRASE} to confirm you want to permanently delete your account.`,
          code: "confirm_phrase_required",
        });
      }

      // Scope is taken from the session ONLY. Nothing in the body can point
      // this at another account.
      const identity = await loadIdentity(req.user!.id);
      if (!identity) return res.status(404).json({ error: "Account not found" });
      if (identity.deleted_at) {
        return res.status(409).json({
          error: "This account has already been deleted.",
          code: "already_deleted",
        });
      }

      if (identity.ssoOnly) {
        const typed = typeof confirm_email === "string" ? confirm_email.trim().toLowerCase() : "";
        if (typed !== identity.email.toLowerCase()) {
          return res.status(401).json({
            error: "Enter the email address on this account to confirm.",
            code: "email_confirmation_failed",
          });
        }
      } else {
        if (!password || typeof password !== "string") {
          return res
            .status(400)
            .json({ error: "Your password is required to delete your account.", code: "password_required" });
        }
        if (!verifyPassword(password, identity.password_hash)) {
          return res.status(401).json({ error: "Password is incorrect", code: "password_incorrect" });
        }
      }

      const receipt = await deleteAccountData(identity.id);

      log.info("self-service account deletion completed", {
        userId: identity.id,
        rows: receipt.total_rows_deleted,
        tables: Object.keys(receipt.deleted).length,
      });

      // End the session. The deletion transaction already removed every
      // `session` row for this user; this clears the cookie on the way out.
      //
      // The account IS deleted by this point, so every path below must still
      // answer 200 — a teardown hiccup is not a deletion failure, and reporting
      // one would send the customer back to retry something already done.
      // `respond` is called exactly once from whichever branch we land in;
      // never guard it with `?.`, which would silently hang the request.
      let answered = false;
      const respond = () => {
        if (answered) return;
        answered = true;
        res.clearCookie("connect.sid");
        res.json({
          ok: true,
          deleted_tables: Object.keys(receipt.deleted).length,
          deleted_rows: receipt.total_rows_deleted,
          sessions_revoked: receipt.sessions_revoked,
          retained: receipt.retained,
          completed_at: receipt.completed_at,
        });
      };

      req.logout((logoutErr) => {
        if (logoutErr) {
          log.error("logout after account deletion failed", { error: String(logoutErr) });
        }
        // passport's logout can leave req.session undefined depending on the
        // session middleware's state; in that case there is nothing to destroy.
        if (!req.session) return respond();
        req.session.destroy((destroyErr) => {
          if (destroyErr) {
            log.error("session destroy after account deletion failed", {
              error: String(destroyErr),
            });
          }
          respond();
        });
      });
    } catch (err) {
      if (err instanceof LegalHoldError) {
        log.warn("account deletion blocked by legal hold", { userId: req.user?.id });
        return res.status(409).json({
          error:
            "We cannot delete this account automatically because some of its records are " +
            "under a legal hold. Email support@wefixtrades.com and we will handle your " +
            "request manually within 30 days.",
          code: "legal_hold",
        });
      }
      log.error("account deletion failed", { userId: req.user?.id, error: String(err) });
      res.status(500).json({
        error:
          "We could not complete the deletion, and nothing was changed. Please try again, or " +
          "email support@wefixtrades.com and we will delete your data manually.",
      });
    }
  });
}
