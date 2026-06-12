/**
 * PRICING-MODELS U4 — photo-upload endpoint regression gate.
 *
 * Drives the PURE dependency-injected core of
 * server/routes/quoteWidgetUploadRoutes.ts (no express wiring, no DB, no
 * disk — every dependency of processUploadRequest is injected):
 *
 *   1. Success path — a valid JPEG is accepted, stored under
 *      data/uploads/lead-photos via the injected saveFile, and the response
 *      carries the public /uploads/lead-photos/<32-hex>.jpg URL + honest
 *      size/mime; the base64 payload never echoes back.
 *   2. Liberal input — a `data:image/jpeg;base64,` URI prefix is stripped.
 *   3. Size caps — >8 MB decoded → 413 too_large; a field's smaller
 *      maxPhotoMb lowers the cap; a bogus maxPhotoMb can NEVER raise it.
 *   4. MAGIC-BYTE policy — bytes decide the type, the filename never does:
 *      PNG bytes named `.jpg` are accepted AND stored as .png; text bytes
 *      named `.jpg` are rejected 415; WEBP accepted.
 *   5. Rate limits — per-IP per-minute and per-day over-cap → 429 quota;
 *      rejected junk does NOT consume the daily budget (only stored
 *      uploads count).
 *   6. Authz — unknown calculator / field_id that is not a photo_upload
 *      field → 404 not_found (no anonymous file hosting via random ids).
 *   7. Garbage — empty / invalid base64 → 400 bad_request; filename
 *      sanitization strips traversal + script chars.
 *   8. DELIBERATE-FAILURE FIXTURE — a regressed sniffer that trusts the
 *      filename extension classifies a text payload named `.jpg` as a JPEG;
 *      the gate's real assertion must turn red against it, proving the gate
 *      CATCHES that regression class rather than merely running.
 *
 * Excluded from `tsc --noEmit` via the tsconfig **\/*.test.ts pattern.
 * Runnable standalone:
 *
 *   npx tsx server/routes/quoteWidgetUploadRoutes.test.ts
 *
 * Wired into CI as `npm run check:quote-widget-upload`.
 */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import path from "node:path";

/* Module-load prerequisite: server/db.ts throws without a DATABASE_URL.
 * Never used for real IO here — every dep is injected. */
process.env.DATABASE_URL ??= "postgresql://stub:stub@localhost:5432/stub";

const {
  processUploadRequest,
  uploadRequestBody,
  sniffImageType,
  stripDataUriPrefix,
  sanitizeFilename,
  HARD_MAX_MB,
  UPLOAD_SUBFOLDER,
} = await import("./quoteWidgetUploadRoutes");
const { RateLimiter, MemoryRateLimitStore } = await import("../services/rateLimiter");

type UploadDeps = import("./quoteWidgetUploadRoutes").UploadDeps;
type UploadRequestInput = import("./quoteWidgetUploadRoutes").UploadRequestInput;

let passed = 0;
let failed = 0;
async function check(label: string, fn: () => void | Promise<void>): Promise<void> {
  try {
    await fn();
    passed++;
    console.log(`  ok  ${label}`);
  } catch (err: any) {
    failed++;
    console.error(`  FAIL ${label}: ${err?.message ?? err}`);
  }
}

/* ═══ Fixtures ════════════════════════════════════════════════════════ */

const MB = 1024 * 1024;

/** JPEG: FF D8 FF (SOI + marker) + padding to `size` bytes. */
function jpegBytes(size = 2048): Buffer {
  const buf = Buffer.alloc(size, 0x42);
  buf[0] = 0xff;
  buf[1] = 0xd8;
  buf[2] = 0xff;
  buf[3] = 0xe0;
  return buf;
}

/** PNG: the 8-byte signature + padding. */
function pngBytes(size = 2048): Buffer {
  const buf = Buffer.alloc(size, 0x42);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buf);
  return buf;
}

/** WEBP: RIFF<size>WEBP + padding. */
function webpBytes(size = 2048): Buffer {
  const buf = Buffer.alloc(size, 0x42);
  buf.write("RIFF", 0, "ascii");
  buf.writeUInt32LE(size - 8, 4);
  buf.write("WEBP", 8, "ascii");
  return buf;
}

/** A plausible "script disguised as a photo" payload. */
const textBytes = Buffer.from("<script>alert('not a photo')</script> hello world", "utf8");

const CALC_ID = 11;
const FIELD_ID = "fld-photos-1";

function makeCalculator(fieldOverrides: Record<string, unknown> = {}) {
  return {
    id: CALC_ID,
    calculator_settings: {
      advanced: {
        fields: [
          { id: "fld-name", type: "text" },
          { id: FIELD_ID, type: "photo_upload", maxPhotos: 3, ...fieldOverrides },
        ],
      },
    },
  };
}

interface SaveCall {
  size: number;
  name: string;
  subfolder: string;
}

function makeDeps(overrides: Partial<UploadDeps> = {}): {
  deps: UploadDeps;
  saveCalls: SaveCall[];
} {
  const saveCalls: SaveCall[] = [];
  const deps: UploadDeps = {
    loadCalculator: async (id) => (id === CALC_ID ? makeCalculator() : undefined),
    // Mirrors fileStorage.saveFile naming: 16-byte random hex + the
    // extension taken from the provided name.
    saveFile: async (buffer, name, subfolder) => {
      saveCalls.push({ size: buffer.length, name, subfolder });
      return `/uploads/${subfolder}/${randomBytes(16).toString("hex")}${path.extname(name)}`;
    },
    perMinLimiter: { check: async () => true },
    perDayLimiter: { check: async () => true },
    ...overrides,
  };
  return { deps, saveCalls };
}

function makeInput(overrides: Partial<UploadRequestInput> = {}): UploadRequestInput {
  return {
    calculatorId: CALC_ID,
    fieldId: FIELD_ID,
    filename: "kitchen-damage.jpg",
    data: jpegBytes().toString("base64"),
    ip: "203.0.113.9",
    ...overrides,
  };
}

/* ═══ 1. Success path ═════════════════════════════════════════════════ */

await check("valid JPEG accepted — lead-photos URL shape + honest size/mime", async () => {
  const { deps, saveCalls } = makeDeps();
  const { status, body } = await processUploadRequest(deps, makeInput());
  assert.equal(status, 200);
  assert.equal(body.ok, true);
  if (!body.ok) throw new Error("unreachable");
  assert.match(body.url, /^\/uploads\/lead-photos\/[0-9a-f]{32}\.jpg$/);
  assert.equal(body.mime, "image/jpeg");
  assert.equal(body.size, 2048);
  assert.equal(body.filename, "kitchen-damage.jpg");
  assert.equal(saveCalls.length, 1);
  assert.equal(saveCalls[0].subfolder, UPLOAD_SUBFOLDER);
  assert.ok(saveCalls[0].name.endsWith(".jpg"));
  // The base64 payload never echoes back in the response.
  assert.ok(!JSON.stringify(body).includes(jpegBytes().toString("base64").slice(0, 40)));
});

await check("data: URI prefix is tolerated and stripped", async () => {
  const { deps } = makeDeps();
  const { body } = await processUploadRequest(
    deps,
    makeInput({ data: `data:image/jpeg;base64,${jpegBytes().toString("base64")}` }),
  );
  assert.equal(body.ok, true);
  if (!body.ok) throw new Error("unreachable");
  assert.equal(body.mime, "image/jpeg");
  assert.equal(body.size, 2048);

  assert.equal(stripDataUriPrefix("data:image/png;base64,AAAA"), "AAAA");
  assert.equal(stripDataUriPrefix("AAAA"), "AAAA", "prefix-less data passes through");
});

/* ═══ 2. Size caps ════════════════════════════════════════════════════ */

await check(">8 MB decoded → 413 too_large, nothing stored", async () => {
  const { deps, saveCalls } = makeDeps();
  const big = jpegBytes(HARD_MAX_MB * MB + 1);
  const { status, body } = await processUploadRequest(
    deps,
    makeInput({ data: big.toString("base64") }),
  );
  assert.equal(status, 413);
  assert.deepEqual(body, { ok: false, reason: "too_large" });
  assert.equal(saveCalls.length, 0);
});

await check("field maxPhotoMb lowers the cap (2 MB field rejects a 3 MB jpeg)", async () => {
  const { deps, saveCalls } = makeDeps({
    loadCalculator: async () => makeCalculator({ maxPhotoMb: 2 }),
  });
  const r1 = await processUploadRequest(deps, makeInput({ data: jpegBytes(3 * MB).toString("base64") }));
  assert.equal(r1.status, 413);
  assert.deepEqual(r1.body, { ok: false, reason: "too_large" });
  const r2 = await processUploadRequest(deps, makeInput({ data: jpegBytes(1 * MB).toString("base64") }));
  assert.equal(r2.body.ok, true, "a 1 MB jpeg passes the 2 MB field cap");
  assert.equal(saveCalls.length, 1);
});

await check("a bogus field maxPhotoMb can NEVER raise the 8 MB hard ceiling", async () => {
  const { deps } = makeDeps({
    loadCalculator: async () => makeCalculator({ maxPhotoMb: 50 }),
  });
  const { status, body } = await processUploadRequest(
    deps,
    makeInput({ data: jpegBytes(HARD_MAX_MB * MB + 1).toString("base64") }),
  );
  assert.equal(status, 413);
  assert.deepEqual(body, { ok: false, reason: "too_large" });
});

/* ═══ 3. Magic-byte policy ════════════════════════════════════════════ */

await check("PNG bytes named .jpg → accepted, typed AND stored as .png (magic wins)", async () => {
  const { deps, saveCalls } = makeDeps();
  const { body } = await processUploadRequest(
    deps,
    makeInput({ filename: "photo.jpg", data: pngBytes().toString("base64") }),
  );
  assert.equal(body.ok, true);
  if (!body.ok) throw new Error("unreachable");
  assert.equal(body.mime, "image/png");
  assert.match(body.url, /\.png$/);
  assert.equal(body.filename, "photo.png", "display name carries the detected extension");
  assert.ok(saveCalls[0].name.endsWith(".png"));
});

await check("text bytes named .jpg → 415 bad_type (extension carries no trust)", async () => {
  const { deps, saveCalls } = makeDeps();
  const { status, body } = await processUploadRequest(
    deps,
    makeInput({ filename: "photo.jpg", data: textBytes.toString("base64") }),
  );
  assert.equal(status, 415);
  assert.deepEqual(body, { ok: false, reason: "bad_type" });
  assert.equal(saveCalls.length, 0);
});

await check("WEBP accepted; GIF/PDF/etc are not on the allowlist", async () => {
  const { deps } = makeDeps();
  const { body } = await processUploadRequest(
    deps,
    makeInput({ filename: "site.webp", data: webpBytes().toString("base64") }),
  );
  assert.equal(body.ok, true);
  if (!body.ok) throw new Error("unreachable");
  assert.equal(body.mime, "image/webp");
  assert.match(body.url, /\.webp$/);

  // GIF89a magic — deliberately NOT allowed.
  const gif = Buffer.concat([Buffer.from("GIF89a", "ascii"), Buffer.alloc(64)]);
  const r = await processUploadRequest(deps, makeInput({ data: gif.toString("base64") }));
  assert.deepEqual(r.body, { ok: false, reason: "bad_type" });

  assert.equal(sniffImageType(jpegBytes())?.mime, "image/jpeg");
  assert.equal(sniffImageType(pngBytes())?.mime, "image/png");
  assert.equal(sniffImageType(webpBytes())?.mime, "image/webp");
  assert.equal(sniffImageType(textBytes), null);
});

/* ═══ 4. Rate limits ══════════════════════════════════════════════════ */

await check("per-IP per-minute over-limit → 429 quota", async () => {
  const minLimiter = new RateLimiter(new MemoryRateLimitStore(), 2, 60_000);
  const { deps, saveCalls } = makeDeps({ perMinLimiter: minLimiter });
  const r1 = await processUploadRequest(deps, makeInput());
  const r2 = await processUploadRequest(deps, makeInput());
  const r3 = await processUploadRequest(deps, makeInput());
  assert.equal(r1.body.ok, true);
  assert.equal(r2.body.ok, true);
  assert.equal(r3.status, 429);
  assert.deepEqual(r3.body, { ok: false, reason: "quota" });
  assert.equal(saveCalls.length, 2, "over-cap request never reaches storage");
});

await check("per-minute limiter keys on the IP (another IP still passes)", async () => {
  const minLimiter = new RateLimiter(new MemoryRateLimitStore(), 1, 60_000);
  const { deps } = makeDeps({ perMinLimiter: minLimiter });
  const a1 = await processUploadRequest(deps, makeInput({ ip: "198.51.100.1" }));
  const a2 = await processUploadRequest(deps, makeInput({ ip: "198.51.100.1" }));
  const b1 = await processUploadRequest(deps, makeInput({ ip: "198.51.100.2" }));
  assert.equal(a1.body.ok, true);
  assert.deepEqual(a2.body, { ok: false, reason: "quota" });
  assert.equal(b1.body.ok, true);
});

await check("per-day over-limit → 429 quota; rejected junk does NOT burn the daily budget", async () => {
  let dayChecks = 0;
  const dayLimiter = {
    check: async () => {
      dayChecks++;
      return dayChecks <= 1;
    },
  };
  const { deps, saveCalls } = makeDeps({ perDayLimiter: dayLimiter });

  // A bad-type reject happens BEFORE the daily check — no budget consumed.
  const junk = await processUploadRequest(deps, makeInput({ data: textBytes.toString("base64") }));
  assert.deepEqual(junk.body, { ok: false, reason: "bad_type" });
  assert.equal(dayChecks, 0, "rejected junk must not consume the daily budget");

  const r1 = await processUploadRequest(deps, makeInput());
  assert.equal(r1.body.ok, true);
  const r2 = await processUploadRequest(deps, makeInput());
  assert.equal(r2.status, 429);
  assert.deepEqual(r2.body, { ok: false, reason: "quota" });
  assert.equal(saveCalls.length, 1);
});

/* ═══ 5. Authz ════════════════════════════════════════════════════════ */

await check("unknown calculator → 404 not_found", async () => {
  const { deps, saveCalls } = makeDeps();
  const { status, body } = await processUploadRequest(deps, makeInput({ calculatorId: 999 }));
  assert.equal(status, 404);
  assert.deepEqual(body, { ok: false, reason: "not_found" });
  assert.equal(saveCalls.length, 0);
});

await check("field_id that is not a photo_upload field → 404 not_found", async () => {
  const { deps } = makeDeps();
  // fld-name exists but is type 'text' — must not be usable as a file host.
  const { status, body } = await processUploadRequest(deps, makeInput({ fieldId: "fld-name" }));
  assert.equal(status, 404);
  assert.deepEqual(body, { ok: false, reason: "not_found" });
});

/* ═══ 6. Garbage + sanitization ═══════════════════════════════════════ */

await check("empty / invalid base64 → 400 bad_request", async () => {
  const { deps } = makeDeps();
  // "!!!!" decodes to zero bytes under Node's lenient base64 decoder.
  const r1 = await processUploadRequest(deps, makeInput({ data: "!!!!" }));
  assert.equal(r1.status, 400);
  assert.deepEqual(r1.body, { ok: false, reason: "bad_request" });
  const r2 = await processUploadRequest(deps, makeInput({ data: "data:image/png;base64," }));
  assert.equal(r2.status, 400);
});

await check("filename sanitization strips traversal + script chars, keeps a stem", () => {
  assert.equal(sanitizeFilename("../../etc/passwd.jpg", ".jpg"), "etc_passwd.jpg");
  assert.equal(sanitizeFilename("<script>x</script>.png", ".png"), "script_x_script.png");
  assert.equal(sanitizeFilename(undefined, ".jpg"), "photo.jpg");
  assert.equal(sanitizeFilename("  ", ".webp"), "photo.webp");
  const long = sanitizeFilename("a".repeat(300) + ".jpg", ".jpg");
  assert.ok(long.length <= 85, "stem capped at 80 chars");
  assert.ok(!/[/\\<>:"|?*]/.test(sanitizeFilename('a/b\\c<d>:e"f|g?h*i.jpg', ".jpg")));
});

await check("body schema: required fields + base64-length ceiling", () => {
  assert.equal(
    uploadRequestBody.safeParse({ calculator_id: 1, field_id: "f", data: "AAAA" }).success,
    true,
    "filename is optional",
  );
  assert.equal(
    uploadRequestBody.safeParse({ calculator_id: 1, data: "AAAA" }).success,
    false,
    "missing field_id rejected",
  );
  assert.equal(
    uploadRequestBody.safeParse({ calculator_id: 1, field_id: "f", data: "" }).success,
    false,
    "empty data rejected",
  );
  // A base64 string that cannot possibly decode under the 8 MB cap is
  // rejected by the schema before any decode work.
  const tooLong = "A".repeat(Math.ceil((HARD_MAX_MB * MB * 4) / 3) + 5000);
  assert.equal(
    uploadRequestBody.safeParse({ calculator_id: 1, field_id: "f", data: tooLong }).success,
    false,
    "absurdly long base64 rejected by schema",
  );
});

/* ═══ 7. DELIBERATE-FAILURE FIXTURE ═══════════════════════════════════
 * A regressed sniffer that trusts the FILENAME extension would classify a
 * script payload named `photo.jpg` as a JPEG. The gate's real assertion
 * (magic bytes must return null for non-image bytes) must turn red against
 * it — proving the gate CATCHES this regression class instead of merely
 * running. (Repo precedent: quoteWidgetDistanceRoutes.test.ts case 7.)
 */

await check("DELIBERATE-FAILURE fixture — filename-trusting sniffer turns the gate red", () => {
  const regressedSniff = (buf: Buffer, filename: string) => {
    // The regression under test: extension decides the type.
    if (/\.jpe?g$/i.test(filename)) return { mime: "image/jpeg", ext: ".jpg" } as const;
    return sniffImageType(buf);
  };
  const verdict = regressedSniff(textBytes, "photo.jpg");
  let caught: unknown = null;
  try {
    assert.equal(verdict, null); // the REAL gate assertion (text must never sniff as an image)
  } catch (err) {
    caught = err;
  }
  assert.ok(caught, "gate assertion must fail red against the regressed sniffer");
});

/* ═══ Verdict ═════════════════════════════════════════════════════════ */

console.log(`\nquote-widget-upload gate: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
