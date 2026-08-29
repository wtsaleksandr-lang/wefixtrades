import { pgTable, serial, integer, text, varchar, boolean, jsonb, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

/**
 * SiteLaunch — the generated-website store.
 *
 * Before this, SiteLaunch had no schema at all: the entire $1,197 product was
 * a Stripe SKU, CRM rows and an alert email
 * (server/services/sitelaunchPaidOrderNotify.ts, whose own doc comment says
 * "NO supplier-dispatch automation exists for SiteLaunch"). The picked
 * "template" lived as a string in `client_service.metadata.config` and
 * nothing consumed it.
 *
 * TWO TABLES, deliberately normalised rather than one document blob:
 *
 *   sitelaunch_sites — one row per customer site. Holds the site-level half
 *     of the document (brand, business facts, theme, footer) in `settings`,
 *     plus lifecycle state and the honest domain fields.
 *
 *   sitelaunch_pages — one row per page, ordered by `sort_order`. `sections`
 *     is the ordered section array validated by
 *     shared/sitelaunch/document.ts. Per-page rows mean the public renderer
 *     fetches exactly the page it is serving instead of loading a whole
 *     site blob to render one URL.
 *
 * `assembleDocument()` (server/storage/sitelaunch.ts) joins the two back
 * into the `SiteDocument` the renderer consumes.
 *
 * NO FOREIGN KEYS. Matches migrations/0096 and the additive-only posture
 * that keeps `check:schema-drift` green — the columns are plain integers
 * referencing clients.id / client_services.id / admin user ids, and the
 * storage layer owns referential care. (Adding constraints later is an
 * additive migration; removing them would not be.)
 */

/** Lifecycle. A site NEVER moves to `published` automatically — publishing
 *  is an explicit admin action after `approved`. See sitelaunchRoutes.ts. */
export const SITELAUNCH_SITE_STATUSES = [
  "draft",
  "in_review",
  "approved",
  "published",
  "archived",
] as const;
export type SiteLaunchSiteStatus = (typeof SITELAUNCH_SITE_STATUSES)[number];

/**
 * How the site is reached. `not_provisioned` is the honest default and the
 * ONLY value phase 1 can produce on its own: nothing in this PR touches DNS,
 * creates a Cloudflare zone, or issues a certificate. The other values exist
 * so the admin surface can record what an operator did by hand, and so
 * phase 2 (live zone provisioning) has somewhere to write.
 */
export const SITELAUNCH_HOSTING_MODES = [
  "not_provisioned",
  "hosted_subdomain",
  "custom_domain",
] as const;
export type SiteLaunchHostingMode = (typeof SITELAUNCH_HOSTING_MODES)[number];

/**
 * Domain progress. Every value below is a state a human can VERIFY.
 * There is deliberately no "ssl_active" that the app sets on a timer — the
 * bug this product area already shipped once
 * (server/routes/domainRoutes.ts issue-ssl) was exactly that.
 */
export const SITELAUNCH_DOMAIN_STATUSES = [
  "not_started",
  /** An operator is doing the zone/DNS work by hand. */
  "manual_in_progress",
  /** Nameservers/records confirmed by a human or a real DNS lookup. */
  "dns_confirmed",
  /** The site answers on the domain over HTTPS — verified, not assumed. */
  "live",
  "failed",
] as const;
export type SiteLaunchDomainStatus = (typeof SITELAUNCH_DOMAIN_STATUSES)[number];

export const sitelaunchSites = pgTable(
  "sitelaunch_sites",
  {
    id: serial("id").primaryKey(),
    /** clients.id — the customer this site belongs to. */
    client_id: integer("client_id"),
    /** client_services.id — the paid SiteLaunch order that produced it. */
    client_service_id: integer("client_service_id"),
    /** Hosted-tier subdomain label. Unique across all sites. */
    slug: varchar("slug", { length: 80 }).notNull(),
    business_name: varchar("business_name", { length: 160 }).notNull(),
    theme_id: varchar("theme_id", { length: 40 }).notNull().default("trade-classic"),
    status: varchar("status", { length: 20 }).notNull().default("draft"),
    /** Site-level document half: { brand, business, footer_note, show_powered_by }. */
    settings: jsonb("settings").notNull().default({}),
    /** Random, unguessable. Grants read-only access to the noindex preview. */
    preview_token: varchar("preview_token", { length: 64 }).notNull(),
    hosting_mode: varchar("hosting_mode", { length: 30 }).notNull().default("not_provisioned"),
    custom_domain: varchar("custom_domain", { length: 253 }),
    domain_status: varchar("domain_status", { length: 30 }).notNull().default("not_started"),
    /** Free text an operator writes describing what was actually done. */
    domain_status_note: text("domain_status_note"),
    published_at: timestamp("published_at"),
    approved_at: timestamp("approved_at"),
    approved_by: integer("approved_by"),
    last_generated_at: timestamp("last_generated_at"),
    /** Last AI-draft failure, surfaced in the admin UI instead of swallowed. */
    last_generation_error: text("last_generation_error"),
    created_at: timestamp("created_at").defaultNow().notNull(),
    updated_at: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    slugKey: uniqueIndex("sitelaunch_sites_slug_key").on(t.slug),
    previewTokenKey: uniqueIndex("sitelaunch_sites_preview_token_key").on(t.preview_token),
    clientIdx: index("sitelaunch_sites_client_idx").on(t.client_id),
    statusIdx: index("sitelaunch_sites_status_idx").on(t.status),
  }),
);

export const sitelaunchPages = pgTable(
  "sitelaunch_pages",
  {
    id: serial("id").primaryKey(),
    site_id: integer("site_id").notNull(),
    /** "" is the home page. */
    slug: varchar("slug", { length: 80 }).notNull().default(""),
    title: varchar("title", { length: 200 }).notNull(),
    nav_label: varchar("nav_label", { length: 60 }).notNull(),
    sort_order: integer("sort_order").notNull().default(0),
    show_in_nav: boolean("show_in_nav").notNull().default(true),
    meta_title: varchar("meta_title", { length: 200 }).notNull().default(""),
    meta_description: varchar("meta_description", { length: 400 }).notNull().default(""),
    /** Ordered SiteSection[] — validated by shared/sitelaunch/document.ts. */
    sections: jsonb("sections").notNull().default([]),
    created_at: timestamp("created_at").defaultNow().notNull(),
    updated_at: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    siteSlugKey: uniqueIndex("sitelaunch_pages_site_slug_key").on(t.site_id, t.slug),
    siteOrderIdx: index("sitelaunch_pages_site_order_idx").on(t.site_id, t.sort_order),
  }),
);

export const insertSitelaunchSiteSchema = createInsertSchema(sitelaunchSites).omit({
  id: true,
  created_at: true,
  updated_at: true,
});
export type InsertSitelaunchSite = z.infer<typeof insertSitelaunchSiteSchema>;
export type SitelaunchSite = typeof sitelaunchSites.$inferSelect;

export const insertSitelaunchPageSchema = createInsertSchema(sitelaunchPages).omit({
  id: true,
  created_at: true,
  updated_at: true,
});
export type InsertSitelaunchPage = z.infer<typeof insertSitelaunchPageSchema>;
export type SitelaunchPage = typeof sitelaunchPages.$inferSelect;

/** Site-level half of the document, as stored in `sitelaunch_sites.settings`. */
export const sitelaunchSettingsSchema = z.object({
  brand: z.record(z.unknown()).default({}),
  business: z.record(z.unknown()).default({}),
  footer_note: z.string().max(400).default(""),
  show_powered_by: z.boolean().default(true),
});
export type SitelaunchSettings = z.infer<typeof sitelaunchSettingsSchema>;
