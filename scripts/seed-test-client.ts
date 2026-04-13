import "dotenv/config";
import { db } from "../server/db";
import { clients } from "@shared/schema";
import { eq } from "drizzle-orm";

async function main() {
  const email = "admin@wefixtrades.com";

  const [existing] = await db
    .select({ id: clients.id })
    .from(clients)
    .where(eq(clients.contact_email, email))
    .limit(1);

  if (existing) {
    console.log("Test client already exists with id:", existing.id);
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
      })
      .returning();
    console.log("Created test client with id:", created.id);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("Failed:", err.message);
  process.exit(1);
});
