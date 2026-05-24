#!/usr/bin/env node
/**
 * Vapi — Riley assistant config sync.
 *
 * Codifies the desired user-facing brand strings on the live Vapi "Riley"
 * inbound voice assistant and idempotently PATCHes the Vapi API to bring
 * the assistant back to spec.
 *
 * Background:
 *   Riley was created from a Vapi "appointment scheduler" template ("Wellness
 *   Partners"). The voicemailMessage / endCallMessage / firstMessage were
 *   never edited in the Vapi UI, so callers heard the wrong business name and
 *   no brand identification on pickup. See PR #698 (audit) + PR fixing this.
 *
 * Scope:
 *   Only the three user-facing brand strings — firstMessage,
 *   voicemailMessage, endCallMessage. Does NOT touch model, system prompt,
 *   tools, transport, server URL, or any other field. The system-prompt /
 *   custom-llm migration is a separate ops decision.
 *
 * Behaviour:
 *   1. GET the live assistant.
 *   2. Diff each desired field against the live value.
 *   3. If anything differs, PATCH only the changed fields.
 *   4. Re-GET and assert the new values stuck.
 *   5. Exit 0 on success (incl. no-op). Non-zero on any drift not corrected.
 *
 * Env (required):
 *   VAPI_API_KEY        — Vapi private API key (Doppler: wefixtrades/prd).
 *
 * Env (optional):
 *   VAPI_RILEY_ID       — override assistant id (defaults to known prod id).
 *   VAPI_API_BASE       — override API base (default https://api.vapi.ai).
 *   DRY_RUN             — set to "1" to print the diff but skip the PATCH.
 *
 * Usage:
 *   doppler run --project wefixtrades --config prd -- \
 *     node scripts/vapi/sync-riley-config.mjs
 *
 *   # preview only:
 *   doppler run --project wefixtrades --config prd -- \
 *     DRY_RUN=1 node scripts/vapi/sync-riley-config.mjs
 */

const API_BASE = process.env.VAPI_API_BASE ?? "https://api.vapi.ai";
const ASSISTANT_ID =
  process.env.VAPI_RILEY_ID ?? "34aa037e-38f7-4cbb-a48e-9c3c5d10bcfa";
const API_KEY = process.env.VAPI_API_KEY;
const DRY_RUN = process.env.DRY_RUN === "1";

/**
 * Desired live config. Edit here, run the script, done.
 * Keep this list narrow — only fields the script owns. Anything not listed
 * is left alone on the live assistant.
 */
const DESIRED = Object.freeze({
  firstMessage:
    "Hey there, thanks for calling WeFixTrades. What can I help you with today?",
  voicemailMessage:
    "Hi, you have reached WeFixTrades. We are not available right now. Please leave your name, phone number, and a brief message and we will get back to you within one business day. Thanks.",
  endCallMessage: "Thanks for calling WeFixTrades. Have a great day.",
});

function log(line) {
  console.log(`[sync-riley] ${line}`);
}

function fail(line) {
  console.error(`[sync-riley] ERROR: ${line}`);
  process.exit(1);
}

async function vapi(method, path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    // Non-JSON response — keep as text in the error path.
  }
  if (!res.ok) {
    const detail = data ? JSON.stringify(data) : text;
    fail(`${method} ${path} -> HTTP ${res.status}: ${detail}`);
  }
  return data;
}

function diff(live, desired) {
  const out = {};
  for (const [key, want] of Object.entries(desired)) {
    if (live?.[key] !== want) {
      out[key] = { from: live?.[key] ?? null, to: want };
    }
  }
  return out;
}

async function main() {
  if (!API_KEY) {
    fail("VAPI_API_KEY is not set. Run via `doppler run --project wefixtrades --config prd --`.");
  }

  log(`Fetching assistant ...${ASSISTANT_ID.slice(-4)}`);
  const before = await vapi("GET", `/assistant/${ASSISTANT_ID}`);

  if (!before || typeof before !== "object") {
    fail("Unexpected GET response shape.");
  }
  if (before.name && before.name !== "Riley") {
    log(`WARN: assistant name is "${before.name}", expected "Riley". Continuing.`);
  }

  const pending = diff(before, DESIRED);
  const changedKeys = Object.keys(pending);

  if (changedKeys.length === 0) {
    log("Live config already matches desired spec. No PATCH needed.");
    return;
  }

  log(`Drift detected on ${changedKeys.length} field(s): ${changedKeys.join(", ")}`);
  for (const k of changedKeys) {
    log(`  - ${k}:`);
    log(`      from: ${JSON.stringify(pending[k].from)}`);
    log(`      to:   ${JSON.stringify(pending[k].to)}`);
  }

  if (DRY_RUN) {
    log("DRY_RUN=1 — skipping PATCH.");
    return;
  }

  const patchBody = Object.fromEntries(
    changedKeys.map((k) => [k, DESIRED[k]]),
  );

  log(`PATCH /assistant/...${ASSISTANT_ID.slice(-4)} with ${changedKeys.length} field(s)`);
  await vapi("PATCH", `/assistant/${ASSISTANT_ID}`, patchBody);

  log("Re-reading assistant to verify ...");
  const after = await vapi("GET", `/assistant/${ASSISTANT_ID}`);
  const stillOff = diff(after, DESIRED);
  if (Object.keys(stillOff).length !== 0) {
    fail(`PATCH applied but read-back still drifts: ${JSON.stringify(stillOff)}`);
  }

  log("Verified. All target fields match desired spec.");
}

main().catch((err) => {
  fail(err?.stack ?? String(err));
});
