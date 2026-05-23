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
