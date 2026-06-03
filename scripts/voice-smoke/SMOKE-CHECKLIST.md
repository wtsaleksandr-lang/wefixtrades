# Voice turn-detection — live-call smoke checklist

Close gate for PR #1306 (`VOICE_BASE_PRESET`). Run this **after** #1306 is merged
and the app is published to a live VAPI-connected environment. It is a
measurement, not a vibe check — `measure-latency.ts` produces the numbers; this
checklist defines pass/fail and the manual observations the API can't make.

> No config changes are made by running this. You place real calls; the script
> reads the resulting Call records.

## Setup
1. Confirm #1306 is deployed (the assistant the calls hit must carry the new
   `startSpeakingPlan` / `stopSpeakingPlan`). Provision/republish a TradeLine
   assistant so the new preset is live on it.
2. Have `VAPI_API_KEY` available (read-only use — to GET call records).
3. Place **3–5 test calls**, each with several back-and-forth turns. Note each
   call ID (VAPI dashboard → Calls, or the end-of-call webhook). Use natural
   pauses and at least one deliberate mid-sentence pause (see criterion 2) and
   one deliberate interruption (criterion 3).

## Pass criteria

### 1. Latency — p50 < 500ms, p95 < 800ms  (automated)
Run:
```
tsx scripts/voice-smoke/measure-latency.ts <callId1> <callId2> <callId3> [...]
```
- Reads `artifact.performanceMetrics.turnLatencies[]` (first-class) when present,
  else derives `bot.time − user.endTime` from `artifact.messages[]`.
- PASS when **p50 < 500ms AND p95 < 800ms** (script prints PASS/FAIL + exit code).
- Record the printed p50/p95/mean and the `source` line.

### 2. NO premature mid-sentence cutoffs  (manual, script-aided)
The regression that matters most for this change: `numWords: 2` +
`onNoPunctuationSeconds: 0.4` must not make the assistant start talking before the
caller finishes, or cut the caller off mid-thought.
- During the calls, deliberately pause mid-sentence ("I need a quote for… *pause* …a kitchen sink"). The assistant must WAIT, not jump in.
- Review the transcript/turn boundaries:
  ```
  tsx scripts/voice-smoke/measure-latency.ts <callIds...> --transcript
  ```
  Look for user turns that end mid-thought immediately followed by a bot turn that
  ignores the unfinished input, or bot turns that begin while the user was still
  speaking. Any such case = FAIL (loosen `onNoPunctuationSeconds` / raise `numWords`).
- PASS = no premature cutoffs observed across all calls.

### 3. Barge-in interrupts the assistant cleanly  (manual)
- While the assistant is speaking, interrupt with a full phrase (not a single
  "uh-huh"). The assistant should stop promptly and listen, with ~1s backoff
  before it resumes (`backoffSeconds: 1`).
- A stray single word / background "mm-hm" should NOT cut it off (`numWords: 2`).
- PASS = real interruptions cut in cleanly; stray noise does not.

### 4. No-voice-selection fallback still correct  (regression vs #1303)
- Use a test client that has **no** `tradeline_assistant_settings.voice_id` set.
  The call must still use the preset voice (or Rachel default) and sound correct —
  confirming the #1303 wiring + this change didn't regress the fallback.
- PASS = unselected-voice client hears the preset/Rachel voice, no error, no
  silent/default-broken voice.

## Verdict
All four PASS → close the gate (mark the voice turn-detection bug done in
CARRYOVER.md). Any FAIL → record the numbers + observation and hand back for a
preset tune (the override hook in `voiceProfile.ts` is where the knobs live).
