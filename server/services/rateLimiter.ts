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
    for (const [key, val] of this.map) {
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
  30,       // max requests
  60_000,   // per 1-minute window
);
