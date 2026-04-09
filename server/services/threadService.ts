/**
 * Thread-based conversation persistence for the portal assistant.
 *
 * Each authenticated portal user has at most one "active" thread per surface.
 * Messages are stored individually (not as a JSON blob) for queryability and
 * future features (search, export, admin review).
 *
 * chatMemory continues to work for non-portal surfaces — this service is
 * additive, not a replacement.
 */

import { db } from "../db";
import { assistantThreads, assistantMessages } from "@shared/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import type { ChatMessage } from "./aiService";

/** Maximum messages returned when loading a thread (context window budget). */
const MAX_THREAD_MESSAGES = 50;

/* ─── Get or create the active thread for a portal user ─── */
export async function getOrCreateThread(
  userId: number,
  surface: string = "portal",
): Promise<{ id: number; isNew: boolean }> {
  // Find most recent active thread for this user + surface
  const [existing] = await db
    .select({ id: assistantThreads.id })
    .from(assistantThreads)
    .where(
      and(
        eq(assistantThreads.user_id, userId),
        eq(assistantThreads.surface, surface),
        eq(assistantThreads.status, "active"),
      ),
    )
    .orderBy(desc(assistantThreads.last_message_at))
    .limit(1);

  if (existing) return { id: existing.id, isNew: false };

  // Create new thread
  const [thread] = await db
    .insert(assistantThreads)
    .values({
      user_id: userId,
      surface,
      status: "active",
      message_count: 0,
    })
    .returning({ id: assistantThreads.id });

  return { id: thread.id, isNew: true };
}

/* ─── Load messages from a thread ─── */
export async function loadThreadMessages(
  threadId: number,
  limit: number = MAX_THREAD_MESSAGES,
): Promise<ChatMessage[]> {
  const rows = await db
    .select({
      role: assistantMessages.role,
      content: assistantMessages.content,
    })
    .from(assistantMessages)
    .where(eq(assistantMessages.thread_id, threadId))
    .orderBy(desc(assistantMessages.created_at))
    .limit(limit);

  // Reverse so oldest first (we queried newest-first for LIMIT efficiency)
  return rows.reverse().map((r) => ({
    role: r.role as "user" | "assistant",
    content: r.content,
  }));
}

/* ─── Append a single message to a thread ─── */
export async function appendMessage(
  threadId: number,
  role: "user" | "assistant",
  content: string,
  tokenCount?: number,
): Promise<number> {
  const now = new Date();

  const [msg] = await db
    .insert(assistantMessages)
    .values({
      thread_id: threadId,
      role,
      content,
      token_count: tokenCount ?? null,
    })
    .returning({ id: assistantMessages.id });

  // Update thread metadata
  await db
    .update(assistantThreads)
    .set({
      message_count: sql`${assistantThreads.message_count} + 1`,
      last_message_at: now,
      updated_at: now,
    })
    .where(eq(assistantThreads.id, threadId));

  return msg.id;
}

/* ─── Append a batch of messages (user + assistant turn) ─── */
export async function appendTurn(
  threadId: number,
  userContent: string,
  assistantContent: string,
): Promise<void> {
  const now = new Date();

  await db.insert(assistantMessages).values([
    { thread_id: threadId, role: "user", content: userContent },
    { thread_id: threadId, role: "assistant", content: assistantContent },
  ]);

  await db
    .update(assistantThreads)
    .set({
      message_count: sql`${assistantThreads.message_count} + 2`,
      last_message_at: now,
      updated_at: now,
    })
    .where(eq(assistantThreads.id, threadId));
}

/* ─── Get thread by ID (with ownership check) ─── */
export async function getThreadForUser(
  threadId: number,
  userId: number,
): Promise<{ id: number; surface: string; status: string; message_count: number } | null> {
  const [row] = await db
    .select({
      id: assistantThreads.id,
      surface: assistantThreads.surface,
      status: assistantThreads.status,
      message_count: assistantThreads.message_count,
    })
    .from(assistantThreads)
    .where(
      and(eq(assistantThreads.id, threadId), eq(assistantThreads.user_id, userId)),
    )
    .limit(1);

  return row ?? null;
}

/* ─── Archive a thread (soft-delete) ─── */
export async function archiveThread(threadId: number): Promise<void> {
  await db
    .update(assistantThreads)
    .set({ status: "archived", updated_at: new Date() })
    .where(eq(assistantThreads.id, threadId));
}
