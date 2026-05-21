/**
 * Seed the suppliers table with initial WeFixTrades supplier roster.
 *
 * Usage:
 *   npx tsx server/scripts/seed-suppliers.ts
 *
 * Idempotent — checks by contact_email before inserting. Safe to run multiple times.
 */

import { db } from "../db";
import { suppliers } from "../../shared/schemas/adminCrm";
import { eq } from "drizzle-orm";

interface SupplierSeed {
  name: string;
  type: string;
  contact_email: string;
  supported_services: string[];
  /* W-AM-3: optional fields for external-marketplace (Fiverr) leads. */
  supplier_type?: string;
  platform_url?: string;
  fiverr_profile_url?: string;
  specialties?: string[];
  status?: string;
  is_active?: boolean;
  notes?: string;
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
  {
    name: "Ad Campaign Agency",
    type: "white_label",
    contact_email: "adflow-agency@example.com",
    supported_services: ["adflow-starter", "adflow-growth", "adflow-pro"],
  },
  /* W-AM-3: AL-3 Fiverr sourcing leads. Seeded as inactive/unverified — Alex
   * must vet each in a Fiverr browser session (confirm Top Rated badge, 500+
   * orders, 4.9+ rating) before flipping is_active to true. */
  {
    name: "Mahmoud Gamal",
    type: "fiverr",
    supplier_type: "fiverr",
    contact_email: "unverified+mahmoud@fiverr-lead.local",
    platform_url: "https://www.fiverr.com/search/gigs?query=Mahmoud%20Gamal%20WordPress",
    fiverr_profile_url: "https://www.fiverr.com/search/gigs?query=Mahmoud%20Gamal%20WordPress",
    supported_services: ["webfix"],
    specialties: ["WordPress", "troubleshooting"],
    status: "inactive",
    is_active: false,
    notes: "AL-3 research lead — unverified. Vet in Fiverr browser session: confirm Top Rated badge, 500+ orders, 4.9+ rating before activating.",
  },
  {
    name: "Lalit S",
    type: "fiverr",
    supplier_type: "fiverr",
    contact_email: "unverified+lalit@fiverr-lead.local",
    platform_url: "https://www.fiverr.com/search/gigs?query=Lalit%20S%20WordPress%20security",
    fiverr_profile_url: "https://www.fiverr.com/search/gigs?query=Lalit%20S%20WordPress%20security",
    supported_services: ["webfix"],
    specialties: ["WordPress", "security", "malware-removal"],
    status: "inactive",
    is_active: false,
    notes: "AL-3 research lead — unverified. Vet in Fiverr browser session: confirm Top Rated badge, 500+ orders, 4.9+ rating before activating.",
  },
  {
    name: "Kofil",
    type: "fiverr",
    supplier_type: "fiverr",
    contact_email: "unverified+kofil@fiverr-lead.local",
    platform_url: "https://www.fiverr.com/search/gigs?query=Kofil%20WordPress%20speed",
    fiverr_profile_url: "https://www.fiverr.com/search/gigs?query=Kofil%20WordPress%20speed",
    supported_services: ["webfix"],
    specialties: ["WordPress", "speed-optimization"],
    status: "inactive",
    is_active: false,
    notes: "AL-3 research lead — unverified. Vet in Fiverr browser session: confirm Top Rated badge, 500+ orders, 4.9+ rating before activating.",
  },
];

async function main() {
  console.log("Seeding suppliers...\n");

  let created = 0;
  let skipped = 0;

  for (const seed of SUPPLIER_SEEDS) {
    /* Idempotent: prefer name match for Fiverr leads (so re-seeding doesn't
     * duplicate placeholder unverified+*@fiverr-lead.local rows), fall back
     * to contact_email for the original roster. */
    const existingByName = await db
      .select({ id: suppliers.id })
      .from(suppliers)
      .where(eq(suppliers.name, seed.name))
      .limit(1);

    if (existingByName.length > 0) {
      console.log(`  - ${seed.name} — already exists, skipping`);
      skipped++;
      continue;
    }

    const existingByEmail = await db
      .select({ id: suppliers.id })
      .from(suppliers)
      .where(eq(suppliers.contact_email, seed.contact_email))
      .limit(1);

    if (existingByEmail.length > 0) {
      console.log(`  - ${seed.name} (${seed.contact_email}) — email already used, skipping`);
      skipped++;
      continue;
    }

    await db.insert(suppliers).values({
      name: seed.name,
      type: seed.type,
      supplier_type: seed.supplier_type ?? "email",
      contact_email: seed.contact_email,
      platform_url: seed.platform_url,
      fiverr_profile_url: seed.fiverr_profile_url,
      supported_services: seed.supported_services,
      specialties: seed.specialties ?? [],
      status: seed.status ?? "active",
      is_active: seed.is_active ?? true,
      notes: seed.notes,
      last_vetted_at: null,
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
