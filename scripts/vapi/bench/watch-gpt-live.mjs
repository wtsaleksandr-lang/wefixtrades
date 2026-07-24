#!/usr/bin/env node
/**
 * GPT-Live watcher (runs in CI on a schedule; also runnable locally).
 *
 * Watches Vapi's live model enum for a NEW OpenAI realtime/"live" model beyond
 * today's known set. The instant one appears (i.e. Vapi supports GPT-Live via
 * API), it auto-provisions a demo assistant cloning the tuned Cedar setup with
 * the new model, and prints a machine-readable result the CI workflow turns
 * into a GitHub issue / notification.
 *
 * Idempotent: if the auto demo assistant already exists, it does nothing (so it
 * won't re-notify every run).
 *
 * Env: VAPI_API_KEY (required). Optional VAPI_BASE_ASSISTANT_ID to clone from.
 * Output: prints a single line `GPTLIVE_RESULT=<json>` for CI to parse.
 */
const API = "https://api.vapi.ai";
const KEY = process.env.VAPI_API_KEY;
const BASE_ID = process.env.VAPI_BASE_ASSISTANT_ID || "34aa037e-38f7-4cbb-a48e-9c3c5d10bcfa";
const DEMO_NAME = "TradeLine — GPT-Live (auto)";

// Realtime/"live" model ids known as of 2026-07-22. Anything new beyond these = the trigger.
const KNOWN = new Set([
  "gpt-4o-realtime-preview-2024-10-01",
  "gpt-4o-realtime-preview-2024-12-17",
  "gpt-4o-mini-realtime-preview-2024-12-17",
  "gpt-realtime-2025-08-28",
  "gpt-realtime-mini-2025-12-15",
  "gpt-realtime-2",
]);

async function vapi(method, path, body) {
  const res = await fetch(`${API}${path}`, { method, headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const t = await res.text(); let d = null; try { d = t ? JSON.parse(t) : null; } catch { d = null; }
  if (!res.ok) throw new Error(`${method} ${path} ${res.status}: ${(d ? JSON.stringify(d) : t).slice(0, 200)}`);
  return d;
}
function emit(obj) { console.log("GPTLIVE_RESULT=" + JSON.stringify(obj)); }

async function main() {
  if (!KEY) { emit({ error: "VAPI_API_KEY missing" }); process.exit(1); }
  // 1) current realtime/live models from Vapi's authoritative enum
  const spec = await (await fetch(`${API.replace("api.", "api.")}/api-json`)).json();
  const om = spec?.components?.schemas?.OpenAIModel?.properties?.model;
  const all = om?.enum || (om?.anyOf || []).flatMap((x) => x.enum || []);
  const realtime = all.filter((m) => /realtime|live/i.test(m));
  const fresh = realtime.filter((m) => !KNOWN.has(m));
  if (fresh.length === 0) { emit({ found: false, checked: realtime.length }); return; }

  // Prefer a model whose name says "live"; else the newest fresh one.
  const pick = fresh.find((m) => /live/i.test(m)) || fresh.sort().at(-1);

  // 2) idempotency — already handled?
  const existing = await vapi("GET", `/assistant?limit=200`);
  const already = (existing || []).find((a) => a.name === DEMO_NAME);
  if (already) { emit({ found: true, model: pick, freshModels: fresh, alreadyProvisioned: true, assistantId: already.id }); return; }

  // 3) provision a demo assistant cloning the tuned Cedar speech-to-speech setup
  const riley = await vapi("GET", `/assistant/${BASE_ID}`);
  const sys = (riley.model.messages || []).find((x) => x.role === "system")?.content || "";
  const payload = {
    name: DEMO_NAME,
    firstMessage: riley.firstMessage, voicemailMessage: riley.voicemailMessage, endCallMessage: riley.endCallMessage,
    endCallFunctionEnabled: riley.endCallFunctionEnabled, endCallPhrases: riley.endCallPhrases,
    backgroundSound: "office", firstMessageInterruptionsEnabled: true,
    startSpeakingPlan: { waitSeconds: 0.2, smartEndpointingEnabled: "livekit", transcriptionEndpointingPlan: { onPunctuationSeconds: 0.1, onNoPunctuationSeconds: 0.8, onNumberSeconds: 0.3 } },
    stopSpeakingPlan: { numWords: 0, voiceSeconds: 0.15, backoffSeconds: 0.8 },
    clientMessages: riley.clientMessages,
    voice: { provider: "openai", voiceId: "cedar" }, // no transcriber = native speech-to-speech
    model: { provider: "openai", model: pick, temperature: riley.model.temperature ?? 0.6, maxTokens: riley.model.maxTokens ?? 160, messages: [{ role: "system", content: sys }] },
  };
  const created = await vapi("POST", `/assistant`, payload);
  emit({ found: true, model: pick, freshModels: fresh, alreadyProvisioned: false, assistantId: created.id, name: DEMO_NAME });
}
main().catch((e) => { emit({ error: String(e.message || e) }); process.exit(1); });
