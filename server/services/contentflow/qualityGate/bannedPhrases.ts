/**
 * ContentFlow article quality gate — banned phrase list.
 *
 * Mirrors `server/services/socialSync/qualityGate.ts` (BANNED_PHRASES /
 * GENERIC_OPENER_PATTERNS / SPAM_INDICATORS). We duplicate the list here
 * rather than reach into the SocialSync module so the two surfaces can
 * evolve independently: long-form article tells (e.g. "in conclusion",
 * "in this article we will explore") are added on top of the shared
 * social tells.
 *
 * Keep approximate parity with the social list — when adding a new
 * sludge phrase to one surface, mirror it here unless it's clearly
 * format-specific.
 */

export const ARTICLE_BANNED_PHRASES: string[] = [
  // ─── Generic AI sludge (mirrors socialSync/qualityGate.ts) ───
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
  // ─── Corporate jargon ───
  "game changer",
  "synergy",
  "leverage our",
  "leverage the",
  "unlock the power",
  "revolutionize",
  "cutting-edge",
  "best-in-class",
  "next-level",
  "paradigm",
  "holistic approach",
  "streamline your",
  // ─── Over-promotional spam ───
  "act now before it's too late",
  "you won't believe",
  "this one weird trick",
  "limited time only!!!",
  "call now!!!",
  "don't miss out!!!",
  // ─── Fake intimacy ───
  "as a homeowner, you",
  "as a fellow homeowner",
  "we know how hard it is",
  "we understand your frustration",
  // ─── Long-form / article-specific AI tells ───
  "in conclusion,",
  "in summary,",
  "to sum up,",
  "in this article, we will",
  "in this article we will",
  "this article will explore",
  "this comprehensive guide",
  "the ultimate guide to",
  "everything you need to know about",
  "delve into",
  "delving into",
  "navigate the complexities",
  "in the realm of",
  "when it comes to",
  "it's important to note that",
  "it is important to note that",
  "it's worth noting that",
  "rest assured",
  "look no further",
  "the world of",
];

export const ARTICLE_GENERIC_OPENER_PATTERNS: RegExp[] = [
  /^in today's (fast-paced |modern )?world/i,
  /^are you (tired of|looking for|struggling with)/i,
  /^when it comes to/i,
  /^have you ever (wondered|thought about)/i,
  /^in this (article|guide|post)/i,
  /^welcome to (this|our|the)/i,
];

export const ARTICLE_SPAM_INDICATORS: RegExp[] = [
  /!!!+/,
  /\$\$\$/,
  /FREE FREE FREE/i,
  /CALL NOW/,
  /ACT NOW/,
  /LIMITED TIME/,
];
