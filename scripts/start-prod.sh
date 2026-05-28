#!/usr/bin/env bash
# start-prod.sh — production entrypoint wrapper used by .replit [deployment].run
#
# Goal: wire the Replit autoscale deployment to source secrets from Doppler
# (project=wefixtrades, config=prd) without breaking deploys when DOPPLER_TOKEN
# is not yet set on the target environment.
#
# Behaviour:
#   1. If DOPPLER_TOKEN is set AND the doppler CLI is on PATH, exec
#      `doppler run -- node ./dist/index.cjs` so every secret in
#      wefixtrades/prd is injected into the process env at startup.
#   2. Otherwise, fall back to plain `node ./dist/index.cjs`. The in-process
#      Doppler bootstrap (server/bootstrapDoppler.ts) will still pull secrets
#      over HTTPS if DOPPLER_TOKEN is present but the CLI is missing; if
#      DOPPLER_TOKEN itself is missing, the server runs in Replit-Secrets-only
#      mode (current pre-cutover behaviour).
#
# The fallback path is the safety net: merging this PR alone must NOT break
# production, even if Alex has not yet pasted DOPPLER_TOKEN into Replit
# Production Secrets.
#
# Support flag: pass --check to print the resolved mode without starting the
# server (used in local CI / verification).

set -euo pipefail

# Layer-C guard for PR fix(deploy): move drizzle.config.dev.ts out of repo root:
# Refuse to boot production if ANY `drizzle.config*.ts` has reappeared at the
# repo root. Replit's deploy pipeline auto-detects the `drizzle.config*` glob
# (NOT just the exact filename `drizzle.config.ts`) and runs the drizzle
# schema-sync command against prod, which is the source of the destructive-
# migration approval prompt Alex sees on redeploy. The canonical config
# location is scripts/db/drizzle.config.dev.ts. Production applies SQL via
# server/lib/bootstrapMigrations.ts at boot — the drizzle schema-sync command
# must never run against the production database. See
# scripts/check-no-prod-drizzle-config.mjs for the full rationale.
#
# This guard runs BEFORE the Doppler wrapper resolution so a misconfigured
# repo fails fast and visibly in the deploy log.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
for forbidden in drizzle.config.ts drizzle.config.dev.ts; do
  if [ -f "${REPO_ROOT}/${forbidden}" ]; then
    echo "[start-prod] FATAL: ${forbidden} found at repo root." >&2
    echo "[start-prod] Replit will auto-run the drizzle schema-sync command against production." >&2
    echo "[start-prod] Move it back to scripts/db/drizzle.config.dev.ts before redeploying." >&2
    exit 1
  fi
done
echo "[start-prod] guard OK — no drizzle.config*.ts at repo root (Replit auto-sync disabled)." >&2

# Layer-D guard removed: it checked for drizzle-kit in node_modules, but
# Replit's deployment runs a full `npm install` (devDependencies included) and
# never prunes them — so the guard fired on every single deploy and blocked
# startup. The real protection is Layer-C above (no drizzle.config at repo
# root), which prevents Replit from auto-detecting the config and running
# schema-sync. drizzle-kit in node_modules is harmless as long as no
# drizzle.config lives at the repo root.

MODE_DOPPLER_CLI="doppler-cli"
MODE_DOPPLER_HTTP="doppler-http-bootstrap-only"
MODE_PLAIN="env-only"

resolve_mode() {
  if [ -n "${DOPPLER_TOKEN:-}" ]; then
    if command -v doppler >/dev/null 2>&1; then
      echo "${MODE_DOPPLER_CLI}"
    else
      echo "${MODE_DOPPLER_HTTP}"
    fi
  else
    echo "${MODE_PLAIN}"
  fi
}

MODE="$(resolve_mode)"

if [ "${1:-}" = "--check" ]; then
  echo "start-prod: mode=${MODE}"
  exit 0
fi

# Deploy Safety Wave 2 — post-boot healthz self-ping.
#
# Run in the background AFTER `exec` would have replaced this shell, so we
# fork it before the exec. The self-ping waits ~15 s for the server to bind
# the port, then hits the local healthz once. Result is logged loudly but
# NEVER crashes the server — healthz is a signal, not a kill switch. The
# real verdict comes from the post-deploy verifier (scripts/post-deploy-
# verify.mjs) running externally against the public URL.
SELF_TEST_PORT="${PORT:-5000}"
SELF_TEST_URL="http://127.0.0.1:${SELF_TEST_PORT}/api/healthz"
(
  # Wait for the server to start accepting connections.
  for _ in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15; do
    sleep 1
    if command -v curl >/dev/null 2>&1; then
      if curl -fsS -o /dev/null --max-time 2 "${SELF_TEST_URL}" 2>/dev/null; then
        echo "[start-prod] self-test: healthz OK at ${SELF_TEST_URL}" >&2
        exit 0
      fi
    elif command -v wget >/dev/null 2>&1; then
      if wget -q -O /dev/null --timeout=2 "${SELF_TEST_URL}" 2>/dev/null; then
        echo "[start-prod] self-test: healthz OK at ${SELF_TEST_URL}" >&2
        exit 0
      fi
    else
      echo "[start-prod] self-test: neither curl nor wget on PATH — skipping" >&2
      exit 0
    fi
  done
  echo "[start-prod] self-test: WARN healthz did not return 200 within 15s at ${SELF_TEST_URL} — server keeps running, investigate via /api/healthz" >&2
) &
disown 2>/dev/null || true

# Bing Webmaster — post-boot sitemap self-registration.
#
# Idempotent. If the sitemap is already on file with Bing, the script logs
# "already registered" and exits 0. Otherwise it calls SubmitFeed. Runs
# AFTER the healthz self-test gives the server time to come up so /sitemap.xml
# is reachable to Bing's crawler the moment we register it. Failures are
# logged but NEVER block startup — the cron + admin "Submit Sitemap" button
# are the retry surface.
BING_REGISTER_SCRIPT="${REPO_ROOT}/scripts/seo/register-sitemap-bing.mjs"
BING_REGISTER_LOG="${REPO_ROOT}/bing-register.log"
if [ -f "${BING_REGISTER_SCRIPT}" ]; then
  (
    # Wait a bit longer than the healthz self-test so the server is definitely up.
    sleep 20
    if [ -z "${BING_WEBMASTER_API_KEY:-}" ]; then
      echo "[start-prod] bing-register: skipped — BING_WEBMASTER_API_KEY not set" >&2
      exit 0
    fi
    # Soft-fork: stderr to a log file so a stack trace can never escape into
    # the deploy log and trip a watchdog. Script always exits 0 by design.
    node "${BING_REGISTER_SCRIPT}" 2>>"${BING_REGISTER_LOG}" || true
  ) &
  disown 2>/dev/null || true
fi

case "${MODE}" in
  "${MODE_DOPPLER_CLI}")
    echo "[start-prod] mode=${MODE} — wrapping with: doppler run -- node ./dist/index.cjs" >&2
    exec doppler run -- node ./dist/index.cjs
    ;;
  "${MODE_DOPPLER_HTTP}")
    echo "[start-prod] mode=${MODE} — DOPPLER_TOKEN set but doppler CLI missing; relying on in-process bootstrap (server/bootstrapDoppler.ts)" >&2
    exec node ./dist/index.cjs
    ;;
  *)
    echo "[start-prod] mode=${MODE} — DOPPLER_TOKEN not set; running with Replit Secrets only. Set DOPPLER_TOKEN in Replit Production Secrets to enable Doppler." >&2
    exec node ./dist/index.cjs
    ;;
esac
