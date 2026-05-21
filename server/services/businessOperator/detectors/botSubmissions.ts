/**
 * Detector: bot_submissions.
 *
 * Two-pronged spam signal on inbound leads:
 *   (a) The lead's email matches a common bot/spam pattern (numeric suffix,
 *       throwaway domains, etc.); OR
 *   (b) The same IP from the intake_events log produced more than 5
 *       lead-style events in the last hour.
 *
 * Severity: critical.
 */

import { sql } from "drizzle-orm";
import { db } from "../../../db";
import { leads, intakeEvents } from "@shared/schema";
import type { DetectorSignal } from "../types";

const MAX_SIGNALS = 20;
const WINDOW_HOURS = 1;
const IP_THRESHOLD = 5;

/** Common bot/throwaway patterns. Kept conservative to avoid false positives. */
const BOT_EMAIL_REGEX =
  "(^[a-z]+[0-9]{6,}@)|(@mailinator\\.|@guerrillamail\\.|@10minutemail\\.|@tempmail\\.|@throwawaymail\\.|@yopmail\\.)";

interface BotByEmail {
  kind: "email_pattern";
  lead_id: number;
  calculator_id: number;
  email: string;
  created_date: Date | null;
}

interface BotByIp {
  kind: "ip_burst";
  ip_address: string;
  event_count: number;
}

export async function detect(): Promise<DetectorSignal[]> {
  const cutoff = new Date(Date.now() - WINDOW_HOURS * 60 * 60 * 1000);

  // Branch (a): suspicious email patterns on the last 24h of leads.
  const dayCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const byEmailRows = (await db.execute(sql`
    SELECT id, calculator_id, email, created_date
    FROM ${leads}
    WHERE email IS NOT NULL
      AND email ~* ${BOT_EMAIL_REGEX}
      AND created_date >= ${dayCutoff}
    ORDER BY created_date DESC
    LIMIT ${MAX_SIGNALS}
  `)) as unknown as { rows: Array<{ id: number; calculator_id: number; email: string; created_date: Date | null }> };

  // Branch (b): IP bursts in the last hour from the normalized intake feed.
  const byIpRows = (await db.execute(sql`
    SELECT ip_address, COUNT(*)::int AS event_count
    FROM ${intakeEvents}
    WHERE ip_address IS NOT NULL
      AND created_at >= ${cutoff}
      AND source_type IN ('widget', 'calculator', 'webform', 'lead')
    GROUP BY ip_address
    HAVING COUNT(*) > ${IP_THRESHOLD}
    ORDER BY event_count DESC
    LIMIT ${MAX_SIGNALS}
  `)) as unknown as { rows: Array<{ ip_address: string; event_count: number }> };

  const signals: DetectorSignal[] = [];

  for (const r of byEmailRows.rows) {
    signals.push({
      signal_id: `lead_email_${r.id}`,
      detail: {
        kind: "email_pattern",
        lead_id: r.id,
        calculator_id: r.calculator_id,
        email: r.email,
        created_date: r.created_date?.toISOString() ?? null,
      },
      summary: `Lead #${r.id} flagged as bot — email pattern (${r.email}).`,
      severity: "critical",
    });
  }

  for (const r of byIpRows.rows) {
    signals.push({
      signal_id: `ip_${r.ip_address}_${WINDOW_HOURS}h`,
      detail: {
        kind: "ip_burst",
        ip_address: r.ip_address,
        event_count: r.event_count,
        window_hours: WINDOW_HOURS,
      },
      summary: `IP ${r.ip_address} produced ${r.event_count} lead events in ${WINDOW_HOURS}h.`,
      severity: "critical",
    });
  }

  return signals.slice(0, MAX_SIGNALS);
}
