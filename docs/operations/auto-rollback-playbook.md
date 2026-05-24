# Auto-Rollback Playbook (Deploy Safety Wave 4)

The post-deploy watchdog (`.github/workflows/post-deploy-watchdog.yml`) runs after every push to `main`. If prod fails to stabilise it opens an emergency revert PR for human approval. This doc describes what triggers that flow and how to respond.

## What the watchdog watches

Target: `https://wefixtrades.com/api/healthz` (configurable via the workflow's `deploy_url` input).

The endpoint contract (from PR #624) is:

```json
{
  "status": "ok | degraded | down",
  "checks": { "<name>": { "status": "ok|degraded|down|skipped", "detail": "..." } },
  "version": "<git sha>",
  "boot_time": "<iso>"
}
```

Watchdog cadence (defaults — overridable via env on the workflow):

- **Settle:** 60 s wait after the push lands, so Replit has time to swap.
- **Polling:** up to 20 polls, one every 30 s (= 10 min observation window).
- **PASS:** `status=ok` for 5 consecutive polls.
- **FAIL — immediate:** any sub-check reports `status=down`.
- **FAIL — sustained:** top-level `status=degraded` for 5 consecutive polls.
- **FAIL — unstable:** never reached 5 consecutive `ok` within the window.

Network blips (timeouts, non-JSON responses) reset the consecutive-ok counter but do NOT count as `degraded` ticks — a flaky probe can't trigger a rollback by itself.

## What triggers the rollback PR

On any FAIL verdict the workflow:

1. Files a GitHub issue labelled `post-deploy-watchdog-failed` and `rollback`, with the captured `/api/healthz` body and the failing sub-check.
2. Pings Sentry (best-effort; requires `SENTRY_DSN` secret).
3. Force-pushes a new branch `auto-rollback/from-<bad>-to-<good>` whose tip is the **parent of the bad commit** — i.e. the prior tip of `main`.
4. Opens a PR titled `REVERT: emergency auto-rollback after healthz failure` from that branch to `main`, with `rollback`, `urgent`, `do-not-auto-merge` labels.
5. Requests review from the repo owner.
6. Marks the workflow run as failed so it surfaces on the Actions dashboard.

The PR is **never auto-merged**. The whole point of the human gate is to prevent a false-positive watchdog from rolling itself back.

## How Alex should respond

When a rollback PR appears in notifications:

1. **Open the linked issue** for the captured healthz body. Look at the sub-check that went down or stayed degraded.
2. **Decide: real regression vs. transient vendor blip.**
   - Real regression (the bad commit changed code that uses the failing dependency): **merge the rollback PR.** Replit will auto-deploy the older code from `main`. The rollback PR is a literal reset of `main` to the previous-good SHA — merging it puts prod back to the last working state with zero schema or data risk.
   - Transient (Stripe or Twilio API was momentarily down, healthz key check changed, etc.): **close the rollback PR**, comment on the linked issue explaining what was actually wrong, and consider widening `WATCHDOG_CONSEC_DEG` or `WATCHDOG_REQ_TIMEOUT_MS` if the same false-positive recurs.
3. **Always close the linked issue once the situation is resolved**, with a one-line note (`merged rollback PR #N` or `false positive — vendor X was down for 90s`). This keeps the dashboard honest.

If the issue is real but the rollback PR's diff looks suspicious (e.g. it would revert unrelated work because multiple commits squashed onto main between the failing deploy and the alert), prefer a hand-crafted revert and close the auto-PR.

## How to disable the watchdog

If the watchdog is producing noise during a planned maintenance window or a known-degraded vendor period:

- **Temporary skip:** rename or comment-out the `on.push` trigger in `.github/workflows/post-deploy-watchdog.yml` on a maintenance branch, merge, then revert when the window closes.
- **Wider thresholds (preferred):** set repository or environment variables:
  - `WATCHDOG_CONSEC_DEG=10` — require 10 consecutive degraded polls (5 min) instead of 5.
  - `WATCHDOG_SETTLE_S=120` — give prod 2 minutes to swap instead of 1.
  - `WATCHDOG_REQ_TIMEOUT_MS=15000` — tolerate slower healthz responses.
- **Hard kill:** disable the workflow from the Actions tab UI (no commit needed). Re-enable when ready.

Whatever you do, **do not "fix" the watchdog by relaxing the healthz endpoint itself**. Healthz is the source of truth for "is prod up"; loosening it just hides regressions.

## Wave alignment

| Wave | What it ships | This doc |
|------|---------------|----------|
| 1 (#621) | Migration safety guards | — |
| 2 (#624) | `/api/healthz` + smoke tests | Source of truth for this watchdog |
| 3 (#625) | Pre-merge staging gate | Catches issues before they reach `main` |
| 4 (this) | Post-deploy watchdog + revert PR | Catches issues that slip past the gate |

Waves 3 and 4 are complementary, not redundant: Wave 3 keeps bad code out of `main`; Wave 4 cleans up if Wave 3 missed (or if the staging gate is inert because the staging Replit isn't provisioned yet).
