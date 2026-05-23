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
