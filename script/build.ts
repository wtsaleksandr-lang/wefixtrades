import { build as esbuild } from "esbuild";
import { build as viteBuild } from "vite";
import { rm, readFile } from "fs/promises";
import { spawn } from "node:child_process";

// server deps to bundle to reduce openat(2) syscalls
// which helps cold start times
const allowlist = [
  "@google/generative-ai",
  "axios",
  "connect-pg-simple",
  "cors",
  "date-fns",
  "drizzle-orm",
  "drizzle-zod",
  "express",
  "express-rate-limit",
  "express-session",
  "jsonwebtoken",
  "memorystore",
  "multer",
  "nanoid",
  "nodemailer",
  "openai",
  "passport",
  "passport-local",
  "pg",
  "stripe",
  "uuid",
  "ws",
  "xlsx",
  "zod",
  "zod-validation-error",
];

/**
 * SEO Wave E — per-route prerender step. Runs after the Vite client
 * build so the rendered dist/public is ready to serve, and before
 * the esbuild server bundle so a prerender failure aborts the whole
 * build (we'd rather catch a busted SEO step here than ship a build
 * where every URL is a duplicate-of-/ to Bing/LLM crawlers).
 *
 * Skip with SKIP_PRERENDER=1 for quick iteration on the server side.
 */
async function prerenderRoutes(): Promise<void> {
  if (process.env.SKIP_PRERENDER === "1") {
    console.log("[build] SKIP_PRERENDER=1 — skipping prerender step.");
    return;
  }
  console.log("prerendering routes for Bing/LLM crawlers...");
  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ["scripts/seo/prerender-routes.mjs"],
      { stdio: "inherit" },
    );
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`prerender exited with code ${code}`));
    });
  });
}

async function buildAll() {
  await rm("dist", { recursive: true, force: true });

  console.log("building client...");
  await viteBuild();

  await prerenderRoutes();

  console.log("building server...");
  const pkg = JSON.parse(await readFile("package.json", "utf-8"));
  const allDeps = [
    ...Object.keys(pkg.dependencies || {}),
    ...Object.keys(pkg.devDependencies || {}),
  ];
  const externals = allDeps.filter((dep) => !allowlist.includes(dep));

  await esbuild({
    entryPoints: ["server/index.ts"],
    platform: "node",
    bundle: true,
    format: "cjs",
    outfile: "dist/index.cjs",
    define: {
      "process.env.NODE_ENV": '"production"',
    },
    minify: true,
    external: externals,
    logLevel: "info",
  });
}

buildAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
