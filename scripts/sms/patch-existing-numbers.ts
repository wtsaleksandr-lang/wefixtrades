/**
 * Wave 76 — one-shot sweep that retroactively attaches webhook URLs to
 * IncomingPhoneNumbers that were provisioned BEFORE the live `provisionNumber()`
 * fix landed. Those numbers shipped without voiceUrl / smsUrl / statusCallback,
 * so inbound calls fell through to Twilio default voicemail and inbound SMS
 * was dropped at Twilio's edge.
 *
 * Run manually post-merge — NOT from CI:
 *   doppler run --project wefixtrades --config prd -- \
 *     tsx scripts/sms/patch-existing-numbers.ts
 *
 *   # preview (no writes):
 *   doppler run --project wefixtrades --config prd -- \
 *     DRY_RUN=1 tsx scripts/sms/patch-existing-numbers.ts
 *
 * Behavior:
 *   - Queries tradeline_phone_setups WHERE assigned_number_sid IS NOT NULL
 *     AND provisioning_status='provisioned'.
 *   - For each row, calls Twilio
 *     client.incomingPhoneNumbers(sid).update({ ...desired URLs }) to
 *     idempotently re-apply the Wave 76 webhook spec.
 *   - Idempotent — safe to re-run. Twilio returns the updated resource even
 *     when the live values already match.
 *   - Skipped entirely when TRADELINE_SETUP_TEST_MODE=true or when Twilio
 *     credentials aren't configured.
 *   - Logs per-row outcome + a summary at the end.
 *
 * Scope:
 *   Voice + SMS webhook URLs and messagingServiceSid. Does NOT touch the
 *   phone number itself, capabilities, or any other field on the resource.
 */

import "dotenv/config";
import { pool } from "../../server/db";
import { getTwilioClient, isTwilioConfigured } from "../../server/twilioClient";
import { buildTwilioWebhookConfig } from "../../server/services/tradelineSetup/provisionNumber";

const DRY_RUN = process.env.DRY_RUN === "1";

interface Row {
  id: number;
  client_id: number;
  assigned_number: string | null;
  assigned_number_sid: string;
}

async function main(): Promise<void> {
  if (process.env.TRADELINE_SETUP_TEST_MODE === "true") {
    console.log("[patch-existing-numbers] TRADELINE_SETUP_TEST_MODE=true — skipping (test mode bypasses Twilio).");
    return;
  }

  if (!isTwilioConfigured()) {
    console.log("[patch-existing-numbers] Twilio not configured (TWILIO_ACCOUNT_SID/AUTH_TOKEN missing) — nothing to do.");
    return;
  }

  const webhookCfg = buildTwilioWebhookConfig();
  const messagingServiceSid = process.env.TWILIO_LINKED_MESSAGING_SERVICE?.trim() || "";

  console.log("[patch-existing-numbers] Desired webhook spec:");
  console.log(`  voiceUrl            = ${webhookCfg.voiceUrl}`);
  console.log(`  voiceFallbackUrl    = ${webhookCfg.voiceFallbackUrl}`);
  console.log(`  smsUrl              = ${webhookCfg.smsUrl}`);
  console.log(`  statusCallback      = ${webhookCfg.statusCallback}`);
  console.log(`  messagingServiceSid = ${messagingServiceSid || "(not set — will skip this field)"}`);
  if (DRY_RUN) {
    console.log("[patch-existing-numbers] DRY_RUN=1 — will list targets but not write.");
  }

  const result = await pool.query<Row>(
    `SELECT id, client_id, assigned_number, assigned_number_sid
       FROM tradeline_phone_setups
      WHERE assigned_number_sid IS NOT NULL
        AND provisioning_status = 'provisioned'
      ORDER BY id ASC`,
  );

  console.log(`[patch-existing-numbers] Found ${result.rows.length} provisioned number(s) to patch.`);

  if (result.rows.length === 0) return;

  const client = getTwilioClient();
  let okCount = 0;
  let skipCount = 0;
  let errCount = 0;

  for (const row of result.rows) {
    const tag = `setup#${row.id} client#${row.client_id} ${row.assigned_number ?? "(no number)"} sid=...${row.assigned_number_sid.slice(-4)}`;
    try {
      if (DRY_RUN) {
        console.log(`[patch-existing-numbers] DRY_RUN: would patch ${tag}`);
        skipCount += 1;
        continue;
      }

      const updateParams: Record<string, unknown> = {
        voiceUrl: webhookCfg.voiceUrl,
        voiceMethod: webhookCfg.voiceMethod,
        voiceFallbackUrl: webhookCfg.voiceFallbackUrl,
        voiceFallbackMethod: webhookCfg.voiceFallbackMethod,
        smsUrl: webhookCfg.smsUrl,
        smsMethod: webhookCfg.smsMethod,
        statusCallback: webhookCfg.statusCallback,
        statusCallbackMethod: webhookCfg.statusCallbackMethod,
      };
      if (messagingServiceSid) {
        updateParams.messagingServiceSid = messagingServiceSid;
      }

      await client.incomingPhoneNumbers(row.assigned_number_sid).update(updateParams as any);

      console.log(`[patch-existing-numbers] OK ${tag}`);
      okCount += 1;
    } catch (err) {
      const msg = (err as Error).message;
      console.error(`[patch-existing-numbers] ERR ${tag} — ${msg}`);
      errCount += 1;
    }
  }

  console.log("[patch-existing-numbers] ─── summary ───");
  console.log(`  patched:  ${okCount}`);
  console.log(`  skipped:  ${skipCount}${DRY_RUN ? " (DRY_RUN)" : ""}`);
  console.log(`  errors:   ${errCount}`);
  console.log(`  total:    ${result.rows.length}`);

  if (errCount > 0) {
    process.exitCode = 1;
  }
}

main()
  .then(() => pool.end())
  .catch(async (err) => {
    console.error("[patch-existing-numbers] FATAL:", err?.stack ?? String(err));
    await pool.end();
    process.exit(1);
  });
