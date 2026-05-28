/**
 * Unit tests for the Wave 79 SMS quiet-hours gate.
 *
 * Excluded from `tsc --noEmit` (tsconfig `**\/*.test.ts`). Runnable
 * standalone via:
 *
 *   npx tsx server/lib/smsQuietHours.test.ts
 *
 * Uses node's built-in `assert/strict` + a fixed `now` override on each
 * call so the assertion is timezone-deterministic regardless of when
 * the suite is run. No test runner dep is added.
 *
 * Coverage:
 *   1. US Eastern timezone, 22:00 local → quiet (true)
 *   2. US Pacific timezone, 14:00 local → not quiet (false)
 *   3. Sunday 09:00 local → quiet (Sunday extension to 10:00)
 *   4. Boundary at 21:00 local → quiet (start is inclusive)
 *   5. Boundary at 08:00 local → not quiet (end is exclusive)
 *   6. Area-code → timezone lookup happy path
 *   7. fallbackTimezone overrides area-code lookup
 *   8. respectSundayMorning=false collapses Sunday rule to weekday rule
 *   9. holdUntilNextWindow returns "now" when window is open
 *  10. holdUntilNextWindow returns a future Date when window is closed
 */
import assert from "node:assert/strict";
import {
  isQuietHour,
  holdUntilNextWindow,
  timezoneFromPhone,
} from "./smsQuietHours";

/**
 * Build a UTC Date that lands at the given local hour/minute on the
 * given weekday in the given timezone. We do this by sampling: we step
 * through hours starting from a known UTC reference and pick the first
 * one that formats to the desired local clock + weekday. Simple, slow-
 * for-tests-but-fine, and DST-correct.
 */
function makeLocalNow(opts: {
  timezone: string;
  weekday: "Sun" | "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat";
  hour: number;
  minute?: number;
}): Date {
  const targetMinute = opts.minute ?? 0;
  // Search window: 2 weeks starting Jan 6 2025 (a Monday in winter, stable
  // for most US zones). That's enough to find every weekday/hour combo.
  const start = Date.UTC(2025, 0, 6, 0, 0, 0); // 2025-01-06T00:00:00Z
  const step = 5 * 60 * 1000;
  for (let t = start; t < start + 21 * 24 * 60 * 60 * 1000; t += step) {
    const d = new Date(t);
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: opts.timezone,
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const parts = fmt.formatToParts(d);
    const wd = parts.find((p) => p.type === "weekday")?.value;
    const hh = parseInt(parts.find((p) => p.type === "hour")?.value ?? "-1", 10) % 24;
    const mm = parseInt(parts.find((p) => p.type === "minute")?.value ?? "-1", 10);
    if (wd === opts.weekday && hh === opts.hour && mm === targetMinute) {
      return d;
    }
  }
  throw new Error(
    `could not find UTC instant for ${opts.timezone} ${opts.weekday} ${opts.hour}:${targetMinute}`,
  );
}

// ── 1. US Eastern, Mon 22:00 → quiet ──────────────────────────────────
{
  const now = makeLocalNow({
    timezone: "America/New_York",
    weekday: "Mon",
    hour: 22,
  });
  const quiet = isQuietHour({
    phoneE164: "+12125550100", // 212 → NY
    now,
  });
  assert.equal(quiet, true, "Mon 22:00 ET should be quiet");
}

// ── 2. US Pacific, Tue 14:00 → not quiet ──────────────────────────────
{
  const now = makeLocalNow({
    timezone: "America/Los_Angeles",
    weekday: "Tue",
    hour: 14,
  });
  const quiet = isQuietHour({
    phoneE164: "+14155550100", // 415 → PT
    now,
  });
  assert.equal(quiet, false, "Tue 14:00 PT should not be quiet");
}

// ── 3. Sunday 09:00 ET → quiet (Sunday extension to 10:00) ────────────
{
  const now = makeLocalNow({
    timezone: "America/New_York",
    weekday: "Sun",
    hour: 9,
  });
  const quiet = isQuietHour({
    phoneE164: "+12125550100",
    now,
  });
  assert.equal(quiet, true, "Sun 09:00 ET should be quiet (Sunday extension)");
}

// ── 4. Boundary at Mon 21:00 ET → quiet (start inclusive) ─────────────
{
  const now = makeLocalNow({
    timezone: "America/New_York",
    weekday: "Mon",
    hour: 21,
  });
  const quiet = isQuietHour({
    phoneE164: "+12125550100",
    now,
  });
  assert.equal(quiet, true, "Mon 21:00 ET should be quiet (start boundary)");
}

// ── 5. Boundary at Mon 08:00 ET → not quiet (end exclusive) ───────────
{
  const now = makeLocalNow({
    timezone: "America/New_York",
    weekday: "Mon",
    hour: 8,
  });
  const quiet = isQuietHour({
    phoneE164: "+12125550100",
    now,
  });
  assert.equal(quiet, false, "Mon 08:00 ET should not be quiet (end boundary)");
}

// ── 6. Area-code → timezone lookup happy path ─────────────────────────
{
  assert.equal(timezoneFromPhone("+12125551234"), "America/New_York", "212 → NY");
  assert.equal(timezoneFromPhone("+14155551234"), "America/Los_Angeles", "415 → LA");
  assert.equal(timezoneFromPhone("+13125551234"), "America/Chicago", "312 → Chicago");
  assert.equal(timezoneFromPhone("+13035551234"), "America/Denver", "303 → Denver");
  assert.equal(timezoneFromPhone("+19075551234"), "America/Anchorage", "907 → Anchorage");
  assert.equal(timezoneFromPhone("+18085551234"), "Pacific/Honolulu", "808 → Honolulu");
  // Unknown area code → null
  assert.equal(timezoneFromPhone("+19995551234"), null, "999 unknown → null");
  // Non-NANP → null
  assert.equal(timezoneFromPhone("+447700900100"), null, "UK number → null");
}

// ── 7. fallbackTimezone overrides area-code lookup ────────────────────
{
  // Phone area code maps to NY; force-evaluate in LA.
  const nowLA10am = makeLocalNow({
    timezone: "America/Los_Angeles",
    weekday: "Tue",
    hour: 10,
  });
  const nyQuiet = isQuietHour({
    phoneE164: "+12125550100", // 212 → NY
    fallbackTimezone: "America/Los_Angeles",
    now: nowLA10am,
  });
  // 10:00 LA is open hours; if the override didn't take effect, evaluating
  // in NY (13:00 ET) would also be open. We pick a case where the two zones
  // disagree: 06:00 LA = 09:00 ET. 06:00 LA is quiet (before 8am); 09:00 ET
  // is open (Mon).
  const nowLA6am = makeLocalNow({
    timezone: "America/Los_Angeles",
    weekday: "Mon",
    hour: 6,
  });
  const quietAtLA6 = isQuietHour({
    phoneE164: "+12125550100",
    fallbackTimezone: "America/Los_Angeles",
    now: nowLA6am,
  });
  assert.equal(nyQuiet, false, "LA 10:00 with LA override → open");
  assert.equal(quietAtLA6, true, "Mon LA 06:00 with LA override → quiet (would be open in NY)");
}

// ── 8. respectSundayMorning=false collapses Sunday rule ───────────────
{
  // Sun 09:00 ET — normally quiet (Sunday extension), but with
  // respectSundayMorning=false, the weekday rule applies (8am end), so
  // 09:00 should be open.
  const now = makeLocalNow({
    timezone: "America/New_York",
    weekday: "Sun",
    hour: 9,
  });
  const quietWithSunday = isQuietHour({
    phoneE164: "+12125550100",
    now,
  });
  const quietWithoutSunday = isQuietHour({
    phoneE164: "+12125550100",
    respectSundayMorning: false,
    now,
  });
  assert.equal(quietWithSunday, true, "Sun 09:00 ET default → quiet");
  assert.equal(
    quietWithoutSunday,
    false,
    "Sun 09:00 ET with respectSundayMorning=false → open",
  );
}

// ── 9. holdUntilNextWindow returns ~now when window is open ───────────
{
  const now = makeLocalNow({
    timezone: "America/New_York",
    weekday: "Tue",
    hour: 14,
  });
  const hold = holdUntilNextWindow({
    phoneE164: "+12125550100",
    now,
  });
  assert.equal(
    hold.getTime(),
    now.getTime(),
    "open window → hold returns now",
  );
}

// ── 10. holdUntilNextWindow returns a future Date when window closed ──
{
  // Mon 23:00 ET → quiet. Next opening is Tue 08:00 ET (~9 hours later).
  const now = makeLocalNow({
    timezone: "America/New_York",
    weekday: "Mon",
    hour: 23,
  });
  const hold = holdUntilNextWindow({
    phoneE164: "+12125550100",
    now,
  });
  const diffMs = hold.getTime() - now.getTime();
  // Allow for DST / hour rounding — should be ~9h give or take an hour.
  assert.ok(
    diffMs >= 8 * 60 * 60 * 1000 && diffMs <= 10 * 60 * 60 * 1000,
    `Mon 23:00 ET → next window in ~9h (got ${diffMs}ms)`,
  );
}

// ── done ──────────────────────────────────────────────────────────────
// eslint-disable-next-line no-console
console.log("smsQuietHours.test.ts — all 10 cases passed");
