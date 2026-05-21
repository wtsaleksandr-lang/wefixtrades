/**
 * Shared executor types.
 *
 * v1 contract: every executor verifies that the proposed_action JSON sits
 * inside a tiny per-playbook allowlist, then logs + fires an admin alert.
 * NO persistent mutations are performed in v1 — the AI earns trust through
 * 3 consecutive admin approvals before its auto_enabled toggle even appears.
 */

import type { AdminAiAction } from "@shared/schema";

export interface ExecutorResult {
  ok: boolean;
  message: string;
  metadata?: Record<string, unknown>;
}

export type ExecutorFn = (action: AdminAiAction) => Promise<ExecutorResult>;
