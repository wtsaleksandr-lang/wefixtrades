/**
 * Deliberate-failure failover test — proves the shared `chat()` engine
 * cascades to a BACKUP provider when the Anthropic primary is unavailable,
 * WITHOUT needing a live provider or DATABASE_URL.
 *
 * Why this matters: the QuoteQuick portal free-tools (review-reply +
 * quote-writer) were migrated from a direct Anthropic-only call to the shared
 * `chat()` engine specifically so a single-provider outage degrades
 * gracefully (backup provider answers) instead of hard-failing the customer
 * with a 502. This test is the proof that the cascade actually triggers.
 *
 * How the failure is injected (no live backend):
 *   1. ANTHROPIC_API_KEY is cleared → `chat()` takes its `!anthropicKeyPresent()`
 *      branch and SKIPS Anthropic entirely, dropping straight into
 *      runTextFallbackChain (see aiService.ts ~334 `hasAnthropic` + ~547).
 *   2. OPENAI_API_KEY is set → OpenAI becomes the first READY provider in the
 *      cascade, so the chain will attempt it first.
 *   3. We monkeypatch `Completions.prototype.create` on the `openai` SDK — the
 *      exact method the chain reaches via `client.chat.completions.create(...)`
 *      (clientFor → new OpenAI(...).chat.completions). The stub RESOLVES a
 *      known sentinel string in the OpenAI response shape. This is a clean
 *      module-boundary injection: no production code change is needed, and it
 *      covers the chain's lazily-cached client too (the patch is on the shared
 *      prototype, not a per-instance property).
 *
 * Assertion: `chat({...})` returns the sentinel → "Anthropic unavailable →
 * backup provider answers." We also assert the pure exported helpers
 * (readyFallbackProviders / resolveOrder via readyFallbackProviders) gate on
 * key presence, and that NoAIProviderError is thrown when NOTHING is ready.
 *
 * Pure-Node spec (no page) — follows the harness style of
 * tests/audit/server-agent-loop.spec.ts.
 */

// MUST be first: sets a dummy DATABASE_URL before server/db.ts is evaluated
// (the chat() import below transitively pulls server/db, which throws at
// module-eval time when DATABASE_URL is unset — as it is in the audit CI).
import './_failover-env-setup';

import { test, expect } from '@playwright/test';
import OpenAI from 'openai';
import { chat, NoAIProviderError } from '../../server/services/aiService';
import { readyFallbackProviders } from '../../server/services/llmFallbackChain';

/* ── Env snapshot / restore so we never leak mutated keys across specs ── */
const ENV_KEYS = [
  'ANTHROPIC_API_KEY',
  'OPENAI_API_KEY',
  'AI_INTEGRATIONS_OPENAI_API_KEY',
  'GROQ_API_KEY',
  'TOGETHER_API_KEY',
  'MISTRAL_API_KEY',
  'DEEPSEEK_API_KEY',
  'XAI_API_KEY',
  'GROK_API_KEY',
  'AI_FALLBACK_CHAIN',
];

let savedEnv: Record<string, string | undefined>;
let origCreate: any;
let CompletionsProto: any;

function clearAllProviderKeys() {
  for (const k of ENV_KEYS) delete process.env[k];
}

test.beforeEach(() => {
  savedEnv = {};
  for (const k of ENV_KEYS) savedEnv[k] = process.env[k];
  // Capture the SDK Completions prototype + original create so we can stub +
  // restore at the exact boundary the fallback chain calls into.
  const probe = new OpenAI({ apiKey: 'probe' });
  CompletionsProto = Object.getPrototypeOf((probe as any).chat.completions);
  origCreate = CompletionsProto.create;
});

test.afterEach(() => {
  // Restore env exactly as it was.
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
  // Restore the SDK method.
  if (origCreate) CompletionsProto.create = origCreate;
});

test.describe('server — shared chat() multi-provider failover', () => {
  test('Anthropic absent → backup provider (OpenAI) answers with the sentinel', async () => {
    const SENTINEL = 'FAILOVER-OK::backup-provider-answered-42';

    // (1) Anthropic key ABSENT → chat() skips Anthropic, drops to the chain.
    clearAllProviderKeys();
    // (2) A backup provider key IS present → OpenAI is the first ready provider.
    process.env.OPENAI_API_KEY = 'sk-test-openai-key';

    // (3) Stub the chain's actual provider call at the SDK boundary.
    let chainCalled = false;
    let sawModel: string | undefined;
    CompletionsProto.create = async function (params: any) {
      chainCalled = true;
      sawModel = params?.model;
      return {
        choices: [{ message: { role: 'assistant', content: SENTINEL } }],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      };
    };

    const result = await chat({
      system: 'You are a test assistant.',
      messages: [{ role: 'user', content: 'ping' }],
      maxTokens: 64,
      modelOverride: 'claude-haiku-4-5-20251001',
      // NOTE: deliberately NO `surface` — mirrors how the QuoteQuick portal
      // routes call chat() (they use the QuoteQuick budget system, not the
      // ai_system_gates surface table). Surface-less = no DB touch here.
    });

    // The proof: with Anthropic unavailable, a backup provider served the call.
    expect(chainCalled).toBe(true);
    expect(result).toBe(SENTINEL);
    // The chain requested OpenAI's configured model (not the Anthropic model).
    expect(sawModel).toBeTruthy();
    expect(sawModel).not.toContain('claude');
  });

  test('readyFallbackProviders() gates strictly on key presence + order', async () => {
    clearAllProviderKeys();
    // No keys → nothing ready.
    expect(readyFallbackProviders()).toEqual([]);

    // Only Groq + OpenAI keys present → only those two are ready, in default
    // cascade order (openai before groq).
    process.env.OPENAI_API_KEY = 'sk-openai';
    process.env.GROQ_API_KEY = 'gsk-groq';
    expect(readyFallbackProviders()).toEqual(['openai', 'groq']);

    // AI_FALLBACK_CHAIN reorders the cascade and prunes unlisted providers.
    process.env.AI_FALLBACK_CHAIN = 'groq,openai';
    expect(readyFallbackProviders()).toEqual(['groq', 'openai']);
  });

  test('no provider at all (Anthropic absent + no fallback key) → NoAIProviderError', async () => {
    clearAllProviderKeys(); // nothing ready anywhere

    await expect(
      chat({
        system: 'sys',
        messages: [{ role: 'user', content: 'hi' }],
        maxTokens: 32,
        modelOverride: 'claude-haiku-4-5-20251001',
      }),
    ).rejects.toBeInstanceOf(NoAIProviderError);
  });
});
