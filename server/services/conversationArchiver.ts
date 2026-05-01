/**
 * Conversation Archiver — evaluates conversations after completion,
 * generates summaries, classifies intent, and decides whether to
 * permanently archive for admin visibility.
 *
 * This is SEPARATE from the 7-day chat_memory used for continuity.
 * This creates long-term repository records for business intelligence.
 *
 * Only save-worthy conversations are stored (high_value, support,
 * sales_intent, report_followup). Low-signal and discard candidates
 * are not archived — they remain visible only in operational logs.
 */

import { db } from "../db";
import { aiConversationArchive } from "@shared/schema";
import { eq } from "drizzle-orm";
import { chat, type ChatMessage } from "./aiService";
import type { ChatSurface } from "./promptBuilder";
import { createLogger } from "../lib/logger";

const log = createLogger("ConversationArchiver");

/* ─── Types ─── */
export type SaveDecision = "high_value" | "support" | "sales_intent" | "report_followup" | "low_signal" | "discard_candidate";

const SAVE_WORTHY: SaveDecision[] = ["high_value", "support", "sales_intent", "report_followup"];

export interface ArchiveEvaluation {
  summary: string;
  contextNote: string;
  tags: string[];
  primaryIntent: string;
  saveDecision: SaveDecision;
}

export interface ArchiveRequest {
  sessionId: string;
  userId?: number;
  surface: ChatSurface;
  reportId?: string;
  messages: ChatMessage[];
  inputTokens?: number;
  outputTokens?: number;
  estimatedCostUsd?: number;
}

/* ─── Minimum conversation length to evaluate ─── */
const MIN_USER_MESSAGES = 2;

/* ─── Evaluate and optionally archive a conversation ─── */
export async function evaluateAndArchive(req: ArchiveRequest): Promise<void> {
  try {
    // Skip very short or empty conversations
    const userMessages = req.messages.filter(m => m.role === "user");
    if (userMessages.length < MIN_USER_MESSAGES) return;

    // If already archived with a save-worthy decision, just update the
    // transcript/tokens (skip the expensive AI classification call).
    const [existing] = await db.select({
      id: aiConversationArchive.id,
      saveDecision: aiConversationArchive.save_decision,
    }).from(aiConversationArchive)
      .where(eq(aiConversationArchive.session_id, req.sessionId))
      .limit(1);

    if (existing && SAVE_WORTHY.includes(existing.saveDecision as SaveDecision)) {
      // Already classified as save-worthy — update transcript only
      await db.update(aiConversationArchive).set({
        message_count: req.messages.length,
        messages_json: req.messages,
        total_input_tokens: req.inputTokens ?? 0,
        total_output_tokens: req.outputTokens ?? 0,
        estimated_cost_usd: req.estimatedCostUsd ?? 0,
        last_message_at: new Date(),
      }).where(eq(aiConversationArchive.id, existing.id));
      return;
    }

    // Generate evaluation via a lightweight AI call
    const evaluation = await classifyConversation(req.messages, req.surface);
    if (!evaluation) return;

    // Only archive save-worthy conversations
    if (!SAVE_WORTHY.includes(evaluation.saveDecision)) return;

    const now = new Date();
    const archiveData = {
      session_id: req.sessionId,
      user_id: req.userId ?? null,
      surface: req.surface,
      report_id: req.reportId ?? null,
      summary: evaluation.summary,
      context_note: evaluation.contextNote,
      tags: evaluation.tags,
      primary_intent: evaluation.primaryIntent,
      save_decision: evaluation.saveDecision,
      message_count: req.messages.length,
      messages_json: req.messages,
      total_input_tokens: req.inputTokens ?? 0,
      total_output_tokens: req.outputTokens ?? 0,
      estimated_cost_usd: req.estimatedCostUsd ?? 0,
      first_message_at: now,
      last_message_at: now,
    };

    if (existing) {
      // Reclassify: update the existing (previously low-signal) entry
      await db.update(aiConversationArchive)
        .set(archiveData)
        .where(eq(aiConversationArchive.id, existing.id));
    } else {
      await db.insert(aiConversationArchive).values(archiveData);
    }
  } catch (err) {
    log.error("[archiver] Failed to evaluate/archive conversation:", { error: String(err) });
  }
}

/* ─── Classify conversation using a lightweight AI call ─── */
async function classifyConversation(
  messages: ChatMessage[],
  surface: string,
): Promise<ArchiveEvaluation | null> {
  try {
    // Build a compact transcript for classification
    const transcript = messages
      .slice(-16) // Keep compact to minimize token cost
      .map(m => `${m.role === "user" ? "User" : "Assistant"}: ${m.content.slice(0, 200)}`)
      .join("\n");

    const classifyPrompt = `Classify this ${surface} chat conversation. Return ONLY valid JSON.

Transcript:
${transcript}

JSON format:
{"summary":"1-3 sentence summary","contextNote":"1 sentence admin note","tags":["topic","tags"],"primaryIntent":"pricing_inquiry|service_interest|report_followup|booking_intent|support_request|product_feedback|general_question|lead_capture","saveDecision":"high_value|support|sales_intent|report_followup|low_signal|discard_candidate"}

Rules:
- high_value: genuine business inquiry, pricing discussion, strong lead
- sales_intent: explicit interest in buying, pricing, or booking
- support: real help request or product question
- report_followup: follow-up on an audit report
- low_signal: vague but not spam
- discard_candidate: spam, trolling, nonsense, test messages, meaningless exchanges`;

    const raw = await chat({
      system: "Return ONLY valid JSON. No markdown, no backticks, no explanation.",
      messages: [{ role: "user", content: classifyPrompt }],
      maxTokens: 300,
    });

    // Parse JSON from response
    const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const parsed = JSON.parse(cleaned);

    if (!parsed.summary || !parsed.saveDecision) return null;

    return {
      summary: String(parsed.summary).slice(0, 500),
      contextNote: String(parsed.contextNote || "").slice(0, 200),
      tags: Array.isArray(parsed.tags) ? parsed.tags.slice(0, 10).map(String) : [],
      primaryIntent: String(parsed.primaryIntent || "general_question").slice(0, 40),
      saveDecision: validateSaveDecision(parsed.saveDecision),
    };
  } catch (err) {
    log.error("[archiver] Classification failed:", { error: String(err) });
    return null;
  }
}

function validateSaveDecision(val: string): SaveDecision {
  const valid: SaveDecision[] = ["high_value", "support", "sales_intent", "report_followup", "low_signal", "discard_candidate"];
  return valid.includes(val as SaveDecision) ? val as SaveDecision : "low_signal";
}
