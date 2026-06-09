/**
 * Public API for the copy engine.
 *
 * Two pure-AI operations (no DB coupling):
 *   - generateSequence(inputs)       — runs the multi-agent pipeline
 *                                      (research → draft → edit → QA) and
 *                                      returns brief + draft + refined steps +
 *                                      QA report.
 *   - personalizeForProspect(p, ctx) — generates per-prospect tokens
 *                                      (ai_first_line, ai_offer_angle,
 *                                      ai_cta_variant) for one prospect.
 *
 * NOTE (port): this module stays pure-AI (no DB coupling). Persistence against
 * main's schema is done at the route layer — POST /sequences/generate with
 * `persist: true` writes the returned steps into outreach_sequences +
 * outreach_sequence_steps (see adminOutreachSequencesRoutes.ts, P1-3).
 * personalizeForProspect's tokens map directly onto the existing
 * prospect_enrichment columns and are written by the campaign-assign hook (P1-2).
 */

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
