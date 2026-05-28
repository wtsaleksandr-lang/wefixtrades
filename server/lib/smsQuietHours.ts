/**
 * SMS quiet-hours gate (Wave 79 — W-SMS-7).
 *
 * Per the TCPA / CTIA guidance the U.S. carriers operationalize, marketing
 * and reminder SMS messages must NOT be delivered to a homeowner outside
 * 8:00 – 21:00 local time. Sunday morning sends are softer-blocked until
 * 10:00 local to avoid the "Sunday-morning sales-text" pattern carriers
 * use as a flag against A2P campaigns.
 *
 * Transactional sends (booking confirmation immediately after the booking
 * was just made, two-factor codes, etc.) are exempt — callers pass
 * `quietHoursBypass: 'transactional'` when calling `sendSmsAsClient`.
 *
 * The dispatcher in `server/services/notifications/dispatch.ts` honors
 * the per-customer `notification_quiet_hours` window from `clients.metadata`
 * for Wave 32 universal notifications. This helper is the equivalent gate
 * for the per-product homeowner workers (BookFlow T-24h, ReviewRequest,
 * ReviewFollowup, TradeLine after-hours, follow-up worker) that don't
 * route through the Wave 32 dispatcher.
 *
 * Pure functions, no side effects, easy to unit-test. We deliberately
 * AVOID importing the shared logger here — it transitively pulls in
 * Sentry / OpenTelemetry, which would block the unit-test runtime from
 * loading this module standalone (matches the Wave 6.5 serpOrchestrator
 * test pattern). Errors from the helper are logged inline via console.warn
 * — this is a leaf utility and never the primary log line of any flow.
 */
function logQuietHourWarn(msg: string, ctx: Record<string, unknown>): void {
  // eslint-disable-next-line no-console
  console.warn(`[sms-quiet-hours] ${msg}`, ctx);
}

/** Quiet window bounds — overridable via env for ops tuning. */
const DEFAULT_QUIET_START_HOUR = Number.parseInt(
  process.env.SMS_QUIET_HOURS_START ?? "21",
  10,
);
const DEFAULT_QUIET_END_HOUR = Number.parseInt(
  process.env.SMS_QUIET_HOURS_END ?? "8",
  10,
);
const DEFAULT_SUNDAY_END_HOUR = Number.parseInt(
  process.env.SMS_QUIET_HOURS_SUNDAY_END ?? "10",
  10,
);
const DEFAULT_TZ = process.env.SMS_QUIET_HOURS_DEFAULT_TZ ?? "America/New_York";

/**
 * Static NANP area-code → IANA timezone map. Best-effort; the trade's
 * configured business timezone (when known) always wins via `fallbackTimezone`.
 * Numbers without a known mapping fall back to America/New_York.
 *
 * Covers the most-frequent area codes our customer base lands on (US +
 * common Canadian zones). Not exhaustive — A2P carriers themselves use
 * the wireline LATA, not the area code; this approximation is enough to
 * keep an Eastern-time homeowner from getting a 6 a.m. text because the
 * trade is on the Pacific coast.
 */
const AREA_CODE_TZ: Readonly<Record<string, string>> = {
  // Eastern
  "201": "America/New_York", "202": "America/New_York", "203": "America/New_York",
  "207": "America/New_York", "212": "America/New_York", "215": "America/New_York",
  "216": "America/New_York", "240": "America/New_York", "267": "America/New_York",
  "301": "America/New_York", "302": "America/New_York", "304": "America/New_York",
  "305": "America/New_York", "315": "America/New_York", "321": "America/New_York",
  "330": "America/New_York", "347": "America/New_York", "351": "America/New_York",
  "352": "America/New_York", "386": "America/New_York", "401": "America/New_York",
  "404": "America/New_York", "407": "America/New_York", "410": "America/New_York",
  "412": "America/New_York", "413": "America/New_York", "419": "America/New_York",
  "443": "America/New_York", "470": "America/New_York", "475": "America/New_York",
  "478": "America/New_York", "484": "America/New_York", "508": "America/New_York",
  "513": "America/New_York", "516": "America/New_York", "518": "America/New_York",
  "540": "America/New_York", "551": "America/New_York", "561": "America/New_York",
  "567": "America/New_York", "570": "America/New_York", "571": "America/New_York",
  "585": "America/New_York", "603": "America/New_York", "607": "America/New_York",
  "609": "America/New_York", "610": "America/New_York", "614": "America/New_York",
  "617": "America/New_York", "631": "America/New_York", "646": "America/New_York",
  "678": "America/New_York", "703": "America/New_York", "704": "America/New_York",
  "716": "America/New_York", "717": "America/New_York", "718": "America/New_York",
  "724": "America/New_York", "732": "America/New_York", "740": "America/New_York",
  "754": "America/New_York", "757": "America/New_York", "770": "America/New_York",
  "772": "America/New_York", "774": "America/New_York", "781": "America/New_York",
  "786": "America/New_York", "804": "America/New_York", "813": "America/New_York",
  "814": "America/New_York", "843": "America/New_York", "845": "America/New_York",
  "848": "America/New_York", "856": "America/New_York", "857": "America/New_York",
  "860": "America/New_York", "862": "America/New_York", "863": "America/New_York",
  "904": "America/New_York", "908": "America/New_York", "910": "America/New_York",
  "912": "America/New_York", "914": "America/New_York", "917": "America/New_York",
  "919": "America/New_York", "929": "America/New_York", "934": "America/New_York",
  "937": "America/New_York", "954": "America/New_York", "959": "America/New_York",
  "973": "America/New_York", "978": "America/New_York", "980": "America/New_York",
  "984": "America/New_York",
  // Central
  "205": "America/Chicago", "210": "America/Chicago", "214": "America/Chicago",
  "217": "America/Chicago", "218": "America/Chicago", "224": "America/Chicago",
  "225": "America/Chicago", "228": "America/Chicago", "231": "America/Chicago",
  "239": "America/Chicago", "251": "America/Chicago", "254": "America/Chicago",
  "262": "America/Chicago", "270": "America/Chicago", "281": "America/Chicago",
  "309": "America/Chicago", "312": "America/Chicago", "314": "America/Chicago",
  "316": "America/Chicago", "317": "America/Chicago", "318": "America/Chicago",
  "319": "America/Chicago", "320": "America/Chicago", "331": "America/Chicago",
  "334": "America/Chicago", "337": "America/Chicago", "346": "America/Chicago",
  "361": "America/Chicago", "402": "America/Chicago", "405": "America/Chicago",
  "409": "America/Chicago", "414": "America/Chicago", "417": "America/Chicago",
  "423": "America/Chicago", "430": "America/Chicago", "432": "America/Chicago",
  "456": "America/Chicago", "469": "America/Chicago", "501": "America/Chicago",
  "502": "America/Chicago", "504": "America/Chicago", "507": "America/Chicago",
  "512": "America/Chicago", "515": "America/Chicago", "563": "America/Chicago",
  "573": "America/Chicago", "601": "America/Chicago", "608": "America/Chicago",
  "615": "America/Chicago", "618": "America/Chicago", "620": "America/Chicago",
  "636": "America/Chicago", "651": "America/Chicago", "660": "America/Chicago",
  "662": "America/Chicago", "682": "America/Chicago", "713": "America/Chicago",
  "731": "America/Chicago", "763": "America/Chicago", "769": "America/Chicago",
  "773": "America/Chicago", "779": "America/Chicago", "785": "America/Chicago",
  "806": "America/Chicago", "815": "America/Chicago", "816": "America/Chicago",
  "817": "America/Chicago", "830": "America/Chicago", "832": "America/Chicago",
  "847": "America/Chicago", "870": "America/Chicago", "872": "America/Chicago",
  "901": "America/Chicago", "903": "America/Chicago", "913": "America/Chicago",
  "915": "America/Chicago", "918": "America/Chicago", "920": "America/Chicago",
  "931": "America/Chicago", "936": "America/Chicago", "940": "America/Chicago",
  "952": "America/Chicago", "956": "America/Chicago", "972": "America/Chicago",
  "979": "America/Chicago",
  // Mountain
  "208": "America/Boise", "303": "America/Denver", "307": "America/Denver",
  "385": "America/Denver", "406": "America/Denver", "435": "America/Denver",
  "480": "America/Phoenix", "505": "America/Denver", "520": "America/Phoenix",
  "575": "America/Denver", "602": "America/Phoenix", "623": "America/Phoenix",
  "719": "America/Denver", "720": "America/Denver", "801": "America/Denver",
  "928": "America/Phoenix", "970": "America/Denver",
  // Pacific
  "206": "America/Los_Angeles", "209": "America/Los_Angeles", "213": "America/Los_Angeles",
  "253": "America/Los_Angeles", "310": "America/Los_Angeles", "323": "America/Los_Angeles",
  "341": "America/Los_Angeles", "360": "America/Los_Angeles", "408": "America/Los_Angeles",
  "415": "America/Los_Angeles", "424": "America/Los_Angeles", "425": "America/Los_Angeles",
  "442": "America/Los_Angeles", "458": "America/Los_Angeles", "503": "America/Los_Angeles",
  "509": "America/Los_Angeles", "510": "America/Los_Angeles", "530": "America/Los_Angeles",
  "541": "America/Los_Angeles", "559": "America/Los_Angeles", "562": "America/Los_Angeles",
  "619": "America/Los_Angeles", "626": "America/Los_Angeles", "650": "America/Los_Angeles",
  "657": "America/Los_Angeles", "661": "America/Los_Angeles", "669": "America/Los_Angeles",
  "707": "America/Los_Angeles", "714": "America/Los_Angeles", "725": "America/Los_Angeles",
  "747": "America/Los_Angeles", "760": "America/Los_Angeles", "775": "America/Los_Angeles",
  "805": "America/Los_Angeles", "818": "America/Los_Angeles", "820": "America/Los_Angeles",
  "831": "America/Los_Angeles", "858": "America/Los_Angeles", "909": "America/Los_Angeles",
  "916": "America/Los_Angeles", "925": "America/Los_Angeles", "949": "America/Los_Angeles",
  "951": "America/Los_Angeles", "971": "America/Los_Angeles",
  // Alaska / Hawaii
  "907": "America/Anchorage", "808": "Pacific/Honolulu",
  // Canada (common)
  "204": "America/Winnipeg", "226": "America/Toronto", "236": "America/Vancouver",
  "249": "America/Toronto", "250": "America/Vancouver", "289": "America/Toronto",
  "306": "America/Regina", "343": "America/Toronto", "365": "America/Toronto",
  "403": "America/Edmonton", "416": "America/Toronto", "418": "America/Toronto",
  "431": "America/Winnipeg", "437": "America/Toronto", "438": "America/Toronto",
  "450": "America/Toronto", "506": "America/Halifax", "514": "America/Toronto",
  "519": "America/Toronto", "548": "America/Toronto", "579": "America/Toronto",
  "581": "America/Toronto", "587": "America/Edmonton", "604": "America/Vancouver",
  "613": "America/Toronto", "639": "America/Regina", "647": "America/Toronto",
  "672": "America/Vancouver", "705": "America/Toronto", "709": "America/St_Johns",
  "742": "America/Toronto", "778": "America/Vancouver", "780": "America/Edmonton",
  "782": "America/Halifax", "807": "America/Toronto", "819": "America/Toronto",
  "825": "America/Edmonton", "867": "America/Whitehorse", "873": "America/Toronto",
  "902": "America/Halifax", "905": "America/Toronto",
};

/**
 * Best-effort area-code → IANA timezone. Returns null when the phone
 * isn't NANP-shaped or the area code isn't in the static map. Callers
 * should fall back to the trade's configured business timezone or
 * `America/New_York`.
 */
export function timezoneFromPhone(phoneE164: string): string | null {
  if (!phoneE164) return null;
  const digits = phoneE164.replace(/\D/g, "");
  // NANP: country code 1, 10 NSN digits. Accept both +1NPANXXXXXX and
  // bare NPANXXXXXX. Reject lengths that can't be NANP.
  let nsn = digits;
  if (digits.length === 11 && digits.startsWith("1")) nsn = digits.slice(1);
  if (nsn.length !== 10) return null;
  const area = nsn.slice(0, 3);
  return AREA_CODE_TZ[area] ?? null;
}

export interface IsQuietHourArgs {
  /** Recipient phone in E.164 or any format we can normalize. */
  phoneE164: string;
  /** Trade's configured business timezone (overrides area-code lookup). */
  fallbackTimezone?: string | null;
  /** When true, Sunday quiet-hours run to 10:00 local. Default true. */
  respectSundayMorning?: boolean;
  /** Override "now" for tests. */
  now?: Date;
}

/**
 * Resolve the timezone we'll evaluate quiet-hours in:
 *   1. `fallbackTimezone` (when caller explicitly passes one, e.g. the
 *      trade's business hours timezone)
 *   2. NANP area-code lookup
 *   3. America/New_York
 */
function resolveTimezone(args: IsQuietHourArgs): string {
  if (args.fallbackTimezone) return args.fallbackTimezone;
  return timezoneFromPhone(args.phoneE164) ?? DEFAULT_TZ;
}

interface LocalParts {
  hour: number;
  minute: number;
  weekday: number; // 0 = Sun, 6 = Sat
}

function localParts(now: Date, timeZone: string): LocalParts {
  // `formatToParts` with weekday=short gives us a stable token we can map.
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hour12: false,
  });
  const parts = fmt.formatToParts(now);
  let hh = 0;
  let mm = 0;
  let wd = 0;
  for (const p of parts) {
    if (p.type === "hour") hh = parseInt(p.value, 10) % 24;
    else if (p.type === "minute") mm = parseInt(p.value, 10);
    else if (p.type === "weekday") {
      switch (p.value) {
        case "Sun": wd = 0; break;
        case "Mon": wd = 1; break;
        case "Tue": wd = 2; break;
        case "Wed": wd = 3; break;
        case "Thu": wd = 4; break;
        case "Fri": wd = 5; break;
        case "Sat": wd = 6; break;
      }
    }
  }
  return { hour: hh, minute: mm, weekday: wd };
}

/**
 * Returns true when the current local time at the recipient is inside
 * the SMS quiet-hours window (21:00 – 08:00 weekdays, 21:00 – 10:00
 * Sunday morning). Pure function; safe to call from any worker.
 */
export function isQuietHour(args: IsQuietHourArgs): boolean {
  try {
    const tz = resolveTimezone(args);
    const now = args.now ?? new Date();
    const { hour, weekday } = localParts(now, tz);

    const start = DEFAULT_QUIET_START_HOUR; // e.g. 21
    const weekdayEnd = DEFAULT_QUIET_END_HOUR; // e.g. 8
    const sundayEnd =
      args.respectSundayMorning === false
        ? weekdayEnd
        : DEFAULT_SUNDAY_END_HOUR; // e.g. 10

    // 21:00 → next-day 08:00 wraps midnight. The "Sunday extension" only
    // applies to the MORNING half — i.e. Sunday until sundayEnd. The
    // evening half (Sat 21:00 → Sun 08:00 base) is handled by the
    // weekday rule from Saturday's perspective.
    if (weekday === 0) {
      // Sunday — quiet until sundayEnd OR after start.
      if (hour < sundayEnd) return true;
      if (hour >= start) return true;
      return false;
    }
    // Mon–Sat — quiet until weekdayEnd OR after start.
    if (hour < weekdayEnd) return true;
    if (hour >= start) return true;
    return false;
  } catch (err: any) {
    logQuietHourWarn("quiet-hour evaluation failed; allowing send", {
      err: err?.message,
      phoneE164: args.phoneE164,
    });
    return false; // fail-open — don't drop sends on a bug in this helper
  }
}

/**
 * Returns the next Date at which the window will reopen for this
 * recipient. Useful for workers that want to defer-and-reschedule
 * rather than rely on the natural hourly retry loop.
 */
export function holdUntilNextWindow(args: IsQuietHourArgs): Date {
  const tz = resolveTimezone(args);
  const now = args.now ?? new Date();
  const { hour, weekday } = localParts(now, tz);
  const sundayEnd =
    args.respectSundayMorning === false
      ? DEFAULT_QUIET_END_HOUR
      : DEFAULT_SUNDAY_END_HOUR;
  const weekdayEnd = DEFAULT_QUIET_END_HOUR;
  const start = DEFAULT_QUIET_START_HOUR;

  // If we're not currently quiet, the "next window" is now.
  if (!isQuietHour({ ...args, now })) return new Date(now);

  // Compute target local hour we're holding until.
  let targetHour: number;
  let dayOffset = 0;
  if (weekday === 0 && hour < sundayEnd) {
    // Early Sunday morning — open at sundayEnd today.
    targetHour = sundayEnd;
  } else if (hour < weekdayEnd) {
    // Early weekday morning — open at weekdayEnd today.
    targetHour = weekdayEnd;
  } else {
    // Currently past `start` — open tomorrow morning.
    dayOffset = 1;
    // If tomorrow is Sunday, use the Sunday end-hour.
    targetHour = (weekday === 6) ? sundayEnd : weekdayEnd;
  }

  // We don't try to be exact across DST — approximate by adding hours
  // until we land at the next opening boundary. Workers retry hourly
  // anyway; this is a "don't bother re-running for >N hours" hint.
  const hoursUntilOpen = (24 * dayOffset + targetHour - hour + 24) % 24 || 24;
  return new Date(now.getTime() + hoursUntilOpen * 60 * 60 * 1000);
}

/** Re-export defaults so callers / tests can read the effective config. */
export const __SMS_QUIET_HOURS_CONFIG = {
  startHour: DEFAULT_QUIET_START_HOUR,
  endHour: DEFAULT_QUIET_END_HOUR,
  sundayEndHour: DEFAULT_SUNDAY_END_HOUR,
  defaultTimezone: DEFAULT_TZ,
};
