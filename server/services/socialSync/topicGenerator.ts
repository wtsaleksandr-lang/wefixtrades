import crypto from "crypto";
import { chat } from "../aiService";
import { storage } from "../../storage";
import type { SocialSyncProfile, SocialSyncTopic } from "@shared/schema";

const TOPIC_TYPES = [
  "educational", "trust_building", "local_relevance", "seasonal",
  "problem_solution", "maintenance_tip", "emergency_awareness",
  "service_spotlight", "before_after", "myth_busting", "faq",
] as const;

function currentSeason(): string {
  const month = new Date().getMonth();
  if (month >= 2 && month <= 4) return "spring";
  if (month >= 5 && month <= 7) return "summer";
  if (month >= 8 && month <= 10) return "fall";
  return "winter";
}

function buildTopicSystemPrompt(profile: SocialSyncProfile): string {
  const services = (profile.services as string[] | null) || [];
  const focus = (profile.service_focus as string[] | null) || services;
  const location = profile.location || "the local area";
  const niche = profile.niche || "home services";

  return `You are a social media content strategist for a local ${niche} business.

Business details:
- Trade/niche: ${niche}
- Location: ${location}
- Services offered: ${services.join(", ") || niche}
- Services to emphasize: ${focus.join(", ") || "all services equally"}
- Tone: ${profile.tone || "professional"}
- Current season: ${currentSeason()}

Your job is to generate unique social media topic ideas that this business can post about.

Rules:
- Topics must be relevant to ${niche} businesses in ${location}
- Topics must feel authentic — like a real local tradesperson would post it
- Never use generic filler phrases like "Did you know?" or "Happy [day]!" as the entire topic
- Each topic must tie to a specific service when possible
- Include seasonal relevance when appropriate
- Vary the content types: tips, before/after concepts, local relevance, trust-building, myth-busting, FAQ answers, emergency awareness, maintenance reminders, service spotlights
- Never suggest topics about industries unrelated to ${niche}

Respond ONLY with valid JSON. No markdown, no explanation.`;
}

function buildTopicUserPrompt(
  count: number,
  existingTitles: string[],
  recentTypes: string[],
): string {
  const avoidList = existingTitles.length > 0
    ? `\n\nAVOID generating topics similar to these recent ones:\n${existingTitles.slice(0, 15).map(t => `- "${t}"`).join("\n")}`
    : "";

  const typeBalance = recentTypes.length > 0
    ? `\n\nRecent topic types used: ${[...new Set(recentTypes)].join(", ")}. Try to use different types for variety.`
    : "";

  return `Generate ${count} unique social media topic ideas.

Return a JSON array of objects with these fields:
- "title": string — the topic title (concise, 5-15 words)
- "type": string — one of: ${TOPIC_TYPES.join(", ")}
- "angle": string — the specific hook or angle (1 sentence)
- "target_service": string — which service this promotes (from the business's service list)
- "target_location": string | null — location tie-in if relevant, null if not needed

Available topic types: ${TOPIC_TYPES.join(", ")}
${avoidList}${typeBalance}

Respond with ONLY the JSON array. Example format:
[{"title":"...","type":"...","angle":"...","target_service":"...","target_location":null}]`;
}

export interface TopicGenerationResult {
  topics: SocialSyncTopic[];
  errors: string[];
}

export async function generateTopics(
  profile: SocialSyncProfile,
  count: number,
): Promise<TopicGenerationResult> {
  const errors: string[] = [];

  // Fetch recent topics to avoid repetition
  const existingTopics = await storage.listSocialSyncTopics(profile.client_id);
  const existingTitles = existingTopics.map(t => t.title);
  const recentTypes = existingTopics.slice(0, 20).map(t => t.type);

  const systemPrompt = buildTopicSystemPrompt(profile);
  const userPrompt = buildTopicUserPrompt(count, existingTitles, recentTypes);

  let raw: string;
  try {
    raw = await chat({
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
      maxTokens: 2000,
    });
  } catch (err: any) {
    return { topics: [], errors: [`AI generation failed: ${err.message}`] };
  }

  // Parse JSON from response
  let parsed: any[];
  try {
    const jsonMatch = raw.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error("No JSON array found in response");
    parsed = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(parsed)) throw new Error("Response is not an array");
  } catch (err: any) {
    return { topics: [], errors: [`Failed to parse AI response: ${err.message}`] };
  }

  // Validate and deduplicate
  const validTopics: any[] = [];
  const existingTitleSet = new Set<string>(existingTitles.map((t) => t.trim().toLowerCase()));

  for (const item of parsed) {
    if (!item.title || typeof item.title !== "string" || item.title.length < 10) {
      errors.push(`Rejected topic: too short or missing title`);
      continue;
    }

    const normalizedTitle = item.title.trim().toLowerCase();
    if (existingTitleSet.has(normalizedTitle)) {
      errors.push(`Rejected duplicate topic: "${item.title}"`);
      continue;
    }

    // Check for near-duplicate via simple word overlap
    const titleWords = new Set<string>(normalizedTitle.split(/\s+/));
    let isDuplicate = false;
    for (const existing of existingTitleSet) {
      const existingWords = new Set<string>(existing.split(/\s+/));
      const overlap = Array.from(titleWords).filter((w) => existingWords.has(w) && w.length > 3).length;
      if (overlap >= Math.min(titleWords.size, existingWords.size) * 0.7) {
        isDuplicate = true;
        break;
      }
    }
    if (isDuplicate) {
      errors.push(`Rejected near-duplicate topic: "${item.title}"`);
      continue;
    }

    existingTitleSet.add(normalizedTitle);

    const type = TOPIC_TYPES.includes(item.type) ? item.type : "educational";

    validTopics.push({
      client_id: profile.client_id,
      title: item.title.trim(),
      type,
      angle: (item.angle || "").slice(0, 500),
      target_service: item.target_service || null,
      target_location: item.target_location || profile.location,
      source_type: "ai_generated",
      status: "active",
      generation_context: {
        method: "ai_v1",
        season: currentSeason(),
        model: "claude",
      },
    });
  }

  if (validTopics.length === 0) {
    return { topics: [], errors: [...errors, "No valid topics generated"] };
  }

  const topics = await storage.createSocialSyncTopics(validTopics);
  return { topics, errors };
}
