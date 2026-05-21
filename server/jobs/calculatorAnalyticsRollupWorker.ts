/**
 * Wave W-BB-4 — calculator analytics daily rollup worker.
 *
 * Runs nightly at 03:00 UTC (wired in scheduler.ts). For every calculator
 * that received any event the previous UTC day:
 *
 *   - counts views / starts / completions / abandonments
 *   - computes avg_completion_seconds across sessions where the same
 *     session_id had both a start and a submit
 *   - aggregates per-field change counts
 *   - upserts a single row into calculator_analytics_daily
 *
 * Idempotent — running twice produces the same row.
 */
import { sql } from "drizzle-orm";
import { db } from "../db";
import {
  calculatorAnalyticsEvents,
  calculatorAnalyticsDaily,
} from "@shared/schema";
import { createLogger } from "../lib/logger";

const log = createLogger("CalculatorAnalyticsRollup");

interface RollupSummary {
  date: string;
  calculators_processed: number;
  rows_upserted: number;
}

/**
 * Compute the UTC date string for "N days ago at 00:00".
 */
function utcDateString(daysAgo: number): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

export async function runCalculatorAnalyticsRollup(
  forDate?: string,
): Promise<RollupSummary> {
  // Roll up YESTERDAY by default — when the cron fires at 03:00 UTC the
  // previous UTC day is fully written. Accepts an override for backfills.
  const target = forDate ?? utcDateString(1);
  const dayStart = `${target} 00:00:00`;
  const dayEnd = `${target} 23:59:59.999999`;

  log.info("Starting calculator analytics rollup", { date: target });

  /* Per-(calculator,event_type) counts. */
  const counts = await db.execute(sql<{
    calculator_id: number;
    event_type: string;
    cnt: string;
  }>`
    select calculator_id, event_type, count(*)::text as cnt
    from ${calculatorAnalyticsEvents}
    where occurred_at >= ${dayStart}::timestamp
      and occurred_at <= ${dayEnd}::timestamp
    group by calculator_id, event_type
  `);

  /* Per-(calculator,field_id) change counts. */
  const fieldRows = await db.execute(sql<{
    calculator_id: number;
    field_id: string;
    cnt: string;
  }>`
    select calculator_id, field_id, count(*)::text as cnt
    from ${calculatorAnalyticsEvents}
    where occurred_at >= ${dayStart}::timestamp
      and occurred_at <= ${dayEnd}::timestamp
      and event_type = 'field_change'
      and field_id is not null
    group by calculator_id, field_id
  `);

  /* Avg completion seconds — for sessions with both a start and a
   * submit in the window, average the per-session delta. */
  const avgRows = await db.execute(sql<{
    calculator_id: number;
    avg_seconds: string;
  }>`
    select calculator_id,
           avg(extract(epoch from (submit_at - start_at)))::text as avg_seconds
    from (
      select calculator_id, session_id,
             min(occurred_at) filter (where event_type = 'start')   as start_at,
             min(occurred_at) filter (where event_type = 'submit')  as submit_at
      from ${calculatorAnalyticsEvents}
      where occurred_at >= ${dayStart}::timestamp
        and occurred_at <= ${dayEnd}::timestamp
        and event_type in ('start', 'submit')
      group by calculator_id, session_id
    ) s
    where start_at is not null and submit_at is not null
      and submit_at >= start_at
    group by calculator_id
  `);

  // execute() returns either { rows } (node-postgres) or an array
  // depending on driver. Normalize.
  const toRows = <T>(r: any): T[] =>
    Array.isArray(r) ? (r as T[]) : ((r?.rows ?? []) as T[]);

  const countRows = toRows<{
    calculator_id: number;
    event_type: string;
    cnt: string;
  }>(counts);
  const fcRows = toRows<{
    calculator_id: number;
    field_id: string;
    cnt: string;
  }>(fieldRows);
  const avgs = toRows<{
    calculator_id: number;
    avg_seconds: string;
  }>(avgRows);

  /* Fold the three queries into one row per calculator. */
  interface DayRow {
    views: number;
    starts: number;
    completions: number;
    abandonments: number;
    avg_completion_seconds: number | null;
    field_change_counts: Record<string, number>;
  }
  const perCalc = new Map<number, DayRow>();
  const ensure = (id: number): DayRow => {
    let row = perCalc.get(id);
    if (!row) {
      row = {
        views: 0,
        starts: 0,
        completions: 0,
        abandonments: 0,
        avg_completion_seconds: null,
        field_change_counts: {},
      };
      perCalc.set(id, row);
    }
    return row;
  };

  for (const r of countRows) {
    const row = ensure(Number(r.calculator_id));
    const n = parseInt(r.cnt, 10) || 0;
    if (r.event_type === "view") row.views = n;
    else if (r.event_type === "start") row.starts = n;
    else if (r.event_type === "submit") row.completions = n;
    else if (r.event_type === "abandon") row.abandonments = n;
  }
  for (const r of fcRows) {
    const row = ensure(Number(r.calculator_id));
    row.field_change_counts[r.field_id] = parseInt(r.cnt, 10) || 0;
  }
  for (const r of avgs) {
    const row = ensure(Number(r.calculator_id));
    const v = parseFloat(r.avg_seconds);
    row.avg_completion_seconds = Number.isFinite(v) ? Math.round(v) : null;
  }

  let upserted = 0;
  for (const [calculator_id, row] of perCalc) {
    await db
      .insert(calculatorAnalyticsDaily)
      .values({
        calculator_id,
        date: target,
        views: row.views,
        starts: row.starts,
        completions: row.completions,
        abandonments: row.abandonments,
        avg_completion_seconds: row.avg_completion_seconds,
        field_change_counts: row.field_change_counts as any,
      })
      .onConflictDoUpdate({
        target: [
          calculatorAnalyticsDaily.calculator_id,
          calculatorAnalyticsDaily.date,
        ],
        set: {
          views: row.views,
          starts: row.starts,
          completions: row.completions,
          abandonments: row.abandonments,
          avg_completion_seconds: row.avg_completion_seconds,
          field_change_counts: row.field_change_counts as any,
        },
      });
    upserted += 1;
  }

  const summary: RollupSummary = {
    date: target,
    calculators_processed: perCalc.size,
    rows_upserted: upserted,
  };
  log.info("Calculator analytics rollup done", { ...summary });
  return summary;
}
