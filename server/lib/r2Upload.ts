/**
 * Minimal Cloudflare R2 uploader (dependency-free SigV4 PUT).
 *
 * Extracted as a shared helper so portal surfaces can persist a generated
 * asset to R2 the same way the ContentFlow image-generation engine does,
 * WITHOUT importing the engine (which would drag in the generation stack).
 * The signing/PUT logic mirrors the proven implementation in
 * server/services/contentflow/imageGenerationService.ts (Sprint 11). R2 uses
 * the same SigV4 signing as S3, so this avoids pulling @aws-sdk/client-s3
 * (a few MB) for a single PUT.
 *
 * Behaviour is best-effort: when R2 is not configured, or the PUT fails, the
 * caller is expected to fall back to its existing inline representation
 * (e.g. a base64 data URI). Nothing here throws on the unhappy path — it
 * returns { ok: false, error } so the caller can decide.
 */

import crypto from "crypto";

export interface R2UploadResult {
  ok: boolean;
  url?: string;
  error?: string;
}

/** True only when every R2 env var the signer needs is present. */
export function isR2Configured(): boolean {
  return !!(
    process.env.R2_ACCESS_KEY_ID &&
    process.env.R2_SECRET_ACCESS_KEY &&
    process.env.R2_BUCKET_NAME &&
    process.env.R2_PUBLIC_URL &&
    process.env.R2_ENDPOINT
  );
}

/**
 * The configured public base (no trailing slash), or null when R2 is not set
 * up. Every URL this module hands out starts with it, so it is also the test
 * for "is this URL an object we own and can delete".
 */
export function r2PublicBase(): string | null {
  const base = process.env.R2_PUBLIC_URL;
  return base ? base.replace(/\/+$/, "") : null;
}

/**
 * Map one public R2 URL back to its bucket key, or null when the URL is not
 * hosted in our bucket (an external stock photo, an AI provider's temporary
 * URL, a pasted link). Callers use null to mean "not ours — nothing to do",
 * never "delete failed".
 */
export function r2KeyFromUrl(url: unknown): string | null {
  if (typeof url !== "string") return null;
  const base = r2PublicBase();
  if (!base || !url.startsWith(base + "/")) return null;
  const key = url.slice(base.length + 1);
  return key.length > 0 ? key : null;
}

/**
 * Signed DELETE of the object behind a public R2 URL.
 *
 * Returns true when the object is gone (deleted now, or already absent — R2
 * answers 404 for a second delete). Returns false when it could not be
 * removed, INCLUDING when R2 is unconfigured while the URL claims to be
 * ours: a caller promising erasure must not read "I could not check" as
 * "the bytes are gone".
 */
export async function deleteFromR2(publicUrl: string): Promise<boolean> {
  const key = r2KeyFromUrl(publicUrl);
  if (key === null) return false;
  if (!isR2Configured()) return false;
  try {
    const accessKey = process.env.R2_ACCESS_KEY_ID!;
    const secretKey = process.env.R2_SECRET_ACCESS_KEY!;
    const bucket = process.env.R2_BUCKET_NAME!;
    const endpoint = process.env.R2_ENDPOINT!.replace(/\/+$/, "");
    const region = "auto";
    const host = new URL(endpoint).host;
    const amzDate = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
    const dateStamp = amzDate.slice(0, 8);

    const payloadHash = crypto.createHash("sha256").update("").digest("hex");
    const canonicalUri = `/${bucket}/${key}`;
    const canonicalHeaders = `host:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
    const signedHeaders = "host;x-amz-content-sha256;x-amz-date";
    const canonicalRequest = `DELETE\n${canonicalUri}\n\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;
    const credentialScope = `${dateStamp}/${region}/s3/aws4_request`;
    const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${credentialScope}\n${crypto
      .createHash("sha256")
      .update(canonicalRequest)
      .digest("hex")}`;

    const kDate = crypto.createHmac("sha256", `AWS4${secretKey}`).update(dateStamp).digest();
    const kRegion = crypto.createHmac("sha256", kDate).update(region).digest();
    const kService = crypto.createHmac("sha256", kRegion).update("s3").digest();
    const kSigning = crypto.createHmac("sha256", kService).update("aws4_request").digest();
    const signature = crypto.createHmac("sha256", kSigning).update(stringToSign).digest("hex");

    const authorization =
      `AWS4-HMAC-SHA256 Credential=${accessKey}/${credentialScope}, ` +
      `SignedHeaders=${signedHeaders}, Signature=${signature}`;

    const res = await fetch(`${endpoint}/${bucket}/${key}`, {
      method: "DELETE",
      headers: {
        Authorization: authorization,
        "x-amz-date": amzDate,
        "x-amz-content-sha256": payloadHash,
      },
    });
    /* 204 on success, 404 when a previous attempt already removed it. */
    return res.ok || res.status === 404;
  } catch {
    return false;
  }
}

/**
 * Single signed PUT of `buffer` (or the bytes fetched from `sourceUrl`) to
 * the configured R2 bucket under `key`. Returns the public https URL on
 * success. Never throws — returns { ok:false, error } on any failure so
 * the caller can fall back.
 */
export async function uploadToR2(args: {
  key: string;
  contentType: string;
  sourceUrl?: string;
  buffer?: Buffer;
}): Promise<R2UploadResult> {
  if (!isR2Configured()) {
    return { ok: false, error: "R2 not configured" };
  }
  try {
    /* Source bytes: a direct Buffer or fetched from a CDN URL. */
    let buffer: Buffer;
    if (args.buffer) {
      buffer = args.buffer;
    } else if (args.sourceUrl) {
      const sourceRes = await fetch(args.sourceUrl);
      if (!sourceRes.ok) {
        return { ok: false, error: `source fetch ${sourceRes.status}` };
      }
      buffer = Buffer.from(await sourceRes.arrayBuffer());
    } else {
      return { ok: false, error: "no source (need sourceUrl or buffer)" };
    }

    const accessKey = process.env.R2_ACCESS_KEY_ID!;
    const secretKey = process.env.R2_SECRET_ACCESS_KEY!;
    const bucket = process.env.R2_BUCKET_NAME!;
    const endpoint = process.env.R2_ENDPOINT!.replace(/\/+$/, "");
    const region = "auto";
    const host = new URL(endpoint).host;
    const date = new Date();
    const amzDate = date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
    const dateStamp = amzDate.slice(0, 8);

    const payloadHash = crypto.createHash("sha256").update(buffer).digest("hex");
    const canonicalUri = `/${bucket}/${args.key}`;
    const canonicalHeaders = `host:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
    const signedHeaders = "host;x-amz-content-sha256;x-amz-date";
    const canonicalRequest = `PUT\n${canonicalUri}\n\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;
    const credentialScope = `${dateStamp}/${region}/s3/aws4_request`;
    const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${credentialScope}\n${crypto.createHash("sha256").update(canonicalRequest).digest("hex")}`;

    const kDate = crypto.createHmac("sha256", `AWS4${secretKey}`).update(dateStamp).digest();
    const kRegion = crypto.createHmac("sha256", kDate).update(region).digest();
    const kService = crypto.createHmac("sha256", kRegion).update("s3").digest();
    const kSigning = crypto.createHmac("sha256", kService).update("aws4_request").digest();
    const signature = crypto.createHmac("sha256", kSigning).update(stringToSign).digest("hex");

    const authorization =
      `AWS4-HMAC-SHA256 Credential=${accessKey}/${credentialScope}, ` +
      `SignedHeaders=${signedHeaders}, Signature=${signature}`;

    const putRes = await fetch(`${endpoint}/${bucket}/${args.key}`, {
      method: "PUT",
      headers: {
        Authorization: authorization,
        "x-amz-date": amzDate,
        "x-amz-content-sha256": payloadHash,
        "Content-Type": args.contentType,
        "Content-Length": String(buffer.length),
      },
      body: buffer,
    });
    if (!putRes.ok) {
      const body = await putRes.text().catch(() => "");
      return { ok: false, error: `R2 PUT ${putRes.status}: ${body.slice(0, 200)}` };
    }
    const publicBase = process.env.R2_PUBLIC_URL!.replace(/\/+$/, "");
    return { ok: true, url: `${publicBase}/${args.key}` };
  } catch (err: any) {
    return { ok: false, error: err?.message || String(err) };
  }
}
