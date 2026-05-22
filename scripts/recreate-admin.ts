/**
 * BF-1 — emergency admin recreation.
 *
 * Recreates (or promotes) Alex's admin account against whatever DATABASE_URL
 * the current environment points at. Designed for the credentials-wipe
 * recovery flow: if the production `users` table no longer contains the
 * admin row, run this against the prod DB to restore login access.
 *
 * Credentials are read from environment variables — NEVER hardcoded:
 *
 *   ADMIN_RECOVERY_EMAIL    — admin email address (required)
 *   ADMIN_RECOVERY_PASSWORD — new password (required; min 12 chars)
 *   ADMIN_RECOVERY_NAME     — display name (optional, defaults to "Admin")
 *
 * Usage:
 *
 *   export ADMIN_RECOVERY_EMAIL='you@example.com'
 *   export ADMIN_RECOVERY_PASSWORD="$(openssl rand -base64 24)"
 *   export ADMIN_RECOVERY_NAME='Alex'
 *   npx tsx scripts/recreate-admin.ts
 *
 * Idempotent: if the email already exists the row is updated in place
 * (role → admin, password reset to the supplied value). If not, a new
 * row is inserted. The script prints the resulting user id and exits.
 *
 * DOES NOT log the password. DOES NOT echo the password. After running,
 * unset the env-var (`unset ADMIN_RECOVERY_PASSWORD`).
 */

import "dotenv/config";
import { db } from "../server/db";
import { users } from "@shared/schema";
import { hashPassword } from "../server/auth";
import { eq } from "drizzle-orm";

async function main() {
  const email = process.env.ADMIN_RECOVERY_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_RECOVERY_PASSWORD;
  const name = process.env.ADMIN_RECOVERY_NAME?.trim() || "Admin";

  if (!email) {
    console.error("ADMIN_RECOVERY_EMAIL is required.");
    process.exit(1);
  }
  if (!password) {
    console.error("ADMIN_RECOVERY_PASSWORD is required.");
    process.exit(1);
  }
  if (password.length < 12) {
    console.error(
      "ADMIN_RECOVERY_PASSWORD must be at least 12 characters. " +
        "Generate one with: openssl rand -base64 24",
    );
    process.exit(1);
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    console.error("ADMIN_RECOVERY_EMAIL is not a valid email address.");
    process.exit(1);
  }
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set. Refusing to run.");
    process.exit(1);
  }

  // Length-category log only — never the value itself.
  console.log(
    `[recreate-admin] target email=${email} password-length=${password.length} ` +
      `db=${process.env.DATABASE_URL.split("@")[1]?.split("/")[0] ?? "unknown-host"}`,
  );

  const passwordHash = hashPassword(password);

  const [existing] = await db
    .select({ id: users.id, role: users.role })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (existing) {
    await db
      .update(users)
      .set({ role: "admin", password_hash: passwordHash })
      .where(eq(users.id, existing.id));
    console.log(
      `[recreate-admin] updated existing user id=${existing.id} ` +
        `(previous role="${existing.role}") → role=admin, password reset.`,
    );
  } else {
    const [inserted] = await db
      .insert(users)
      .values({
        email,
        password_hash: passwordHash,
        name,
        role: "admin",
      })
      .returning({ id: users.id });
    console.log(`[recreate-admin] inserted new admin user id=${inserted.id}.`);
  }

  console.log(
    `[recreate-admin] done. Log in at /login with the email above. ` +
      `Unset ADMIN_RECOVERY_PASSWORD from your shell now.`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error("[recreate-admin] FAILED:", err?.message ?? err);
  process.exit(1);
});
