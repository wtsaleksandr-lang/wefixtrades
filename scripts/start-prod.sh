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

# Layer-C guard for PR fix/replit-disable-drizzle-push-prompt:
# Refuse to boot production if `drizzle.config.ts` has reappeared at the repo
# root. Replit's deploy pipeline auto-detects that exact filename and runs the
# Drizzle Kit schema-sync flow against prod, which is the source of the
# destructive-migration approval prompt Alex sees on redeploy. Production
# applies SQL via server/lib/bootstrapMigrations.ts at boot — the dev schema
# sync command must never run against the production database. See
# scripts/check-no-prod-drizzle-config.mjs for the full rationale.
#
# This guard runs BEFORE the Doppler wrapper resolution so a misconfigured
# repo fails fast and visibly in the deploy log.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
if [ -f "${REPO_ROOT}/drizzle.config.ts" ]; then
  echo "[start-prod] FATAL: drizzle.config.ts found at repo root." >&2
  echo "[start-prod] Replit will auto-run Drizzle Kit schema sync against production." >&2
  echo "[start-prod] Rename to drizzle.config.dev.ts before redeploying." >&2
  exit 1
fi
echo "[start-prod] guard OK — no drizzle.config.ts at repo root (Replit auto-push disabled)." >&2

# Layer-D guard (PR fix/replit-drizzle-push-nuke-from-deps):
# At runtime in production, drizzle-kit MUST NOT exist in node_modules. If it
# does, something (Replit's auto-install, a stale build cache, or a mis-classified
# dependency) has put the binary on the deploy machine, which is exactly what
# Replit's database integration uses to auto-run schema sync. The project
# applies SQL via server/lib/bootstrapMigrations.ts at boot — drizzle-kit is a
# strict devDependency. If it leaked into prod, fail fast and visibly so the
# regression is caught in deploy logs rather than after a destructive sync.
#
# This guard runs ONLY when NODE_ENV=production (Replit deploys set this) so
# `bash ./scripts/start-prod.sh --check` keeps working in local dev where
# drizzle-kit is legitimately present.
if [ "${NODE_ENV:-}" = "production" ]; then
  if [ -d "${REPO_ROOT}/node_modules/drizzle-kit" ]; then
    echo "[start-prod] FATAL: node_modules/drizzle-kit exists in a production environment." >&2
    echo "[start-prod] drizzle-kit is a devDependency and must NEVER be installed on the deploy machine." >&2
    echo "[start-prod] Replit's database integration discovers this binary and runs schema-sync prompts on Publish." >&2
    echo "[start-prod] Investigate the deploy install path — production should run with devDependencies pruned." >&2
    exit 1
  fi
  echo "[start-prod] guard OK — drizzle-kit binary absent from production node_modules." >&2
fi

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
