/**
 * Seed the suppliers table with initial WeFixTrades supplier roster.
 *
 * Usage:
 *   npx tsx server/scripts/seed-suppliers.ts
 *
 * Idempotent — checks by contact_email before inserting. Safe to run multiple times.
 */

import { db } from "../db";
import { suppliers } from "@shared/schema";
import { eq } from "drizzle-orm";

interface SupplierSeed {
  name: string;
  type: string;
  contact_email: string;
  supported_services: string[];
}

const SUPPLIER_SEEDS: SupplierSeed[] = [
  {
    name: "Website Design Agency",
    type: "white_label",
    contact_email: "design@example.com",
    supported_services: ["sitelaunch", "sitelaunch-template"],
  },
  {
    name: "SEO Specialist",
    type: "freelancer",
    contact_email: "seo@example.com",
    supported_services: ["rankflow-starter", "rankflow-growth", "rankflow-pro", "webfix"],
  },
  {
    name: "Content Writer",
    type: "freelancer",
    contact_email: "content@example.com",
    supported_services: ["socialsync", "contentflow"],
  },
  {
    name: "Google Ads Manager",
    type: "freelancer",
    contact_email: "ads@example.com",
    supported_services: [],
  },
];

async function main() {
  console.log("Seeding suppliers...\n");

  let created = 0;
  let skipped = 0;

  for (const seed of SUPPLIER_SEEDS) {
    // Idempotent: check if supplier with this email already exists
    const existing = await db
      .select({ id: suppliers.id })
      .from(suppliers)
      .where(eq(suppliers.contact_email, seed.contact_email))
      .limit(1);

    if (existing.length > 0) {
      console.log(`  - ${seed.name} (${seed.contact_email}) — already exists, skipping`);
      skipped++;
      continue;
    }

    await db.insert(suppliers).values({
      name: seed.name,
      type: seed.type,
      contact_email: seed.contact_email,
      supported_services: seed.supported_services,
      is_active: true,
    });

    console.log(`  + ${seed.name} (${seed.contact_email}) — created`);
    created++;
  }

  console.log(`\nDone: ${created} created, ${skipped} skipped (already exist).`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Failed to seed suppliers:", err.message);
  const cause = (err as any).cause ?? err;
  if (cause) {
    for (const key of ["code", "detail", "hint", "table", "column", "constraint"]) {
      const val = cause[key];
      if (val !== undefined && val !== null) console.error(`  ${key}: ${val}`);
    }
  }
  process.exit(1);
});
