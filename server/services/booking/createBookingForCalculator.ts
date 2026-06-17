/**
 * Booking consolidation (PR2) — the single booking façade.
 *
 * This is the ONE seam every booking entry point (QuoteQuick wizard, the
 * inline Book button, the legacy booking step, TradeLine voice + chat) will
 * later call instead of writing to its own divergent table. PR2 lands the
 * seam fully tested but repoints NO live caller — that's PR3–7.
 *
 * Flow:
 *   1. resolve client       (resolveClientForCalculator — calc→user→client)
 *   2. ensure settings      (ensureBookflowSettings — lazy provision + projection)
 *   3. create appointment   (bookflowService.createAppointment — the EXISTING
 *      race-safe engine) tagged with a `source`.
 *
 * By delegating to the native engine, every consolidated entry point inherits
 * BookFlow's race-safe conflict guard, confirmation email, and the full SMS
 * lifecycle (confirmation / T-24h / day-of / thank-you / no-show) for free —
 * none of which the `bookings` / `scheduled_appointments` paths have today.
 *
 * DB-free unit-testable: every collaborator is injected via `deps`, mirroring
 * the DI seam in server/services/tradelineBooking.test.ts.
 */
import type { BookflowAppointment, BookflowSettings } from "@shared/schema";
import type { SchedulingAppearance } from "@shared/schemas/scheduling";
import type { CreateAppointmentInput } from "./bookflowService";
import {
  resolveClientForCalculator as realResolveClient,
  defaultResolveClientDeps,
  type ResolveClientDeps,
} from "./resolveClientForCalculator";
import {
  ensureBookflowSettings as realEnsureSettings,
  defaultEnsureBookflowSettingsDeps,
  type EnsureBookflowSettingsDeps,
} from "./ensureBookflowSettings";

/** The booking sources PR2 supports tagging onto a consolidated appointment. */
export type BookingSource = "quotequick" | "tradeline_voice" | "tradeline_chat";

export interface CreateBookingForCalculatorInput {
  customerName: string;
  customerEmail?: string;
  customerPhone?: string;
  customerAddress?: string;
  serviceName?: string;
  serviceDurationMinutes?: number;
  /** ISO timestamp of the slot start. */
  startTime: string;
  notes?: string;
  source: BookingSource;
  /**
   * The calculator's wizard scheduling config, used ONLY to lazily provision
   * `bookflow_settings` when the client has none yet. Optional: when the
   * settings row already exists this is ignored.
   */
  scheduling?: Pick<
    SchedulingAppearance,
    "working_days" | "working_hours_start" | "working_hours_end" | "slot_duration_minutes" | "buffer_minutes"
  >;
  /** Business name to seed a freshly-provisioned settings row. */
  businessName?: string | null;
}

export interface CreateBookingForCalculatorDeps {
  resolveClient: (calculatorId: number, deps?: ResolveClientDeps) => Promise<number | null>;
  resolveClientDeps?: ResolveClientDeps;
  ensureSettings: (
    clientId: number,
    scheduling: NonNullable<CreateBookingForCalculatorInput["scheduling"]>,
    deps?: EnsureBookflowSettingsDeps,
    businessName?: string | null,
  ) => Promise<BookflowSettings>;
  ensureSettingsDeps?: EnsureBookflowSettingsDeps;
  /** The EXISTING native engine entry point — bookflowService.createAppointment. */
  createAppointment: (clientId: number, input: CreateAppointmentInput) => Promise<BookflowAppointment>;
}

/* Default deps: lazy-import the real engine to keep this module DB-free at
 * eval time (bookflowService transitively imports server/db). */
export const defaultCreateBookingDeps: CreateBookingForCalculatorDeps = {
  resolveClient: realResolveClient,
  resolveClientDeps: defaultResolveClientDeps,
  ensureSettings: realEnsureSettings,
  ensureSettingsDeps: defaultEnsureBookflowSettingsDeps,
  async createAppointment(clientId, input) {
    const { createAppointment } = await import("./bookflowService");
    return createAppointment(clientId, input);
  },
};

export class BookingFacadeError extends Error {
  constructor(
    message: string,
    readonly code: "no_client",
  ) {
    super(message);
    this.name = "BookingFacadeError";
  }
}

/**
 * Create a booking for a public calculator through the native BookFlow engine.
 * Returns the persisted `bookflow_appointments` row.
 *
 * Throws BookingFacadeError("no_client") when the calculator has no linked
 * client (callers in PR3+ surface this as a graceful "booking not available").
 */
export async function createBookingForCalculator(
  calculatorId: number,
  input: CreateBookingForCalculatorInput,
  deps: CreateBookingForCalculatorDeps = defaultCreateBookingDeps,
): Promise<BookflowAppointment> {
  // 1. Resolve the owning client.
  const clientId = await deps.resolveClient(calculatorId, deps.resolveClientDeps);
  if (!clientId) {
    throw new BookingFacadeError(
      `No client linked to calculator ${calculatorId} — cannot route booking to BookFlow.`,
      "no_client",
    );
  }

  // 2. Ensure a bookflow_settings row exists (lazy provision from scheduling).
  //    When no scheduling config is supplied we still ensure with sensible
  //    defaults so createAppointment finds an active settings row.
  const scheduling = input.scheduling ?? {
    working_days: [1, 2, 3, 4, 5],
    working_hours_start: "09:00",
    working_hours_end: "17:00",
    slot_duration_minutes: 30 as const,
    buffer_minutes: 0 as const,
  };
  await deps.ensureSettings(clientId, scheduling, deps.ensureSettingsDeps, input.businessName ?? null);

  // 3. Delegate to the EXISTING race-safe engine, tagged with the source. This
  //    inherits the conflict guard + email + SMS lifecycle for free.
  const appointmentInput: CreateAppointmentInput = {
    customerName: input.customerName,
    customerEmail: input.customerEmail,
    customerPhone: input.customerPhone,
    customerAddress: input.customerAddress,
    serviceName: input.serviceName,
    serviceDurationMinutes: input.serviceDurationMinutes,
    startTime: input.startTime,
    notes: input.notes,
    source: input.source,
  };

  return deps.createAppointment(clientId, appointmentInput);
}
