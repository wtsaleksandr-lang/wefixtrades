import { db } from "../db";
import { chatMemory } from "@shared/schema";
import { eq, and, gt } from "drizzle-orm";
import type { ChatMessage } from "./aiService";
import type { MemoryContext } from "./promptBuilder";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_STORED_MESSAGES = 40;

/* ─── Get or create session memory ─── */
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

/* ─── Save/update session memory ─── */
export async function saveMemory(
  sessionId: string,
  messages: ChatMessage[],
  updates?: Partial<{
    reportId: string;
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

  // Keep only the last N messages to prevent bloat
  const trimmedMessages = messages.slice(-MAX_STORED_MESSAGES);

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

/* ─── Extract memory signals from assistant + user messages ─── */
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

    if (/pric(e|ing)|cost|how much|rate|fee/.test(lower)) {
      signals.interestedInPricing = true;
      topics.add("pricing");
    }
    if (/book|call|schedule|appointment|consult/.test(lower)) {
      signals.interestedInBooking = true;
      topics.add("booking");
    }
    if (/seo|rank|google|map|visib/.test(lower)) topics.add("SEO/visibility");
    if (/review|reputation|rating/.test(lower)) topics.add("reviews");
    if (/website|speed|page|mobile/.test(lower)) topics.add("website");
    if (/chat|ai|bot|assist/.test(lower)) topics.add("AI tools");
    if (/lead|customer|call/.test(lower)) topics.add("lead generation");
  }

  if (topics.size) signals.previousTopics = Array.from(topics);
  return signals;
}

/* ─── Cleanup expired records (call periodically) ─── */
export async function cleanupExpiredMemory(): Promise<number> {
  const now = new Date();
  const result = await db.delete(chatMemory).where(
    gt(now, chatMemory.expires_at)
  );
  return 0; // drizzle delete doesn't return count easily
}
