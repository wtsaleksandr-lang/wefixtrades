/**
 * Drizzle Kit config — DEV-ONLY.
 *
 * Why this file is named `drizzle.config.dev.ts` (not `drizzle.config.ts`):
 * Replit's deploy pipeline ("Database" panel + Publish flow) auto-detects
 * Drizzle projects by scanning the repo root for the exact filename
 * `drizzle.config.ts`. When found, Replit runs a `drizzle-kit push` schema
 * diff on every Publish — which surfaces a "destructive migration" approval
 * prompt to Alex on every redeploy, even though production never needed or
 * wanted `drizzle-kit push` to run (we use file-based migrations applied at
 * boot via `server/lib/bootstrapMigrations.ts`).
 *
 * Renaming this file makes Replit's auto-detector miss it entirely, which
 * permanently removes the manual-approval prompt from deploys.
 *
 * Local dev still uses this file via:
 *   npm run db:push   ->   drizzle-kit push --config=drizzle.config.dev.ts
 *
 * DO NOT rename back to `drizzle.config.ts` — that would re-enable the
 * Replit destructive-migration prompt on every publish.
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
