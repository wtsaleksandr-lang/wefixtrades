/**
 * Rate limiter with pluggable backend.
 *
 * Current: in-memory Map (single-server).
 * To switch to Redis: replace MemoryRateLimitStore with a RedisRateLimitStore
 * that uses INCR + EXPIRE commands. The RateLimiter class stays the same.
 *
 * Redis migration checklist:
 *   1. Install ioredis: npm i ioredis
 *   2. Create RedisRateLimitStore implementing RateLimitStore
 *   3. Use Redis INCR with EX (or MULTI/EXEC for atomic window)
 *   4. Pass RedisRateLimitStore to new RateLimiter() instead of MemoryRateLimitStore
 *   5. Remove the cleanup interval (Redis TTL handles expiry)
 */

/* ─── Store interface ─── */
export interface RateLimitStore {
  /** Increment the counter for a key. Returns the new count. */
  increment(key: string, windowMs: number): Promise<number>;
  /** Optional cleanup (for in-memory stores). */
  cleanup?(): void;
}

/* ─── In-memory store (current default) ─── */
export class MemoryRateLimitStore implements RateLimitStore {
  private map = new Map<string, { count: number; resetAt: number }>();
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    // Auto-cleanup stale entries every 5 minutes
    this.cleanupTimer = setInterval(() => this.cleanup(), 5 * 60_000);
  }

  async increment(key: string, windowMs: number): Promise<number> {
    const now = Date.now();
    const entry = this.map.get(key);
    if (!entry || now > entry.resetAt) {
      this.map.set(key, { count: 1, resetAt: now + windowMs });
      return 1;
    }
    entry.count++;
    return entry.count;
  }

  cleanup(): void {
    const now = Date.now();
    for (const [key, val] of Array.from(this.map)) {
      if (now > val.resetAt) this.map.delete(key);
    }
  }

  destroy(): void {
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
  }
}

/* ─── Rate limiter ─── */
export class RateLimiter {
  constructor(
    private store: RateLimitStore,
    private maxRequests: number,
    private windowMs: number,
  ) {}

  async check(key: string): Promise<boolean> {
    const count = await this.store.increment(key, this.windowMs);
    return count <= this.maxRequests;
  }
}

/* ─── Default singleton for chat endpoints ─── */
const defaultStore = new MemoryRateLimitStore();

export const chatRateLimiter = new RateLimiter(
  defaultStore,
  20,       // max requests per minute per user/IP
  60_000,   // per 1-minute window
);

/** Rate limiter for auth endpoints (login, forgot-password, reset, password change). */
export const authRateLimiter = new RateLimiter(
  defaultStore,
  10,        // max attempts
  15 * 60_000, // per 15-minute window
);

/**
 * Sprint 8 — portal review actions (approve / request-changes / reject).
 * Per-client cap; protects against a compromised portal token spamming
 * decisions and burning admin notification emails.
 */
export const portalReviewRateLimiter = new RateLimiter(
  defaultStore,
  30,       // max actions
  60_000,   // per 1-minute window
);

/** Rate limiter for AI chat endpoints (/api/ai/*). 20 req/min per IP. */
export const aiChatRateLimiter = new RateLimiter(
  defaultStore,
  20,
  60_000,
);

/* ───────────────────────────────────────────────────────────────────────────
 * Wave WAI — anonymous QuoteQuick wizard AI limiters.
 *
 * The wizard AI assistant (chat / formula-help / image-to-template) is now
 * fully anonymous + free (matches "all wizard features free"). Anonymous LLM
 * access is a real cost/abuse surface, so anonymous callers are bounded by a
 * strict per-IP rate limit *and* a per-IP daily cap. There is no DB budget row
 * for an anonymous visitor (the budget service is keyed on a numeric user id),
 * so these limiters ARE the anonymous spend ceiling — keep them conservative.
 *
 * Logged-in callers keep the existing per-user budget caps (DB-backed) and are
 * NOT subject to these anon limiters; the routes key the limiter on userId when
 * present and on req.ip only when the caller is anonymous.
 *
 * All counts are env-overridable so we can tune without a redeploy.
 * ──────────────────────────────────────────────────────────────────────────*/

/** Parse a positive-integer env override, falling back to `dflt`. */
function envInt(name: string, dflt: number): number {
  const raw = process.env[name];
  if (!raw) return dflt;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : dflt;
}

const DAY_MS = 24 * 60 * 60_000;

/** Anonymous wizard chat / formula-help — per-IP per-minute burst cap. */
export const anonWizardAiPerMinLimiter = new RateLimiter(
  defaultStore,
  envInt("ANON_WIZARD_AI_PER_MIN", 10), // ~10 AI messages / minute / IP
  60_000,
);

/** Anonymous wizard chat / formula-help — per-IP per-day cap. The hard
 *  anonymous spend ceiling: an anonymous IP can send at most this many AI
 *  messages in a rolling 24h window. */
export const anonWizardAiPerDayLimiter = new RateLimiter(
  defaultStore,
  envInt("ANON_WIZARD_AI_PER_DAY", 50), // ~50 AI messages / day / IP
  DAY_MS,
);

/** Anonymous image-to-template (vision — the most expensive call) — per-IP
 *  per-minute cap. Strictly tighter than text so a single IP can't pump
 *  vision calls. */
export const anonImageToTemplatePerMinLimiter = new RateLimiter(
  defaultStore,
  envInt("ANON_IMG2TMPL_PER_MIN", 2), // 2 vision calls / minute / IP
  60_000,
);

/** Anonymous image-to-template — per-IP per-day cap. The hard anonymous
 *  vision-spend ceiling. */
export const anonImageToTemplatePerDayLimiter = new RateLimiter(
  defaultStore,
  envInt("ANON_IMG2TMPL_PER_DAY", 10), // 10 vision calls / day / IP
  DAY_MS,
);

/**
 * Per-user cap for the QuoteQuick portal AI free-tools — AI Quote Writer
 * (POST /api/portal/free-tools/quote-writer) and AI Review Responder
 * (POST /api/portal/free-tools/review-reply). Each call is a real (metered)
 * Haiku generation that also counts against the user's AI budget; 10/min/user
 * is generous for interactive drafting while bounding a scripted loop.
 */
export const portalAiToolRateLimiter = new RateLimiter(
  defaultStore,
  10,
  60_000,
);

/**
 * Per-calculator cap for the QuoteQuick Integrations "Send test" button
 * (POST /api/calculators/integrations/test). Each call makes a real outbound
 * POST to the owner's configured URL; 10/min/calculator is generous for
 * interactive testing while bounding a loop that could be used to bounce
 * traffic off our server.
 */
export const webhookTestRateLimiter = new RateLimiter(
  defaultStore,
  10,
  60_000,
);

/**
 * Per-user cap for mobile voice transcription (/api/mobile/ai/transcribe).
 *
 * Whisper costs ~$0.006/min — at 30 transcripts/hr/user that's roughly
 * $0.18/hr/user even in worst-case full-length clips, which is well
 * within the AI cost envelope while still letting a real user dictate
 * many short messages back-to-back. The 1-hour window matches OpenAI's
 * own usage-tracking granularity.
 */
export const voiceTranscribeRateLimiter = new RateLimiter(
  defaultStore,
  30,             // max transcriptions per user
  60 * 60_000,    // per 1-hour window
);

/**
 * BF-5 — Per-user cap on the image-to-template endpoint
 * (POST /api/ai/wizard/image-to-template). Vision calls are
 * substantially more expensive than text calls (≈3-6× input
 * tokens once the image is encoded), and the wizard owner needs
 * exactly a handful of attempts to dial in a calculator from an
 * invoice screenshot — not dozens. 5 / hour / user is the spec.
 */
export const imageToTemplateRateLimiter = new RateLimiter(
  defaultStore,
  5,
  60 * 60_000,
);

/**
 * Per-user-id dedupe for password-reset emails.
 *
 * Two clicks of "forgot password" within 60s should not mint two valid
 * tokens — that confuses customers ("which link do I use?") and burns
 * inbox real estate. With max=1 per 60s the second call silently
 * succeeds without re-sending; the existing reset email + token is
 * still valid (1h TTL) so the customer can use it.
 *
 * Separate from authRateLimiter (which is IP-keyed, 10/15min). Both
 * apply: IP-keyed protects against scrapers, user-keyed dedupes
 * legitimate double-clicks.
 */
export const passwordResetDedupeLimiter = new RateLimiter(
  defaultStore,
  1,
  60_000,
);

/**
 * Per-user-id dedupe for magic-link sign-in emails. Same rationale as
 * passwordResetDedupeLimiter — prevent two valid magic-link tokens
 * landing in the inbox from one double-click.
 */
export const magicLinkDedupeLimiter = new RateLimiter(
  defaultStore,
  1,
  60_000,
);

/**
 * Per-admin cap on the outbound scrape endpoint
 * (POST /api/admin/outbound/scrape). Each scrape costs real Outscraper
 * credits (~$0.005-0.05 per lead, plan-dependent) and a botched query
 * can burn through hundreds of credits in seconds. 5 / hour / admin
 * gives plenty of headroom for legitimate use while bounding accidents.
 */
export const outboundScrapeRateLimiter = new RateLimiter(
  defaultStore,
  5,
  60 * 60_000,
);

/**
 * PR #724 P1 — public lead-submission endpoint (POST /api/leads).
 *
 * Two layers, both keyed unauthenticated (this is a fully public endpoint):
 *   - `leadsSubmissionRateLimiter`  → per-IP × per-calculator, 20 / hour.
 *     Bounds a single bot pounding one calculator while still letting
 *     a contractor's whole office submit a few legit quotes in a row.
 *   - `leadsIpRateLimiter`          → per-IP only, 60 / hour across all
 *     calculators. Catches a bot rotating through many calculator_ids
 *     from the same IP, which the per-calc limiter alone would miss.
 *
 * Both must pass for the request to proceed. Window is fixed
 * (not sliding) — exact accuracy isn't needed for spam control.
 */
export const leadsSubmissionRateLimiter = new RateLimiter(
  defaultStore,
  20,
  60 * 60_000,
);

export const leadsIpRateLimiter = new RateLimiter(
  defaultStore,
  60,
  60 * 60_000,
);

/**
 * Window length (ms) used to compute the `Retry-After` header when
 * the leads limiter rejects. Exported so the route can stay in sync
 * with the constants above without re-deriving them.
 */
export const LEADS_RATE_LIMIT_WINDOW_MS = 60 * 60_000;

/**
 * Public free-audit endpoints (POST /api/audit/generate and the other
 * public write routes). This is a no-login endpoint that spends real
 * Outscraper + DataForSEO + Anthropic credits on every call, so an
 * unthrottled bot could burn through credits fast. 5 /generate per IP
 * per 10 minutes is plenty for a human running a few audits while
 * bounding abuse / runaway cost.
 */
export const AUDIT_GENERATE_RATE_LIMIT_WINDOW_MS = 10 * 60_000;

export const auditGenerateRateLimiter = new RateLimiter(
  defaultStore,
  5,
  AUDIT_GENERATE_RATE_LIMIT_WINDOW_MS,
);

/** Broader per-IP cap for the other public audit write routes (chat,
 *  save-lead, send-email). 30 / 10 min — generous for a real session,
 *  tight enough to stop a spam loop. */
export const auditWriteRateLimiter = new RateLimiter(
  defaultStore,
  30,
  AUDIT_GENERATE_RATE_LIMIT_WINDOW_MS,
);

/** Public checkout endpoints (Citation Builder, Full Audit Master).
 *  5 sessions / IP / 10 min — generous for a real buyer, tight enough
 *  to stop Stripe-session-creation spam. */
export const publicCheckoutRateLimiter = new RateLimiter(
  defaultStore,
  5,
  AUDIT_GENERATE_RATE_LIMIT_WINDOW_MS,
);

/** Public coupon-validation endpoint (POST /api/calculators/:slug/coupons/validate).
 *  Per-IP, 10 / min — generous for a customer trying codes, tight enough
 *  to prevent brute-force enumeration of active coupon codes. */
export const couponValidateRateLimiter = new RateLimiter(
  defaultStore,
  10,
  60_000,
);

/** Quote snapshot edit/delete endpoints (PATCH/DELETE /api/q/:slug).
 *  Per-IP, 30 / 10 min — generous for a real user editing a quote,
 *  tight enough to bound spam from a compromised edit token. */
export const snapshotMutateRateLimiter = new RateLimiter(
  defaultStore,
  30,
  AUDIT_GENERATE_RATE_LIMIT_WINDOW_MS,
);

/**
 * Inbound email webhook (POST /api/inbound/email/:token). Token-gated, but if
 * the path token ever leaks, an attacker could POST a flood that spawns tickets
 * and burns LLM classifier spend. SendGrid Inbound Parse's legitimate volume is
 * low (a handful of forwarded mails per minute at most), so 60 / min / IP is
 * generous for real traffic while bounding a leaked-token flood. Pairs with the
 * classifier-invocation ceiling in inboundEmailConcierge for defence in depth. */
export const inboundEmailRateLimiter = new RateLimiter(
  defaultStore,
  60,
  60_000,
);

/**
 * Per-sender cap on the brand-line inbound SMS classify path
 * (POST /api/twilio/inbound, no-lead branch). Every signed inbound that
 * doesn't match a lead runs an LLM classifier (Claude Haiku) and may create
 * a support ticket. The matched-lead path already has checkRateLimit; the
 * no-lead branch had none, so a single sender could drive unbounded Haiku
 * spend + unbounded ticket creation. Keyed on the inbound `From` number,
 * 15 / hour is generous for a real prospect texting back-and-forth while
 * bounding a spam/abuse loop. Past the cap we ack Twilio quietly and skip
 * the classify entirely. */
export const brandLineInboundRateLimiter = new RateLimiter(
  defaultStore,
  15,
  60 * 60_000,
);

/**
 * Vapi voice webhooks (POST /api/vapi/webhook and POST /api/vapi/conversation).
 * Both are signature/secret-gated, but a flood of even rejected requests (or a
 * replayed signed payload) burns CPU + LLM spend, and per-call duration caps
 * don't bound aggregate volume. 120 / min keyed on IP and/or call.id is an
 * order of magnitude above real Vapi traffic while blunting a flood. */
export const vapiRateLimiter = new RateLimiter(
  defaultStore,
  120,
  60_000,
);

/**
 * PRICING-MODELS U1 — public distance-resolve endpoint
 * (POST /api/quote-widget/distance). Every uncached call is a billed Google
 * Distance Matrix element (~½¢), so two layers bound the spend:
 *   - `distanceResolvePerMinLimiter`        → per-IP, 10 / min. Bounds a
 *     single client hammering the endpoint (incl. cache-hit floods).
 *   - `distanceResolvePerCalcPerDayLimiter` → per-calculator, 500 / day.
 *     The per-widget-owner daily Maps budget; cache hits do NOT count
 *     (they cost nothing upstream).
 * Over-cap returns `{ok:false, reason:'quota'}` — the widget soft-fails to
 * its manual "Distance in miles" input, never an error page. Both caps are
 * env-overridable so they can be tuned without a redeploy.
 */
export const distanceResolvePerMinLimiter = new RateLimiter(
  defaultStore,
  envInt("DISTANCE_RESOLVE_PER_MIN", 10),
  60_000,
);

export const distanceResolvePerCalcPerDayLimiter = new RateLimiter(
  defaultStore,
  envInt("DISTANCE_RESOLVE_PER_CALC_PER_DAY", 500),
  DAY_MS,
);

/**
 * PRICING-MODELS U4 — public photo-upload endpoint
 * (POST /api/quote-widget/upload). Anonymous buyers attach job photos from
 * the embedded widget; every accepted upload writes up to 8 MB to
 * data/uploads/lead-photos, so two per-IP layers bound disk abuse:
 *   - `photoUploadPerMinLimiter` → per-IP, 5 / min. Bounds a single client
 *     hammering the endpoint (a real buyer uploads at most maxPhotos ≤ 5
 *     per quote, so 5/min is generous for legitimate use).
 *   - `photoUploadPerDayLimiter` → per-IP, 30 / day. The hard per-IP disk
 *     budget (~240 MB/day worst case). Only requests that pass validation
 *     consume it — rejected junk can't starve a buyer's real photos.
 * Over-cap returns 429 {ok:false, reason:'quota'} — the widget shows a retry
 * badge on the tile and the quote submit NEVER blocks on photos. Both caps
 * are env-overridable so they can be tuned without a redeploy.
 */
export const photoUploadPerMinLimiter = new RateLimiter(
  defaultStore,
  envInt("QUOTE_PHOTO_UPLOAD_PER_MIN", 5),
  60_000,
);

export const photoUploadPerDayLimiter = new RateLimiter(
  defaultStore,
  envInt("QUOTE_PHOTO_UPLOAD_PER_DAY", 30),
  DAY_MS,
);

/**
 * AI-assistant free activation — per-calculator daily CONVERSATION cap for the
 * customer widget assistant (POST /api/ai/client-chat). Counted at conversation
 * START only (first user message) so a mid-chat customer is never cut off.
 * Bypass bounded by per-IP limits + 25¢/conversation cap + surface budget.
 * Env-overridable so it can be tuned without a redeploy.
 */
export const widgetAiConvsPerCalcPerDayLimiter = new RateLimiter(
  defaultStore,
  envInt("WIDGET_AI_CONVS_PER_CALC_PER_DAY", 50),
  DAY_MS,
);
