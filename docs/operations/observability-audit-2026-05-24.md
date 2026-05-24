# Observability audit — 2026-05-24

Read-only sweep of WeFixTrades' Sentry coverage, log structure, healthz
depth, and alert routing. Two inline fixes shipped in this PR (Sentry
release tagging + request_id in the access log); everything else is
documented for follow-up.

**Verdict: MOSTLY HEALTHY with one large gap.** Healthz, alert routing,
and the structured logger are all in good shape. The single material
finding is that **Sentry is wired but barely used** — only 8 explicit
`Sentry.captureException`/`captureMessage` sites exist across ~1,300
`log.error` calls in the server. The Express error handler captures
uncaught exceptions, but ~99 % of error paths in this codebase
`catch (err) { log.error(...); res.status(500).json(...) }` and never
hand the error to Sentry. The error tracker is effectively dark for
most route failures.

---

## At a glance

| Area | State | Severity if gap |
|---|---|---|
| Sentry init (server + client) | OK — both initialised when DSN present | — |
| Sentry release tag | FIXED inline (PR adds `release: GIT_SHA`) | was: P2 |
| Sentry Express error handler | OK — `setupExpressErrorHandler` mounted | — |
| Explicit Sentry capture sites | **8 across the entire server** | **P0** |
| Structured logger (JSON in prod) | OK — `server/lib/logger.ts` emits JSON in prod, text in dev | — |
| request_id in logs | PARTIAL — middleware exists but only mounted on `/api/v1/*`; access log now echoes it (this PR) | P1 |
| /api/healthz depth | OK — 8 probes, parallel, 2 s timeout, 15 s cache, 3-state aggregation | — |
| Alert routing (DB + email + Slack) | OK — `services/alertService.ts` with 1 h dedupe, optional `SLACK_WEBHOOK_URL` | — |
| Admin inbox view | OK — `/api/admin/inbox` aggregates failed jobs, alerts, internal tasks, open tickets, QA reviews | — |
| Server-side APM / per-endpoint dashboards | MISSING — no histogram, no slow-query log | P2 |
| Per-severity alert routing (sev-1 → SMS) | MISSING — all severities go to one admin email + one Slack channel | P2 |

---

## P0 — Sentry capture coverage

Counts taken against `origin/main` (`4b659383`) inside
`server/`:

- `Sentry.captureException` / `Sentry.captureMessage` call sites: **8**
  (in 5 files: `cron/aiBudgetAlerts.ts`, `cron/learningCandidateSweep.ts`,
  `routes/adminCrmRoutes.ts`, `routes/twilioRoutes.ts`,
  `jobs/tradelineRetryWorker.ts`).
- `log.error(...)` call sites: **~1,300 across ~250 files**.
- `console.error` call sites in `server/routes` + `server/services` +
  `server/jobs` + `server/cron`: **1** (in
  `services/mapguardTaskEngine.ts:1098`). The rest of the codebase has
  already migrated to the structured logger — that bit hasn't.

What this means in practice: when a Stripe webhook handler throws,
when a Twilio inbound SMS handler 500s, when a portal route's DB
query fails, when ContentFlow's WordPress publisher errors out — none
of it reaches Sentry. It's logged to stdout (and is JSON-structured,
which is good for grep), but the error tracker sees nothing. The
post-deploy watchdog at
`.github/workflows/post-deploy-watchdog.yml:174` pings Sentry to check
for a spike during a release; with this little capture surface, that
check is mostly noise-detection on the 8 sites above plus uncaught
exceptions.

`Sentry.setupExpressErrorHandler(app)` IS mounted
(`server/index.ts:541-543`), so any route that lets an exception
propagate to the Express error chain is captured. But almost every
route in this repo follows the pattern:

```ts
try {
  // ... do thing
  res.json({ ok: true });
} catch (err: any) {
  log.error("Failed to do thing", { error: err.message });
  res.status(500).json({ error: "Failed to do thing" });
}
```

That response.status(500) short-circuits Express's error chain. Sentry
never sees it. This is by far the largest observability gap on the
platform.

---

## P1 — request_id correlation is incomplete

The `requestId` middleware (`server/middleware/requestId.ts`) generates
a UUID per request, echoes it back as `X-Request-Id`, and
`server/routes/apiV1/envelope.ts` includes it in the JSON envelope so
customers can quote it on support tickets. Good.

**But the middleware is only mounted on `/api/v1/*`**
(`server/routes/apiV1/index.ts:31`). `/api/admin/*`, `/api/portal/*`,
the Stripe billing webhook, Twilio webhooks, calculator routes, and
every other surface have no request id. When a customer reports a
broken portal page and quotes a timestamp, we can't grep one log line
back to the request that triggered it.

Inline fix shipped in this PR: the access-log middleware now echoes
`rid=<id>` when present, so wherever the middleware IS mounted (today:
`/api/v1`), the access log can be cross-referenced. The structural fix
(mount requestId platform-wide and tag every `log.error` with
`request_id`) is a follow-up — touches every logger call site.

---

## /api/healthz — well-built, keep as is

`server/routes/healthz.ts`:

- 8 probes run in parallel (`db`, `db_tables`, `doppler`, `stripe`,
  `twilio`, `google_maps`, `bing`, `redis`).
- Each probe wrapped in a 2 s timeout (`PROBE_TIMEOUT_MS = 2_000`).
  No single slow vendor can stall the whole response.
- 3-state aggregation: `down` if any probe is down, `degraded` if any
  is degraded, else `ok`. Returns HTTP 503 for not-ok.
- In-process 15 s cache (`HEALTHZ_CACHE_TTL_MS = 15_000`). Stops
  external monitoring polling at 1 Hz from hammering Stripe.
- Response includes `version` (from `GIT_SHA` / `REPL_DEPLOYMENT_ID` /
  `SOURCE_VERSION`) — the staging-gate uses this to confirm a deploy
  rolled out the expected SHA before declaring success.
- Bing probe also checks remaining daily quota (<10 → degraded). Nice
  touch — surfaces a real-world failure mode pre-emptively.

No changes recommended here.

---

## Alert routing — also well-built

`server/services/alertService.ts` `fireAlert()`:

- Writes a `system_alerts` row (admin inbox surfaces it).
- Sends email to `ADMIN_EMAIL` (or `SMTP_FROM`) — severity-coloured.
- POSTs to `SLACK_WEBHOOK_URL` if set — severity-emoji prefix.
- 1 h dedupe per `(category, title)` so a stuck loop doesn't
  carpet-bomb the inbox.
- Wrapped in nested `try` — email/Slack failures don't break the alert
  write.

`server/routes/adminAlertRoutes.ts` exposes `/api/admin/alerts` (list +
ack) and `/api/admin/inbox`, which aggregates **failed jobs (last
24 h) + unacked alerts + waiting-internal tasks + open support tickets
+ QA-review tasks** into a single prioritised feed. That's the admin
"incidents view" the audit brief asked about — it already exists, just
isn't labelled as such.

Gap: there's no severity-tier routing. A `critical` alert goes to the
same email + same Slack channel as a `warning`. For a launch in
~52 days, sev-1 should page (PagerDuty / Opsgenie / Twilio SMS) — see
P2-1 below.

---

## Top 10 recommendations (ordered by impact)

1. **[P0] Wrap every `log.error` in route catch blocks with a
   Sentry capture.** Pattern:
   ```ts
   } catch (err: any) {
     log.error("...", { error: err.message });
     Sentry.captureException(err, { tags: { route: "..." } });
     res.status(500).json({ error: "..." });
   }
   ```
   Mechanical sweep. ~1,300 sites. Prioritise these first: Stripe
   webhook handlers (`server/routes/stripeBillingRoutes.ts` — already
   fires `fireAlert` but not `captureException`), Twilio webhooks
   (`server/routes/twilioRoutes.ts`), portal routes
   (`server/routes/portalRoutes.ts` has ~96 `log.error` calls), public
   API v1 (`server/routes/apiV1/*`), checkout
   (`server/routes/calculatorRoutes.ts`, ~10 calls). A wrapper helper
   in `server/lib/logger.ts` (e.g. `log.errorAndCapture`) would let
   the sweep be a global find-replace.

2. **[P0] Hand the error to Express's error chain instead of
   catching + 500-ing.** Even simpler than #1 — replace
   `} catch (err) { log.error(...); res.status(500)... }` with
   `} catch (err) { next(err); }` and let `setupExpressErrorHandler`
   capture it. The fallback handler at `server/index.ts:545` already
   serializes a 500 JSON response. Lower-effort than #1 for new code;
   needs care on routes that return a domain-specific 500 body.

3. **[P1] Mount `requestId` middleware globally.** Move it from
   `server/routes/apiV1/index.ts` to `server/index.ts` before the
   access-log middleware. Then add `request_id: req.requestId` to
   every `log.error({ ... })` call (mechanical sweep, can be combined
   with #1). One grep gets a full request trace.

4. **[P1] Add request id + user/client tags to Sentry scope.** Set
   `Sentry.setUser({ id: req.user?.id })` + `Sentry.setTag("client_id",
   req.user?.client_id)` in a middleware that runs after passport.
   Sentry events become navigable per-user/per-client.

5. **[P2] Per-severity alert routing.** Add an SMS channel
   (Twilio is already wired) for `severity: "critical"` only — keep
   email/Slack for everything. Edit `fireAlert()` to branch on severity
   and call `sendSMS(ADMIN_ONCALL_PHONE, ...)`. ~10 lines, no new
   dependency. Pre-launch must-have.

6. **[P2] Server-side request-duration histogram.** Sentry's
   `tracesSampleRate: 0.1` already captures 10 % of transactions —
   surface those in a dashboard ("p95 latency by route") and pin it.
   No code change; just a Sentry UI setup task.

7. **[P2] Slow-query log.** Add a `db.execute` wrapper that logs any
   query taking >500 ms. `server/db.ts` is a single import point so
   instrumentation is one file. Catches N+1 regressions in code review.

8. **[P2] Errors-per-endpoint dashboard.** Once #1 is done and Sentry
   sees the volume, Sentry's "Issues by Tag" view on `route` becomes a
   real top-N broken-endpoints report. Mechanical — only blocked on #1.

9. **[P3] Migrate remaining `console.error` sites.** 1 left in
   `services/mapguardTaskEngine.ts:1098`, plus the
   `server/replit_integrations/*` and `server/scripts/*` files. Low
   value (scripts don't run in prod) but completes the migration.

10. **[P3] Set `serverName` in Sentry init.** Distinguish events from
    `staging` vs `prd` deployments inside one Sentry project. One line
    in `server/index.ts`; useful only after the volume in #1 lands.

---

## Inline fixes shipped in this PR

1. **`server/index.ts`** — Sentry server init now sets `release` from
   `SENTRY_RELEASE` / `GIT_SHA` / `REPL_DEPLOYMENT_ID` /
   `SOURCE_VERSION` (same chain as `/api/healthz`'s `version` field).
   Lets Sentry group regressions per-deploy and lets the
   post-deploy-watchdog's Sentry ping correlate cleanly. Zero
   behaviour change when DSN unset.

2. **`server/index.ts`** — the per-request access-log line now appends
   `rid=<requestId>` when the requestId middleware has tagged the
   request. Today that's `/api/v1/*` only; when recommendation #3 lands
   it'll cover every route. ~3 lines.

---

## Blockers

None. Audit was read-only against `origin/main`. Inline fixes are
purely additive (string field added to Sentry init; log-line
concatenation) and gated on existing env / middleware behaviour.
