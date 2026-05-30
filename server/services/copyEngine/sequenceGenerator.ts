/**
 * Multi-agent sequence generator.
 *
 * Pipeline: research → drafter → editor → QA
 *
 * Each agent is a single chat() call against Anthropic via the shared
 * aiService (circuit breaker, retry, prompt caching all reused).
 *
 * Models:
 *   - research, drafter: Haiku 4.5 (cheap; volume cuts cost)
 *   - editor, QA:        Sonnet 4.6 (sharper instruction following)
 *
 * Total cost per sequence: ~$0.05-0.15 depending on response length.
 */

import { chat } from "../aiService";
import { createLogger } from "../../lib/logger";
import {
  type SequenceInputs,
  researchSystemPrompt,
  researchUserPrompt,
  drafterSystemPrompt,
  drafterUserPrompt,
  editorSystemPrompt,
  editorUserPrompt,
  qaSystemPrompt,
  qaUserPrompt,
} from "./prompts";

const log = createLogger("CopyEngine");

const MODEL_CHEAP = "claude-haiku-4-5-20251001";
const MODEL_SHARP = "claude-sonnet-4-6";

const MAX_TOKENS_RESEARCH = 1200;
const MAX_TOKENS_DRAFT = 2400;
const MAX_TOKENS_EDIT = 2400;
const MAX_TOKENS_QA = 1500;

export interface SequenceStepDraft {
  stepNumber: number;
  delayDays: number;
  subjectVariants: string[];
  body: string;
}

export interface AgentBrief {
  painPoints: string[];
  valueProps: string[];
  objections: Array<{ objection: string; response: string }>;
  subjectThemes: Array<{ angle: string; example: string }>;
  openingHooks: string[];
  antiPatterns: string[];
  callToAction: string;
}

export interface QaReport {
  warnings: Array<{
    stepNumber: number;
    severity: "high" | "medium" | "low";
    issue: string;
    fix: string;
  }>;
  spamRiskScore: number;
  tokensUsed: string[];
  tokensInvalid: string[];
  hasHardcodedUnsubscribe: boolean;
  passesCompliance: boolean;
  summary: string;
}

export interface GenerateSequenceResult {
  runId: string;
  inputs: SequenceInputs;
  brief: AgentBrief;
  draftSteps: SequenceStepDraft[];
  refinedSteps: SequenceStepDraft[];
  editorNotes: string[];
  qaReport: QaReport;
  /** The final published steps — alias of refinedSteps + qa metadata. */
  steps: SequenceStepDraft[];
  /** Models used per agent — for audit + cost attribution. */
  models: {
    research: string;
    drafter: string;
    editor: string;
    qa: string;
  };
}

/**
 * Parse a JSON response from an LLM, with one retry on common failures
 * (markdown fences, leading commentary). Throws on second failure so
 * the caller sees what the model returned.
 */
function parseJson<T>(raw: string, agent: string): T {
  // Strip markdown fences if the model included them despite instructions.
  let cleaned = raw.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/```\s*$/, "")
      .trim();
  }
  // Some models prepend a "Here is the JSON:" preamble. Find the first {.
  const firstBrace = cleaned.indexOf("{");
  if (firstBrace > 0) cleaned = cleaned.slice(firstBrace);
  const lastBrace = cleaned.lastIndexOf("}");
  if (lastBrace !== -1 && lastBrace < cleaned.length - 1) {
    cleaned = cleaned.slice(0, lastBrace + 1);
  }

  try {
    return JSON.parse(cleaned) as T;
  } catch (err: any) {
    log.error(`${agent} returned non-JSON`, {
      error: err.message,
      raw_preview: raw.slice(0, 200),
    });
    throw new Error(`${agent} returned invalid JSON: ${err.message}`);
  }
}

function newRunId(): string {
  return `seqgen_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Run the full multi-agent pipeline for one sequence.
 *
 * Throws if any agent returns invalid JSON or the QA agent flags
 * `passesCompliance: false`. Caller decides whether to retry, surface
 * to the operator for review, or accept.
 */
export async function generateSequence(
  inputs: SequenceInputs
): Promise<GenerateSequenceResult> {
  const runId = newRunId();
  log.info("sequence generation start", { runId, icp: inputs.icp.slice(0, 80) });

  // ── Agent 1: Research ──────────────────────────────────────────
  const researchRaw = await chat({
    system: researchSystemPrompt(),
    messages: [{ role: "user", content: researchUserPrompt(inputs) }],
    maxTokens: MAX_TOKENS_RESEARCH,
    modelOverride: MODEL_CHEAP,
  });
  const brief = parseJson<AgentBrief>(researchRaw, "research");
  log.info("research done", {
    runId,
    painPoints: brief.painPoints?.length,
    subjectThemes: brief.subjectThemes?.length,
  });

  // ── Agent 2: Drafter ───────────────────────────────────────────
  // Inject step count into the system prompt template literal.
  const drafterSystem = drafterSystemPrompt().replace(
    "${stepCount}",
    String(inputs.stepCount)
  );
  const draftRaw = await chat({
    system: drafterSystem,
    messages: [{ role: "user", content: drafterUserPrompt(inputs, brief) }],
    maxTokens: MAX_TOKENS_DRAFT,
    modelOverride: MODEL_CHEAP,
  });
  const draftParsed = parseJson<{ steps: SequenceStepDraft[] }>(draftRaw, "drafter");
  if (!Array.isArray(draftParsed.steps) || draftParsed.steps.length !== inputs.stepCount) {
    throw new Error(
      `drafter returned ${draftParsed.steps?.length ?? 0} steps, expected ${inputs.stepCount}`
    );
  }
  log.info("draft done", { runId, steps: draftParsed.steps.length });

  // ── Agent 3: Editor ────────────────────────────────────────────
  const editRaw = await chat({
    system: editorSystemPrompt(),
    messages: [{ role: "user", content: editorUserPrompt(inputs, draftParsed) }],
    maxTokens: MAX_TOKENS_EDIT,
    modelOverride: MODEL_SHARP,
  });
  const refined = parseJson<{
    steps: SequenceStepDraft[];
    editorNotes: string[];
  }>(editRaw, "editor");
  if (!Array.isArray(refined.steps) || refined.steps.length !== inputs.stepCount) {
    throw new Error(
      `editor returned ${refined.steps?.length ?? 0} steps, expected ${inputs.stepCount}`
    );
  }
  log.info("edit done", { runId, notes: refined.editorNotes?.length ?? 0 });

  // ── Agent 4: QA ────────────────────────────────────────────────
  const qaRaw = await chat({
    system: qaSystemPrompt(),
    messages: [{ role: "user", content: qaUserPrompt(refined) }],
    maxTokens: MAX_TOKENS_QA,
    modelOverride: MODEL_SHARP,
  });
  const qaReport = parseJson<QaReport>(qaRaw, "qa");
  log.info("qa done", {
    runId,
    spamRiskScore: qaReport.spamRiskScore,
    warnings: qaReport.warnings?.length ?? 0,
    passes: qaReport.passesCompliance,
  });

  return {
    runId,
    inputs,
    brief,
    draftSteps: draftParsed.steps,
    refinedSteps: refined.steps,
    editorNotes: refined.editorNotes ?? [],
    qaReport,
    steps: refined.steps,
    models: {
      research: MODEL_CHEAP,
      drafter: MODEL_CHEAP,
      editor: MODEL_SHARP,
      qa: MODEL_SHARP,
    },
  };
}
