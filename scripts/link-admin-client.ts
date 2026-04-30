import "dotenv/config";
import { db } from "../server/db";
import { users, clients } from "@shared/schema";
import { eq } from "drizzle-orm";

async function main() {
  // Get admin user
  const [adminUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, "admin@wefixtrades.com"))
    .limit(1);

  if (!adminUser) {
    console.error("Admin user not found");
    process.exit(1);
  }
  console.log("Admin user_id:", adminUser.id);

  // Get test client
  const [client] = await db
    .select({ id: clients.id, user_id: clients.user_id })
    .from(clients)
    .where(eq(clients.contact_email, "admin@wefixtrades.com"))
    .limit(1);

  if (!client) {
    console.error("Test client not found");
    process.exit(1);
  }

  if (client.user_id === adminUser.id) {
    console.log("Already linked");
  } else {
    await db
      .update(clients)
      .set({ user_id: adminUser.id })
      .where(eq(clients.id, client.id));
    console.log(`Linked client ${client.id} to user ${adminUser.id}`);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("Failed:", err.message);
  process.exit(1);
});
