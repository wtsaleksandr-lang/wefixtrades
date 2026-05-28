/**
 * BookFlow homeowner SMS templates + helpers (Wave 80).
 *
 * Wave 80 introduces five homeowner SMS flows on top of the legacy T-24h
 * reminder that BookFlow already shipped (Wave 4-ish). Each flow has a
 * fixed template here; Wave 82 will centralize templates across all
 * products into a single dispatcher-resolved registry.
 *
 * Keep this module dependency-free: pure functions only, no DB calls,
 * no logger imports. The same constraint as smsQuietHours.ts — the
 * helper must be unit-testable in isolation without booting Sentry /
 * OTel / Drizzle.
 *
 * Template variables use `{name}` (single-brace) interpolation so the
 * patterns read clean in the source even when the body is a one-liner.
 * Unknown variables are left literal in the output, which keeps the
 * failure mode observable in production logs ("…at {time}…" shows up
 * as a visible bug rather than silently dropping the value).
 */

export type BookflowSmsFlow =
  | "confirmation"
  | "day_of_reminder"
  | "eta"
  | "post_thank_you"
  | "no_show_recovery";

export const BOOKFLOW_SMS_TEMPLATES: Record<BookflowSmsFlow, string> = {
  // Flow 1 — fires immediately on createAppointment. Transactional bypass.
  // Includes the carrier-required STOP / HELP language because this is the
  // first homeowner-facing SMS in the BookFlow lifecycle for this booking.
  confirmation:
    "Booked! {brand_name}: {service_name} on {date} at {time}. Reply STOP to opt out, HELP for help. Manage: {manage_link}",

  // Flow 2 — fires ~3-4h before start_time via the cron worker.
  // Transactional bypass (critical reminder of an upcoming appointment).
  day_of_reminder:
    "Reminder: {brand_name} is scheduled today at {time}. Reply 1 to confirm, 2 to reschedule. STOP to opt out.",

  // Flow 3 — fires when the trade hits the "on my way" button from the
  // mobile / admin tool. The richer body lives at the call site; this
  // template is here for parity with the other flows.
  eta:
    "{tech_name} from {brand_name} is on the way! ETA {eta_time}. Track: {track_link}",

  // Flow 4 — fires ~30 min after status flips to 'completed'. Honors
  // quiet hours (reminder bypass), so it'll defer to the next morning
  // if the appointment ran late into the evening.
  post_thank_you:
    "Thanks for choosing {brand_name}! How did it go? Reply with a number 1-5 (1=poor, 5=excellent). Or leave a review: {review_link}",

  // Flow 5 — fires 1-2h after a no-show window closes. Honors quiet
  // hours (reminder bypass).
  no_show_recovery:
    "Hi! We missed you for your {service_name} appointment today. Want to reschedule? Reply YES or visit: {reschedule_link}",
};

/**
 * Single-brace `{var}` interpolation. Unknown variables are left
 * literal so production logs surface the broken template instead of
 * silently emitting a half-rendered line.
 */
export function interpolate(template: string, vars: Record<string, string | undefined>): string {
  return template.replace(/\{([a-z_][a-z0-9_]*)\}/gi, (match, name: string) => {
    const v = vars[name];
    return v === undefined || v === null || v === "" ? match : v;
  });
}

/**
 * Format a Date as a homeowner-readable time string ("3:45 PM").
 *
 * `timezone` should be the trade's configured business timezone (from
 * bookflow_settings.timezone). Falls back to UTC if absent.
 */
export function formatAppointmentTime(date: Date, timezone?: string | null): string {
  return date.toLocaleString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: timezone ?? "UTC",
  });
}

/**
 * Format a Date as a homeowner-readable date string ("Mon, May 28").
 */
export function formatAppointmentDate(date: Date, timezone?: string | null): string {
  return date.toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: timezone ?? "UTC",
  });
}
