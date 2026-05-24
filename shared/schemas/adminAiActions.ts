/**
 * Wave W-AV-1 — Business Operator AI v1 schema.
 *
 * Three tables back the autonomous Business Operator AI cron:
 *
 *   - admin_ai_actions          — one row per detected signal, with AI
 *                                  reasoning + proposed action + review state.
 *   - admin_ai_playbook_state   — per-playbook trust ladder + auto-enable flag.
 *   - admin_ai_budget           — monthly cap ($50 default) + alert tracking.
 *
 * All routes (server/routes/adminAiActivityRoutes.ts) and the cron worker
 * (server/jobs/businessOperatorWorker.ts) write through these tables.
 *
 * v1 is ESCALATE-ONLY by default. The per-playbook auto_enabled toggle
 * only unlocks after 3 consecutive admin approvals on that playbook.
 */

import { pgTable, text, integer, boolean, jsonb, timestamp, serial, index, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { users } from "./db";

/* ─── Playbook keys (stable string identifiers) ─── */
export const ADMIN_AI_PLAYBOOKS = [
  "stuck_submissions",
  "past_due_subs",
  "unassigned_webfix",
  "draft_calculators",
  "bot_submissions",
] as const;
export type AdminAiPlaybook = (typeof ADMIN_AI_PLAYBOOKS)[number];

/* ─── Action / signal status ─── */
export const ADMIN_AI_ACTION_STATUSES = [
  "pending",
  "approved",
  "rejected",
  "auto_executed",
  "claude_failed",
  "escalated",
  "pending_no_ai_budget",
] as const;
export type AdminAiActionStatus = (typeof ADMIN_AI_ACTION_STATUSES)[number];

/* ─── Severity ─── */
export const ADMIN_AI_SEVERITIES = ["low", "medium", "high", "critical"] as const;
export type AdminAiSeverity = (typeof ADMIN_AI_SEVERITIES)[number];

/* ─── admin_ai_actions ─── */
export const adminAiActions = pgTable(
  "admin_ai_actions",
  {
    /** crypto.randomUUID() */
    id: text("id").primaryKey(),
    playbook: text("playbook").notNull(),
    /** Unique within a playbook — used for dedup. E.g. 'submission_42'. */
    signal_id: text("signal_id").notNull(),
    status: text("status").notNull().default("pending"),
    severity: text("severity").notNull().default("medium"),
    /** One-line summary shown in admin notification feed + listing. */
    summary: text("summary").notNull(),
    /** Structured signal payload — detector-specific. */
    detail: jsonb("detail").notNull(),
    /** Executor-readable action descriptor (allowlist-checked). */
    proposed_action: jsonb("proposed_action"),
    /** Claude's free-text reasoning for this proposed action. */
    ai_reasoning: text("ai_reasoning"),
    /** Anthropic model id e.g. 'claude-haiku-4-5-20251001'. */
    ai_model: text("ai_model"),
    ai_input_tokens: integer("ai_input_tokens").default(0),
    ai_output_tokens: integer("ai_output_tokens").default(0),
    /** Estimated cost in US cents (input * $0.80/M + output * $4/M). */
    ai_cost_cents: integer("ai_cost_cents").default(0),
    ai_attempt_count: integer("ai_attempt_count").default(0),
    ai_last_error: text("ai_last_error"),
    reviewed_by: integer("reviewed_by").references(() => users.id),
    reviewed_at: timestamp("reviewed_at"),
    executed_at: timestamp("executed_at"),
    created_at: timestamp("created_at").defaultNow().notNull(),
    updated_at: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    /** Dedup pending rows by (playbook, signal_id). */
    dedupIdx: uniqueIndex("admin_ai_actions_dedup_idx")
      .on(t.playbook, t.signal_id)
      .where(sql`${t.status} = 'pending'`),
    // Direction must match migrations/0028_admin_ai_actions.sql:
    //   CREATE INDEX admin_ai_actions_status_idx ON admin_ai_actions (status, created_at DESC).
    // Postgres default for DESC is NULLS FIRST. Drizzle's `.desc()` alone
    // emits `DESC NULLS LAST`, which does NOT match the live index and
    // makes drizzle-kit propose drop+recreate on every deploy. The
    // `.nullsFirst()` chain pins the schema to the same NULL ordering
    // Postgres chose when the migration ran with bare `DESC`.
    statusIdx: index("admin_ai_actions_status_idx").on(
      t.status,
      t.created_at.desc().nullsFirst(),
    ),
  }),
);

export const insertAdminAiActionSchema = createInsertSchema(adminAiActions).omit({
  created_at: true,
  updated_at: true,
});
export type InsertAdminAiAction = z.infer<typeof insertAdminAiActionSchema>;
export type AdminAiAction = typeof adminAiActions.$inferSelect;

/* ─── admin_ai_playbook_state ─── */
export const adminAiPlaybookState = pgTable("admin_ai_playbook_state", {
  playbook: text("playbook").primaryKey(),
  auto_enabled: boolean("auto_enabled").default(false),
  /** Resets to 0 on any rejection. Auto-enable toggle unlocks at >= 3. */
  consecutive_approvals: integer("consecutive_approvals").default(0),
  last_auto_executed_at: timestamp("last_auto_executed_at"),
  last_admin_action_at: timestamp("last_admin_action_at"),
  /** Per-playbook cumulative cents this calendar month (best-effort). */
  monthly_cost_cents: integer("monthly_cost_cents").default(0),
  monthly_cost_reset_at: timestamp("monthly_cost_reset_at").defaultNow().notNull(),
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
});

export type AdminAiPlaybookState = typeof adminAiPlaybookState.$inferSelect;

/* ─── admin_ai_budget ─── */
export const adminAiBudget = pgTable("admin_ai_budget", {
  id: serial("id").primaryKey(),
  /** 'YYYY-MM' (e.g. '2026-05'). One row per calendar month, UTC. */
  month: text("month").notNull().unique(),
  spent_cents: integer("spent_cents").default(0),
  /** Monthly hard cap — default $50.00 = 5000 cents. */
  cap_cents: integer("cap_cents").default(5000),
  /** Which threshold notices have fired this month ('80pct', '100pct'). */
  alerts_sent: jsonb("alerts_sent").$type<string[]>().default(sql`'[]'::jsonb`),
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
});

export type AdminAiBudget = typeof adminAiBudget.$inferSelect;

/* ─── Constants ─── */
/** Anthropic Haiku 4.5 pricing (USD per 1M tokens). */
export const ADMIN_AI_INPUT_USD_PER_M = 0.8;
export const ADMIN_AI_OUTPUT_USD_PER_M = 4.0;
/** Number of consecutive admin approvals required to unlock auto-execute. */
export const ADMIN_AI_AUTO_UNLOCK_APPROVALS = 3;
