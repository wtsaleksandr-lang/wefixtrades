import crypto from "crypto";
import { chat } from "../aiService";
import { storage } from "../../storage";
import { evaluateQuality, type QualityResult } from "./qualityGate";
import { logAiContentCost } from "./costTracker";
import { readBrandProfile, type BrandProfile } from "../contentflow/brandProfile";
import type { SocialSyncProfile, SocialSyncTopic, SocialSyncPost } from "@shared/schema";

/* ─── Platform-specific constraints ─── */

const PLATFORM_CONFIG: Record<string, { maxLength: number; maxHashtags: number; style: string }> = {
  facebook: {
    maxLength: 1500,
    maxHashtags: 5,
    style: "Slightly longer, conversational, can include a call-to-action. Write in a way that encourages comments and shares. Can use 2-3 short paragraphs.",
  },
  instagram: {
    maxLength: 800,
    maxHashtags: 15,
    style: "Caption-driven, punchy, visual-first tone. Start with a hook. Use line breaks. End with a clear CTA or question. Hashtags go at the end, separated by a line break.",
  },
  google_business: {
    maxLength: 700,
    maxHashtags: 0,
    style: "Short, professional, local-focused. Mention the service area. Include a call to action like 'Call us' or 'Book now'. No hashtags.",
  },
  linkedin: {
    maxLength: 1200,
    maxHashtags: 5,
    style: "Professional, industry-focused, thought-leadership tone. Can reference business growth, team achievements, or industry trends. Short paragraphs.",
  },
};

function buildContentSystemPrompt(
  profile: SocialSyncProfile,
  platform: string,
  brand: BrandProfile = {},
): string {
  const config = PLATFORM_CONFIG[platform] || PLATFORM_CONFIG.facebook;
  const services = (profile.services as string[] | null) || [];
  const location = brand.location_cue || profile.location || "the local area";
  const niche = profile.niche || "home services";
  const tone = brand.tone || profile.tone || "professional";
  /* Sprint 16: layer in content_brand fields where present. Falls
   * back to SocialSync profile fields so existing tests are unaffected. */
  const styleKw = brand.style_keywords?.length ? brand.style_keywords.join(", ") : "";
  const avoidKw = brand.avoid?.length ? brand.avoid.join(", ") : "";
  const focusKw = brand.service_focus?.length ? brand.service_focus.join(", ") : services.join(", ");
  const forbiddenClaims = brand.forbidden_claims?.length ? brand.forbidden_claims.join(", ") : "";

  return `You are writing a social media post for a real local ${niche} business.

Business details:
- Trade: ${niche}
- Location: ${location}
- Services: ${focusKw || niche}
- Brand tone: ${tone}
${styleKw ? `- Style keywords: ${styleKw}` : ""}
${avoidKw ? `- Avoid: ${avoidKw}` : ""}
${forbiddenClaims ? `- Never claim (unless explicitly provided in topic): ${forbiddenClaims}` : ""}

Platform: ${platform}
Platform style: ${config.style}
Maximum post length: ${config.maxLength} characters
Maximum hashtags: ${config.maxHashtags}

CRITICAL RULES:
- Write like a real local trade business owner, NOT like a marketing agency
- Never use corporate jargon, buzzwords, or phrases like "leverage", "synergy", "unlock"
- Never start with "Did you know?" or "Happy [day]!"
- Never use excessive emojis (1-3 max per post)
- Mention ${location} naturally when relevant, don't force it
- Reference specific services by name
- Sound helpful and knowledgeable, not salesy
- Every post should provide value: a tip, insight, proof of work, or honest information
- Do NOT make up fake statistics, reviews, or testimonials

Respond ONLY with valid JSON. No markdown fences, no explanation.`;
}

function buildContentUserPrompt(
  topic: SocialSyncTopic,
  platform: string,
  recentTexts: string[],
): string {
  const config = PLATFORM_CONFIG[platform] || PLATFORM_CONFIG.facebook;
  const avoidList = recentTexts.length > 0
    ? `\n\nAvoid phrasing similar to these recent posts:\n${recentTexts.slice(0, 5).map(t => `- "${t.slice(0, 100)}..."`).join("\n")}`
    : "";

  return `Write a ${platform} post about this topic:

Topic: "${topic.title}"
Type: ${topic.type}
Angle: ${topic.angle || "general"}
Target service: ${topic.target_service || "general services"}
Location context: ${topic.target_location || "local area"}

Return a JSON object with:
- "post_text": string — the full post text (max ${config.maxLength} chars)
- "caption": string — a shorter 1-2 sentence version suitable for a preview or alt platform
- "hashtags": string[] — ${config.maxHashtags > 0 ? `${config.maxHashtags} relevant hashtags without the # symbol` : "empty array (this platform does not use hashtags)"}
- "media_plan": {"type": "image"|"carousel", "prompt": string, "notes": string} — describe what image would pair well with this post
${avoidList}

Respond with ONLY the JSON object.`;
}

/* ─── Quality validation (delegated to qualityGate.ts) ─── */

/* ─── Main generation function ─── */

export interface ContentGenerationResult {
  post: SocialSyncPost | null;
  error?: string;
  rejected?: boolean;
  rejectionReason?: string;
}

export async function generatePostFromTopic(
  profile: SocialSyncProfile,
  topic: SocialSyncTopic,
  platform: string,
  scheduledFor?: Date,
): Promise<ContentGenerationResult> {
  // Get recent posts for dedup
  const recentPosts = await storage.listRecentSocialSyncPosts(profile.client_id, 30);
  const recentTexts = recentPosts.map(p => p.post_text);
  /* Sprint 16: layer in content_brand from clients.metadata. */
  const client = await storage.getClientById(profile.client_id);
  const brand = readBrandProfile(client);
  const systemPrompt = buildContentSystemPrompt(profile, platform, brand);
  const userPrompt = buildContentUserPrompt(topic, platform, recentTexts);

  let raw: string;
  try {
    raw = await chat({
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
      maxTokens: 1500,
    });
    // Log cost (estimate ~500 input + ~400 output tokens per post)
    logAiContentCost(profile.client_id, 500, 400, `Post for ${platform}`).catch(() => {});
  } catch (err: any) {
    return { post: null, error: `AI generation failed: ${err.message}` };
  }

  // Parse JSON
  let parsed: any;
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON object found");
    parsed = JSON.parse(jsonMatch[0]);
  } catch (err: any) {
    return { post: null, error: `Failed to parse AI response: ${err.message}` };
  }

  const postText = (parsed.post_text || "").trim();
  const caption = (parsed.caption || "").trim();
  let hashtags: string[] = Array.isArray(parsed.hashtags) ? parsed.hashtags : [];
  const mediaPlan = parsed.media_plan || null;

  // Sanitize hashtags: remove # prefix, limit count
  const config = PLATFORM_CONFIG[platform] || PLATFORM_CONFIG.facebook;
  hashtags = hashtags
    .map((h: string) => String(h).replace(/^#/, "").trim())
    .filter((h: string) => h.length > 0 && h.length <= 30)
    .slice(0, config.maxHashtags);

  // Quality gate evaluation
  const quality = await evaluateQuality(
    postText, hashtags, platform, profile, topic,
    recentPosts.map(p => ({ post_text: p.post_text })),
    true, // enable AI self-review
  );

  if (quality.verdict === "reject") {
    return {
      post: null,
      rejected: true,
      rejectionReason: `Quality rejected (score ${quality.score}): ${quality.reasons.join("; ")}`,
    };
  }

  if (quality.verdict === "regenerate") {
    return {
      post: null,
      rejected: true,
      rejectionReason: `Quality below threshold (score ${quality.score}): ${quality.reasons.join("; ")}`,
    };
  }

  // Compute duplicate hash
  const duplicateHash = crypto.createHash("sha256").update(postText.trim().toLowerCase()).digest("hex");

  // Save post with quality metadata
  const post = await storage.createSocialSyncPost({
    client_id: profile.client_id,
    topic_id: topic.id,
    platform,
    post_text: postText,
    caption: caption || null,
    hashtags: hashtags.length > 0 ? hashtags : null,
    media_plan: mediaPlan,
    status: "ready",
    quality_score: quality.score,
    duplicate_hash: duplicateHash,
    scheduled_for: scheduledFor || null,
    created_by_system: true,
  } as any);

  // Mark topic as used
  await storage.updateSocialSyncTopic(topic.id, { status: "used" });

  return { post };
}

export async function regeneratePost(
  postId: number,
): Promise<ContentGenerationResult> {
  const post = await storage.getSocialSyncPostById(postId);
  if (!post) return { post: null, error: "Post not found" };

  const profile = await storage.getSocialSyncProfile(post.client_id);
  if (!profile) return { post: null, error: "Profile not found" };

  // If post has a topic, reuse it (reset topic to active first)
  let topic: SocialSyncTopic | undefined;
  if (post.topic_id) {
    const topics = await storage.listSocialSyncTopics(post.client_id);
    topic = topics.find(t => t.id === post.topic_id);
    if (topic) {
      await storage.updateSocialSyncTopic(topic.id, { status: "active" });
    }
  }

  if (!topic) {
    // Generate a fresh topic
    const { chat: aiChat } = await import("../aiService");
    const freshRaw = await aiChat({
      system: `Generate a single social media topic for a ${profile.niche || "home services"} business in ${profile.location || "the local area"}. Return JSON: {"title":"...","type":"...","angle":"...","target_service":"..."}`,
      messages: [{ role: "user", content: `Create one topic about ${profile.niche || "home services"} for ${post.platform}. JSON only.` }],
      maxTokens: 300,
    });
    try {
      const parsed = JSON.parse(freshRaw.match(/\{[\s\S]*\}/)![0]);
      const [newTopic] = await storage.createSocialSyncTopics([{
        client_id: post.client_id,
        title: parsed.title,
        type: parsed.type || "educational",
        angle: parsed.angle || "",
        target_service: parsed.target_service || null,
        target_location: profile.location,
        source_type: "ai_generated",
        status: "active",
        generation_context: { method: "regeneration" },
      }] as any[]);
      topic = newTopic;
    } catch {
      return { post: null, error: "Failed to generate replacement topic" };
    }
  }

  // Cancel old post
  await storage.updateSocialSyncPost(postId, { status: "cancelled" } as any);

  // Generate new post from topic
  return generatePostFromTopic(profile, topic, post.platform, post.scheduled_for || undefined);
}
