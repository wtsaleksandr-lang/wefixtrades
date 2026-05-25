import { db } from "../db";
import { chatMemory } from "@shared/schema";
import { eq, and, gt, lt, desc } from "drizzle-orm";
import type { ChatMessage } from "./aiService";
import type { MemoryContext, ChatSurface } from "./promptBuilder";
import { redactPii } from "../lib/redactPii";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_STORED_MESSAGES = 40;

/* ─── Get session memory ─── */
export async function getMemory(sessionId: string): Promise<{
  id: number;
  memory: MemoryContext;
  messages: ChatMessage[];
} | null> {
  const now = new Date();
  const rows = await db
    .select()
    .from(chatMemory)
    .where(and(eq(chatMemory.session_id, sessionId), gt(chatMemory.expires_at, now)))
    .limit(1);

  if (!rows.length) return null;

  const row = rows[0];
  return {
    id: row.id,
    memory: {
      userName: row.user_name ?? undefined,
      businessType: row.business_type ?? undefined,
      serviceArea: row.service_area ?? undefined,
      websiteUrl: row.website_url ?? undefined,
      reportId: row.report_id ?? undefined,
      previousTopics: (row.previous_topics as string[]) || [],
      interestedInPricing: row.interested_in_pricing ?? false,
      interestedInBooking: row.interested_in_booking ?? false,
    },
    messages: (row.messages_json as ChatMessage[]) || [],
  };
}

/* ─── Get memory by authenticated user ID (portal cross-session lookup) ─── */
export async function getMemoryByUserId(userId: number): Promise<{
  id: number;
  memory: MemoryContext;
  messages: ChatMessage[];
} | null> {
  const now = new Date();
  const rows = await db
    .select()
    .from(chatMemory)
    .where(and(eq(chatMemory.user_id, userId), gt(chatMemory.expires_at, now)))
    .orderBy(desc(chatMemory.updated_at))
    .limit(1);

  if (!rows.length) return null;

  const row = rows[0];
  return {
    id: row.id,
    memory: {
      userName: row.user_name ?? undefined,
      businessType: row.business_type ?? undefined,
      serviceArea: row.service_area ?? undefined,
      websiteUrl: row.website_url ?? undefined,
      reportId: row.report_id ?? undefined,
      previousTopics: (row.previous_topics as string[]) || [],
      interestedInPricing: row.interested_in_pricing ?? false,
      interestedInBooking: row.interested_in_booking ?? false,
    },
    messages: (row.messages_json as ChatMessage[]) || [],
  };
}

/* ─── Link anonymous session to authenticated user (website→portal continuity) ─── */
export async function linkSessionToUser(sessionId: string, userId: number): Promise<void> {
  await db
    .update(chatMemory)
    .set({ user_id: userId, updated_at: new Date() })
    .where(eq(chatMemory.session_id, sessionId));
}

/* ─── Save/update session memory ─── */
export async function saveMemory(
  sessionId: string,
  messages: ChatMessage[],
  updates?: Partial<{
    reportId: string;
    userId: number;
    surface: ChatSurface;
    userName: string;
    businessType: string;
    serviceArea: string;
    websiteUrl: string;
    previousTopics: string[];
    interestedInPricing: boolean;
    interestedInBooking: boolean;
  }>
): Promise<void> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SEVEN_DAYS_MS);
  // PII scrub on every persisted message body — chat memory rides 7 days
  // and feeds back into future prompts. Stripping card / SSN / external
  // emails here keeps that long tail out of durable storage and out of
  // the model context on re-hydration.
  const trimmedMessages = messages.slice(-MAX_STORED_MESSAGES).map((m) => ({
    ...m,
    content: typeof m.content === "string" ? redactPii(m.content) : m.content,
  }));

  const existing = await db
    .select({ id: chatMemory.id })
    .from(chatMemory)
    .where(eq(chatMemory.session_id, sessionId))
    .limit(1);

  if (existing.length) {
    const updateData: Record<string, any> = {
      messages_json: trimmedMessages,
      expires_at: expiresAt,
      updated_at: now,
    };
    if (updates?.reportId) updateData.report_id = updates.reportId;
    if (updates?.userId) updateData.user_id = updates.userId;
    if (updates?.surface) updateData.surface = updates.surface;
    if (updates?.userName) updateData.user_name = updates.userName;
    if (updates?.businessType) updateData.business_type = updates.businessType;
    if (updates?.serviceArea) updateData.service_area = updates.serviceArea;
    if (updates?.websiteUrl) updateData.website_url = updates.websiteUrl;
    if (updates?.previousTopics) updateData.previous_topics = updates.previousTopics;
    if (updates?.interestedInPricing !== undefined) updateData.interested_in_pricing = updates.interestedInPricing;
    if (updates?.interestedInBooking !== undefined) updateData.interested_in_booking = updates.interestedInBooking;

    await db.update(chatMemory).set(updateData).where(eq(chatMemory.id, existing[0].id));
  } else {
    await db.insert(chatMemory).values({
      session_id: sessionId,
      user_id: updates?.userId ?? null,
      surface: updates?.surface ?? "website",
      report_id: updates?.reportId ?? null,
      user_name: updates?.userName ?? null,
      business_type: updates?.businessType ?? null,
      service_area: updates?.serviceArea ?? null,
      website_url: updates?.websiteUrl ?? null,
      previous_topics: updates?.previousTopics ?? [],
      interested_in_pricing: updates?.interestedInPricing ?? false,
      interested_in_booking: updates?.interestedInBooking ?? false,
      messages_json: trimmedMessages,
      expires_at: expiresAt,
    });
  }
}

/* ─── Extract memory signals from conversation ─── */
export function extractMemorySignals(
  messages: ChatMessage[]
): Partial<{
  interestedInPricing: boolean;
  interestedInBooking: boolean;
  previousTopics: string[];
}> {
  const signals: ReturnType<typeof extractMemorySignals> = {};
  const topics = new Set<string>();

  for (const msg of messages) {
    if (msg.role !== "user") continue;
    const lower = msg.content.toLowerCase();

    if (/\b(pric|cost|how much|rate|fee|afford)\b/.test(lower)) {
      signals.interestedInPricing = true;
      topics.add("pricing");
    }
    if (/\b(book|schedule|appointment|consult|strategy call)\b/.test(lower)) {
      signals.interestedInBooking = true;
      topics.add("booking");
    }
    if (/\b(seo|rank|google|map|visib|local search)\b/.test(lower)) topics.add("SEO/visibility");
    if (/\b(review|reputation|rating|trust)\b/.test(lower)) topics.add("reviews");
    if (/\b(website|speed|page speed|mobile|core web vital)\b/.test(lower)) topics.add("website");
    if (/\b(chat|ai|voice|call line|chat line)\b/.test(lower)) topics.add("AI tools");
    if (/\b(lead|customer|conversion|quote)\b/.test(lower)) topics.add("lead generation");
  }

  if (topics.size) signals.previousTopics = Array.from(topics);
  return signals;
}

/* ─── Cleanup expired records ─── */
export async function cleanupExpiredMemory(): Promise<void> {
  const now = new Date();
  await db.delete(chatMemory).where(lt(chatMemory.expires_at, now));
}
