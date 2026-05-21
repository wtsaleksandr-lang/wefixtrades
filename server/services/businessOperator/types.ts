/**
 * Shared types for Business Operator AI detectors and executors.
 */

import type { AdminAiPlaybook, AdminAiSeverity } from "@shared/schema";

/** What a detector returns for one operational signal. */
export interface DetectorSignal {
  /** Stable within this playbook — used as the dedup key. */
  signal_id: string;
  /** Free-form structured payload — passed to Claude + stored verbatim. */
  detail: Record<string, unknown>;
  /** Human-readable one-liner for the admin notification feed. */
  summary: string;
  severity: AdminAiSeverity;
}

/** Shape of a registered detector. */
export type DetectorFn = () => Promise<DetectorSignal[]>;

/** Map a playbook key to its detector function. */
export interface PlaybookDetector {
  playbook: AdminAiPlaybook;
  detect: DetectorFn;
}
