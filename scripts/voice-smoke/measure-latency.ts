/**
 * Voice latency harness — post-merge smoke for the VOICE_BASE_PRESET
 * turn-detection work (PR #1306). Measures per-turn "caller stopped speaking →
 * assistant started speaking" latency from Vapi's Call API and reports p50/p95
 * against the pass criteria (p50 < 500ms, p95 < 800ms).
 *
 * READ-ONLY: this never changes voice config or places calls — a human places
 * 3–5 test calls, then runs this with the call IDs. See README.md.
 *
 * ── Latency source (field names verified against Vapi docs 2026-06-03) ──
 * PREFERRED — first-class metrics: `call.artifact.performanceMetrics.turnLatencies[]`,
 *   each turn with `endpointingLatency` / `modelLatency` / `voiceLatency` /
 *   `transcriberLatency` / `turnLatency` (ms). Perceived "stop→speak" gap ≈
 *   `turnLatency` (all-in). We report it plus the endpoint/model/voice breakdown.
 * FALLBACK — derive from `call.artifact.messages[]` when performanceMetrics is
 *   absent: pair each `role:"user"` turn with the next `role:"bot"` turn and take
 *   `bot.time − user.endTime` (both epoch ms). `secondsFromStart` is deliberately
 *   NOT used (known epoch-vs-relative bug).
 *
 * Fail-soft: a turn missing a needed field is logged and skipped, not fatal. A
 * call with no usable turns is logged and skipped. Only a run with zero usable
 * turns across all inputs exits non-zero.
 *
 * Usage:
 *   tsx scripts/voice-smoke/measure-latency.ts <callId> [callId...]   # live (needs VAPI_API_KEY)
 *   tsx scripts/voice-smoke/measure-latency.ts --fixture <path.json>  # offline, from saved call JSON
 *   tsx scripts/voice-smoke/measure-latency.ts --selftest             # synthetic fixture, asserts math
 *   ...add --transcript to also print per-turn transcript + gaps (premature-cutoff review aid)
 *   ...add --json to print a machine-readable summary
 */

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const VAPI_API_BASE = "https://api.vapi.ai";
const PASS_P50_MS = 500;
const PASS_P95_MS = 800;

/* ─── Types (only the fields we read) ─── */
interface TurnLatency {
  endpointingLatency?: number;
  modelLatency?: number;
  voiceLatency?: number;
  transcriberLatency?: number;
  turnLatency?: number;
}
interface VapiMessage {
  role?: string;
  message?: string;
  time?: number;
  endTime?: number;
}
interface VapiCall {
  id?: string;
  artifact?: {
    performanceMetrics?: { turnLatencies?: TurnLatency[] };
    messages?: VapiMessage[];
  };
  messages?: VapiMessage[];
}

interface TurnSample {
  callId: string;
  index: number;
  perceivedMs: number;
  source: "performanceMetrics" | "messages";
  breakdown?: { endpointing?: number; model?: number; voice?: number; transcriber?: number };
  userText?: string;
  botText?: string;
  gapMs?: number;
}

const log = {
  info: (m: string) => console.log(m),
  warn: (m: string) => console.warn(`  [warn] ${m}`),
  err: (m: string) => console.error(`  [error] ${m}`),
};

/** Nearest-rank percentile (deterministic; documented in README). */
function percentile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return NaN;
  const rank = Math.ceil((p / 100) * sortedAsc.length);
  return sortedAsc[Math.min(sortedAsc.length, Math.max(1, rank)) - 1];
}

/** Extract per-turn perceived latency from one call. Fail-soft. */
function extractTurns(call: VapiCall): TurnSample[] {
  const callId = call.id ?? "unknown";
  const samples: TurnSample[] = [];

  // PREFERRED: first-class performanceMetrics.
  const tl = call.artifact?.performanceMetrics?.turnLatencies;
  if (Array.isArray(tl) && tl.length > 0) {
    tl.forEach((t, i) => {
      // Perceived stop→speak gap: prefer all-in turnLatency; else sum the parts.
      const perceived =
        typeof t.turnLatency === "number"
          ? t.turnLatency
          : [t.endpointingLatency, t.modelLatency, t.voiceLatency]
              .filter((n): n is number => typeof n === "number")
              .reduce((a, b) => a + b, 0);
      if (!perceived || perceived <= 0) {
        log.warn(`call ${callId} turn ${i}: no usable turnLatency — skipped`);
        return;
      }
      samples.push({
        callId,
        index: i,
        perceivedMs: perceived,
        source: "performanceMetrics",
        breakdown: {
          endpointing: t.endpointingLatency,
          model: t.modelLatency,
          voice: t.voiceLatency,
          transcriber: t.transcriberLatency,
        },
      });
    });
    if (samples.length > 0) return samples;
    log.warn(`call ${callId}: performanceMetrics present but no usable turns — trying messages`);
  }

  // FALLBACK: derive from message timestamps (bot.time − user.endTime).
  const msgs = call.artifact?.messages ?? call.messages;
  if (!Array.isArray(msgs) || msgs.length === 0) {
    log.warn(`call ${callId}: no performanceMetrics and no messages — skipped`);
    return samples;
  }
  let turnIdx = 0;
  for (let i = 0; i < msgs.length - 1; i++) {
    const u = msgs[i];
    if (u.role !== "user") continue;
    // next bot message after this user turn
    const b = msgs.slice(i + 1).find((m) => m.role === "bot");
    if (!b) continue;
    if (typeof u.endTime !== "number" || typeof b.time !== "number") {
      log.warn(`call ${callId}: a user/bot turn is missing endTime/time — skipped`);
      continue;
    }
    const gap = b.time - u.endTime;
    if (gap <= 0 || gap > 60_000) {
      log.warn(`call ${callId}: implausible gap ${gap}ms (turn boundary issue) — skipped`);
      continue;
    }
    samples.push({
      callId,
      index: turnIdx++,
      perceivedMs: gap,
      source: "messages",
      userText: u.message,
      botText: b.message,
      gapMs: gap,
    });
  }
  return samples;
}

async function fetchCall(id: string, apiKey: string): Promise<VapiCall | null> {
  try {
    const r = await fetch(`${VAPI_API_BASE}/call/${encodeURIComponent(id)}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!r.ok) {
      log.err(`GET /call/${id} → ${r.status} ${await r.text().catch(() => "")}`);
      return null;
    }
    return (await r.json()) as VapiCall;
  } catch (e) {
    log.err(`GET /call/${id} threw: ${(e as Error).message}`);
    return null;
  }
}

function report(samples: TurnSample[], opts: { json: boolean; transcript: boolean }): number {
  if (samples.length === 0) {
    log.err("No usable turns measured across all inputs — cannot compute latency.");
    return 1;
  }
  const vals = samples.map((s) => s.perceivedMs).sort((a, b) => a - b);
  const p50 = percentile(vals, 50);
  const p95 = percentile(vals, 95);
  const mean = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
  const source = [...new Set(samples.map((s) => s.source))].join("+");
  const pass = p50 < PASS_P50_MS && p95 < PASS_P95_MS;

  if (opts.transcript) {
    log.info("\n── Per-turn (review for premature mid-sentence cutoffs) ──");
    for (const s of samples) {
      const parts = s.breakdown
        ? ` [endpoint ${s.breakdown.endpointing ?? "?"} / model ${s.breakdown.model ?? "?"} / voice ${s.breakdown.voice ?? "?"}]`
        : "";
      log.info(`  ${s.callId} turn ${s.index}: ${Math.round(s.perceivedMs)}ms${parts}`);
      if (s.userText) log.info(`    user: ${s.userText}`);
      if (s.botText) log.info(`    bot : ${s.botText}`);
    }
  }

  const summary = {
    turns: vals.length,
    source,
    p50Ms: Math.round(p50),
    p95Ms: Math.round(p95),
    meanMs: mean,
    minMs: vals[0],
    maxMs: vals[vals.length - 1],
    targets: { p50Ms: PASS_P50_MS, p95Ms: PASS_P95_MS },
    pass,
  };

  if (opts.json) {
    log.info("\n" + JSON.stringify(summary, null, 2));
  } else {
    log.info("\n──────── Voice latency smoke ────────");
    log.info(`  turns measured : ${summary.turns}  (source: ${source})`);
    log.info(`  p50            : ${summary.p50Ms}ms   (target < ${PASS_P50_MS}ms)  ${p50 < PASS_P50_MS ? "PASS" : "FAIL"}`);
    log.info(`  p95            : ${summary.p95Ms}ms   (target < ${PASS_P95_MS}ms)  ${p95 < PASS_P95_MS ? "PASS" : "FAIL"}`);
    log.info(`  mean/min/max   : ${summary.meanMs} / ${summary.minMs} / ${summary.maxMs} ms`);
    log.info(`  VERDICT        : ${pass ? "PASS ✅" : "FAIL ❌"}`);
    log.info("─────────────────────────────────────");
  }
  return pass ? 0 : 1;
}

async function loadFixture(path: string): Promise<VapiCall[]> {
  const raw = JSON.parse(await readFile(path, "utf8"));
  return Array.isArray(raw) ? raw : [raw];
}

async function runSelftest(): Promise<number> {
  const here = dirname(fileURLToPath(import.meta.url));
  const calls = await loadFixture(join(here, "fixtures", "selftest-calls.json"));
  const samples = calls.flatMap(extractTurns);
  // Fixture is hand-built so the expected stats are deterministic (nearest-rank).
  // perceived values (ms): pm call → 300,350,400,420,1100 ; fallback call → 450,600
  // combined sorted: 300,350,400,420,450,600,1100  (n=7)
  // p50 = nearest-rank ceil(.5*7)=4th = 420 ; p95 = ceil(.95*7)=7th = 1100
  const vals = samples.map((s) => s.perceivedMs).sort((a, b) => a - b);
  const expected = { turns: 7, p50: 420, p95: 1100 };
  const got = { turns: vals.length, p50: percentile(vals, 50), p95: percentile(vals, 95) };
  let ok = true;
  const assert = (name: string, cond: boolean, g: unknown, e: unknown) => {
    if (cond) console.log(`  ✓ ${name}`);
    else { ok = false; console.error(`  ✗ ${name} — got ${JSON.stringify(g)}, expected ${JSON.stringify(e)}`); }
  };
  console.log("selftest: extraction + percentile math (no real calls)");
  assert("usable turns from both performanceMetrics + messages fallback", got.turns === expected.turns, got.turns, expected.turns);
  assert("both extraction sources exercised", new Set(samples.map((s) => s.source)).size === 2, [...new Set(samples.map((s) => s.source))], ["performanceMetrics", "messages"]);
  assert("p50 nearest-rank", got.p50 === expected.p50, got.p50, expected.p50);
  assert("p95 nearest-rank", got.p95 === expected.p95, got.p95, expected.p95);
  // fail-soft: the fixture includes a malformed turn (missing fields) + an empty
  // call; neither should crash and both should be skipped with a warning above.
  assert("fail-soft skipped malformed/empty without crashing", got.turns === 7, got.turns, 7);
  console.log(ok ? "\nselftest: PASS" : "\nselftest: FAIL");
  return ok ? 0 : 1;
}

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  const flags = new Set(argv.filter((a) => a.startsWith("--")));
  const positionals = argv.filter((a) => !a.startsWith("--"));
  const opts = { json: flags.has("--json"), transcript: flags.has("--transcript") };

  if (flags.has("--selftest")) return runSelftest();

  let calls: VapiCall[] = [];
  const fixtureIdx = argv.indexOf("--fixture");
  if (fixtureIdx >= 0) {
    const path = argv[fixtureIdx + 1];
    if (!path) { log.err("--fixture needs a path"); return 2; }
    calls = await loadFixture(path);
  } else {
    if (positionals.length === 0) {
      log.err("Provide call IDs, or --fixture <path>, or --selftest. See README.md.");
      return 2;
    }
    const apiKey = process.env.VAPI_API_KEY;
    if (!apiKey) { log.err("VAPI_API_KEY is not set — required to fetch live calls."); return 2; }
    for (const id of positionals) {
      const c = await fetchCall(id, apiKey);
      if (c) calls.push(c);
    }
  }

  const samples = calls.flatMap(extractTurns);
  return report(samples, opts);
}

main().then((code) => process.exit(code)).catch((e) => { console.error(e); process.exit(1); });
