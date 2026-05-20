/**
 * Wave K — server-side AI budget enforcement unit tests.
 *
 * Pure-Node tests against the budget service's deterministic surface area
 * (cost calculation, the gate decision function, edge cases). Runs under
 * Playwright but doesn't need a browser — the testFn imports the service
 * directly, runs in Node, and uses Playwright's assertion helpers.
 *
 * The DB-backed paths (read/write/upsert) are covered by the admin-page
 * test which exercises the full HTTP surface against a live server.
 */

import { test, expect } from '@playwright/test';

// Import the pure helpers from the math-only module so the spec doesn't
// pull in server/db (which throws unless DATABASE_URL is set).
import {
  costForUsage, estimateCallCost, gateDecision, utcDayKey,
} from '../../server/services/quotequickAiBudgetMath';
import { DEFAULT_AI_BUDGET_CONFIG } from '../../shared/schemas/quotequickAiBudget';

test.describe('server — quotequickAiBudget cost math', () => {
  test('costForUsage matches the published per-1M token rates', () => {
    // Haiku 4.5: $1.00 input / $5.00 output per 1M tokens.
    // 10K input + 1K output = (10000/1M)*1 + (1000/1M)*5 = 0.01 + 0.005 = $0.015.
    const haiku = costForUsage('claude-haiku-4-5-20251001', 10_000, 1_000);
    expect(haiku).toBeCloseTo(0.015, 6);

    // Sonnet 4.6: $3.00 input / $15.00 output per 1M tokens.
    // 10K + 1K = 0.03 + 0.015 = $0.045.
    const sonnet = costForUsage('claude-sonnet-4-6', 10_000, 1_000);
    expect(sonnet).toBeCloseTo(0.045, 6);
  });

  test('costForUsage falls back to vision-tier pricing for unknown models', () => {
    // Unknown model → use the most-expensive (Sonnet 4.6) pricing so we
    // under-issue rather than over-spend.
    const unknown = costForUsage('claude-future-9-9', 10_000, 1_000);
    const sonnet = costForUsage('claude-sonnet-4-6', 10_000, 1_000);
    expect(unknown).toBeCloseTo(sonnet, 6);
  });

  test('estimateCallCost rounds in the right direction for a small text turn', () => {
    const est = estimateCallCost({
      model: 'claude-haiku-4-5-20251001',
      systemPromptTokens: 3500,
      historyTokens: 200,
      messageTokens: 40,
      hasImage: false,
    });
    // < $0.01 for a small Haiku turn, but > 0.
    expect(est).toBeGreaterThan(0);
    expect(est).toBeLessThan(0.01);
  });

  test('estimateCallCost adds image overhead when hasImage = true', () => {
    const text = estimateCallCost({
      model: 'claude-sonnet-4-6',
      systemPromptTokens: 3500,
      historyTokens: 0,
      messageTokens: 50,
      hasImage: false,
    });
    const withImg = estimateCallCost({
      model: 'claude-sonnet-4-6',
      systemPromptTokens: 3500,
      historyTokens: 0,
      messageTokens: 50,
      hasImage: true,
    });
    expect(withImg).toBeGreaterThan(text);
  });

  test('utcDayKey returns YYYY-MM-DD', () => {
    const key = utcDayKey(new Date('2026-05-19T22:14:00Z'));
    expect(key).toBe('2026-05-19');
  });
});

test.describe('server — quotequickAiBudget gate decisions', () => {
  const snapshot = (over: Partial<{ cumulative_usd: number; today_usd: number; images_used: number }>) => ({
    cumulative_usd: over.cumulative_usd ?? 0.10,
    today_usd: over.today_usd ?? 0.02,
    images_used: over.images_used ?? 0,
    config: { ...DEFAULT_AI_BUDGET_CONFIG },
    scope: 'global' as const,
    tier: 'free' as const,
  });

  test('allows when all checks pass', () => {
    const decision = gateDecision(snapshot({}), 0.01, false);
    expect(decision.allowed).toBe(true);
  });

  test('blocks when cumulative + estimate would exceed cap_lifetime_usd', () => {
    // 0.49 + 0.05 = 0.54 > 0.50 cap → cap_exceeded.
    const decision = gateDecision(snapshot({ cumulative_usd: 0.49 }), 0.05, false);
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) expect(decision.code).toBe('cap_exceeded');
  });

  test('blocks when estimate alone exceeds per_call_max_usd', () => {
    // 0.20 > $0.15 per-call max → per_call_max_exceeded (caught BEFORE cap).
    const decision = gateDecision(snapshot({ cumulative_usd: 0 }), 0.20, false);
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) expect(decision.code).toBe('per_call_max_exceeded');
  });

  test('blocks when today + estimate would exceed daily_ceiling_usd', () => {
    // today 0.19, est 0.05 → 0.24 > 0.20 ceiling.
    const decision = gateDecision(snapshot({ today_usd: 0.19 }), 0.05, false);
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) expect(decision.code).toBe('daily_ceiling_exceeded');
  });

  test('blocks vision call when image count is at the lifetime cap', () => {
    // 10 images already used, 1 more would be 11 > 10 cap.
    const decision = gateDecision(snapshot({ images_used: 10 }), 0.05, true);
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) expect(decision.code).toBe('image_cap_exceeded');
  });

  test('sets the soft-warn flag when cumulative reaches soft_warn_pct of cap', () => {
    // cap = 0.50, soft_warn = 80% → warn at 0.40. cumulative 0.40, est 0.005 → 0.405 ≥ 0.4 → warn=true.
    const decision = gateDecision(snapshot({ cumulative_usd: 0.40 }), 0.005, false);
    expect(decision.allowed).toBe(true);
    if (decision.allowed) expect(decision.warn).toBe(true);
  });

  test('does NOT warn when cumulative is well below the soft-warn threshold', () => {
    const decision = gateDecision(snapshot({ cumulative_usd: 0.05 }), 0.005, false);
    expect(decision.allowed).toBe(true);
    if (decision.allowed) expect(decision.warn).toBe(false);
  });
});
