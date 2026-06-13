/**
 * Unification wiring tests (P0): the number a client gets MUST be the number
 * the AI answers on, and we must NEVER report "live" when the AI can't answer.
 *
 * Excluded from `tsc --noEmit` (tsconfig `**\/*.test.ts`). Runnable standalone:
 *
 *   npx tsx server/services/tradelineSetup/unifyNumber.test.ts
 *
 * What these gate (each maps to a fixed P0 gap):
 *   - GAP 1: the bought number's Twilio voice_url must point at the SAME Vapi
 *     inbound URL the working platform number uses — NOT the never-registered
 *     `/api/twilio/voice/inbound` route that 404'd every inbound call.
 *   - GAP 2: provisioning the Vapi phone number must IMPORT the client's
 *     existing Twilio number (`number` + Twilio creds in the payload), not BUY
 *     a fresh one (the legacy `{provider:"twilio"}`-only payload).
 *   - GAP 4: getTradeLineReadiness must report NOT-ready (honest status) when
 *     the assistant is absent, so no surface tells the owner the line is live
 *     while the AI can't pick up.
 *
 * DB-free: env stubs satisfy db.ts's DATABASE_URL require (the stub never
 * connects), storage methods are monkeypatched, and global.fetch is stubbed so
 * no real Vapi/Twilio call is made.
 */
import assert from "node:assert/strict";

process.env.DATABASE_URL ||= "postgresql://stub:stub@localhost:5432/stub";
process.env.NODE_ENV ||= "test";
process.env.VAPI_API_KEY ||= "test-vapi-key";
process.env.VAPI_SERVER_URL ||= "https://wefixtrades.com";
process.env.TWILIO_ACCOUNT_SID = "ACtestaccountsidtestaccountsidtest";
process.env.TWILIO_AUTH_TOKEN = "testauthtokentestauthtokentest00";

let failures = 0;
function test(name: string, ok: boolean, detail = "") {
  if (ok) {
    console.log(`  ok  ${name}`);
  } else {
    failures++;
    console.error(`  FAIL ${name}${detail ? `\n      ${detail}` : ""}`);
  }
}

async function main() {
  // ── GAP 1: the Twilio webhook config routes inbound voice to Vapi ──
  const { buildTwilioWebhookConfig } = await import("./provisionNumber");
  const { VAPI_TWILIO_INBOUND_VOICE_URL } = await import("../vapiService");
  const cfg = buildTwilioWebhookConfig();

  test(
    "GAP1: voiceUrl points at the Vapi inbound URL (not the dead route)",
    cfg.voiceUrl === VAPI_TWILIO_INBOUND_VOICE_URL,
    `voiceUrl=${cfg.voiceUrl}`,
  );
  test(
    "GAP1: voiceUrl is NOT the never-registered /api/twilio/voice/inbound route",
    !cfg.voiceUrl.includes("/api/twilio/voice/inbound"),
    `voiceUrl=${cfg.voiceUrl}`,
  );
  test(
    "GAP1: the Vapi inbound URL matches the working platform number's value",
    VAPI_TWILIO_INBOUND_VOICE_URL === "https://api.vapi.ai/twilio/inbound_call",
    `value=${VAPI_TWILIO_INBOUND_VOICE_URL}`,
  );

  // ── GAP 2: provisionVapiPhoneNumber IMPORTS the client's number ──
  const vapiService = await import("../vapiService");
  const { storage } = await import("../../storage");

  // Monkeypatch storage so no DB is touched. The function reads the config to
  // check for an existing vapiPhoneNumberId (none), then writes back the id.
  (storage as any).getTradeLineConfig = async () => ({
    assistant: { status: "built", vapiAssistantId: "asst_existing", templateId: "", inputHash: "", lastBuiltAt: "", lastBuildError: "", manualOverride: false },
  });
  (storage as any).updateTradeLineConfig = async () => ({});
  (storage as any).logAdminActivity = async () => undefined;

  // Capture the exact body sent to Vapi.
  const realFetch = global.fetch;
  let captured: { url: string; body: any } | null = null;
  global.fetch = (async (url: any, init: any) => {
    captured = { url: String(url), body: init?.body ? JSON.parse(init.body) : null };
    return {
      ok: true,
      status: 200,
      json: async () => ({ id: "vapi_pn_123", number: "+14155550123" }),
      text: async () => "",
    } as any;
  }) as any;

  let importResult: any;
  try {
    importResult = await vapiService.provisionVapiPhoneNumber(
      42,
      "asst_existing",
      { importNumber: "+14155550123" },
    );
  } finally {
    global.fetch = realFetch;
  }

  test(
    "GAP2: POSTs to the Vapi /phone-number endpoint",
    !!captured && captured.url.endsWith("/phone-number"),
    `url=${captured?.url}`,
  );
  test(
    "GAP2: import payload carries the CLIENT's number (imports, not buys)",
    !!captured && captured.body?.number === "+14155550123",
    `body=${JSON.stringify(captured?.body)}`,
  );
  test(
    "GAP2: import payload carries Twilio account SID + auth token",
    !!captured &&
      captured.body?.twilioAccountSid === process.env.TWILIO_ACCOUNT_SID &&
      captured.body?.twilioAuthToken === process.env.TWILIO_AUTH_TOKEN,
    `body=${JSON.stringify({ sid: captured?.body?.twilioAccountSid, tok: captured?.body?.twilioAuthToken ? "set" : "missing" })}`,
  );
  test(
    "GAP2: import payload attaches the assistant to THAT number",
    !!captured && captured.body?.assistantId === "asst_existing",
    `assistantId=${captured?.body?.assistantId}`,
  );
  test(
    "GAP2: import payload provider is twilio",
    !!captured && captured.body?.provider === "twilio",
    `provider=${captured?.body?.provider}`,
  );
  test(
    "GAP2: returns the imported number + Vapi phone id",
    importResult?.phoneNumberId === "vapi_pn_123" && importResult?.number === "+14155550123",
    `result=${JSON.stringify(importResult)}`,
  );

  // Negative fixture: with NO importNumber, the legacy payload omits `number`
  // — which is exactly how Vapi was told to BUY a fresh number (the bug).
  let buyBody: any = null;
  global.fetch = (async (_url: any, init: any) => {
    buyBody = init?.body ? JSON.parse(init.body) : null;
    return { ok: true, status: 200, json: async () => ({ id: "vapi_pn_buy" }), text: async () => "" } as any;
  }) as any;
  (storage as any).getTradeLineConfig = async () => ({
    assistant: { status: "built", vapiAssistantId: "asst_existing" },
  });
  try {
    await vapiService.provisionVapiPhoneNumber(43, "asst_existing");
  } finally {
    global.fetch = realFetch;
  }
  test(
    "GAP2 (negative): no-import payload omits `number` (the legacy BUY shape) — proves import mode is what differs",
    buyBody && buyBody.number === undefined,
    `buyBody=${JSON.stringify(buyBody)}`,
  );

  // ── GAP 4: honest readiness — NOT live when the assistant is absent ──
  const { getTradeLineReadiness } = await import("@shared/schema");

  // A voice variant, number provisioned + voice webhook attached, BUT the
  // assistant was never built. This is the exact false-"live" trap: the number
  // is wired but the AI can't answer. Readiness MUST be false.
  const cfgNoAssistant: any = {
    variant: "call_backup",
    setupStage: "ready_for_testing",
    channels: { voice: true, sms: false, websiteChat: false, websiteVoice: false, hostedFallback: false },
    phoneRouting: { primaryBusinessNumber: "+14155550123" },
    website: { embedMode: "none" },
    assistant: { status: "not_built" },
  };
  const r1 = getTradeLineReadiness(cfgNoAssistant, {
    provisioningStatus: "provisioned",
    voiceWebhookAttached: true,
    smsWebhookAttached: true,
  });
  test(
    "GAP4: NOT ready when assistant is absent even though number is wired",
    r1.ready === false && r1.issues.some((i: string) => /assistant/i.test(i)),
    `issues=${JSON.stringify(r1.issues)}`,
  );

  // Same config but assistant built → ready. Confirms the gate is the assistant
  // (and the number-health signals), not an unrelated field.
  const cfgBuilt = { ...cfgNoAssistant, assistant: { status: "built" } };
  const r2 = getTradeLineReadiness(cfgBuilt, {
    provisioningStatus: "provisioned",
    voiceWebhookAttached: true,
    smsWebhookAttached: true,
  });
  test(
    "GAP4: ready ONLY when assistant built AND number health is green",
    r2.ready === true,
    `issues=${JSON.stringify(r2.issues)}`,
  );

  if (failures > 0) {
    console.error(`\n${failures} test(s) failed`);
    process.exit(1);
  }
  console.log("\nall tradeline unification tests passed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
