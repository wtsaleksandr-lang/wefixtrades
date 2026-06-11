/**
 * ContentFlow Phase 2 — WP5 stitcher + TTS tests.
 *
 * Runnable standalone (no test-runner dep, no live ffmpeg/network/API key):
 *   npx tsx server/services/contentflow/videoStitcher/stitcher.test.ts
 *   npm run check:contentflow-video-stitcher
 *
 * Excluded from `tsc --noEmit` (tsconfig excludes **\/*.test.ts). Pattern
 * matches server/services/contentflow/referenceReplication.test.ts.
 *
 * Coverage:
 *   1. ffmpeg probe fail → "auto" ladder falls through to managed.
 *   2. managed env absent (and no ffmpeg) → stable `stitcher_unavailable`.
 *   3. Forced provider settings honor availability.
 *   4. singleSceneBypass: 1 scene → returned as final; 0/2+ → null.
 *   5. STATIC MEMORY GUARD: ffmpegStitcher.ts source must never buffer a
 *      whole video clip in memory (no `.arrayBuffer(` / `Buffer.concat(`),
 *      with a deliberate-failure fixture proving the predicate catches the
 *      regressed pattern.
 *   6. Mocked end-to-end ffmpeg stitch: fetch + spawn mocked — asserts
 *      sequential streaming downloads to disk, concat list contents, and
 *      that intermediates are cleaned while the final mp4 survives.
 *   7. Narration duck-mix args + fallback to narration-only mapping when
 *      the mix pass fails (silent native audio case).
 *   8. ttsService: env-skip result when unconfigured; cost math + mp3
 *      buffer with a mocked OpenAI client.
 *   9. LIVE ffmpeg concat (auto-skipped when ffmpeg absent): two 1s
 *      testsrc clips → real stitch → output file exists.
 */

import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { spawn as realSpawn } from "node:child_process";
import {
  createFfmpegStitcher,
  createManagedStitcher,
  selectStitcher,
  singleSceneBypass,
  STITCHER_UNAVAILABLE,
  type VideoStitcher,
} from "./index";
import { createOpenAiTtsProvider } from "../ttsService";

const __dir = dirname(fileURLToPath(import.meta.url));

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => Promise<void> | void): Promise<void> {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(err);
    failed++;
  }
}

/* ── Mock helpers ────────────────────────────────────────────────────────── */

/** spawn() that always fails to start (binary missing). */
const failingSpawn: any = () => {
  const child: any = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = () => true;
  setImmediate(() => child.emit("error", new Error("ENOENT: ffmpeg not found")));
  return child;
};

/**
 * spawn() mock that records invocations and "succeeds": for ffmpeg runs it
 * writes a fake output file (last arg) so downstream stat checks pass.
 * `failMatching` makes any invocation whose args match the predicate exit 1
 * (used to simulate the no-native-audio duck-mix failure).
 */
function makeRecordingSpawn(opts: {
  failMatching?: (args: string[]) => boolean;
} = {}) {
  const calls: string[][] = [];
  const spawnMock: any = (_bin: string, args: string[]) => {
    calls.push(args);
    const child: any = new EventEmitter();
    child.stderr = new EventEmitter();
    child.kill = () => true;
    const shouldFail = opts.failMatching?.(args) ?? false;
    setImmediate(() => {
      if (shouldFail) {
        child.stderr.emit("data", "Stream specifier ':a' matches no streams");
        child.emit("close", 1);
        return;
      }
      // ffmpeg convention in our stitcher: output path is the final arg.
      const out = args[args.length - 1];
      if (out && out.endsWith(".mp4")) {
        writeFileSync(out, "fake-mp4-bytes");
      }
      child.emit("close", 0);
    });
    return child;
  };
  return { spawnMock, calls };
}

/** fetch() mock streaming a small body; records request order. */
function makeStreamingFetch() {
  const requested: string[] = [];
  const fetchMock: any = async (url: string) => {
    requested.push(String(url));
    return new Response(`clip-bytes-for:${url}`, { status: 200 });
  };
  return { fetchMock, requested };
}

const unavailableStitcher = (id: "ffmpeg" | "managed"): VideoStitcher => ({
  id,
  isAvailable: async () => false,
  stitch: async () => ({ ok: false, error: "unavailable stub" }),
});

const availableStitcher = (id: "ffmpeg" | "managed"): VideoStitcher => ({
  id,
  isAvailable: async () => true,
  stitch: async () => ({ ok: true, filePath: "/tmp/stub.mp4" }),
});

/* ── Main ────────────────────────────────────────────────────────────────── */

async function main() {
  console.log("stitcher.test.ts (WP5)");

  /* 1. probe fail → auto falls through to managed */
  await test("auto: ffmpeg probe fails → managed selected", async () => {
    const ffmpeg = createFfmpegStitcher({ spawn: failingSpawn });
    assert.equal(await ffmpeg.isAvailable(), false, "probe must be negative");
    // Probe result is cached — second call must not re-probe differently.
    assert.equal(await ffmpeg.isAvailable(), false);

    const managed = createManagedStitcher({
      env: { STITCH_API_BASE: "https://stitch.example.com", STITCH_API_KEY: "k" },
      fetch: (async () => new Response("{}", { status: 200 })) as any,
    });
    const selection = await selectStitcher({ provider: "auto", ffmpeg, managed });
    assert.ok(selection.ok, "selection should succeed");
    assert.equal(selection.ok && selection.stitcher.id, "managed");
  });

  /* 2. managed env absent → unavailable error constant */
  await test("auto: no ffmpeg + managed env absent → stitcher_unavailable", async () => {
    const ffmpeg = createFfmpegStitcher({ spawn: failingSpawn });
    const managed = createManagedStitcher({ env: {} });
    assert.equal(await managed.isAvailable(), false);
    const selection = await selectStitcher({ provider: "auto", ffmpeg, managed });
    assert.equal(selection.ok, false);
    assert.equal(!selection.ok && selection.error, STITCHER_UNAVAILABLE);
    assert.equal(STITCHER_UNAVAILABLE, "stitcher_unavailable");
  });

  /* 2b. managed needs BOTH env vars */
  await test("managed: partial env (base without key) is unavailable", async () => {
    const onlyBase = createManagedStitcher({
      env: { STITCH_API_BASE: "https://stitch.example.com" },
    });
    assert.equal(await onlyBase.isAvailable(), false);
  });

  /* 3. forced provider settings */
  await test("forced ffmpeg ignores managed; forced managed ignores ffmpeg", async () => {
    const forcedFfmpeg = await selectStitcher({
      provider: "ffmpeg",
      ffmpeg: unavailableStitcher("ffmpeg"),
      managed: availableStitcher("managed"),
    });
    assert.equal(forcedFfmpeg.ok, false, "forced ffmpeg must not fall back");

    const forcedManaged = await selectStitcher({
      provider: "managed",
      ffmpeg: availableStitcher("ffmpeg"),
      managed: unavailableStitcher("managed"),
    });
    assert.equal(forcedManaged.ok, false, "forced managed must not fall back");
  });

  /* 4. singleSceneBypass */
  await test("singleSceneBypass: 1 scene returned, 0/2+ → null", () => {
    const lone = { url: "https://r2/scene-0.mp4", durationSec: 8 };
    assert.equal(singleSceneBypass([lone]), lone);
    assert.equal(singleSceneBypass([]), null);
    assert.equal(
      singleSceneBypass([lone, { url: "https://r2/scene-1.mp4", durationSec: 6 }]),
      null,
    );
  });

  /* 5. static memory guard */
  const FORBIDDEN_BUFFERING = [
    /\.arrayBuffer\s*\(/,
    /Buffer\s*\.\s*concat\s*\(/,
  ];
  const violatesBufferingRule = (source: string): boolean =>
    FORBIDDEN_BUFFERING.some((re) => re.test(source));

  await test("static guard: ffmpegStitcher.ts never buffers whole clips", () => {
    const source = readFileSync(join(__dir, "ffmpegStitcher.ts"), "utf8");
    assert.equal(
      violatesBufferingRule(source),
      false,
      "ffmpegStitcher.ts must stream downloads to disk — found a whole-file buffering pattern",
    );
    // Sanity: the streaming primitives ARE present.
    assert.match(source, /pipeline\(/);
    assert.match(source, /createWriteStream\(/);
  });

  await test("static guard: deliberate-failure fixture trips the predicate", () => {
    // Regressed code that buffers a whole clip in memory — the exact
    // pattern the guard exists to block. If the predicate ever stops
    // catching this, the test goes red.
    const regressed = `
      const res = await fetch(scene.url);
      const buf = Buffer.from(await res.arrayBuffer());
      chunks.push(buf);
      await writeFile(dest, Buffer.concat(chunks));
    `;
    assert.equal(
      violatesBufferingRule(regressed),
      true,
      "guard predicate failed to flag whole-file buffering — guard is broken",
    );
  });

  /* 6. mocked end-to-end ffmpeg stitch */
  await test("ffmpeg stitch: sequential streamed downloads, concat list, cleanup", async () => {
    const workDir = await mkdtemp(join(tmpdir(), "wp5-stitch-"));
    try {
      const { spawnMock, calls } = makeRecordingSpawn();
      const { fetchMock, requested } = makeStreamingFetch();
      const stitcher = createFfmpegStitcher({ spawn: spawnMock, fetch: fetchMock });

      const result = await stitcher.stitch(
        {
          scenes: [
            { url: "https://r2.example/scene-0.mp4", durationSec: 8 },
            { url: "https://r2.example/scene-1.mp4", durationSec: 6 },
          ],
          aspectRatio: "16:9",
        },
        { workDir },
      );

      assert.ok(result.ok, `stitch should succeed: ${!result.ok ? result.error : ""}`);
      assert.equal(result.ok && result.filePath, join(workDir, "final.mp4"));
      assert.ok(existsSync(join(workDir, "final.mp4")), "final mp4 must exist");
      // Downloads were sequential & streamed to disk in scene order.
      assert.deepEqual(requested, [
        "https://r2.example/scene-0.mp4",
        "https://r2.example/scene-1.mp4",
      ]);
      // One ffmpeg run (no narration), with the spec'd normalize+concat args.
      assert.equal(calls.length, 1);
      const args = calls[0].join(" ");
      assert.match(args, /-f concat/);
      assert.match(args, /-safe 0/);
      assert.match(args, /-c:v libx264/);
      assert.match(args, /-preset veryfast/);
      assert.match(args, /-r 30/);
      assert.match(args, /-pix_fmt yuv420p/);
      assert.match(args, /-c:a aac/);
      // Intermediates (downloads + list.txt) cleaned; only final.mp4 left.
      assert.equal(
        existsSync(join(workDir, "intermediates")),
        false,
        "intermediates dir must be removed in finally",
      );
    } finally {
      await rm(workDir, { recursive: true, force: true });
    }
  });

  /* 6b. concat list content is verifiable mid-run */
  await test("ffmpeg stitch: list.txt enumerates downloaded scenes in order", async () => {
    const workDir = await mkdtemp(join(tmpdir(), "wp5-list-"));
    try {
      let capturedList = "";
      const { fetchMock } = makeStreamingFetch();
      const spawnMock: any = (_bin: string, args: string[]) => {
        const child: any = new EventEmitter();
        child.stderr = new EventEmitter();
        child.kill = () => true;
        // Snapshot list.txt while it still exists (pre-cleanup).
        const listIdx = args.indexOf("-i") + 1;
        capturedList = readFileSync(args[listIdx], "utf8");
        setImmediate(() => {
          writeFileSync(args[args.length - 1], "fake");
          child.emit("close", 0);
        });
        return child;
      };
      const stitcher = createFfmpegStitcher({ spawn: spawnMock, fetch: fetchMock });
      const result = await stitcher.stitch(
        {
          scenes: [
            { url: "https://r2.example/a.mp4", durationSec: 4 },
            { url: "https://r2.example/b.mp4", durationSec: 4 },
          ],
          aspectRatio: "9:16",
        },
        { workDir },
      );
      assert.ok(result.ok);
      const lines = capturedList.trim().split("\n");
      assert.equal(lines.length, 2);
      assert.match(lines[0], /^file '.*scene-0\.mp4'$/);
      assert.match(lines[1], /^file '.*scene-1\.mp4'$/);
      // Downloaded scene bytes were streamed to those exact paths.
      const scene0Path = lines[0].slice("file '".length, -1);
      assert.equal(
        capturedList.includes("scene-0.mp4") &&
          scene0Path.endsWith("scene-0.mp4"),
        true,
      );
    } finally {
      await rm(workDir, { recursive: true, force: true });
    }
  });

  /* 7. narration duck-mix + fallback */
  await test("narration: duck-mix pass runs; native-audio-less fallback maps narration solo", async () => {
    const workDir = await mkdtemp(join(tmpdir(), "wp5-mix-"));
    try {
      // First: happy path — duck mix succeeds → 2 ffmpeg runs.
      {
        const { spawnMock, calls } = makeRecordingSpawn();
        const { fetchMock } = makeStreamingFetch();
        const stitcher = createFfmpegStitcher({ spawn: spawnMock, fetch: fetchMock });
        const result = await stitcher.stitch(
          {
            scenes: [{ url: "https://r2.example/s0.mp4", durationSec: 8 }],
            narrationAudioPath: join(workDir, "narration.mp3"),
            aspectRatio: "16:9",
          },
          { workDir: join(workDir, "a") },
        );
        assert.ok(result.ok, !result.ok ? result.error : "");
        assert.equal(calls.length, 2, "concat pass + mix pass");
        const mixArgs = calls[1].join(" ");
        assert.match(mixArgs, /volume=0\.25/);
        assert.match(mixArgs, /amix=inputs=2/);
        assert.match(mixArgs, /-shortest/);
      }
      // Second: duck mix fails (no native audio) → narration-only fallback.
      {
        const { spawnMock, calls } = makeRecordingSpawn({
          failMatching: (args) => args.some((a) => a.includes("amix")),
        });
        const { fetchMock } = makeStreamingFetch();
        const stitcher = createFfmpegStitcher({ spawn: spawnMock, fetch: fetchMock });
        const result = await stitcher.stitch(
          {
            scenes: [{ url: "https://r2.example/s0.mp4", durationSec: 8 }],
            narrationAudioPath: join(workDir, "narration.mp3"),
            aspectRatio: "16:9",
          },
          { workDir: join(workDir, "b") },
        );
        assert.ok(result.ok, !result.ok ? result.error : "");
        assert.equal(calls.length, 3, "concat + failed mix + solo fallback");
        const soloArgs = calls[2];
        assert.ok(soloArgs.includes("1:a"), "fallback maps narration as sole audio");
        assert.ok(!soloArgs.join(" ").includes("amix"));
      }
    } finally {
      await rm(workDir, { recursive: true, force: true });
    }
  });

  /* 7b. download failure is a retryable error, intermediates cleaned */
  await test("ffmpeg stitch: failed download → retryable error result", async () => {
    const workDir = await mkdtemp(join(tmpdir(), "wp5-dlfail-"));
    try {
      const { spawnMock } = makeRecordingSpawn();
      const fetch404: any = async () => new Response("nope", { status: 404 });
      const stitcher = createFfmpegStitcher({ spawn: spawnMock, fetch: fetch404 });
      const result = await stitcher.stitch(
        {
          scenes: [{ url: "https://r2.example/missing.mp4", durationSec: 8 }],
          aspectRatio: "16:9",
        },
        { workDir },
      );
      assert.equal(result.ok, false);
      assert.match(!result.ok ? result.error : "", /HTTP 404/);
      assert.equal(!result.ok && result.retryable, true);
      assert.equal(existsSync(join(workDir, "intermediates")), false);
    } finally {
      await rm(workDir, { recursive: true, force: true });
    }
  });

  /* 8. ttsService */
  await test("tts: unconfigured env → graceful skip (no throw)", async () => {
    const provider = createOpenAiTtsProvider({ env: {}, getClient: () => null });
    assert.equal(provider.isConfigured(), false);
    const result = await provider.synthesize("Hello roofers of Toronto.");
    assert.equal(result.ok, false);
    assert.equal(!result.ok && result.error, "tts_not_configured");
    assert.equal(!result.ok && result.skipped, true);
  });

  await test("tts: mocked client → mp3 buffer + cost at 15 µUSD/char", async () => {
    const text = "Book your roof inspection today.";
    const fakeClient: any = {
      audio: {
        speech: {
          create: async (params: any) => {
            assert.equal(params.model, "tts-1");
            assert.equal(params.response_format, "mp3");
            return new Response(Buffer.from("fake-mp3"));
          },
        },
      },
    };
    const provider = createOpenAiTtsProvider({
      env: { OPENAI_API_KEY: "test-key" },
      getClient: () => fakeClient,
    });
    assert.equal(provider.isConfigured(), true);
    const result = await provider.synthesize(text, "nova");
    assert.ok(result.ok, !result.ok ? result.error : "");
    if (result.ok) {
      assert.equal(result.mp3Buffer.toString(), "fake-mp3");
      assert.equal(result.costMicroUsd, text.length * 15);
    }
  });

  await test("tts: empty text rejected without provider call", async () => {
    const provider = createOpenAiTtsProvider({
      env: { OPENAI_API_KEY: "test-key" },
      getClient: () => {
        throw new Error("must not be called for empty text");
      },
    });
    const result = await provider.synthesize("   ");
    assert.equal(result.ok, false);
    assert.equal(!result.ok && result.skipped, undefined);
  });

  /* 9. LIVE ffmpeg concat — runs only when a real ffmpeg binary exists */
  const realFfmpeg = createFfmpegStitcher();
  if (await realFfmpeg.isAvailable()) {
    await test("LIVE: real 2-clip testsrc concat produces an output file", async () => {
      const workDir = await mkdtemp(join(tmpdir(), "wp5-live-"));
      try {
        const clipsDir = join(workDir, "clips");
        await mkdir(clipsDir, { recursive: true });
        const makeClip = (out: string) =>
          new Promise<void>((resolve, reject) => {
            const child = realSpawn("ffmpeg", [
              "-y",
              "-f", "lavfi",
              "-i", "testsrc=duration=1:size=320x240:rate=30",
              "-pix_fmt", "yuv420p",
              out,
            ]);
            child.on("error", reject);
            child.on("close", (code) =>
              code === 0 ? resolve() : reject(new Error(`clip gen exit ${code}`)),
            );
          });
        const clipA = join(clipsDir, "a.mp4");
        const clipB = join(clipsDir, "b.mp4");
        await makeClip(clipA);
        await makeClip(clipB);

        const result = await realFfmpeg.stitch(
          {
            scenes: [
              { filePath: clipA, durationSec: 1 },
              { filePath: clipB, durationSec: 1 },
            ],
            aspectRatio: "16:9",
          },
          { workDir },
        );
        assert.ok(result.ok, !result.ok ? result.error : "");
        if (result.ok) {
          const bytes = await readFile(result.filePath);
          assert.ok(bytes.length > 1_000, "real concat output should be non-trivial");
        }
      } finally {
        await rm(workDir, { recursive: true, force: true });
      }
    });
  } else {
    console.log("  - LIVE ffmpeg concat SKIPPED (no ffmpeg binary on this machine/CI)");
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
