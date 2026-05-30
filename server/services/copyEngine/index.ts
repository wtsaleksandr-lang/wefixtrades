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
 * NOTE (port): the original branch also shipped a persistSequence() that wrote
 * to outbound_sequence_templates / _steps. Those tables predate main's
 * outreach_sequences schema (migration 0037) and don't exist here, so
 * persistence is intentionally omitted from this port. generateSequence returns
 * its full result for the caller to use or persist against the current schema;
 * personalizeForProspect's tokens map directly onto the existing
 * prospect_enrichment columns. Wiring persistence to main's schema is a
 * follow-up.
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
