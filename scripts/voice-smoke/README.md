# Voice latency smoke harness

Turnkey measurement for the post-merge live-call smoke on the
`VOICE_BASE_PRESET` turn-detection change (PR #1306). A human places a few test
calls; this reports per-turn p50/p95 latency against the targets so the smoke is
a measurement, not a guess.

**This harness is read-only.** It changes no voice config and places no calls.

## Files
- `measure-latency.ts` — the utility (run with `tsx`).
- `SMOKE-CHECKLIST.md` — the four pass criteria + manual observations.
- `fixtures/selftest-calls.json` — synthetic calls for `--selftest` (no API needed).

## Latency source (field names verified vs VAPI docs, 2026-06-03)
- **Preferred — first-class:** `call.artifact.performanceMetrics.turnLatencies[]`,
  each turn carrying `endpointingLatency` / `modelLatency` / `voiceLatency` /
  `transcriberLatency` / `turnLatency` (ms). Perceived "caller stopped → assistant
  started" ≈ `turnLatency` (all-in).
- **Fallback — derived** (when `performanceMetrics` is absent): pair each
  `role:"user"` turn with the next `role:"bot"` turn in `artifact.messages[]` and
  take `bot.time − user.endTime` (epoch ms). `secondsFromStart` is **not** used
  (known epoch-vs-relative bug). `time`/`endTime` are the reliable anchors.
- Percentiles use the **nearest-rank** method (deterministic): the p-th
  percentile is the value at rank `ceil(p/100 × N)`.

## Run it

### 0. Sanity-check the tool with no calls (optional)
```
tsx scripts/voice-smoke/measure-latency.ts --selftest
```
Asserts the extraction + percentile math against the synthetic fixture (exercises
both the performanceMetrics and message-fallback paths + fail-soft skips).

### 1. After placing 3–5 test calls
Collect the call IDs (VAPI dashboard → Calls), then:
```
# needs VAPI_API_KEY in the environment (read-only)
tsx scripts/voice-smoke/measure-latency.ts <callId1> <callId2> <callId3> [callId4 callId5]
```
Add flags as needed:
- `--transcript` — print per-turn latency + the transcript, to eyeball premature
  mid-sentence cutoffs (criterion 2 in the checklist).
- `--json` — machine-readable summary.

You can also save a `GET /call/{id}` response to a file and run offline:
```
tsx scripts/voice-smoke/measure-latency.ts --fixture ./my-call.json
```

The script prints p50/p95 with PASS/FAIL against the targets (**p50 < 500ms,
p95 < 800ms**) and exits non-zero on FAIL.

## Results template — paste into CARRYOVER.md after the run

```
### Voice turn-detection live-call smoke — RESULTS (YYYY-MM-DD)
Calls measured: <N> call IDs: <id1, id2, ...>
Latency source: <performanceMetrics | messages | performanceMetrics+messages>
Turns measured: <N>
  p50: <X>ms   (target <500)  PASS/FAIL
  p95: <X>ms   (target <800)  PASS/FAIL
  mean/min/max: <X>/<X>/<X> ms
2. No premature mid-sentence cutoffs:  PASS/FAIL  (notes: ...)
3. Barge-in interrupts cleanly:        PASS/FAIL  (notes: ...)
4. No-voice client falls back correctly: PASS/FAIL (test client: ...)
OVERALL: PASS/FAIL
Follow-up (if any): ...
```
