/**
 * Seed an admin user for the AI Operations dashboard.
 *
 * Usage:
 *   npx tsx server/scripts/seed-admin.ts <email> <password> [name]
 *
 * Example:
 *   npx tsx server/scripts/seed-admin.ts admin@wefixtrades.com MySecurePass123 "Admin"
 *
 * If the email already exists, the user's role is updated to "admin".
 */

import { db } from "../db";
import { users } from "@shared/schema";
import { hashPassword } from "../auth";
import { eq } from "drizzle-orm";

async function main() {
  const [, , email, password, name] = process.argv;

  if (!email || !password) {
    console.error("Usage: npx tsx server/scripts/seed-admin.ts <email> <password> [name]");
    process.exit(1);
  }

  const normalizedEmail = email.toLowerCase().trim();

  // Check if user exists
  const [existing] = await db
    .select({ id: users.id, email: users.email, role: users.role })
    .from(users)
    .where(eq(users.email, normalizedEmail))
    .limit(1);

  if (existing) {
    // Promote existing user to admin and reset password
    const passwordHash = hashPassword(password);
    await db.update(users).set({ role: "admin", password_hash: passwordHash }).where(eq(users.id, existing.id));
    console.log(`Updated existing user "${normalizedEmail}" to admin role with new password.`);
  } else {
    // Create new admin user
    const passwordHash = hashPassword(password);
    await db.insert(users).values({
      email: normalizedEmail,
      password_hash: passwordHash,
      name: name || "Admin",
      role: "admin",
    });
    console.log(`Created admin user: ${normalizedEmail}`);
  }

  console.log("\nAdmin access ready:");
  console.log(`  Login:     /login`);
  console.log(`  Dashboard: /admin/ai`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Failed to seed admin:", err.message);
  process.exit(1);
});
