#!/usr/bin/env node
/**
 * TradeLine model benchmark — assistant provisioner (config-driven).
 *
 * Clones the LIVE Riley assistant's full pipeline (transcriber, voice, prompt,
 * temperature, maxTokens, endpointing, brand strings, the recommend_services
 * tool) and creates/updates ONE benchmark assistant per entry in models.json,
 * changing ONLY model.provider + model.model. Idempotent by name, so re-running
 * after editing models.json adds/updates assistants without duplicating.
 *
 * The whole point: add a new model = add a line to models.json + re-run this.
 * No code changes.
 *
 * Env: VAPI_API_KEY (Doppler wefixtrades/prd).
 * Usage:
 *   doppler run --project wefixtrades --config prd -- node scripts/vapi/bench/provision.mjs
 *   DRY_RUN=1 ... (print payloads, create nothing)
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dir = dirname(fileURLToPath(import.meta.url));
const API = process.env.VAPI_API_BASE ?? "https://api.vapi.ai";
const KEY = process.env.VAPI_API_KEY;
const DRY = process.env.DRY_RUN === "1";
if (!KEY) { console.error("VAPI_API_KEY not set — run via doppler wefixtrades/prd."); process.exit(1); }

const cfg = JSON.parse(readFileSync(join(__dir, "models.json"), "utf8"));

// The one tool the prompt already assumes. Added IDENTICALLY to every variant so
// tool-calling reliability is measurable and the comparison stays fair.
const RECOMMEND_SERVICES_TOOL = {
  type: "function",
  function: {
    name: "recommend_services",
    description:
      "Show the caller tappable product cards for the WeFixTrades services being recommended. Call whenever you recommend one or more specific services.",
    parameters: {
      type: "object",
      properties: {
        service_ids: {
          type: "array",
          items: {
            type: "string",
            enum: ["mapguard-setup","mapguard-ongoing","reputationshield","tradeline","webfix","rankflow","webcare","sitelaunch","quotequick","socialsync","adflow","bookflow"],
          },
          description: "IDs of the services to display as cards.",
        },
      },
      required: ["service_ids"],
    },
  },
};

async function vapi(method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data = null; try { data = text ? JSON.parse(text) : null; } catch {}
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${data ? JSON.stringify(data) : text}`);
  return data;
}

// Build the shared, model-independent base from the live Riley assistant.
function buildBase(riley) {
  const m = riley.model || {};
  const systemMsg = (m.messages || []).find((x) => x.role === "system");
  return {
    // fixed pipeline — cloned exactly
    transcriber: riley.transcriber,
    voice: riley.voice,
    firstMessage: riley.firstMessage,
    voicemailMessage: riley.voicemailMessage,
    endCallMessage: riley.endCallMessage,
    endCallFunctionEnabled: riley.endCallFunctionEnabled,
    endCallPhrases: riley.endCallPhrases,
    backgroundDenoisingEnabled: riley.backgroundDenoisingEnabled,
    startSpeakingPlan: riley.startSpeakingPlan,
    stopSpeakingPlan: riley.stopSpeakingPlan,
    clientMessages: riley.clientMessages,
    serverMessages: riley.serverMessages,
    // model shell — everything fixed except provider/model (set per variant)
    _modelShell: {
      temperature: m.temperature,
      maxTokens: m.maxTokens,
      messages: systemMsg ? [{ role: "system", content: systemMsg.content }] : [],
      tools: [RECOMMEND_SERVICES_TOOL],
    },
  };
}

async function main() {
  console.log(`[bench] fetching live base assistant …${cfg.baseAssistantId.slice(-4)}`);
  const riley = await vapi("GET", `/assistant/${cfg.baseAssistantId}`);
  const base = buildBase(riley);

  console.log("[bench] listing existing assistants (idempotency) …");
  const existing = await vapi("GET", `/assistant?limit=200`);
  const byName = new Map((existing || []).map((a) => [a.name, a]));

  const out = [];
  for (const entry of cfg.models) {
    const name = `${cfg.namePrefix} — ${entry.label}`;
    const payload = {
      name,
      ...base,
      model: { provider: entry.provider, model: entry.model, ...base._modelShell },
    };
    delete payload._modelShell;

    if (DRY) { console.log(`[bench] DRY ${name}: model=${entry.provider}/${entry.model}`); out.push({ ...entry, name }); continue; }

    let assistant;
    if (byName.has(name)) {
      const id = byName.get(name).id;
      assistant = await vapi("PATCH", `/assistant/${id}`, payload);
      console.log(`[bench] updated  ${name}  (…${id.slice(-4)})`);
    } else {
      assistant = await vapi("POST", `/assistant`, payload);
      console.log(`[bench] created  ${name}  (…${assistant.id.slice(-4)})`);
    }
    out.push({ ...entry, name, assistantId: assistant.id });
  }

  writeFileSync(join(__dir, "bench-assistants.json"), JSON.stringify({ publicKeyHint: "VAPI_PUBLIC_KEY", assistants: out }, null, 2));
  console.log(`[bench] wrote bench-assistants.json (${out.length} assistants)`);
}
main().catch((e) => { console.error("[bench] ERROR:", e.message); process.exit(1); });
