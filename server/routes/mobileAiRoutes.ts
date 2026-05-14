/**
 * Mobile AI chat endpoints — share the SAME conversation thread and
 * brain as the WeFixTrades portal assistant.
 *
 * ── Thread-sharing strategy ────────────────────────────────────────
 * The portal assistant (server/services/assistant.ts → buildContext)
 * persists each authenticated user's "general" conversation in one
 * row of `assistant_threads` keyed by:
 *
 *     (user_id, surface="portal", page_context="general", status="active")
 *
 * Mobile uses the SAME triple. That means:
 *   - one active thread per user spans portal + mobile
 *   - a message sent from mobile appears in the portal's chat view
 *     on the next portal load, and vice-versa
 *   - the system prompt, model, and business-context injection are
 *     reused unchanged (same PortalContext via assemblePortalContext)
 *
 * Why not a separate "mobile" surface? It would split the brain in
 * two — different system prompts, separate thread rows, no shared
 * memory — which is exactly what Alex asked us not to build.
 *
 * Why not a `source` column on messages? The current schema has no
 * such column. Distinguishing portal-vs-mobile origin is not needed
 * for the shared-state UX, so we don't migrate the schema.
 *
 * Page-context: mobile is treated as the portal's "general" page.
 * Specialized portal threads (onboarding/billing/support) keep
 * working from the web only; mobile users land on the general
 * thread which is what the dashboard's main chat panel uses too.
 *
 * ── Auth ───────────────────────────────────────────────────────────
 * `requireSessionOrBearer` — same hybrid mobile auth used by
 * /api/mobile/profile + /api/mobile/voice (bearer JWT or session
 * cookie).
 *
 * ── Rate limiting ──────────────────────────────────────────────────
 * Reuses the existing `chatRateLimiter` (20 req/min) that the portal
 * /api/chat endpoint already enforces, keyed by user id (or IP for
 * the rare cookie-session-without-id case). Same protective ceiling
 * the portal uses.
 */

import type { Express, Request, Response } from "express";
import { z } from "zod";
import { desc, eq, and } from "drizzle-orm";
import { requireSessionOrBearer } from "../lib/mobileAuth";
import { db } from "../db";
import { assistantThreads, assistantMessages } from "@shared/schema";
import { assistantSync, isReady, type AssistantRequest } from "../services/assistant";
import { assemblePortalContext } from "../services/portalAssistantContext";
import { getOrCreateThread, derivePageContext } from "../services/threadService";
import { chatRateLimiter } from "../services/rateLimiter";
import { downloadDecrypted } from "../lib/objectStorage";
import { buildSignedImageUrl, getDefaultBaseUrl } from "../lib/assistantImageUrl";
import { createLogger } from "../lib/logger";

const log = createLogger("MobileAi");

const MAX_MESSAGES_RETURNED = 50;
const MAX_CONTENT_LENGTH = 4000;
const MAX_ATTACHMENTS_PER_MESSAGE = 4;

/** Anthropic Messages API multimodal: accepted image MIME types. */
const ANTHROPIC_IMAGE_MIMES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

const attachmentRefSchema = z.object({
  assetId: z.string().min(1).max(256),
  mimeType: z.string().min(1).max(64),
});

const chatBodySchema = z.object({
  content: z.string().trim().min(1).max(MAX_CONTENT_LENGTH),
  attachments: z.array(attachmentRefSchema).max(MAX_ATTACHMENTS_PER_MESSAGE).optional(),
});

/** Reference stored on the assistant_messages.attachments JSONB column. */
interface StoredAttachmentRef {
  assetId: string;
  mimeType: string;
  sizeBytes: number;
}

/** Shape returned to the mobile client (assetId + ready-to-fetch signed URL). */
interface MobileAttachment {
  assetId: string;
  url: string;
  mimeType: string;
}

interface MobileMessage {
  id: number;
  role: "user" | "assistant";
  content: string;
  attachments?: MobileAttachment[];
  created_at: string;
}

/**
 * Validate + normalize whatever shape we read out of the JSONB column.
 * We trust this code wrote the rows (post-migration), but be defensive
 * about legacy nulls and malformed data so a bad row can't 500 the
 * whole thread.
 */
function parseStoredAttachments(raw: unknown): StoredAttachmentRef[] {
  if (!Array.isArray(raw)) return [];
  const out: StoredAttachmentRef[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const a = item as Record<string, unknown>;
    if (typeof a.assetId !== "string" || typeof a.mimeType !== "string") continue;
    out.push({
      assetId: a.assetId,
      mimeType: a.mimeType,
      sizeBytes: typeof a.sizeBytes === "number" ? a.sizeBytes : 0,
    });
  }
  return out;
}

function signAttachmentsForUser(userId: number, refs: StoredAttachmentRef[]): MobileAttachment[] {
  if (!refs.length) return [];
  const base = getDefaultBaseUrl();
  return refs.map((r) => ({
    assetId: r.assetId,
    mimeType: r.mimeType,
    url: buildSignedImageUrl({ userId, assetPath: r.assetId, baseUrl: base }),
  }));
}

function toMobileMessage(
  row: {
    id: number;
    role: string;
    content: string;
    attachments: unknown;
    created_at: Date | null;
  },
  userId: number,
): MobileMessage {
  const refs = parseStoredAttachments(row.attachments);
  const out: MobileMessage = {
    id: row.id,
    role: row.role === "assistant" ? "assistant" : "user",
    content: row.content,
    created_at: (row.created_at ?? new Date()).toISOString(),
  };
  if (refs.length) {
    out.attachments = signAttachmentsForUser(userId, refs);
  }
  return out;
}

function getClientIp(req: Request): string {
  return (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.ip || "unknown";
}

function rateLimitKey(req: Request): string {
  const uid = (req.user as any)?.id;
  return uid ? `mobile-ai-user-${uid}` : `mobile-ai-ip-${getClientIp(req)}`;
}

/**
 * Load the most recent N messages for a thread, oldest-first, with
 * id + created_at preserved (the shared `loadThreadMessages` in
 * threadService.ts strips those fields).
 */
async function loadRecentMessages(
  threadId: number,
  limit: number,
  userId: number,
): Promise<MobileMessage[]> {
  const rows = await db
    .select({
      id: assistantMessages.id,
      role: assistantMessages.role,
      content: assistantMessages.content,
      attachments: assistantMessages.attachments,
      created_at: assistantMessages.created_at,
    })
    .from(assistantMessages)
    .where(eq(assistantMessages.thread_id, threadId))
    .orderBy(desc(assistantMessages.created_at), desc(assistantMessages.id))
    .limit(limit);

  return rows.reverse().map((r) => toMobileMessage(r, userId));
}

export function registerMobileAiRoutes(app: Express): void {
  /**
   * GET /api/mobile/ai/thread
   *
   * Returns the user's active portal thread + up to the 50 most
   * recent messages (oldest first). Creates the thread on first hit
   * so the client never has to handle a "no thread yet" case.
   */
  app.get(
    "/api/mobile/ai/thread",
    requireSessionOrBearer,
    async (req: Request, res: Response) => {
      try {
        const userId = (req.user as any)?.id as number | undefined;
        if (!userId) return res.status(401).json({ error: "Authentication required" });

        const pageContext = derivePageContext(undefined); // "general"
        const { id: threadId } = await getOrCreateThread(userId, "portal", pageContext);

        const messages = await loadRecentMessages(threadId, MAX_MESSAGES_RETURNED, userId);
        return res.json({ threadId, messages });
      } catch (err) {
        log.error("thread load failed", { err: (err as Error).message });
        return res.status(500).json({ error: "Failed to load thread" });
      }
    },
  );

  /**
   * POST /api/mobile/ai/chat
   *
   * Body:  { content: string (1..4000) }
   * Resp:  { userMessage, assistantMessage }
   *
   * The heavy lifting (system prompt, business-context injection,
   * thread persistence, memory, usage logging) all runs inside
   * `assistantSync` — exactly the path the portal's /api/chat/sync
   * uses. We hand it surface="portal" so the same brain answers.
   */
  app.post(
    "/api/mobile/ai/chat",
    requireSessionOrBearer,
    async (req: Request, res: Response) => {
      try {
        const userId = (req.user as any)?.id as number | undefined;
        if (!userId) return res.status(401).json({ error: "Authentication required" });

        // Same per-minute ceiling the portal applies on /api/chat.
        if (!(await chatRateLimiter.check(rateLimitKey(req)))) {
          return res.status(429).json({ error: "Too many requests, please try again shortly" });
        }

        const readiness = isReady();
        if (!readiness.ready) {
          return res.status(503).json({ error: "Chat is temporarily unavailable." });
        }

        const parsed = chatBodySchema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({
            error: "Invalid request: content must be a 1..4000 char string, attachments must be a list of {assetId, mimeType}.",
          });
        }
        const userContent = parsed.data.content;
        const attachmentRefs = parsed.data.attachments ?? [];

        // Resolve attachments: ownership-check + load bytes from object
        // storage. Any failure short-circuits the chat (we don't want to
        // silently drop an image the user actually attached).
        const resolvedAttachments: NonNullable<AssistantRequest["userAttachments"]> = [];
        for (const ref of attachmentRefs) {
          const ownerPrefix = `assistant-uploads/${userId}/`;
          if (!ref.assetId.startsWith(ownerPrefix)) {
            log.warn("attachment owner-mismatch rejected", { userId, assetId: ref.assetId });
            return res.status(403).json({ error: "Attachment does not belong to caller" });
          }
          const mime = ref.mimeType.toLowerCase().split(";")[0].trim();
          if (!ANTHROPIC_IMAGE_MIMES.has(mime)) {
            return res.status(415).json({ error: `Unsupported attachment mimeType: ${ref.mimeType}` });
          }
          const dl = await downloadDecrypted(ref.assetId);
          if (!dl.ok) {
            log.error("attachment fetch failed", { userId, assetId: ref.assetId, err: dl.error });
            return res.status(dl.notFound ? 404 : 502).json({
              error: dl.notFound ? "Attachment not found" : "Attachment fetch failed",
            });
          }
          resolvedAttachments.push({
            assetId: ref.assetId,
            mimeType: mime as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
            sizeBytes: dl.data.length,
            data: dl.data,
          });
        }

        // Build the portal context the same way the portal does so the
        // assistant sees the user's clients/services/billing/etc.
        const portalContext = await assemblePortalContext(userId).catch((err) => {
          log.error("portal context assembly failed", { err: (err as Error).message });
          return undefined;
        });

        // Persistence + AI call. surface="portal" routes through
        // buildContext's thread-aware path (server/services/assistant.ts).
        // sessionId convention matches chatRoutes.ts: `portal_${userId}`.
        const assistantReq: AssistantRequest = {
          surface: "portal",
          sessionId: `portal_${userId}`,
          userId,
          // The shared engine treats the LAST message as the new user
          // turn; thread history is loaded server-side from DB.
          messages: [{ role: "user", content: userContent }],
          portalContext,
          userAttachments: resolvedAttachments.length ? resolvedAttachments : undefined,
        };

        await assistantSync(assistantReq);

        // assistantSync persisted both the user message and the
        // assistant reply via appendTurn(). Read them back so we can
        // return ids + created_at to the client.
        const threadId = assistantReq._threadId;
        if (!threadId) {
          // Thread fallback path — extremely rare (thread create failed
          // and we fell through to chatMemory). In that case there's
          // nothing to return ids for; surface a 500 so the mobile app
          // can retry rather than show a half-state.
          log.error("assistantSync completed without a thread id", { userId });
          return res.status(500).json({ error: "Conversation persistence unavailable, please retry." });
        }

        const latest = await db
          .select({
            id: assistantMessages.id,
            role: assistantMessages.role,
            content: assistantMessages.content,
            attachments: assistantMessages.attachments,
            created_at: assistantMessages.created_at,
          })
          .from(assistantMessages)
          .where(eq(assistantMessages.thread_id, threadId))
          .orderBy(desc(assistantMessages.id))
          .limit(2);

        // latest[0] = assistant reply (most recent), latest[1] = user turn
        const assistantRow = latest.find((r) => r.role === "assistant");
        const userRow = latest.find((r) => r.role === "user");
        if (!assistantRow || !userRow) {
          log.error("Could not locate the just-persisted turn", { threadId, gotCount: latest.length });
          return res.status(500).json({ error: "Chat reply persisted but could not be read back." });
        }

        return res.json({
          userMessage: toMobileMessage(userRow, userId),
          assistantMessage: toMobileMessage(assistantRow, userId),
        });
      } catch (err) {
        log.error("chat failed", { err: (err as Error).message });
        return res.status(500).json({ error: "Chat request failed, please retry." });
      }
    },
  );
}
