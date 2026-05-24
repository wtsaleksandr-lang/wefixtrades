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
