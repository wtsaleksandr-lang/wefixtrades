/**
 * Drizzle Kit config — DEV-ONLY.
 *
 * Why this file lives at `scripts/db/drizzle.config.dev.ts` (not the repo root):
 * Replit's deploy pipeline ("Database" panel + Publish flow) auto-detects
 * Drizzle projects by scanning the repo root for the `drizzle.config*` glob.
 * When found, Replit runs a `drizzle-kit push` schema diff on every Publish
 * — which surfaces a "destructive migration" approval prompt to Alex on
 * every redeploy, even though production never needed or wanted
 * `drizzle-kit push` to run (we use file-based migrations applied at boot
 * via `server/lib/bootstrapMigrations.ts`).
 *
 * History:
 *   1. Original name `drizzle.config.ts` triggered the detector.
 *   2. PR #620 renamed to `drizzle.config.dev.ts` hoping the rename alone
 *      would defeat the detector — it did NOT. The detector matches the
 *      `drizzle.config*` glob, not the exact filename.
 *   3. This PR moves the file out of the repo root entirely. The detector
 *      only scans the root, so relocating to `scripts/db/` silences it
 *      permanently.
 *
 * Local dev still uses this file via:
 *   npm run db:push:dev  ->  drizzle-kit push --config=scripts/db/drizzle.config.dev.ts
 *
 * DO NOT move this file back to the repo root — that would re-enable the
 * Replit destructive-migration prompt on every publish.
 *
 * NB: `schema:` and `out:` paths below are relative to the cwd at invocation
 * (drizzle-kit 0.31.x behaviour), and the npm scripts always run from repo
 * root, so the paths stay `./shared/schemas/*.ts` and `./migrations`.
 */
import { defineConfig } from "drizzle-kit";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

export default defineConfig({
  out: "./migrations",
  // Point at every per-domain schema file directly (not the `schema.ts`
  // barrel). The barrel uses chained `export *` (`schema.ts` -> `schemas/index.ts`
  // -> `./adminCrm` etc.); drizzle-kit's esbuild bundler does NOT always
  // resolve tables defined behind two layers of `export *`, which caused
  // drizzle-kit push to think tables defined in `adminCrm.ts` (e.g.
  // `client_faq_items`, `client_trust_badges`, `clients.business_hours`)
  // were missing and propose destructive DROPs against production. Scanning
  // each file directly eliminates that resolution gap.
  schema: ["./shared/schemas/*.ts", "!./shared/schemas/index.ts"],
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
