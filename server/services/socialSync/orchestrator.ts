import { storage } from "../../storage";
import { generateTopics } from "./topicGenerator";
import { generatePostFromTopic, type ContentGenerationResult } from "./contentGenerator";
import { checkContentMix } from "./qualityGate";
import type { SocialSyncProfile, SocialSyncTopic } from "@shared/schema";

/* ─── Frequency mapping ─── */

const FREQUENCY_MAP: Record<string, number> = {
  daily: 7,
  "3_per_week": 3,
  "2_per_week": 2,
  weekly: 1,
};

function getWeeklyPostCount(profile: SocialSyncProfile): number {
  return FREQUENCY_MAP[profile.frequency || "3_per_week"] || 3;
}

/* ─── Schedule time generation ─── */

// Reasonable posting windows (hours in 24h format, will be treated as local-ish time)
const POSTING_WINDOWS = [
  { day: 1, hour: 9, minute: 15 },   // Monday morning
  { day: 1, hour: 17, minute: 30 },   // Monday evening
  { day: 2, hour: 10, minute: 0 },    // Tuesday morning
  { day: 2, hour: 16, minute: 45 },   // Tuesday afternoon
  { day: 3, hour: 9, minute: 30 },    // Wednesday morning
  { day: 3, hour: 18, minute: 0 },    // Wednesday evening
  { day: 4, hour: 11, minute: 15 },   // Thursday late morning
  { day: 4, hour: 17, minute: 0 },    // Thursday afternoon
  { day: 5, hour: 9, minute: 0 },     // Friday morning
  { day: 5, hour: 15, minute: 30 },   // Friday afternoon
  { day: 6, hour: 10, minute: 0 },    // Saturday morning
];

function generateScheduleSlots(
  count: number,
  startDate: Date,
): Date[] {
  const slots: Date[] = [];
  const start = new Date(startDate);

  // Find next Monday
  const dayOfWeek = start.getDay();
  const daysUntilMonday = dayOfWeek === 0 ? 1 : dayOfWeek === 1 ? 0 : 8 - dayOfWeek;
  const nextMonday = new Date(start);
  nextMonday.setDate(nextMonday.getDate() + daysUntilMonday);
  nextMonday.setHours(0, 0, 0, 0);

  // Spread across the week using posting windows
  const windowsToUse = POSTING_WINDOWS.slice(0, Math.min(count, POSTING_WINDOWS.length));

  // If we need more slots than windows, space them evenly
  const step = Math.max(1, Math.floor(windowsToUse.length / count));

  for (let i = 0; i < count; i++) {
    const windowIndex = (i * step) % windowsToUse.length;
    const window = windowsToUse[windowIndex];
    const slot = new Date(nextMonday);
    slot.setDate(slot.getDate() + window.day - 1); // day 1 = Monday
    slot.setHours(window.hour, window.minute, 0, 0);

    // Only schedule in the future
    if (slot > start) {
      slots.push(slot);
    }
  }

  // If we didn't get enough future slots, push remaining to next week
  while (slots.length < count) {
    const lastSlot = slots.length > 0 ? slots[slots.length - 1] : nextMonday;
    const nextSlot = new Date(lastSlot);
    nextSlot.setDate(nextSlot.getDate() + 1);
    nextSlot.setHours(10, 0, 0, 0);
    slots.push(nextSlot);
  }

  return slots.sort((a, b) => a.getTime() - b.getTime());
}

/* ─── Content mix distribution ─── */

function selectPlatforms(profile: SocialSyncProfile): string[] {
  const prefs = (profile.platform_preferences as string[] | null);
  if (prefs && prefs.length > 0) return prefs;
  return ["facebook", "instagram"]; // Default
}

function distributeTopicsAcrossPlatforms(
  topics: SocialSyncTopic[],
  platforms: string[],
): { topic: SocialSyncTopic; platform: string }[] {
  const pairs: { topic: SocialSyncTopic; platform: string }[] = [];

  for (let i = 0; i < topics.length; i++) {
    // Rotate platforms
    const platform = platforms[i % platforms.length];
    pairs.push({ topic: topics[i], platform });
  }

  return pairs;
}

/* ─── Single client orchestration ─── */

export interface WeekGenerationResult {
  client_id: number;
  topics_generated: number;
  posts_generated: number;
  posts_queued: number;
  errors: string[];
}

export async function generateWeekForClient(
  clientId: number,
): Promise<WeekGenerationResult> {
  const result: WeekGenerationResult = {
    client_id: clientId,
    topics_generated: 0,
    posts_generated: 0,
    posts_queued: 0,
    errors: [],
  };

  // 1. Load profile
  const profile = await storage.getSocialSyncProfile(clientId);
  if (!profile) {
    result.errors.push("No SocialSync profile found");
    return result;
  }
  if (!profile.enabled) {
    result.errors.push("SocialSync is not enabled for this client");
    return result;
  }

  const postsNeeded = getWeeklyPostCount(profile);
  const platforms = selectPlatforms(profile);

  // 2. Check how many posts are already queued/scheduled for the upcoming week
  const existingPosts = await storage.listSocialSyncPosts(clientId, { status: "queued", limit: 50 });
  const futureQueuedCount = existingPosts.filter(p => {
    if (!p.scheduled_for) return false;
    const daysDiff = (new Date(p.scheduled_for).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    return daysDiff >= 0 && daysDiff <= 8;
  }).length;

  const postsToGenerate = Math.max(0, postsNeeded - futureQueuedCount);
  if (postsToGenerate === 0) {
    await storage.createSocialSyncLog({
      client_id: clientId,
      entity_type: "profile",
      entity_id: profile.id,
      action: "week.skipped",
      status: "info",
      details: { reason: "Already have enough posts queued", existing: futureQueuedCount, needed: postsNeeded },
    });
    return result;
  }

  // 3. Get or generate topics
  const availableTopics = await storage.listSocialSyncTopics(clientId, "active");
  let topicsToUse = availableTopics.slice(0, postsToGenerate);

  if (topicsToUse.length < postsToGenerate) {
    const topicsNeeded = postsToGenerate - topicsToUse.length;
    try {
      const genResult = await generateTopics(profile, topicsNeeded + 3); // Generate a few extra for buffer
      result.topics_generated = genResult.topics.length;
      if (genResult.errors.length > 0) {
        result.errors.push(...genResult.errors);
      }
      topicsToUse = [...topicsToUse, ...genResult.topics.slice(0, topicsNeeded)];
    } catch (err: any) {
      result.errors.push(`Topic generation failed: ${err.message}`);
    }
  }

  if (topicsToUse.length === 0) {
    result.errors.push("No topics available and generation failed");
    return result;
  }

  // 4. Content mix guard — filter topics to avoid bad sequences
  const recentPosts = await storage.listRecentSocialSyncPosts(clientId, 10);
  const recentTopicTypes = recentPosts
    .filter(p => p.topic_id)
    .map(p => {
      // Extract topic type from recent posts (stored in topics table)
      const matchingTopic = [...availableTopics, ...(topicsToUse)].find(t => t.id === p.topic_id);
      return matchingTopic?.type || "unknown";
    })
    .filter(t => t !== "unknown");

  const filteredTopics: SocialSyncTopic[] = [];
  const usedTypes: string[] = [...recentTopicTypes];
  for (const topic of topicsToUse.slice(0, postsToGenerate + 5)) { // Check more than needed
    if (filteredTopics.length >= postsToGenerate) break;
    const mixCheck = checkContentMix(topic.type, usedTypes);
    if (mixCheck.ok) {
      filteredTopics.push(topic);
      usedTypes.unshift(topic.type);
    } else {
      result.errors.push(`Topic skipped (mix guard): ${mixCheck.adjustment}`);
    }
  }

  // 5. Distribute topics across platforms
  const pairs = distributeTopicsAcrossPlatforms(filteredTopics, platforms);

  // 6. Generate schedule slots
  const scheduleSlots = generateScheduleSlots(pairs.length, new Date());

  // 7. Generate posts
  const MAX_RETRIES = 1;
  for (let i = 0; i < pairs.length; i++) {
    const { topic, platform } = pairs[i];
    const scheduledFor = scheduleSlots[i];

    let genResult: ContentGenerationResult | null = null;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        genResult = await generatePostFromTopic(profile, topic, platform, scheduledFor);
        if (genResult.post) break;
        if (genResult.rejected && attempt < MAX_RETRIES) {
          result.errors.push(`Post rejected (will retry): ${genResult.rejectionReason}`);
          // Reset topic for retry
          await storage.updateSocialSyncTopic(topic.id, { status: "active" });
          continue;
        }
      } catch (err: any) {
        result.errors.push(`Post generation error: ${err.message}`);
      }
    }

    if (!genResult?.post) {
      if (genResult?.rejectionReason) result.errors.push(`Post rejected: ${genResult.rejectionReason}`);
      else if (genResult?.error) result.errors.push(genResult.error);
      continue;
    }

    result.posts_generated++;

    // 7. Enqueue for publishing. Post status = "pending_approval" so the
    //    customer gets a review window before it publishes. The queue worker
    //    auto-approves at scheduled_for if the customer doesn't act (matches
    //    the "done-for-you" product promise — silence = implicit consent).
    try {
      await storage.enqueueSocialSyncJob({
        client_id: clientId,
        post_id: genResult.post.id,
        platform,
        status: "pending",
        run_at: scheduledFor,
        attempts: 0,
        max_attempts: 3,
      } as any);

      await storage.updateSocialSyncPost(genResult.post.id, { status: "pending_approval" } as any);
      result.posts_queued++;
    } catch (err: any) {
      result.errors.push(`Enqueue failed for post ${genResult.post.id}: ${err.message}`);
    }
  }

  // 8. Log result
  await storage.createSocialSyncLog({
    client_id: clientId,
    entity_type: "profile",
    entity_id: profile.id,
    action: "week.generated",
    status: result.errors.length > 0 ? "info" : "success",
    details: {
      topics_generated: result.topics_generated,
      posts_generated: result.posts_generated,
      posts_queued: result.posts_queued,
      errors: result.errors.slice(0, 10),
    },
  });

  return result;
}

/* ─── Batch orchestration for all due clients ─── */

export interface BatchGenerationResult {
  clients_processed: number;
  total_posts_generated: number;
  total_posts_queued: number;
  errors: string[];
  results: WeekGenerationResult[];
}

export async function generateAllDue(): Promise<BatchGenerationResult> {
  const batch: BatchGenerationResult = {
    clients_processed: 0,
    total_posts_generated: 0,
    total_posts_queued: 0,
    errors: [],
    results: [],
  };

  const profiles = await storage.listEnabledSocialSyncProfiles();
  if (profiles.length === 0) return batch;

  // Process sequentially to avoid overwhelming the AI API
  for (const profile of profiles) {
    if (!profile.autopilot) continue;

    try {
      const result = await generateWeekForClient(profile.client_id);
      batch.results.push(result);
      batch.clients_processed++;
      batch.total_posts_generated += result.posts_generated;
      batch.total_posts_queued += result.posts_queued;
      if (result.errors.length > 0) {
        batch.errors.push(`Client ${profile.client_id}: ${result.errors.join("; ")}`);
      }
    } catch (err: any) {
      batch.errors.push(`Client ${profile.client_id} failed: ${err.message}`);
    }
  }

  return batch;
}
