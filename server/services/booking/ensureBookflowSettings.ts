/**
 * Booking consolidation (PR2) — lazy BookFlow settings provisioning.
 *
 * The consolidation façade routes every booking entry point through the
 * native BookFlow engine, which requires a `bookflow_settings` row keyed by
 * `client_id`. A trade who only ever configured scheduling inside the
 * QuoteQuick wizard (`appearance.scheduling`) may not have one yet. This
 * helper lazily provisions that row from the calculator's wizard scheduling
 * config the first time a booking is attempted — and is a no-op (idempotent)
 * when a row already exists.
 *
 * CRITICAL shape conversion (the projection PR2 must get right):
 *   `appearance.scheduling` stores availability as NUMERIC `working_days`
 *   (0=Sun .. 6=Sat, matching JS Date.getDay()) plus a SINGLE global
 *   `working_hours_start` / `working_hours_end`.
 *
 *   `bookflow_settings.working_hours` stores it as NAMED-DAY KEYS:
 *     { sunday:{enabled,start,end}, monday:{…}, … saturday:{…} }
 *   with per-day start/end. We project the global hours onto every enabled
 *   day and mark the rest `enabled:false`.
 *
 * DB-free unit-testable: data access + slug generation injected via `deps`.
 */
import { db } from "../../db";
import { eq } from "drizzle-orm";
import { bookflowSettings, type BookflowSettings } from "@shared/schema";
import type { SchedulingAppearance } from "@shared/schemas/scheduling";

/** Ordered 0=Sun..6=Sat → bookflow_settings.working_hours key names. */
export const DAY_INDEX_TO_NAME = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;

export interface WorkingDay {
  enabled: boolean;
  start: string; // "HH:MM"
  end: string; // "HH:MM"
}
export type NamedWorkingHours = Record<(typeof DAY_INDEX_TO_NAME)[number], WorkingDay>;

/**
 * Project numeric `working_days[]` + global hours → named-day-keyed
 * `working_hours`. Every one of the 7 days is present; only days listed in
 * `working_days` are `enabled:true` and carry the global start/end.
 *
 * Pure + deterministic — the table-driven test asserts this directly.
 */
export function projectSchedulingToWorkingHours(
  scheduling: Pick<SchedulingAppearance, "working_days" | "working_hours_start" | "working_hours_end">,
): NamedWorkingHours {
  const start = scheduling.working_hours_start;
  const end = scheduling.working_hours_end;
  const enabledDays = new Set(scheduling.working_days ?? []);

  const out = {} as NamedWorkingHours;
  for (let dayIdx = 0; dayIdx < 7; dayIdx++) {
    const name = DAY_INDEX_TO_NAME[dayIdx];
    const enabled = enabledDays.has(dayIdx);
    out[name] = {
      enabled,
      // Disabled days still carry the global hours so toggling a day on in
      // the portal later doesn't surface empty start/end.
      start,
      end,
    };
  }
  return out;
}

export interface EnsureBookflowSettingsDeps {
  getByClientId: (clientId: number) => Promise<BookflowSettings | null>;
  create: (row: {
    client_id: number;
    business_name: string | null;
    slug: string;
    working_hours: NamedWorkingHours;
    slot_duration_minutes: number;
    buffer_minutes: number;
  }) => Promise<BookflowSettings>;
  generateSlug: (businessName: string) => Promise<string>;
}

export const defaultEnsureBookflowSettingsDeps: EnsureBookflowSettingsDeps = {
  async getByClientId(clientId: number): Promise<BookflowSettings | null> {
    const [row] = await db
      .select()
      .from(bookflowSettings)
      .where(eq(bookflowSettings.client_id, clientId))
      .limit(1);
    return row ?? null;
  },
  async create(row): Promise<BookflowSettings> {
    const [created] = await db
      .insert(bookflowSettings)
      .values({
        client_id: row.client_id,
        business_name: row.business_name,
        slug: row.slug,
        working_hours: row.working_hours,
        slot_duration_minutes: row.slot_duration_minutes,
        buffer_minutes: row.buffer_minutes,
      })
      .returning();
    return created;
  },
  async generateSlug(businessName: string): Promise<string> {
    // Lazy import — bookflowService transitively imports server/db, so keeping
    // this out of the module-eval path lets the DB-free unit test load this
    // module (with injected deps) without DATABASE_URL.
    const { generateSlug } = await import("./bookflowService");
    return generateSlug(businessName);
  },
};

export interface EnsureBookflowSettingsInput {
  /** The calculator's wizard scheduling config (appearance.scheduling). */
  scheduling: Pick<
    SchedulingAppearance,
    "working_days" | "working_hours_start" | "working_hours_end" | "slot_duration_minutes" | "buffer_minutes"
  >;
  /** Business name to seed the slug + settings from (falls back to a default). */
  businessName?: string | null;
}

/**
 * Ensure a `bookflow_settings` row exists for `clientId`, creating one from
 * the calculator's `appearance.scheduling` when absent. Idempotent: if a row
 * already exists it is returned unchanged (no overwrite — the trade may have
 * since configured BookFlow directly).
 */
export async function ensureBookflowSettings(
  clientId: number,
  scheduling: EnsureBookflowSettingsInput["scheduling"],
  deps: EnsureBookflowSettingsDeps = defaultEnsureBookflowSettingsDeps,
  businessName: string | null = null,
): Promise<BookflowSettings> {
  const existing = await deps.getByClientId(clientId);
  if (existing) return existing; // idempotent — never clobber existing config

  const workingHours = projectSchedulingToWorkingHours(scheduling);
  const name = businessName?.trim() || `Client ${clientId}`;
  const slug = await deps.generateSlug(name);

  return deps.create({
    client_id: clientId,
    business_name: businessName ?? null,
    slug,
    working_hours: workingHours,
    slot_duration_minutes: scheduling.slot_duration_minutes ?? 60,
    buffer_minutes: scheduling.buffer_minutes ?? 15,
  });
}
