/**
 * SocialSync Quality Gate — validates generated content before publishing.
 *
 * Three layers:
 *   1. Rule-based checks (fast, deterministic)
 *   2. Similarity/repetition detection (against recent content)
 *   3. AI self-review (lightweight second-pass, optional)
 *
 * Returns a structured verdict: accept, regenerate, or reject.
 */
import crypto from "crypto";
import { chat } from "../aiService";
import type { SocialSyncProfile, SocialSyncPost, SocialSyncTopic } from "@shared/schema";

/* ─── Types ─── */

export type QualityVerdict = "accept" | "regenerate" | "reject";

export interface QualityResult {
  verdict: QualityVerdict;
  score: number;          // 0-100
  flags: QualityFlag[];
  reasons: string[];      // Human-readable rejection/warning reasons
}

export interface QualityFlag {
  rule: string;
  severity: "block" | "warn" | "info";
  detail: string;
}

/* ─── Platform Config ─── */

const PLATFORM_MAX_LENGTH: Record<string, number> = {
  facebook: 1500,
  instagram: 800,
  google_business: 700,
  linkedin: 1200,
};

/* ─── Banned Phrases (expanded) ─── */

const BANNED_PHRASES = [
  // Generic AI sludge
  "did you know?",
  "in today's fast-paced world",
  "in today's world",
  "let's dive in",
  "without further ado",
  "let me tell you",
  "here's the thing",
  "it's no secret that",
  "at the end of the day",
  "in this day and age",
  // Corporate jargon
  "game changer",
  "synergy",
  "leverage our",
  "unlock the power",
  "revolutionize",
  "cutting-edge",
  "best-in-class",
  "next-level",
  "paradigm",
  "holistic approach",
  "streamline your",
  // Over-promotional spam
  "act now before it's too late",
  "you won't believe",
  "this one weird trick",
  "limited time only!!!",
  "call now!!!",
  "don't miss out!!!",
  // Fake intimacy
  "as a homeowner, you",
  "as a fellow homeowner",
  "we know how hard it is",
  "we understand your frustration",
];

const GENERIC_OPENER_PATTERNS = [
  /^(hey|hi|hello) there[!,.]?\s/i,
  /^(attention|calling all) (homeowners|residents)/i,
  /^are you tired of/i,
  /^looking for (a |the )?(best|top|reliable)/i,
  /^do you need help with/i,
  /^is your home ready/i,
  /^happy (monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i,
  /^happy (spring|summer|fall|winter|new year|holidays)/i,
  /^welcome to another/i,
];

const SPAM_INDICATORS = [
  /!!!+/,                        // Multiple exclamation marks
  /\$\$\$/,                      // Dollar signs spam
  /FREE FREE FREE/i,             // Repetitive FREE
  /CALL NOW/i,                   // Aggressive CTA in caps
  /ACT NOW/i,
  /LIMITED TIME/i,
  /🔥{3,}/,                      // Emoji spam
  /💯{2,}/,
  /⚡{3,}/,
];

/* ─── Rule-Based Checks ─── */

function runRuleChecks(
  postText: string,
  hashtags: string[],
  platform: string,
  profile: SocialSyncProfile,
  topic: SocialSyncTopic | null,
): QualityFlag[] {
  const flags: QualityFlag[] = [];
  const lower = postText.toLowerCase();
  const maxLen = PLATFORM_MAX_LENGTH[platform] || 1500;

  // Length checks
  if (postText.length < 50) {
    flags.push({ rule: "min_length", severity: "block", detail: `Too short: ${postText.length} chars (min 50)` });
  } else if (postText.length < 80) {
    flags.push({ rule: "low_length", severity: "warn", detail: `Short post: ${postText.length} chars` });
  }
  if (postText.length > maxLen + 100) {
    flags.push({ rule: "max_length", severity: "block", detail: `Too long: ${postText.length} chars (max ${maxLen})` });
  }

  // Banned phrases
  for (const phrase of BANNED_PHRASES) {
    if (lower.includes(phrase)) {
      flags.push({ rule: "banned_phrase", severity: "block", detail: `Banned phrase: "${phrase}"` });
    }
  }

  // Generic openers
  for (const pattern of GENERIC_OPENER_PATTERNS) {
    if (pattern.test(postText)) {
      flags.push({ rule: "generic_opener", severity: "warn", detail: `Generic opener detected` });
      break;
    }
  }

  // Spam indicators
  for (const pattern of SPAM_INDICATORS) {
    if (pattern.test(postText)) {
      flags.push({ rule: "spam_indicator", severity: "block", detail: `Spam pattern detected: ${pattern.source.slice(0, 30)}` });
      break;
    }
  }

  // Hashtag limits
  const maxTags = platform === "instagram" ? 15 : platform === "google_business" ? 0 : 5;
  if (hashtags.length > maxTags + 3) {
    flags.push({ rule: "hashtag_stuffing", severity: "warn", detail: `${hashtags.length} hashtags (limit: ${maxTags})` });
  }

  // Service relevance: if topic targets a service, check the post mentions it
  if (topic?.target_service) {
    const serviceLower = topic.target_service.toLowerCase();
    const serviceWords = serviceLower.split(/\s+/).filter(w => w.length > 3);
    const mentionsService = serviceWords.some(w => lower.includes(w));
    if (!mentionsService) {
      flags.push({ rule: "service_irrelevant", severity: "warn", detail: `Post doesn't mention target service "${topic.target_service}"` });
    }
  }

  // Location relevance: if profile has a location and topic expects it
  if (profile.location && topic?.target_location) {
    const locationWords = profile.location.toLowerCase().split(/[\s,]+/).filter(w => w.length > 3);
    const mentionsLocation = locationWords.some(w => lower.includes(w));
    // Only warn, don't block — not every post needs location
    if (!mentionsLocation && topic.type === "local_relevance") {
      flags.push({ rule: "location_missing", severity: "warn", detail: `Local topic but post doesn't mention "${profile.location}"` });
    }
  }

  // Empty substance check: post is mostly hashtags/emojis/whitespace
  const strippedText = postText.replace(/[#@\n\r\s🔥💯⚡✅❌🏠🔧💪👷‍♂️📞📱🛠️]/g, "").trim();
  if (strippedText.length < 30) {
    flags.push({ rule: "low_substance", severity: "block", detail: "Post has very little substantive text content" });
  }

  return flags;
}

/* ─── Similarity Detection ─── */

function computeWordSet(text: string): Set<string> {
  return new Set(
    text.toLowerCase()
      .replace(/[^a-z0-9\s]/g, "")
      .split(/\s+/)
      .filter(w => w.length > 3)
  );
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  const intersection = [...a].filter(w => b.has(w)).length;
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : intersection / union;
}

function checkSimilarity(
  postText: string,
  recentPosts: { post_text: string }[],
): QualityFlag[] {
  const flags: QualityFlag[] = [];
  const newWords = computeWordSet(postText);

  // Exact hash duplicate
  const hash = crypto.createHash("sha256").update(postText.trim().toLowerCase()).digest("hex");

  for (const recent of recentPosts) {
    const recentHash = crypto.createHash("sha256").update(recent.post_text.trim().toLowerCase()).digest("hex");
    if (hash === recentHash) {
      flags.push({ rule: "exact_duplicate", severity: "block", detail: "Exact duplicate of recent post" });
      return flags;
    }

    const recentWords = computeWordSet(recent.post_text);
    const similarity = jaccardSimilarity(newWords, recentWords);
    if (similarity > 0.7) {
      flags.push({ rule: "high_similarity", severity: "block", detail: `${Math.round(similarity * 100)}% similar to recent post` });
      return flags;
    }
    if (similarity > 0.5) {
      flags.push({ rule: "moderate_similarity", severity: "warn", detail: `${Math.round(similarity * 100)}% similar to recent post` });
    }
  }

  // Check for repetitive opening patterns across recent posts
  const newOpener = postText.split(/[.!\n]/)[0]?.trim().toLowerCase().slice(0, 50);
  if (newOpener) {
    const recentOpeners = recentPosts.map(p => p.post_text.split(/[.!\n]/)[0]?.trim().toLowerCase().slice(0, 50));
    const openerMatches = recentOpeners.filter(o => o && (o === newOpener || jaccardSimilarity(computeWordSet(o), computeWordSet(newOpener)) > 0.6)).length;
    if (openerMatches >= 2) {
      flags.push({ rule: "repetitive_opener", severity: "warn", detail: `Opening line too similar to ${openerMatches} recent posts` });
    }
  }

  return flags;
}

/* ─── AI Self-Review (lightweight) ─── */

async function aiSelfReview(
  postText: string,
  platform: string,
  niche: string,
  location: string,
): Promise<QualityFlag[]> {
  const flags: QualityFlag[] = [];

  try {
    const response = await chat({
      system: `You are a quality reviewer for social media posts written for local trades businesses. Rate the post honestly. Respond ONLY with valid JSON.`,
      messages: [{
        role: "user",
        content: `Review this ${platform} post for a ${niche} business in ${location}:

"${postText.slice(0, 600)}"

Rate on a JSON object with these boolean fields:
- "sounds_authentic": true if it sounds like a real local business owner, false if it sounds like generic AI
- "has_value": true if it provides useful information, false if it's empty filler
- "too_salesy": true if it's overly promotional/pushy
- "too_generic": true if it could apply to any business in any location
- "awkward_phrasing": true if the language sounds unnatural

JSON only, no explanation.`,
      }],
      maxTokens: 200,
      surface: "socialsync",
    });

    const parsed = JSON.parse(response.match(/\{[\s\S]*\}/)![0]);

    if (parsed.sounds_authentic === false) {
      flags.push({ rule: "ai_not_authentic", severity: "warn", detail: "AI review: doesn't sound like a real local business" });
    }
    if (parsed.has_value === false) {
      flags.push({ rule: "ai_no_value", severity: "warn", detail: "AI review: lacks useful information" });
    }
    if (parsed.too_salesy === true) {
      flags.push({ rule: "ai_too_salesy", severity: "warn", detail: "AI review: overly promotional" });
    }
    if (parsed.too_generic === true) {
      flags.push({ rule: "ai_too_generic", severity: "warn", detail: "AI review: too generic, not locally relevant" });
    }
    if (parsed.awkward_phrasing === true) {
      flags.push({ rule: "ai_awkward", severity: "info", detail: "AI review: awkward phrasing detected" });
    }
  } catch {
    // AI review failure is not a blocker — just skip it
  }

  return flags;
}

/* ─── Content Mix Guard ─── */

export interface ContentMixCheck {
  ok: boolean;
  adjustment?: string;
  blockedType?: string;
}

export function checkContentMix(
  topicType: string,
  recentTopicTypes: string[],
): ContentMixCheck {
  if (recentTopicTypes.length === 0) return { ok: true };

  const last3 = recentTopicTypes.slice(0, 3);

  // Block 3+ consecutive posts of the same type
  if (last3.every(t => t === topicType) && last3.length >= 2) {
    return {
      ok: false,
      adjustment: `Avoid "${topicType}" — last ${last3.length} posts were the same type`,
      blockedType: topicType,
    };
  }

  // Block 2+ promos in a row
  const promoTypes = ["promo", "service_spotlight"];
  if (promoTypes.includes(topicType) && last3.slice(0, 1).some(t => promoTypes.includes(t))) {
    return {
      ok: false,
      adjustment: "Avoid back-to-back promotional posts",
      blockedType: topicType,
    };
  }

  // Block 2+ emergency posts in a row
  if (topicType === "emergency_awareness" && last3[0] === "emergency_awareness") {
    return {
      ok: false,
      adjustment: "Avoid consecutive emergency posts",
      blockedType: topicType,
    };
  }

  return { ok: true };
}

/* ─── Main Quality Gate ─── */

/**
 * Full quality gate evaluation.
 *
 * @param postText - The generated post text
 * @param hashtags - Generated hashtags
 * @param platform - Target platform
 * @param profile - Client profile
 * @param topic - Source topic (if available)
 * @param recentPosts - Recent posts for similarity check
 * @param enableAiReview - Whether to run the AI self-review pass (adds ~1s latency + API cost)
 */
export async function evaluateQuality(
  postText: string,
  hashtags: string[],
  platform: string,
  profile: SocialSyncProfile,
  topic: SocialSyncTopic | null,
  recentPosts: { post_text: string }[],
  enableAiReview: boolean = true,
): Promise<QualityResult> {
  const allFlags: QualityFlag[] = [];

  // Layer 1: Rule-based checks
  allFlags.push(...runRuleChecks(postText, hashtags, platform, profile, topic));

  // Layer 2: Similarity detection
  allFlags.push(...checkSimilarity(postText, recentPosts));

  // Layer 3: AI self-review (only if no blocking flags yet and enabled)
  const hasBlockingFlag = allFlags.some(f => f.severity === "block");
  if (enableAiReview && !hasBlockingFlag) {
    const aiFlags = await aiSelfReview(
      postText,
      platform,
      profile.niche || "home services",
      profile.location || "local area",
    );
    allFlags.push(...aiFlags);
  }

  // Calculate score and verdict
  const blockFlags = allFlags.filter(f => f.severity === "block");
  const warnFlags = allFlags.filter(f => f.severity === "warn");

  // Score: start at 80, deduct for issues
  let score = 80;
  score -= blockFlags.length * 30;
  score -= warnFlags.length * 10;

  // Bonus points for good signals
  if (postText.length >= 100 && postText.length <= (PLATFORM_MAX_LENGTH[platform] || 1500)) score += 5;
  if (hashtags.length > 0 && hashtags.length <= 10) score += 5;
  if (postText.split("\n").filter(l => l.trim()).length >= 2) score += 5; // Multi-paragraph
  if (allFlags.length === 0) score += 5; // Clean pass

  score = Math.max(0, Math.min(100, score));

  // Verdict
  let verdict: QualityVerdict;
  const reasons: string[] = allFlags.filter(f => f.severity !== "info").map(f => f.detail);

  if (blockFlags.length > 0) {
    verdict = score <= 20 ? "reject" : "regenerate";
  } else if (warnFlags.length >= 3) {
    verdict = "regenerate";
  } else {
    verdict = "accept";
  }

  return { verdict, score, flags: allFlags, reasons };
}
