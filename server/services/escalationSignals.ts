/**
 * Wave AI-1 — high-signal escalation detectors for the autonomous "sharp-mind"
 * Opus router (see aiBudgetRouter.ts > selectModelWithEscalation).
 *
 * These are intentionally CONSERVATIVE keyword heuristics, not a model call:
 * the whole point is to spend Opus money only when a task is *genuinely* an
 * error-resolution / troubleshooting / outage situation. A false negative just
 * keeps a hard task on Sonnet (acceptable). A false positive costs ~5×/25×, so
 * the bar is deliberately high — a single ambiguous word like "help" does NOT
 * trip it; the phrasing has to read like something is broken.
 *
 * Wiring: chatRoutes.ts admin path passes `escalationSignal: "resolution"`
 * when looksLikeResolutionTask() returns true for the latest user turn. The
 * router still enforces the per-client budget band AND the global $50/mo Opus
 * ceiling on top of this, so this function only OFFERS escalation — it can
 * never force Opus spend past the guards.
 */

import type { ChatMessage } from "./aiService";

/**
 * Phrases that strongly imply the operator is troubleshooting a failure /
 * outage / error rather than doing routine work. Matched case-insensitively
 * as substrings against the latest user message. Kept tight on purpose.
 */
const RESOLUTION_PATTERNS: RegExp[] = [
  /\b(error|errors|exception|stack ?trace|traceback)\b/i,
  /\b(failing|failed|failure|crash(?:ing|ed)?|broken|broke)\b/i,
  /\b(outage|down(?:time)?|not working|isn'?t working|won'?t (?:load|start|run|send))\b/i,
  /\b(bug|regression|misbehav(?:ing|e)|stuck|hangs?|timing out|timeout)\b/i,
  /\b(troubleshoot|diagnose|root ?cause|why (?:is|did|won'?t|isn'?t|does(?:n'?t)?))\b/i,
  /\b(500|502|503|504)\b/, // common HTTP failure codes
  /\b(can'?t (?:send|deliver|charge|process|sync|connect|log ?in))\b/i,
];

/** True when the text reads like an error-resolution / troubleshooting task. */
export function textLooksLikeResolution(text: string): boolean {
  if (!text) return false;
  return RESOLUTION_PATTERNS.some((re) => re.test(text));
}

/**
 * Inspect a conversation and decide whether the LATEST user turn is an
 * error-resolution / troubleshooting task worth escalating. Only the most
 * recent user message is considered — escalation is per-call, and an old
 * resolved error earlier in the thread should not keep escalating every turn.
 */
export function looksLikeResolutionTask(messages: ChatMessage[]): boolean {
  if (!Array.isArray(messages) || messages.length === 0) return false;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "user") {
      return textLooksLikeResolution(messages[i].content);
    }
  }
  return false;
}
