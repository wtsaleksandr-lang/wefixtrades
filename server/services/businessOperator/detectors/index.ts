/**
 * Registry of all Business Operator AI detectors.
 *
 * Each detector exports a `detect()` function returning DetectorSignal[].
 * The agent loop (businessOperatorAgent.ts) walks every entry in DETECTORS.
 */

import type { PlaybookDetector } from "../types";
import { detect as detectStuckSubmissions } from "./stuckSubmissions";
import { detect as detectPastDueSubscriptions } from "./pastDueSubscriptions";
import { detect as detectUnassignedWebFix } from "./unassignedWebFix";
import { detect as detectDraftCalculators } from "./draftCalculators";
import { detect as detectBotSubmissions } from "./botSubmissions";

export const DETECTORS: PlaybookDetector[] = [
  { playbook: "stuck_submissions", detect: detectStuckSubmissions },
  { playbook: "past_due_subs", detect: detectPastDueSubscriptions },
  { playbook: "unassigned_webfix", detect: detectUnassignedWebFix },
  { playbook: "draft_calculators", detect: detectDraftCalculators },
  { playbook: "bot_submissions", detect: detectBotSubmissions },
];
