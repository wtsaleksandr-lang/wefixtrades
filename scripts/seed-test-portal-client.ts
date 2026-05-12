/**
 * Seed a dedicated test-client account for the Q4 portal-settings E2E.
 *
 * Creates a `users` row with role='client' + a linked `clients` row, so
 * the E2E suite (tests/e2e/portal-settings.e2e.spec.ts) can log in and
 * exercise change-password / contact-info / logo flows without touching
 * a real customer account.
 *
 * Usage:
 *
 *   pnpm tsx scripts/seed-test-portal-client.ts \
 *     --email "test-client@wefixtrades.com" \
 *     --password "<choose-strong-throwaway>"
 *
 * Idempotent: if the email already exists, the password is updated and
 * the linked client row is created if missing. Safe to run repeatedly.
 *
 * After running, set the same email + password in Doppler so the E2E
 * suite picks them up:
 *
 *   doppler secrets set TEST_CLIENT_EMAIL=test-client@wefixtrades.com \
 *                       TEST_CLIENT_PASSWORD='<...>' \
 *                       --project wefixtrades --config dev
 *
 * Then from the Replit Shell:
 *
 *   pnpm test:e2e tests/e2e/portal-settings.e2e.spec.ts
 *
 * Security note: the password is read from `--password` CLI arg only —
 * never hardcoded, never committed. Choose a throwaway value distinct
 * from any real customer or admin credential.
 */

import "dotenv/config";
import { db } from "../server/db";
import { clients, users } from "@shared/schema";
import { hashPassword } from "../server/auth";
import { eq } from "drizzle-orm";

function parseArgs(): { email: string; password: string } {
  const args = process.argv.slice(2);
  const get = (flag: string) => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const email = get("--email");
  const password = get("--password");
  if (!email || !password) {
    console.error("Usage: tsx scripts/seed-test-portal-client.ts --email <e> --password <p>");
    process.exit(2);
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    console.error("--email must look like an email address");
    process.exit(2);
  }
  if (password.length < 8) {
    console.error("--password must be at least 8 characters");
    process.exit(2);
  }
  return { email, password };
}

async function main() {
  const { email, password } = parseArgs();
  const password_hash = hashPassword(password);

  // Upsert user
  const [existingUser] = await db
    .select({ id: users.id, role: users.role })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  let userId: number;
  if (existingUser) {
    if (existingUser.role !== "client") {
      console.error(
        `User ${email} exists but has role='${existingUser.role}'. Refusing to overwrite — pick a different --email.`,
      );
      process.exit(3);
    }
    await db.update(users).set({ password_hash }).where(eq(users.id, existingUser.id));
    userId = existingUser.id;
    console.log(`Updated password for existing test-client user id=${userId}`);
  } else {
    const [created] = await db
      .insert(users)
      .values({
        email,
        password_hash,
        name: "Q4 E2E Test Client",
        role: "client",
      })
      .returning();
    userId = created.id;
    console.log(`Created test-client user id=${userId} email=${email}`);
  }

  // Upsert clients row linked to this user
  const [existingClient] = await db
    .select({ id: clients.id, user_id: clients.user_id })
    .from(clients)
    .where(eq(clients.contact_email, email))
    .limit(1);

  if (existingClient) {
    if (existingClient.user_id !== userId) {
      await db.update(clients).set({ user_id: userId }).where(eq(clients.id, existingClient.id));
      console.log(`Re-linked client id=${existingClient.id} to user id=${userId}`);
    } else {
      console.log(`Client row id=${existingClient.id} already linked — no change`);
    }
  } else {
    const [createdClient] = await db
      .insert(clients)
      .values({
        business_name: "Q4 E2E Demo Business",
        contact_name: "Q4 E2E Test Client",
        contact_email: email,
        contact_phone: "+15551230000",
        trade_type: "test",
        status: "active",
        source: "manual",
        user_id: userId,
      })
      .returning();
    console.log(`Created client row id=${createdClient.id} linked to user id=${userId}`);
  }

  console.log("\n✓ Seed complete. Next steps:");
  console.log(`  doppler secrets set TEST_CLIENT_EMAIL=${email} TEST_CLIENT_PASSWORD='<the password you just used>' --project wefixtrades --config dev`);
  console.log(`  pnpm test:e2e tests/e2e/portal-settings.e2e.spec.ts`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Failed:", err?.message ?? err);
  process.exit(1);
});
