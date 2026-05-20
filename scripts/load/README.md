# MapGuard load test

Local-only k6 harness that simulates 100 active MapGuard clients hitting
the weekly scan path, with Serper and Google Places stubbed out so no
external API calls fire.

> **Local only.** Do not point `BASE_URL` at staging or production. The
> harness is intended for the dev box and the synthetic-client mode it
> relies on (`MAPGUARD_LOAD_MODE=1`) bypasses DB writes — running it
> against shared infra would still hammer those external APIs and skew
> any production telemetry you happen to be watching.

## What it measures

- **p50/p95/p99 latency for `runMapguardBatchScan`** — surfaced via k6's
  built-in `http_req_duration{endpoint:mapguard_batch}` and a custom
  `batch_scan_seconds` trend, both reported in the run summary.
- **Peak heap and DB pool saturation** — captured out-of-band, see
  "Diagnostics" below. (We deliberately did not add a heap/pool probe
  endpoint to the server; standard tooling is sufficient and avoids
  shipping dev-only routes.)

## Files

| File | Purpose |
|---|---|
| `mock-apis.ts` | Tiny Node http server stubbing Serper + Google Places |
| `mapguard-batch.js` | k6 script: logs in as admin, hits `POST /api/mapguard/scan/batch` `ITERATIONS` times |

## Prerequisites

- k6 installed and on PATH (`brew install k6` / `choco install k6` /
  download from https://k6.io/docs/getting-started/installation/)
- Local dev DB reachable AND `npm run db:push` already run on this
  checkout — `setup()` authenticates against `users`, which has columns
  the current Drizzle schema requires (`totp_secret`, `totp_enabled`).
  Without an applied push, login returns HTTP 500 with a "Failed query"
  body and the load run aborts.
- A dev admin account you know the password for (created via the normal
  signup flow or seed script — not hardcoded)

## Run it

Three terminals.

**Terminal 1 — mock APIs:**

```bash
npx tsx scripts/load/mock-apis.ts
# → [mock-apis] listening on http://127.0.0.1:4545
```

**Terminal 2 — dev server with load-mode env:**

```bash
SERPER_BASE_URL=http://127.0.0.1:4545 \
PLACES_BASE_URL=http://127.0.0.1:4545/places \
SERPER_API_KEY=loadtest \
GOOGLE_MAPS_API_KEY=loadtest \
MAPGUARD_LOAD_MODE=1 \
MAPGUARD_LOAD_CLIENT_COUNT=100 \
npm run dev
```

The `MAPGUARD_LOAD_MODE=1` switch makes
`server/services/mapguardMonitor.ts` substitute 100 in-memory synthetic
clients, skip the inter-client 2-second sleep, and short-circuit every
DB write inside `runMapguardScan`. Without that switch the load mode
would either pollute `mapguard_snapshots` with thousands of throwaway
rows or silently hit zero clients on a fresh DB.

PowerShell variant:

```powershell
$env:SERPER_BASE_URL="http://127.0.0.1:4545"
$env:PLACES_BASE_URL="http://127.0.0.1:4545/places"
$env:SERPER_API_KEY="loadtest"
$env:GOOGLE_MAPS_API_KEY="loadtest"
$env:MAPGUARD_LOAD_MODE="1"
$env:MAPGUARD_LOAD_CLIENT_COUNT="100"
npm run dev
```

**Terminal 3 — k6 run:**

```bash
k6 run scripts/load/mapguard-batch.js \
  -e BASE_URL=http://localhost:5000 \
  -e ADMIN_EMAIL=admin@yourdev.local \
  -e ADMIN_PASSWORD='your-dev-password' \
  -e ITERATIONS=10
```

`ITERATIONS=10` runs the batch ten times sequentially. The endpoint has
a process-level mutex (`batchScanRunning`) so concurrent batches collide
on the lock — VUs > 1 would not give you a meaningful concurrency story,
just lock contention. Bump `ITERATIONS` if you want a tighter percentile.

## Reading the output

k6's end-of-run summary will print something like:

```
   batch_scan_seconds...........: avg=4.2  min=3.9  med=4.1  max=5.6  p(50)=4.1 p(95)=5.2 p(99)=5.5
   http_req_duration............: avg=4.21s ... p(95)=5.24s p(99)=5.51s
     { endpoint:mapguard_batch }: avg=4.21s ... p(95)=5.24s p(99)=5.51s
   http_req_failed..............: 0.00%   ✓ 0       ✗ 10
```

Treat `batch_scan_seconds` and `http_req_duration{endpoint:mapguard_batch}`
as your headline numbers — they should track each other within a few ms.

## Diagnostics (heap + DB pool)

We did not build heap/pool probe endpoints into the server. Use the
standard tooling instead:

### Peak heap

Start the dev server with `--inspect`:

```bash
NODE_OPTIONS="--inspect=0.0.0.0:9229" \
SERPER_BASE_URL=http://127.0.0.1:4545 \
PLACES_BASE_URL=http://127.0.0.1:4545/places \
SERPER_API_KEY=loadtest GOOGLE_MAPS_API_KEY=loadtest \
MAPGUARD_LOAD_MODE=1 MAPGUARD_LOAD_CLIENT_COUNT=100 \
npm run dev
```

Then open `chrome://inspect`, attach the Memory profiler, take a
heap snapshot before and after the k6 run, and diff. Or run with
`--max-old-space-size=512` to surface OOM behavior under tighter limits.

### DB pool saturation

While the k6 run is in flight, hit `pg_stat_activity` from a fourth
terminal to see live pool usage:

```bash
psql "$DATABASE_URL" -c "
  SELECT state, count(*)
    FROM pg_stat_activity
   WHERE application_name LIKE '%node%' OR datname = current_database()
GROUP BY state
ORDER BY count DESC;
"
```

Run that every few seconds (`watch -n 2 ...`). What you want to see:

- `active` count climbing during the batch and falling back between
  iterations
- `idle in transaction` staying near zero — anything sustained there
  indicates a leaked connection
- Total connections never exceeding the pool size you've configured (see
  `server/db.ts`)

If `active` plateaus at the pool limit, the worker is pool-starved and
that's your bottleneck — not Serper/Places latency.

## Tuning the mock

Two env vars on `mock-apis.ts`:

- `MAPGUARD_MOCK_LATENCY_MS` (default 25) — sleep before responding,
  to simulate healthy upstream latency. Set to 0 for pure server-side
  measurement, 100+ to simulate a slow Serper.
- `MAPGUARD_MOCK_ERROR_RATE` (default 0) — fraction of requests to fail
  with HTTP 500. Useful for testing the `serper_keyword_errors` paths
  the engine consumes (see `server/engine/rules/mapguard.ts`).

## Why localhost only

The "do not run against staging/prod" rule applies to the `BASE_URL`
target, not to the mocks (which only ever bind to `127.0.0.1`). Two
specific hazards if you ignore it:

1. The dev server you're targeting is the one with `MAPGUARD_LOAD_MODE=1`.
   That env on a shared box would silently disable real scan persistence
   for every admin who triggers a batch — including the Tuesday cron.
2. Even in load mode the dev server still does `getActiveMapguardClients`
   work on cold start; pointing this at any environment with real customer
   data will read those rows during normal operation and you'd be load
   testing against live data shapes you didn't anticipate.

Stick to `BASE_URL=http://localhost:5000`.
