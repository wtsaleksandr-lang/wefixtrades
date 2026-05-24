#!/usr/bin/env node
/**
 * Twilio — phone-number voice_fallback_url sync.
 *
 * Codifies the desired voice_fallback_url on the operating brand's primary
 * Twilio phone number (TWILIO_PHONE_NUMBER) and idempotently PATCHes the
 * Incoming Phone Number resource to bring it back to spec.
 *
 * Background:
 *   PR #706 audit found `voice_fallback_url` empty on the prod number. If
 *   Vapi (the primary voice_url) is down or returns 5xx, Twilio has nothing
 *   to fall back to and the caller hears the carrier error tone instead of
 *   a branded "leave a message" experience. This script wires the fallback
 *   to our own handler at /api/twilio/voice-fallback.
 *
 * Scope:
 *   Only voice_fallback_url + voice_fallback_method. Does NOT touch
 *   voice_url, voice_application_sid, sms_url, status_callback, or any
 *   other field on the phone number.
 *
 * Behaviour:
 *   1. GET the IncomingPhoneNumber resource for TWILIO_PHONE_NUMBER.
 *   2. Diff fallback url + method against desired.
 *   3. If anything differs, POST (Twilio's update verb) only the changed
 *      fields.
 *   4. Re-GET and assert the new values stuck.
 *   5. Exit 0 on success (incl. no-op). Non-zero on any drift not corrected.
 *
 * Env (required):
 *   TWILIO_ACCOUNT_SID
 *   TWILIO_AUTH_TOKEN
 *   TWILIO_PHONE_NUMBER     — E.164, the number whose fallback we're setting.
 *
 * Env (optional):
 *   TWILIO_VOICE_FALLBACK_URL  — override the default fallback URL.
 *   DRY_RUN                     — set to "1" to print the diff but skip PATCH.
 *
 * Usage:
 *   doppler run --project wefixtrades --config prd -- \
 *     node scripts/twilio/patch-fallback-url.mjs
 *
 *   # preview only:
 *   doppler run --project wefixtrades --config prd -- \
 *     DRY_RUN=1 node scripts/twilio/patch-fallback-url.mjs
 */

const ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER;
const DRY_RUN = process.env.DRY_RUN === "1";

const DESIRED = Object.freeze({
  voice_fallback_url:
    process.env.TWILIO_VOICE_FALLBACK_URL ??
    "https://wefixtrades.com/api/twilio/voice-fallback",
  voice_fallback_method: "POST",
});

function log(line) {
  console.log(`[twilio-fallback] ${line}`);
}

function fail(line) {
  console.error(`[twilio-fallback] ERROR: ${line}`);
  process.exit(1);
}

function authHeader() {
  return "Basic " + Buffer.from(`${ACCOUNT_SID}:${AUTH_TOKEN}`).toString("base64");
}

async function twilio(method, path, formBody) {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${ACCOUNT_SID}${path}`;
  const init = {
    method,
    headers: { Authorization: authHeader() },
  };
  if (formBody) {
    init.headers["Content-Type"] = "application/x-www-form-urlencoded";
    init.body = new URLSearchParams(formBody).toString();
  }
  const res = await fetch(url, init);
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    /* leave as text */
  }
  if (!res.ok) {
    const detail = data ? JSON.stringify(data) : text;
    fail(`${method} ${path} -> HTTP ${res.status}: ${detail}`);
  }
  return data;
}

async function findNumber() {
  const list = await twilio(
    "GET",
    `/IncomingPhoneNumbers.json?PhoneNumber=${encodeURIComponent(PHONE_NUMBER)}`,
  );
  const arr = list?.incoming_phone_numbers ?? [];
  if (arr.length === 0) {
    fail(`No IncomingPhoneNumber found matching TWILIO_PHONE_NUMBER (...${(PHONE_NUMBER || "").slice(-4)}).`);
  }
  if (arr.length > 1) {
    log(`WARN: ${arr.length} numbers matched, using first (sid ...${arr[0].sid.slice(-4)}).`);
  }
  return arr[0];
}

function diff(live, desired) {
  const out = {};
  for (const [key, want] of Object.entries(desired)) {
    if ((live?.[key] ?? "") !== want) {
      out[key] = { from: live?.[key] ?? "", to: want };
    }
  }
  return out;
}

async function main() {
  if (!ACCOUNT_SID || !AUTH_TOKEN || !PHONE_NUMBER) {
    fail("TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER are required. Run via `doppler run --project wefixtrades --config prd --`.");
  }

  log("Fetching live IncomingPhoneNumber config ...");
  const before = await findNumber();
  const numberSid = before.sid;
  log(`Phone number sid ...${numberSid.slice(-4)} located.`);
  log(`Live voice_url            = ${before.voice_url || "(empty)"}`);
  log(`Live voice_fallback_url   = ${before.voice_fallback_url || "(empty)"}`);
  log(`Live voice_fallback_method= ${before.voice_fallback_method || "(empty)"}`);

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

  // Twilio updates IncomingPhoneNumber via HTTP POST with form params.
  // Field names in the API are PascalCase (e.g. VoiceFallbackUrl).
  const formBody = {};
  if (pending.voice_fallback_url) formBody.VoiceFallbackUrl = DESIRED.voice_fallback_url;
  if (pending.voice_fallback_method) formBody.VoiceFallbackMethod = DESIRED.voice_fallback_method;

  log(`POST /IncomingPhoneNumbers/...${numberSid.slice(-4)}.json with ${Object.keys(formBody).length} field(s)`);
  await twilio("POST", `/IncomingPhoneNumbers/${numberSid}.json`, formBody);

  log("Re-reading IncomingPhoneNumber to verify ...");
  const after = await twilio("GET", `/IncomingPhoneNumbers/${numberSid}.json`);
  const stillOff = diff(after, DESIRED);
  if (Object.keys(stillOff).length !== 0) {
    fail(`POST applied but read-back still drifts: ${JSON.stringify(stillOff)}`);
  }

  log(`Verified. voice_fallback_url = ${after.voice_fallback_url}`);
  log(`Verified. voice_fallback_method = ${after.voice_fallback_method}`);
}

main().catch((err) => {
  fail(err?.stack ?? String(err));
});
