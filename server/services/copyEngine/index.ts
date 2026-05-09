/**
 * Public API for the copy engine.
 *
 * Two operations:
 *   - generateSequence(inputs)            — runs the multi-agent pipeline
 *                                            and returns brief + draft + refined
 *                                            steps + QA report.
 *   - persistSequence(generated, opts)    — writes the output to
 *                                            outbound_sequence_templates +
 *                                            outbound_sequence_steps.
 *   - personalizeForProspect(p, ctx)      — generates per-prospect tokens
 *                                            (ai_first_line, etc.) and returns
 *                                            them; caller writes to DB.
 */

import { db } from "../../db";
import {
  outboundSequenceTemplates,
  outboundSequenceSteps,
  type InsertOutboundSequenceTemplate,
  type InsertOutboundSequenceStep,
} from "@shared/schema";

import {
  generateSequence,
  type GenerateSequenceResult,
  type SequenceStepDraft,
  type AgentBrief,
  type QaReport,
} from "./sequenceGenerator";

import {
  personalizeForProspect,
  type PersonalizationTokens,
  type PersonalizeContext,
} from "./prospectPersonalizer";

import type { SequenceInputs } from "./prompts";

export {
  generateSequence,
  personalizeForProspect,
};

export type {
  SequenceInputs,
  SequenceStepDraft,
  AgentBrief,
  QaReport,
  GenerateSequenceResult,
  PersonalizationTokens,
  PersonalizeContext,
};

export interface PersistSequenceOptions {
  /** Optional campaign this template belongs to. */
  campaignId?: number;
  /** Display name for the template (admin UI shows this). */
  name: string;
  /** Userid that triggered the generation, for audit. */
  createdBy?: number;
  /** Mark template as 'active' immediately (default: 'draft' so QA warnings can be reviewed). */
  activate?: boolean;
}

export interface PersistedSequence {
  templateId: number;
  stepIds: number[];
}

/**
 * Write a generated sequence to the DB. Inserts the template row + N
 * step rows. Idempotent insert is NOT attempted — every call creates
 * a new template (callers can archive old ones via PATCH route).
 */
export async function persistSequence(
  generated: GenerateSequenceResult,
  opts: PersistSequenceOptions
): Promise<PersistedSequence> {
  const status = opts.activate ? "active" : "draft";

  const tplPayload: InsertOutboundSequenceTemplate = {
    campaign_id: opts.campaignId ?? null,
    name: opts.name,
    icp: generated.inputs.icp,
    pain_point: generated.inputs.painPoint,
    offer: generated.inputs.offer,
    sender_persona: generated.inputs.senderPersona,
    tone: generated.inputs.tone,
    generation_model: `${generated.models.research}+${generated.models.drafter}+${generated.models.editor}+${generated.models.qa}`,
    generation_run_id: generated.runId,
    agent_brief: generated.brief as any,
    qa_report: generated.qaReport as any,
    status,
    created_by: opts.createdBy ?? null,
  };

  const [tpl] = await db
    .insert(outboundSequenceTemplates)
    .values(tplPayload)
    .returning({ id: outboundSequenceTemplates.id });

  const stepPayloads: InsertOutboundSequenceStep[] = generated.steps.map((s, idx) => ({
    template_id: tpl.id,
    step_number: s.stepNumber,
    delay_days: s.delayDays,
    subject_variants: s.subjectVariants as any,
    body: s.body,
    editor_notes: generated.editorNotes[idx] ?? null,
    qa_warnings: generated.qaReport.warnings.filter(
      (w) => w.stepNumber === s.stepNumber
    ) as any,
  }));

  const stepRows = await db
    .insert(outboundSequenceSteps)
    .values(stepPayloads)
    .returning({ id: outboundSequenceSteps.id });

  return {
    templateId: tpl.id,
    stepIds: stepRows.map((r) => r.id),
  };
}
