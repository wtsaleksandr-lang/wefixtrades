#!/usr/bin/env node
/**
 * TradeLine VOICE benchmark — the axis that actually moves naturalness.
 * Holds the LLM fixed and varies only the voice engine / architecture:
 *   - upgraded cascade TTS voices (ElevenLabs, Cartesia, OpenAI gpt-4o-mini-tts)
 *   - one OpenAI Realtime speech-to-speech assistant (the "ChatGPT-style" one).
 * Everything else cloned from live Riley. Creates/updates idempotently by name,
 * and reports per-variant success/failure so partial success is fine.
 *
 * Env: VAPI_API_KEY (Doppler wefixtrades/prd).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const __dir = dirname(fileURLToPath(import.meta.url));
const API = "https://api.vapi.ai";
const KEY = process.env.VAPI_API_KEY;
if (!KEY) { console.error("VAPI_API_KEY not set"); process.exit(1); }
const cfg = JSON.parse(readFileSync(join(__dir, "models.json"), "utf8"));

const TOOL = { type: "function", function: { name: "recommend_services",
  description: "Show tappable product cards for recommended WeFixTrades services.",
  parameters: { type: "object", properties: { service_ids: { type: "array",
    items: { type: "string", enum: ["mapguard-setup","mapguard-ongoing","reputationshield","tradeline","webfix","rankflow","webcare","sitelaunch","quotequick","socialsync","adflow","bookflow"] } } }, required: ["service_ids"] } } };

// Fixed LLM for the cascade voice tests = the current model, so ONLY the voice changes.
const FIXED_MODEL = { provider: "openai", model: "gpt-4o" };

// Voice experiments. Each: {label, voice, realtime?}. Realtime replaces model + drops transcriber.
const VARIANTS = [
  { label: "OpenAI gpt-4o-mini-tts (Nova, steered)", short: "OpenAI TTS (Nova)", slug: "openai-tts-nova",
    voice: { provider: "openai", voiceId: "nova", model: "gpt-4o-mini-tts",
      instructions: "Warm, upbeat front-desk receptionist. Friendly and unhurried, with natural pauses. Never robotic." } },
  { label: "ElevenLabs Turbo v2.5 (Rachel)", short: "ElevenLabs (Rachel)", slug: "elevenlabs-rachel",
    voice: { provider: "11labs", voiceId: "21m00Tcm4TlvDq8ikWAM", model: "eleven_turbo_v2_5", stability: 0.4, similarityBoost: 0.8, speed: 0.96 } },
  { label: "Cartesia Sonic-3", short: "Cartesia Sonic-3", slug: "cartesia-sonic3",
    voice: { provider: "cartesia", voiceId: "a0e99841-438c-4a64-b679-ae501e7d6091", model: "sonic-3" } },
  { label: "OpenAI Realtime (Cedar, speech-to-speech)", short: "Realtime (Cedar)", slug: "openai-realtime-cedar",
    realtime: true, voice: { provider: "openai", voiceId: "cedar" },
    model: { provider: "openai", model: "gpt-realtime-2025-08-28" } },
];

async function vapi(method, path, body) {
  const res = await fetch(`${API}${path}`, { method, headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text(); let data = null; try { data = text ? JSON.parse(text) : null; } catch {}
  if (!res.ok) throw new Error(`${res.status}: ${data ? JSON.stringify(data).slice(0,300) : text.slice(0,300)}`);
  return data;
}

async function main() {
  const riley = await vapi("GET", `/assistant/${cfg.baseAssistantId}`);
  const sys = (riley.model.messages || []).find((x) => x.role === "system");
  const existing = await vapi("GET", `/assistant?limit=200`);
  const byName = new Map((existing || []).map((a) => [a.name, a]));

  const base = {
    firstMessage: riley.firstMessage, voicemailMessage: riley.voicemailMessage, endCallMessage: riley.endCallMessage,
    endCallFunctionEnabled: riley.endCallFunctionEnabled, endCallPhrases: riley.endCallPhrases,
    backgroundDenoisingEnabled: riley.backgroundDenoisingEnabled, backgroundSound: "office",
    startSpeakingPlan: riley.startSpeakingPlan, stopSpeakingPlan: riley.stopSpeakingPlan,
    clientMessages: riley.clientMessages, serverMessages: riley.serverMessages,
  };
  const modelShell = { temperature: riley.model.temperature, maxTokens: riley.model.maxTokens,
    messages: sys ? [{ role: "system", content: sys.content }] : [], tools: [TOOL] };

  const out = [];
  for (const v of VARIANTS) {
    const name = `TradeLine Voice — ${v.short}`;
    const payload = { name, ...base, voice: v.voice };
    if (v.realtime) {
      payload.model = { ...v.model, ...modelShell };
      // realtime = no transcriber (audio in/out native)
    } else {
      payload.transcriber = riley.transcriber;
      payload.model = { ...FIXED_MODEL, ...modelShell };
    }
    try {
      let a;
      if (byName.has(name)) { a = await vapi("PATCH", `/assistant/${byName.get(name).id}`, payload); console.log(`OK  updated  ${v.label}  (…${a.id.slice(-4)})`); }
      else { a = await vapi("POST", `/assistant`, payload); console.log(`OK  created  ${v.label}  (…${a.id.slice(-4)})`); }
      out.push({ ...v, name, assistantId: a.id, ok: true });
    } catch (e) { console.log(`FAIL ${v.label}: ${e.message}`); out.push({ ...v, name, ok: false, error: e.message }); }
  }
  writeFileSync(join(__dir, "voice-assistants.json"), JSON.stringify({ assistants: out.filter(x=>x.ok) }, null, 2));
  console.log(`\n${out.filter(x=>x.ok).length}/${out.length} voice variants live.`);
}
main().catch((e) => { console.error("ERROR:", e.message); process.exit(1); });
