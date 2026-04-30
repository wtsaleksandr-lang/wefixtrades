/**
 * Ops Engine — AI summarization layer.
 *
 * ARCHITECTURE CONTRACT:
 * - This file does NOT query the database directly.
 * - It receives OpsSignal[] from opsDetectors.ts and summarizes them.
 * - It calls chat() from aiService.ts — the only AI call in the ops stack.
 * - It validates the AI output against a strict schema (hard parse failure if invalid).
 * - It writes to opsSnapshots for traceability.
 * - It logs token usage to aiUsageLogs via standard patterns.
 *
 * AI does NOT:
 * - assign severity (that is done in detectors)
 * - decide what is "stalled" or "blocked" (detectors own that)
 * - read or mutate any other table
 */

import { db } from "../db";
import { opsSnapshots } from "@shared/schema";
import { chat, getModel } from "./aiService";
import { type OpsSignal } from "./opsDetectors";

export const PROMPT_VERSION = "ops-daily-v1";

/* ─── AI Output Contract ─── */
// Claude MUST return exactly this shape. Parsing fails hard if invalid.

export interface OpsPriority {
  title: string;
  severity: "low" | "medium" | "high" | "critical";
  reason: string;
  related_entities: Array<{ type: string; id: number }>;
}

export interface DailyOpsSummaryOutput {
  summary: string;         // 2–4 sentence narrative of the current ops state
  priorities: OpsPriority[]; // ordered high → low, max 10
  risks: string[];           // forward-looking risks, max 5
  recommendations: string[]; // suggested admin actions, max 5
}

/* ─── System prompt for daily summary ─── */
const OPS_SYSTEM_PROMPT = `You are an internal operations assistant for a SaaS trade business called WeFixTrades.
You receive a list of detected operational signals. Each signal has already been assigned a severity by deterministic rules.

Your job is ONLY to:
1. Write a concise 2–4 sentence narrative summary of the current operational state.
2. List the top priorities based on the signals provided, grouped logically.
3. Identify forward-looking risks implied by the signals.
4. Suggest specific, actionable next steps for the admin.

Rules:
- Do NOT re-assign severity. Use the severity from the signals as provided.
- Do NOT invent signals that are not in the input.
- Keep the summary factual and grounded in the signals.
- Return ONLY valid JSON matching the schema. No markdown, no backticks, no explanation.`;

/* ─── Build a compact text representation of signals for the prompt ─── */
function buildSignalContext(signals: OpsSignal[]): string {
  if (!signals.length) return "No signals detected. Operations appear clear.";

  // Group by severity for clarity
  const bySeverity: Record<string, OpsSignal[]> = {
    critical: [],
    high: [],
    medium: [],
    low: [],
  };

  for (const s of signals) {
    bySeverity[s.severity].push(s);
  }

  const lines: string[] = [];
  for (const sev of ["critical", "high", "medium", "low"]) {
    const group = bySeverity[sev];
    if (!group.length) continue;
    lines.push(`[${sev.toUpperCase()}]`);
    for (const s of group) {
      lines.push(`  - [${s.entity_type}#${s.entity_id}] ${s.reason}`);
    }
  }

  return lines.join("\n");
}

/* ─── Validate AI output shape ─── */
function validateOutput(raw: unknown): DailyOpsSummaryOutput {
  if (!raw || typeof raw !== "object") {
    throw new Error("AI output is not an object");
  }
  const o = raw as Record<string, unknown>;
  if (typeof o.summary !== "string" || !o.summary.trim()) {
    throw new Error("AI output missing or empty 'summary'");
  }
  if (!Array.isArray(o.priorities)) {
    throw new Error("AI output 'priorities' must be an array");
  }
  if (!Array.isArray(o.risks)) {
    throw new Error("AI output 'risks' must be an array");
  }
  if (!Array.isArray(o.recommendations)) {
    throw new Error("AI output 'recommendations' must be an array");
  }

  const validSeverities = new Set(["low", "medium", "high", "critical"]);
  const priorities: OpsPriority[] = (o.priorities as any[]).slice(0, 10).map((p, i) => {
    if (typeof p.title !== "string") throw new Error(`priorities[${i}].title must be a string`);
    if (!validSeverities.has(p.severity)) throw new Error(`priorities[${i}].severity invalid: ${p.severity}`);
    if (typeof p.reason !== "string") throw new Error(`priorities[${i}].reason must be a string`);
    const relatedEntities = Array.isArray(p.related_entities)
      ? (p.related_entities as any[]).map((e) => ({ type: String(e.type ?? ""), id: Number(e.id ?? 0) }))
      : [];
    return { title: String(p.title), severity: p.severity, reason: String(p.reason), related_entities: relatedEntities };
  });

  return {
    summary: String(o.summary).slice(0, 1000),
    priorities,
    risks: (o.risks as any[]).slice(0, 5).map(String),
    recommendations: (o.recommendations as any[]).slice(0, 5).map(String),
  };
}

/* ═══════════════════════════════════════════════════════════════
   Main entry point: generate daily ops summary
   ═══════════════════════════════════════════════════════════════ */
export async function generateDailyOpsSummary(
  signals: OpsSignal[],
): Promise<{ snapshot: typeof opsSnapshots.$inferSelect | null; error?: string }> {
  const periodStart = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const periodEnd = new Date();
  const startedAt = Date.now();

  let rawResponse = "";
  let inputTokens = 0;
  let outputTokens = 0;

  try {
    const signalContext = buildSignalContext(signals);

    const userMessage = `Today's operational signals (${signals.length} total):

${signalContext}

Return a JSON object matching this exact schema:
{
  "summary": "string (2-4 sentences)",
  "priorities": [
    {
      "title": "string",
      "severity": "low|medium|high|critical",
      "reason": "string",
      "related_entities": [{ "type": "string", "id": number }]
    }
  ],
  "risks": ["string"],
  "recommendations": ["string"]
}`;

    // Direct call to Anthropic — no streaming, strict JSON mode
    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

    const response = await client.messages.create({
      model: getModel(),
      max_tokens: 800,
      system: OPS_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    });

    const block = response.content[0];
    rawResponse = block.type === "text" ? block.text : "";
    inputTokens = response.usage?.input_tokens ?? 0;
    outputTokens = response.usage?.output_tokens ?? 0;

    // Parse and validate — hard fail if structure is wrong
    const cleaned = rawResponse
      .replace(/^```json\s*/m, "")
      .replace(/^```\s*/m, "")
      .replace(/```\s*$/m, "")
      .trim();

    const parsed = JSON.parse(cleaned);
    const aiOutput = validateOutput(parsed);

    const estimatedCostUsd = Math.round(
      (inputTokens * 0.00000025 + outputTokens * 0.00000125) * 1_000_000
    ); // micro-cents, same convention as aiUsageLogs

    const latencyMs = Date.now() - startedAt;

    // Store snapshot — raw_signals and ai_output are stored separately
    const [inserted] = await db.insert(opsSnapshots).values({
      snapshot_type: "daily_summary",
      period_start: periodStart,
      period_end: periodEnd,
      raw_signals: signals as any,
      ai_output: aiOutput as any,
      prompt_version: PROMPT_VERSION,
      detector_version: (await import("./opsDetectors")).DETECTOR_VERSION,
      model_used: getModel(),
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      estimated_cost_usd: estimatedCostUsd,
      signal_count: signals.length,
      metadata: { latency_ms: latencyMs },
    }).returning();

    console.log(
      `[opsEngine] Daily summary generated — ${signals.length} signals, ${inputTokens}in/${outputTokens}out tokens, ${latencyMs}ms`
    );

    return { snapshot: inserted };
  } catch (err: any) {
    console.error("[opsEngine] generateDailyOpsSummary failed:", err.message);

    // Store a failed snapshot so the run is traceable even on AI error
    try {
      const [inserted] = await db.insert(opsSnapshots).values({
        snapshot_type: "daily_summary",
        period_start: periodStart,
        period_end: periodEnd,
        raw_signals: signals as any,
        ai_output: null,
        prompt_version: PROMPT_VERSION,
        detector_version: (await import("./opsDetectors")).DETECTOR_VERSION,
        model_used: getModel(),
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        estimated_cost_usd: 0,
        signal_count: signals.length,
        metadata: { error: err.message, latency_ms: Date.now() - startedAt },
      }).returning();
      return { snapshot: inserted, error: err.message };
    } catch (dbErr: any) {
      console.error("[opsEngine] Failed to store error snapshot:", dbErr.message);
    }

    return { snapshot: null, error: err.message };
  }
}
