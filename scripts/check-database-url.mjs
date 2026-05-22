/**
 * BF-1b — CI entry point for the DATABASE_URL sanity guard.
 *
 * Mirrors the logic in server/lib/checkDatabaseUrl.ts so CI catches the
 * same misconfiguration the boot-path guard would. Kept as a standalone
 * .mjs (no TS imports) so it runs before any build step.
 *
 * Usage:
 *   NODE_ENV=production DATABASE_URL=... node scripts/check-database-url.mjs
 *
 * Exit code 0 = OK, 1 = guard tripped.
 */

const RAW = process.env.DATABASE_URL || "";
const NODE_ENV = process.env.NODE_ENV || "development";
const REQUIRED_SUBSTRING = process.env.PROD_DATABASE_URL_REQUIRED_SUBSTRING || "";

const NON_PROD_MARKERS = [
  "dev",
  "develop",
  "development",
  "preview",
  "staging",
  "stage",
  "test",
  "sandbox",
  "ephemeral",
  "localhost",
  "127.0.0.1",
];

function maskHost(url) {
  const m = url.match(/@([^/?]+)/);
  return m ? m[1] : "(unparseable)";
}

if (!RAW) {
  if (NODE_ENV === "production") {
    console.error(
      "[check-database-url] FATAL: DATABASE_URL is empty in production.",
    );
    process.exit(1);
  }
  console.log("[check-database-url] DATABASE_URL unset (non-production) — OK");
  process.exit(0);
}

const host = maskHost(RAW).toLowerCase();
const tokens = host.split(/[.\-_]/);
const hits = NON_PROD_MARKERS.filter((m) => tokens.includes(m));

if (NODE_ENV !== "production") {
  console.log(
    `[check-database-url] env=${NODE_ENV} host=${host} ` +
      `markers=${hits.length ? hits.join(",") : "none"} — non-prod, no enforcement`,
  );
  process.exit(0);
}

if (hits.length > 0) {
  console.error(
    `[check-database-url] FATAL: NODE_ENV=production but DATABASE_URL host ` +
      `contains non-prod marker(s): ${hits.join(",")} (host=${host}). ` +
      `BF-1 credential-wipe signature. Fix the deployment's DATABASE_URL ` +
      `Secret in Replit Deployments console before retrying.`,
  );
  process.exit(1);
}

if (REQUIRED_SUBSTRING && !host.includes(REQUIRED_SUBSTRING.toLowerCase())) {
  console.error(
    `[check-database-url] FATAL: NODE_ENV=production and ` +
      `PROD_DATABASE_URL_REQUIRED_SUBSTRING="${REQUIRED_SUBSTRING}" set, but ` +
      `DATABASE_URL host (${host}) does not contain it.`,
  );
  process.exit(1);
}

console.log(
  `[check-database-url] OK env=production host=${host}` +
    (REQUIRED_SUBSTRING ? ` required-substring=${REQUIRED_SUBSTRING} ✓` : ""),
);
process.exit(0);
