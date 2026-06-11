/**
 * Healthz version-stamp regression test.
 *
 * Proves the deploy-verification contract introduced with dist/build-info.json
 * (stamped by script/build.ts, read by server/lib/buildInfo.ts, surfaced by
 * GET /api/healthz):
 *
 *   1. build-info.json PRESENT  → version carries its git_sha (+ built_at,
 *      git_branch), end-to-end over a real HTTP round-trip.
 *   2. build-info.json ABSENT   → version "dev", built_at null.
 *   3. DELIBERATE FAILURE — build-info.json MALFORMED (garbage bytes) →
 *      version "dev", NO throw, and the HTTP endpoint answers 200, not 500.
 *      If a future change removes the never-throw guarantee from
 *      buildInfo.ts, express converts the throw into a 500 and this case
 *      goes red (per [feedback_external_integration_rigor]: the gate must
 *      catch a regression, not just run).
 *   4. Wrong-shaped JSON (missing/empty/non-string git_sha) → "dev".
 *   5. getBuildInfo() default path in an unbundled (dev) context → "dev",
 *      and the process-lifetime cache returns the identical object.
 *   6. Source contract — server/routes/healthz.ts actually uses
 *      getBuildInfo and no longer falls back to "unknown"; script/build.ts
 *      actually writes dist/build-info.json. Catches the wiring being
 *      reverted while the lib survives.
 *
 * No test-runner dep (assert/strict only), no DB, no live services.
 * Excluded from `tsc --noEmit` (tsconfig excludes **\/*.test.ts).
 * Run standalone:
 *
 *   npx tsx tests/healthz-version.test.ts
 */

import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { AddressInfo } from "node:net";
import express from "express";

import {
  getBuildInfo,
  readBuildInfoFrom,
  _resetBuildInfoCacheForTests,
} from "../server/lib/buildInfo";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

let passed = 0;
function ok(label: string) {
  passed += 1;
  console.log(`  PASS ${label}`);
}

async function main(): Promise<void> {
  const dir = await mkdtemp(path.join(tmpdir(), "wft-healthz-version-"));
  const presentPath = path.join(dir, "build-info.json");
  const absentPath = path.join(dir, "does-not-exist.json");
  const malformedPath = path.join(dir, "build-info.malformed.json");
  const wrongShapePath = path.join(dir, "build-info.wrong-shape.json");

  try {
    console.log("[healthz-version] fixtures...");
    await writeFile(
      presentPath,
      JSON.stringify(
        { git_sha: "abc1234", git_branch: "main", built_at: "2026-06-11T00:00:00.000Z" },
        null,
        2,
      ),
      "utf-8",
    );
    // Deliberate-failure fixture: not JSON at all.
    await writeFile(malformedPath, "{ this is ;;; not json", "utf-8");
    // Parses fine, but git_sha is unusable in every variant.
    await writeFile(
      wrongShapePath,
      JSON.stringify({ git_sha: "   ", built_at: 12345, note: "no usable sha" }),
      "utf-8",
    );

    /* ── 1. present → sha carried ── */
    {
      const info = readBuildInfoFrom(presentPath);
      assert.equal(info.version, "abc1234");
      assert.equal(info.built_at, "2026-06-11T00:00:00.000Z");
      assert.equal(info.git_branch, "main");
      ok("present file → version carries git_sha + built_at + branch");
    }

    /* ── 2. absent → dev ── */
    {
      const info = readBuildInfoFrom(absentPath);
      assert.equal(info.version, "dev");
      assert.equal(info.built_at, null);
      ok("absent file → version 'dev', built_at null");
    }

    /* ── 3. malformed → dev, no throw ── */
    {
      let info: ReturnType<typeof readBuildInfoFrom> | null = null;
      assert.doesNotThrow(() => {
        info = readBuildInfoFrom(malformedPath);
      });
      assert.equal(info!.version, "dev");
      ok("malformed JSON → version 'dev', no throw");
    }

    /* ── 4. wrong shape → dev ── */
    {
      assert.equal(readBuildInfoFrom(wrongShapePath).version, "dev");
      assert.equal(readBuildInfoFrom(null).version, "dev");
      ok("wrong-shaped JSON / null path → version 'dev'");
    }

    /* ── 5. getBuildInfo default path (dev context) + cache identity ── */
    {
      _resetBuildInfoCacheForTests();
      const first = getBuildInfo();
      // tsx runs this unbundled — no build-info.json next to server/lib/.
      assert.equal(first.version, "dev");
      assert.equal(getBuildInfo(), first, "second call must hit the cache");
      _resetBuildInfoCacheForTests();
      ok("getBuildInfo() in dev context → 'dev'; result is cached");
    }

    /* ── HTTP round-trips: sha served when present; malformed MUST NOT 500 ── */
    {
      const app = express();
      // Mirrors the real route's resolution contract (resolveVersionInfo in
      // server/routes/healthz.ts): the handler does NOT guard the call —
      // if readBuildInfoFrom ever throws, express answers 500 and the
      // malformed case below fails loudly.
      app.get("/api/healthz-present", (_req, res) => {
        const info = readBuildInfoFrom(presentPath);
        res.status(200).json({ status: "ok", version: info.version, built_at: info.built_at });
      });
      app.get("/api/healthz-malformed", (_req, res) => {
        const info = readBuildInfoFrom(malformedPath);
        res.status(200).json({ status: "ok", version: info.version, built_at: info.built_at });
      });

      const server = app.listen(0, "127.0.0.1");
      await new Promise<void>((resolve) => server.once("listening", resolve));
      const port = (server.address() as AddressInfo).port;
      try {
        const presentRes = await fetch(`http://127.0.0.1:${port}/api/healthz-present`);
        assert.equal(presentRes.status, 200);
        const presentBody = (await presentRes.json()) as { version: string; built_at: string };
        assert.equal(presentBody.version, "abc1234");
        assert.equal(presentBody.built_at, "2026-06-11T00:00:00.000Z");
        ok("HTTP: present stamp → healthz JSON carries its sha");

        const malformedRes = await fetch(`http://127.0.0.1:${port}/api/healthz-malformed`);
        assert.equal(
          malformedRes.status,
          200,
          "malformed build-info.json must NOT 500 the endpoint",
        );
        const malformedBody = (await malformedRes.json()) as { version: string };
        assert.equal(malformedBody.version, "dev");
        ok("HTTP: malformed stamp → 200 with version 'dev' (no 500)");
      } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    }

    /* ── 6. source contract — the wiring is actually in place ── */
    {
      const healthzSrc = await readFile(
        path.join(REPO_ROOT, "server", "routes", "healthz.ts"),
        "utf-8",
      );
      assert.match(
        healthzSrc,
        /getBuildInfo/,
        "healthz.ts must resolve version via getBuildInfo (lib/buildInfo)",
      );
      assert.doesNotMatch(
        healthzSrc,
        /\?\?\s*"unknown"/,
        'healthz.ts must not fall back to version "unknown" anymore',
      );
      assert.match(healthzSrc, /built_at/, "healthz.ts response must include built_at");

      const buildSrc = await readFile(path.join(REPO_ROOT, "script", "build.ts"), "utf-8");
      assert.match(
        buildSrc,
        /dist\/build-info\.json/,
        "script/build.ts must stamp dist/build-info.json",
      );
      assert.match(buildSrc, /stampBuildInfo\(\)/, "buildAll must invoke stampBuildInfo()");
      ok("source contract: healthz wired to stamp; build stamps the file");
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }

  console.log(`[healthz-version] ALL ${passed} cases passed`);
}

main().catch((err) => {
  console.error("[healthz-version] FAIL");
  console.error(err);
  process.exit(1);
});
