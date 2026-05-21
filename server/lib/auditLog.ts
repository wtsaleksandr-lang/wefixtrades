/**
 * Audit log write helper — Wave W-AI-3c.
 *
 * Fire-and-forget writer for the `audit_log` table. Callers should NOT
 * await the returned promise in a hot path — `writeAudit()` swallows its
 * own errors and resolves to `void` regardless of outcome, so a logging
 * failure can never block a user-facing request.
 *
 * Typical usage from an Express route:
 *
 *   await doTheThing();
 *   writeAudit({
 *     actorId: req.user?.id ? String(req.user.id) : null,
 *     action: 'update',
 *     entityType: 'quotequick_template',
 *     entityId,
 *     before,
 *     after,
 *     req,
 *   });
 *
 * The call is intentionally not `await`ed — the request handler returns
 * its JSON response immediately. Errors are logged but not rethrown.
 *
 * `shallowDiff()` produces a minimal `{ added, removed, changed }` summary
 * of changed top-level keys so the reader UI doesn't have to re-derive
 * what changed on every row.
 */

import type { Request } from "express";
import { db } from "../db";
import { auditLog } from "@shared/schema";
import { createLogger } from "./logger";

const log = createLogger("AuditLog");

export type AuditActorType = "admin" | "system" | "user";

export interface WriteAuditOpts {
  actorId?: string | number | null;
  actorType?: AuditActorType;
  action: string;
  entityType: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
  diff?: unknown;
  metadata?: unknown;
  req?: Request;
}

/**
 * Append a single row to the audit log. Fire-and-forget: returns `void`
 * even on DB failure (errors are logged, never rethrown). Safe to call
 * without `await` in a request path.
 */
export function writeAudit(opts: WriteAuditOpts): Promise<void> {
  const actorId =
    opts.actorId === undefined || opts.actorId === null
      ? null
      : String(opts.actorId);
  const actorType = opts.actorType ?? "admin";

  // Compute diff if caller didn't supply one and we have before+after.
  const diff =
    opts.diff !== undefined
      ? opts.diff
      : isPlainObject(opts.before) && isPlainObject(opts.after)
        ? shallowDiff(opts.before, opts.after)
        : undefined;

  const ip = opts.req ? extractIp(opts.req) : null;
  const userAgent = opts.req?.headers?.["user-agent"]
    ? String(opts.req.headers["user-agent"]).slice(0, 1024)
    : null;

  // Insert in the background — never block the caller, never throw.
  return db
    .insert(auditLog)
    .values({
      actor_id: actorId,
      actor_type: actorType,
      action: opts.action,
      entity_type: opts.entityType,
      entity_id: opts.entityId,
      before: opts.before ?? null,
      after: opts.after ?? null,
      diff: diff ?? null,
      metadata: opts.metadata ?? null,
      ip,
      user_agent: userAgent,
    })
    .then(() => undefined)
    .catch((err: Error) => {
      log.error("write failed", {
        err: err.message,
        entityType: opts.entityType,
        entityId: opts.entityId,
        action: opts.action,
      });
    });
}

/* ─── Diff helpers ─── */

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

export interface ShallowDiff {
  added: string[];
  removed: string[];
  changed: string[];
}

/**
 * Shallow key-level diff. Compares top-level keys only — nested differences
 * count as `changed` on the parent key.
 */
export function shallowDiff(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): ShallowDiff {
  const beforeKeys = new Set(Object.keys(before));
  const afterKeys = new Set(Object.keys(after));
  const added: string[] = [];
  const removed: string[] = [];
  const changed: string[] = [];

  for (const k of afterKeys) {
    if (!beforeKeys.has(k)) {
      added.push(k);
    } else if (!isShallowEqual(before[k], after[k])) {
      changed.push(k);
    }
  }
  for (const k of beforeKeys) {
    if (!afterKeys.has(k)) removed.push(k);
  }

  return { added, removed, changed };
}

function isShallowEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (typeof a !== typeof b) return false;
  if (typeof a === "object") {
    // Cheap structural comparison — fine for shallow-diff bucketing.
    try {
      return JSON.stringify(a) === JSON.stringify(b);
    } catch {
      return false;
    }
  }
  return false;
}

function extractIp(req: Request): string | null {
  const xfwd = req.headers["x-forwarded-for"];
  if (typeof xfwd === "string" && xfwd.length > 0) {
    return xfwd.split(",")[0].trim().slice(0, 64);
  }
  if (Array.isArray(xfwd) && xfwd.length > 0) {
    return String(xfwd[0]).slice(0, 64);
  }
  if (req.ip) return req.ip.slice(0, 64);
  const sock = req.socket?.remoteAddress;
  return sock ? sock.slice(0, 64) : null;
}
