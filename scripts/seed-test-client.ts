import "dotenv/config";
import { db } from "../server/db";
import { clients, users } from "@shared/schema";
import { eq } from "drizzle-orm";

async function main() {
  const email = "admin@wefixtrades.com";

  // Find admin user
  const [adminUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (!adminUser) {
    console.error("Admin user not found — run seed-admin first");
    process.exit(1);
  }

  const [existing] = await db
    .select({ id: clients.id, user_id: clients.user_id })
    .from(clients)
    .where(eq(clients.contact_email, email))
    .limit(1);

  if (existing) {
    // Ensure linked
    if (!existing.user_id) {
      await db.update(clients).set({ user_id: adminUser.id }).where(eq(clients.id, existing.id));
      console.log("Linked existing client", existing.id, "to user", adminUser.id);
    } else {
      console.log("Test client already exists and linked — id:", existing.id);
    }
  } else {
    const [created] = await db
      .insert(clients)
      .values({
        business_name: "Demo Plumbing Co",
        contact_name: "Admin User",
        contact_email: email,
        contact_phone: "+1234567890",
        trade_type: "plumber",
        status: "active",
        source: "manual",
        user_id: adminUser.id,
      })
      .returning();
    console.log("Created test client with id:", created.id, "linked to user", adminUser.id);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("Failed:", err.message);
  process.exit(1);
});
