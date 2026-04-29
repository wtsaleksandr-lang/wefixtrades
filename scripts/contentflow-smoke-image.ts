/**
 * ContentFlow Sprint 19 — image generation + R2 storage smoke test.
 *
 * Steps:
 *   1. Call OpenAI gpt-image-1 with a benign prompt (real API)
 *   2. Verify response shape (URL or base64)
 *   3. If R2 env is configured: PUT the bytes to R2, GET back, verify reachable
 *   4. (Optional) DELETE the test object
 *
 * Triple-gated:
 *   CONTENTFLOW_REAL_API_SMOKE=1   master
 *   ALLOW_REAL_POSTS=1             not strictly needed (generated image isn't user-facing) — but kept consistent
 *   DRY_RUN=1                      skips the actual /images/generations call
 *
 * Operator-supplied:
 *   OPENAI_API_KEY              (already a prod env var — no SMOKE_ prefix needed)
 *   R2_ACCESS_KEY_ID
 *   R2_SECRET_ACCESS_KEY
 *   R2_BUCKET_NAME
 *   R2_ENDPOINT
 *   R2_PUBLIC_URL
 *
 * Usage:
 *   CONTENTFLOW_REAL_API_SMOKE=1 DRY_RUN=1 npx tsx scripts/contentflow-smoke-image.ts
 *   CONTENTFLOW_REAL_API_SMOKE=1 npx tsx scripts/contentflow-smoke-image.ts
 */

import * as crypto from "crypto";
import { log, err, runSmoke, preflight, isDryRun } from "./lib/smokeReport";

const SCRIPT = "image";

async function main(): Promise<void> {
  /* Image gen does NOT require ALLOW_REAL_POSTS — it doesn't post anywhere
   * publicly. Only the master smoke gate is needed. */
  const skip = preflight(SCRIPT, { requirePublicPost: false });
  if (skip) {
    const { recordResult } = await import("./lib/smokeReport");
    recordResult(SCRIPT, skip);
    log(SCRIPT, "skipped:", skip.message);
    return;
  }

  await runSmoke(SCRIPT, SCRIPT, async () => {
    const openaiKey = process.env.OPENAI_API_KEY;
    if (!openaiKey) {
      return {
        status: "blocked",
        message: "missing OPENAI_API_KEY",
        manual_steps: ["Set OPENAI_API_KEY in the env (prod-grade key with image-generation scope)."],
      };
    }
    if (process.env.IMAGE_API_BASE_OVERRIDE) {
      return {
        status: "blocked",
        message: "IMAGE_API_BASE_OVERRIDE is set — this points at the dev mock; unset before real-API smoke",
        manual_steps: ["Unset IMAGE_API_BASE_OVERRIDE in this env to use real OpenAI."],
      };
    }

    const r2Configured =
      process.env.R2_ACCESS_KEY_ID &&
      process.env.R2_SECRET_ACCESS_KEY &&
      process.env.R2_BUCKET_NAME &&
      process.env.R2_PUBLIC_URL &&
      process.env.R2_ENDPOINT;

    if (isDryRun()) {
      return {
        status: "ok",
        message: `DRY_RUN: env wired (openai=set, r2=${r2Configured ? "configured" : "not configured"}); skipped real call`,
        details: { r2_configured: !!r2Configured },
      };
    }

    /* Step 1 — call OpenAI. */
    const model = process.env.IMAGE_MODEL || "gpt-image-1";
    const size = process.env.IMAGE_SIZE || "1024x1024";
    const prompt = "A clean, plain product-shot style photo of a roll of plumbing tape on a neutral background. No text, no logos, daylight.";
    log(SCRIPT, `POST /v1/images/generations model=${model} size=${size}`);
    let res: Response;
    try {
      res = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${openaiKey}`,
        },
        body: JSON.stringify({ model, prompt, size, n: 1 }),
        signal: AbortSignal.timeout(60_000),
      });
    } catch (e: any) {
      return { status: "failed", message: `image API unreachable: ${e?.message || e}` };
    }
    const body: any = await res.json().catch(() => ({}));
    if (!res.ok || body?.error) {
      return {
        status: "failed",
        message: `image API rejected: ${body?.error?.message ?? `HTTP ${res.status}`}`,
        details: { http_status: res.status, error_code: body?.error?.code ?? null, error_type: body?.error?.type ?? null },
      };
    }
    const first = body?.data?.[0] ?? {};
    const url = first.url as string | undefined;
    const b64 = first.b64_json as string | undefined;
    if (!url && !b64) {
      return { status: "failed", message: "image API returned no url and no b64_json", details: { response_shape: Object.keys(body) } };
    }
    log(SCRIPT, `image generated (${url ? "url" : "b64_json"} mode)`);

    /* Step 2 — fetch bytes (whether url or b64). */
    let bytes: Buffer;
    if (b64) {
      bytes = Buffer.from(b64, "base64");
    } else {
      try {
        const r = await fetch(url!, { signal: AbortSignal.timeout(30_000) });
        if (!r.ok) {
          return { status: "failed", message: `image url returned ${r.status}` };
        }
        const ab = await r.arrayBuffer();
        bytes = Buffer.from(ab);
      } catch (e: any) {
        return { status: "failed", message: `failed to fetch image url: ${e?.message || e}` };
      }
    }
    log(SCRIPT, `bytes=${bytes.length}`);

    /* Step 3 — R2 upload (if configured). Uses SigV4 PUT, no SDK. */
    if (!r2Configured) {
      return {
        status: "ok",
        message: `image generated (${bytes.length} bytes); R2 not configured — upload skipped`,
        details: { bytes: bytes.length, r2_configured: false },
        manual_steps: [
          "To validate full R2 path, set R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_BUCKET_NAME / R2_ENDPOINT / R2_PUBLIC_URL.",
        ],
      };
    }

    /* Reuse the same SigV4 path Sprint 11 uses. We import it lazily so the
     * script is self-contained when R2 is unconfigured. */
    let r2Module: any;
    try {
      r2Module = await import("../server/services/contentflow/imageGenerationService");
    } catch (e: any) {
      return { status: "failed", message: `R2 module load failed: ${e?.message || e}` };
    }
    /* The module exports uploadToR2 internally; without re-exporting we
     * fall back to a manual SigV4 PUT here. To keep this surgical (no
     * production export changes), we replicate the minimal upload path. */
    const objectKey = `smoke/sprint19-${Date.now()}-${crypto.randomBytes(4).toString("hex")}.png`;
    const endpoint = process.env.R2_ENDPOINT!.replace(/\/$/, "");
    const bucket = process.env.R2_BUCKET_NAME!;
    const publicUrl = process.env.R2_PUBLIC_URL!.replace(/\/$/, "");

    /* Use S3-style PUT via fetch with AWS SigV4 signing. We use an ad-hoc
     * SigV4 signer to avoid pulling in @aws-sdk/client-s3 just for a
     * smoke test. */
    const accessKey = process.env.R2_ACCESS_KEY_ID!;
    const secretKey = process.env.R2_SECRET_ACCESS_KEY!;
    const region = "auto";
    const host = new URL(endpoint).host;
    const canonicalUri = `/${bucket}/${objectKey}`;
    const isoDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
    const dateStamp = isoDate.slice(0, 8);
    const payloadHash = crypto.createHash("sha256").update(bytes).digest("hex");
    const canonicalHeaders =
      `host:${host}\n` +
      `x-amz-content-sha256:${payloadHash}\n` +
      `x-amz-date:${isoDate}\n`;
    const signedHeaders = "host;x-amz-content-sha256;x-amz-date";
    const canonicalRequest = `PUT\n${canonicalUri}\n\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;
    const credentialScope = `${dateStamp}/${region}/s3/aws4_request`;
    const stringToSign =
      `AWS4-HMAC-SHA256\n${isoDate}\n${credentialScope}\n` +
      crypto.createHash("sha256").update(canonicalRequest).digest("hex");
    const kDate = crypto.createHmac("sha256", `AWS4${secretKey}`).update(dateStamp).digest();
    const kRegion = crypto.createHmac("sha256", kDate).update(region).digest();
    const kService = crypto.createHmac("sha256", kRegion).update("s3").digest();
    const kSigning = crypto.createHmac("sha256", kService).update("aws4_request").digest();
    const signature = crypto.createHmac("sha256", kSigning).update(stringToSign).digest("hex");
    const authHeader = `AWS4-HMAC-SHA256 Credential=${accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    log(SCRIPT, `PUT R2 ${endpoint}${canonicalUri}`);
    let putRes: Response;
    try {
      putRes = await fetch(`${endpoint}${canonicalUri}`, {
        method: "PUT",
        headers: {
          Host: host,
          "x-amz-content-sha256": payloadHash,
          "x-amz-date": isoDate,
          Authorization: authHeader,
          "Content-Type": "image/png",
          "Content-Length": String(bytes.length),
        },
        body: bytes,
        signal: AbortSignal.timeout(30_000),
      });
    } catch (e: any) {
      return { status: "failed", message: `R2 PUT failed: ${e?.message || e}` };
    }
    if (!putRes.ok) {
      const t = await putRes.text().catch(() => "");
      return {
        status: "failed",
        message: `R2 PUT returned ${putRes.status}: ${t.slice(0, 200)}`,
        details: { http_status: putRes.status },
      };
    }
    log(SCRIPT, `R2 upload ok`);

    /* Step 4 — verify public URL is reachable. */
    const finalUrl = `${publicUrl}/${objectKey}`;
    log(SCRIPT, `verifying ${finalUrl}`);
    let getRes: Response;
    try {
      getRes = await fetch(finalUrl, { method: "HEAD", signal: AbortSignal.timeout(15_000) });
    } catch (e: any) {
      return {
        status: "failed",
        message: `public URL HEAD failed: ${e?.message || e}`,
        details: { public_url: finalUrl },
      };
    }
    if (!getRes.ok) {
      return {
        status: "failed",
        message: `public URL not reachable: HTTP ${getRes.status}`,
        details: { http_status: getRes.status, public_url: finalUrl },
      };
    }

    return {
      status: "ok",
      message: `image gen + R2 upload + public URL verified`,
      details: {
        bytes: bytes.length,
        r2_object_key: objectKey,
        public_url: finalUrl,
        model,
        size,
      },
      manual_steps: [
        `Smoke artefact lives at ${finalUrl}. Optional: delete via R2 console or wait for Sprint 11 retention worker.`,
      ],
    };
  });
}

main().catch((e) => {
  err(SCRIPT, "fatal:", e?.message || e);
  process.exit(0);
});
