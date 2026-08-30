/**
 * Citation Builder — customer-facing checkout + portal routes.
 *
 * Wave 3.5 launch-wiring (PR #815 shipped the marketing page; this file
 * closes the loop with real Stripe checkout instead of mailto:sales@).
 *
 *   POST   /api/citation-builder/checkout                — Stripe Checkout
 *   POST   /api/citation-builder/submission              — create row (auth'd)
 *   GET    /api/citation-builder/submission/:id          — fetch by id
 *   GET    /api/citation-builder/submissions             — paginated list
 *
 * Checkout is unauth'd (we link submissions to customer_id post-payment
 * via metadata.user_id when the payer is logged in). All portal reads
 * require requireClient.
 */
import type { Express, Request, Response } from "express";
import { z } from "zod";
import Stripe from "stripe";
import { and, desc, eq, sql } from "drizzle-orm";
import { requireClient } from "../auth";
import { db } from "../db";
import {
  citationBuilderDirectoryTasks,
  citationBuilderSubmissions,
  CITATION_BUILDER_TIER_PRICE_CENTS,
} from "@shared/schema";
import { CITATIONBUILDER } from "@shared/pricing";
import { createLogger } from "../lib/logger";
import { publicCheckoutRateLimiter } from "../services/rateLimiter";
import {
  CITATION_BUILDER_TIER_DIRECTORIES,
  getBuilderDirectory,
  type CitationBuilderTier,
} from "@shared/citationBuilder/directories";

const log = createLogger("CitationBuilderRoutes");

function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  return new Stripe(key, { apiVersion: "2025-01-27.acacia" as any });
}

const TIERS = ["starter", "pro", "premium"] as const;

const checkoutSchema = z.object({
  tier: z.enum(TIERS),
  business_info: z.object({
    name: z.string().min(1).max(200),
    address: z.string().max(500).optional(),
    phone: z.string().max(50).optional(),
    website: z.string().max(500).optional(),
    categories: z.array(z.string().max(100)).max(20).optional(),
  }),
  email: z.string().email().optional(),
});

function tierStripePriceId(tier: typeof TIERS[number]): string | undefined | null {
  const t = CITATIONBUILDER.tiers.find(x => x.id === `citationbuilder-${tier}`);
  return t?.stripePriceId;
}

function tierPriceCents(tier: typeof TIERS[number]): number {
  return CITATION_BUILDER_TIER_PRICE_CENTS[tier] ?? 7900;
}

/**
 * The REAL number of listings in the tier, from the submission registry that
 * also generates the operator's checklist. There is deliberately no `?? 25`
 * fallback: an unknown tier is a bug, and quietly charging someone for a
 * made-up count is exactly what this product used to do.
 */
function tierDirectoryCount(tier: typeof TIERS[number]): number {
  return CITATION_BUILDER_TIER_DIRECTORIES[tier as CitationBuilderTier];
}

/**
 * The per-directory rows a CUSTOMER may see.
 *
 * These are the operator's own records — nothing is inferred, projected or
 * filled in. A directory the operator has not touched reports `not_started`,
 * and the only state rendered as a listing is `live`, which cannot be
 * recorded without its URL (see validateTaskWrite). `submissionNote` is the
 * operator's internal brief and is deliberately NOT exposed.
 */
async function customerVisibleTasks(submissionId: string) {
  const rows = await db
    .select()
    .from(citationBuilderDirectoryTasks)
    .where(eq(citationBuilderDirectoryTasks.submission_id, submissionId))
    .orderBy(citationBuilderDirectoryTasks.directory_name);
  return rows.map(t => ({
    id: t.id,
    directory_id: t.directory_id,
    directory_name: t.directory_name,
    status: t.status,
    listing_url: t.status === "live" ? t.listing_url : null,
    note: t.note,
    submitted_at: t.submitted_at,
    live_at: t.live_at,
    category: getBuilderDirectory(t.directory_id)?.category ?? null,
  }));
}

export function registerCitationBuilderRoutes(app: Express): void {

  /* ─── POST /api/citation-builder/checkout ──────────────────────── */
  app.post("/api/citation-builder/checkout", async (req: Request, res: Response) => {
    const ip = req.ip || req.socket.remoteAddress || "unknown";
    if (!(await publicCheckoutRateLimiter.check(`cb-checkout:${ip}`))) {
      return res.status(429).json({ error: "Too many checkout attempts. Try again in a few minutes." });
    }

    const parsed = checkoutSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid payload", details: parsed.error.flatten() });

    const stripe = getStripe();
    if (!stripe) return res.status(503).json({ error: "Stripe not configured" });

    try {
      const { tier, business_info, email } = parsed.data;
      const baseUrl = process.env.APP_URL || `${req.protocol}://${req.get("host")}`;
      const livePriceId = tierStripePriceId(tier);

      // Build a line item: prefer live price_id (durable wiring), fall
      // back to inline price_data so checkout works end-to-end before
      // Alex mints the live prices.
      let lineItem: Stripe.Checkout.SessionCreateParams.LineItem;
      if (livePriceId) {
        lineItem = { price: livePriceId, quantity: 1 };
      } else {
        lineItem = {
          quantity: 1,
          price_data: {
            currency: "usd",
            product_data: {
              name: `Citation Builder — ${tier.charAt(0).toUpperCase() + tier.slice(1)}`,
              description: `${tierDirectoryCount(tier)} listings, submitted by hand`,
            },
            unit_amount: tierPriceCents(tier),
          },
        };
      }

      const userId = (req as any).user?.id;
      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        line_items: [lineItem],
        customer_email: email || (req as any).user?.email,
        metadata: {
          product: "citation_builder",
          tier,
          user_id: userId ? String(userId) : "",
          business_info: JSON.stringify(business_info),
        },
        success_url: `${baseUrl}/portal/citation-builder?checkout=success`,
        cancel_url: `${baseUrl}/citation-builder?checkout=cancelled`,
      });

      res.json({ checkout_url: session.url, session_id: session.id });
    } catch (err: any) {
      log.error("checkout failed", { error: err?.message });
      res.status(500).json({ error: "Failed to create checkout session" });
    }
  });

  /* ─── POST /api/citation-builder/submission ────────────────────── */
  // Manual create (e.g. admin reorder or future portal "start new submission").
  app.post("/api/citation-builder/submission", requireClient, async (req: Request, res: Response) => {
    const parsed = z.object({
      tier: z.enum(TIERS),
      business_info: checkoutSchema.shape.business_info,
    }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid payload", details: parsed.error.flatten() });

    try {
      const customerId = (req as any).user!.id;
      const [row] = await db.insert(citationBuilderSubmissions).values({
        customer_id: customerId,
        tier: parsed.data.tier,
        business_info: parsed.data.business_info as any,
        // directories_total stays 0 until an operator starts the order and the
        // checklist is cut. Pre-filling it with the tier size would render a
        // "0 / 12" progress bar against work nobody has been assigned yet —
        // the portal shows the tier's coverage separately instead.
        directories_total: 0,
        status: "pending",
      }).returning();
      res.json({ submission: row });
    } catch (err: any) {
      log.error("create submission failed", { error: err?.message });
      res.status(500).json({ error: "Failed to create submission" });
    }
  });

  /* ─── GET /api/citation-builder/submission/:id ─────────────────── */
  app.get("/api/citation-builder/submission/:id", requireClient, async (req: Request, res: Response) => {
    try {
      const customerId = (req as any).user!.id;
      const id = String(req.params.id ?? "");
      if (!id) return res.status(400).json({ error: "Missing id" });

      const rows = await db
        .select()
        .from(citationBuilderSubmissions)
        .where(and(
          eq(citationBuilderSubmissions.id, id),
          eq(citationBuilderSubmissions.customer_id, customerId),
        ))
        .limit(1);
      if (rows.length === 0) return res.status(404).json({ error: "Not found" });
      res.json({
        submission: rows[0],
        directories: await customerVisibleTasks(id),
        tier_directory_count: tierDirectoryCount(rows[0].tier as typeof TIERS[number]),
      });
    } catch (err: any) {
      log.error("get submission failed", { error: err?.message });
      res.status(500).json({ error: "Failed to load submission" });
    }
  });

  /* ─── GET /api/citation-builder/submissions ────────────────────── */
  app.get("/api/citation-builder/submissions", requireClient, async (req: Request, res: Response) => {
    try {
      const customerId = (req as any).user!.id;
      const page = Math.max(1, Number(req.query.page) || 1);
      const limit = Math.min(100, Math.max(10, Number(req.query.limit) || 25));
      const offset = (page - 1) * limit;

      const rows = await db
        .select()
        .from(citationBuilderSubmissions)
        .where(eq(citationBuilderSubmissions.customer_id, customerId))
        .orderBy(desc(citationBuilderSubmissions.created_at))
        .limit(limit)
        .offset(offset);

      const [{ total = 0 } = { total: 0 }] = await db
        .select({ total: sql<number>`count(*)::int` })
        .from(citationBuilderSubmissions)
        .where(eq(citationBuilderSubmissions.customer_id, customerId));

      // Each order carries its own operator-recorded directory rows so the
      // dashboard can show what genuinely happened per listing rather than a
      // bare percentage. Orders are page-limited, so this is bounded.
      const submissions = await Promise.all(
        rows.map(async row => ({
          ...row,
          directories: await customerVisibleTasks(row.id),
          tier_directory_count: tierDirectoryCount(row.tier as typeof TIERS[number]),
        })),
      );

      res.json({ submissions, total, page, limit });
    } catch (err: any) {
      log.error("list submissions failed", { error: err?.message });
      res.status(500).json({ error: "Failed to load submissions" });
    }
  });
}
