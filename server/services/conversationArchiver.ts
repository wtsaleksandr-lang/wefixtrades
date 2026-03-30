/**
 * Conversation Archiver — evaluates conversations after completion,
 * generates summaries, classifies intent, and decides whether to
 * permanently archive for admin visibility.
 *
 * This is SEPARATE from the 7-day chat_memory used for continuity.
 * This creates long-term repository records for business intelligence.
 */

import { db } from "../db";
import { aiConversationArchive } from "@shared/schema";
import { eq } from "drizzle-orm";
import { chat, type ChatMessage } from "./aiService";
import type { ChatSurface } from "./promptBuilder";

/* ─── Types ─── */
export interface ArchiveEvaluation {
  summary: string;
  contextNote: string;
  tags: string[];
  primaryIntent: string;
  saveDecision: "high_value" | "support" | "sales_intent" | "report_followup" | "low_signal" | "discard_candidate";
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

    // Check if already archived for this session
    const existing = await db.select({ id: aiConversationArchive.id })
      .from(aiConversationArchive)
      .where(eq(aiConversationArchive.session_id, req.sessionId))
      .limit(1);

    // Generate evaluation via a lightweight AI call
    const evaluation = await classifyConversation(req.messages, req.surface);
    if (!evaluation) return;

    // Discard low-value conversations
    if (evaluation.saveDecision === "discard_candidate") return;

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

    if (existing.length) {
      // Update existing archive entry
      await db.update(aiConversationArchive)
        .set(archiveData)
        .where(eq(aiConversationArchive.id, existing[0].id));
    } else {
      await db.insert(aiConversationArchive).values(archiveData);
    }
  } catch (err) {
    console.error("[archiver] Failed to evaluate/archive conversation:", err);
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
      .slice(-20) // Cap to avoid huge prompts
      .map(m => `${m.role === "user" ? "User" : "Assistant"}: ${m.content.slice(0, 300)}`)
      .join("\n");

    const classifyPrompt = `You are a conversation classifier for a business SaaS platform (WeFixTrades). Analyze this conversation and return a JSON object.

Surface: ${surface}

Transcript:
${transcript}

Return ONLY valid JSON (no markdown, no backticks):
{
  "summary": "1-3 sentence summary of what the user wanted and what happened",
  "contextNote": "Short admin-readable note (1 sentence max)",
  "tags": ["array", "of", "relevant", "topic", "tags"],
  "primaryIntent": "one of: pricing_inquiry, service_interest, report_followup, booking_intent, support_request, product_feedback, general_question, lead_capture",
  "saveDecision": "one of: high_value, support, sales_intent, report_followup, low_signal, discard_candidate"
}

Classification rules:
- high_value: genuine business inquiry, pricing discussion, strong lead potential
- sales_intent: explicit interest in buying, pricing, or booking
- support: real help request or product question
- report_followup: follow-up on an audit report
- low_signal: vague or unclear but not spam
- discard_candidate: spam, trolling, nonsense, meaningless exchanges, test messages`;

    const raw = await chat({
      system: "You are a precise JSON classifier. Return ONLY valid JSON, no other text.",
      messages: [{ role: "user", content: classifyPrompt }],
      maxTokens: 400,
    });

    // Parse JSON from response
    const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const parsed = JSON.parse(cleaned);

    // Validate required fields
    if (!parsed.summary || !parsed.saveDecision) return null;

    return {
      summary: String(parsed.summary).slice(0, 500),
      contextNote: String(parsed.contextNote || "").slice(0, 200),
      tags: Array.isArray(parsed.tags) ? parsed.tags.slice(0, 10).map(String) : [],
      primaryIntent: String(parsed.primaryIntent || "general_question").slice(0, 40),
      saveDecision: validateSaveDecision(parsed.saveDecision),
    };
  } catch (err) {
    console.error("[archiver] Classification failed:", err);
    return null;
  }
}

function validateSaveDecision(val: string): ArchiveEvaluation["saveDecision"] {
  const valid = ["high_value", "support", "sales_intent", "report_followup", "low_signal", "discard_candidate"];
  return valid.includes(val) ? val as ArchiveEvaluation["saveDecision"] : "low_signal";
}
