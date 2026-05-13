/**
 * Doppler → process.env bootstrap. Runs FIRST in server/index.ts, before
 * any other module that reads process.env at import time (server/db.ts
 * throws on missing DATABASE_URL, etc.).
 *
 * Goal: pull secrets stored only in Doppler into the runtime env so we
 * don't have to manually mirror everything into Replit Secrets. The
 * inverse case — secrets only in Replit Secrets — also still works
 * because Replit-injected env vars take precedence (we only fill in
 * MISSING keys; never overwrite).
 *
 * Failure mode: soft. If DOPPLER_TOKEN is unset, Doppler is unreachable,
 * the response is malformed, or the request times out, we log a warning
 * and continue with whatever env the runtime already has. The server
 * still boots; only Doppler-only secrets are missing.
 *
 * Sync execution via execSync curl is deliberate — we need the secrets
 * in process.env BEFORE any other ESM import runs, and Node's native
 * fetch is async-only. The Replit autoscale container is single-tenant
 * so argv-visibility of the token for ~5s is acceptable risk.
 */

import { execSync } from "node:child_process";

(() => {
  const token = process.env.DOPPLER_TOKEN;
  if (!token) {
    console.log("[doppler-bootstrap] DOPPLER_TOKEN not set — skipping");
    return;
  }

  const project = process.env.DOPPLER_PROJECT || "wefixtrades";
  const config = process.env.DOPPLER_CONFIG || "dev";
  const url = `https://api.doppler.com/v3/configs/config/secrets?project=${encodeURIComponent(project)}&config=${encodeURIComponent(config)}&include_dynamic_secrets=false&include_managed_secrets=false`;

  let raw: string;
  try {
    raw = execSync(
      `curl -s --max-time 5 --fail -H "Authorization: Bearer ${token}" "${url}"`,
      { encoding: "utf8", timeout: 6000, stdio: ["ignore", "pipe", "pipe"] },
    );
  } catch (err) {
    const msg = (err as Error).message;
    console.warn(`[doppler-bootstrap] fetch failed (${msg.split("\n")[0]}) — proceeding without Doppler`);
    return;
  }

  let payload: { secrets?: Record<string, { computed?: string; raw?: string }> };
  try {
    payload = JSON.parse(raw);
  } catch {
    console.warn("[doppler-bootstrap] response was not valid JSON — proceeding without Doppler");
    return;
  }

  const secrets = payload?.secrets ?? {};
  let applied = 0;
  let skippedExisting = 0;
  let skippedEmpty = 0;

  for (const [key, value] of Object.entries(secrets)) {
    // Doppler bookkeeping vars — never inject these into the app
    if (key.startsWith("DOPPLER_") || key === "NAME") continue;

    // Replit Secrets / .env / runtime env wins over Doppler — preserve existing values.
    // This means rotating a value in Replit Secrets but not Doppler stays consistent.
    if (process.env[key] !== undefined && process.env[key] !== "") {
      skippedExisting++;
      continue;
    }

    const v = value?.computed ?? value?.raw;
    if (typeof v === "string" && v.length > 0) {
      process.env[key] = v;
      applied++;
    } else {
      skippedEmpty++;
    }
  }

  console.log(
    `[doppler-bootstrap] project=${project} config=${config} ` +
      `fetched=${Object.keys(secrets).length} applied=${applied} ` +
      `kept-from-runtime=${skippedExisting} empty=${skippedEmpty}`,
  );
})();
