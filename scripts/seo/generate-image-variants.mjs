#!/usr/bin/env node
/**
 * SEO Wave B — generate WebP + AVIF siblings for every PNG / JPG
 * under `client/public/`.
 *
 * Behavior:
 *   - Scans `client/public/` recursively for `.png` / `.jpg` / `.jpeg`.
 *   - For each source, writes `<name>.webp` and `<name>.avif`
 *     siblings if they are missing OR older than the source.
 *   - Skips quietly when `sharp` is not installed (the package is
 *     not in package.json by design — encoding is an optional
 *     prebuild). The script exits 0 so it can be wired into
 *     `prebuild` without breaking the build pipeline.
 *
 * Usage:
 *   node scripts/seo/generate-image-variants.mjs
 *   node scripts/seo/generate-image-variants.mjs --dry-run
 *   node scripts/seo/generate-image-variants.mjs --force   (rewrite even if up to date)
 *
 * Wire-up:
 *   To run this automatically, install sharp as a devDependency
 *   and add a `prebuild` script in package.json:
 *     "prebuild": "node scripts/seo/generate-image-variants.mjs"
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const PUBLIC_DIR = path.join(REPO_ROOT, "client", "public");

const RASTER_EXT = new Set([".png", ".jpg", ".jpeg"]);
const VARIANT_FORMATS = [
  { ext: ".webp", method: "webp", options: { quality: 82 } },
  { ext: ".avif", method: "avif", options: { quality: 55, effort: 4 } },
];

const ARGS = new Set(process.argv.slice(2));
const DRY_RUN = ARGS.has("--dry-run");
const FORCE = ARGS.has("--force");

/**
 * Recursively walk a directory yielding absolute file paths.
 */
async function* walk(dir) {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (err) {
    if (err.code === "ENOENT") return;
    throw err;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(full);
    } else if (entry.isFile()) {
      yield full;
    }
  }
}

async function statOrNull(p) {
  try {
    return await fs.stat(p);
  } catch (err) {
    if (err.code === "ENOENT") return null;
    throw err;
  }
}

async function shouldRegenerate(source, target) {
  if (FORCE) return true;
  const targetStat = await statOrNull(target);
  if (!targetStat) return true;
  const sourceStat = await fs.stat(source);
  return sourceStat.mtimeMs > targetStat.mtimeMs;
}

async function loadSharp() {
  try {
    const mod = await import("sharp");
    return mod.default ?? mod;
  } catch (err) {
    if (err && (err.code === "ERR_MODULE_NOT_FOUND" || err.code === "MODULE_NOT_FOUND")) {
      return null;
    }
    throw err;
  }
}

async function main() {
  const sharp = await loadSharp();
  if (!sharp) {
    console.log(
      "[seo:images] sharp is not installed — skipping WebP/AVIF generation.\n" +
        "            Install with `npm i -D sharp` to enable the prebuild step.",
    );
    process.exit(0);
  }

  const publicStat = await statOrNull(PUBLIC_DIR);
  if (!publicStat) {
    console.log(`[seo:images] ${PUBLIC_DIR} does not exist — nothing to do.`);
    process.exit(0);
  }

  let scanned = 0;
  let written = 0;
  let skipped = 0;
  const failures = [];

  for await (const file of walk(PUBLIC_DIR)) {
    const ext = path.extname(file).toLowerCase();
    if (!RASTER_EXT.has(ext)) continue;
    scanned += 1;
    const base = file.slice(0, -ext.length);

    for (const { ext: variantExt, method, options } of VARIANT_FORMATS) {
      const target = `${base}${variantExt}`;
      if (!(await shouldRegenerate(file, target))) {
        skipped += 1;
        continue;
      }
      const rel = path.relative(REPO_ROOT, target);
      if (DRY_RUN) {
        console.log(`[seo:images] would write ${rel}`);
        written += 1;
        continue;
      }
      try {
        await sharp(file)[method](options).toFile(target);
        written += 1;
        console.log(`[seo:images] wrote ${rel}`);
      } catch (err) {
        failures.push({ file: path.relative(REPO_ROOT, file), variant: variantExt, error: err });
        console.warn(`[seo:images] failed ${rel}: ${err.message ?? err}`);
      }
    }
  }

  console.log(
    `[seo:images] scanned ${scanned} raster files — wrote ${written}, skipped ${skipped}, failed ${failures.length}.`,
  );

  // Don't fail the build on per-file encode errors; just surface them.
  process.exit(0);
}

main().catch((err) => {
  console.error("[seo:images] fatal:", err);
  process.exit(1);
});
