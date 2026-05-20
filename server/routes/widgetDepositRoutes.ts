/**
 * Widget Deposit Routes — Wave R-2.
 *
 * Stripe Checkout deposit collection for the QuoteQuick widget's
 * post-quote "Secure your slot" panel. Money flows via Stripe Connect
 * (transfer_data.destination) to the calculator owner's connected
 * account; the platform takes a small application_fee_amount.
 *
 * Endpoints:
 *   POST /api/widget-deposit/create-session  →  create Checkout session
 *
 * The corresponding webhook handler lives in stripeBillingRoutes.ts —
 * on checkout.session.completed with metadata.source === 'widget_deposit',
 * the matching widget_deposits row is marked paid.
 */

import type { Express, Request, Response } from "express";
import Stripe from "stripe";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../storage";
import { widgetDeposits } from "@shared/schema";
import { createLogger } from "../lib/logger";

const log = createLogger("WidgetDeposit");

// Platform fee on every widget deposit, in cents. Conservative default —
// Alex can tune later via env or settings UI. Capped to the deposit amount
// so we never overcharge a tiny test deposit.
const PLATFORM_FEE_CENTS = Number(
  process.env.WIDGET_DEPOSIT_APP_FEE_CENTS || 290,
);

function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  return new Stripe(key, { apiVersion: "2025-01-27.acacia" as any });
}

interface CreateSessionBody {
  slug?: string;
  quote_amount_cents?: number;
  lead_id?: number;
  customer_email?: string;
}

export function registerWidgetDepositRoutes(app: Express): void {
  app.post(
    "/api/widget-deposit/create-session",
    async (req: Request, res: Response) => {
      try {
        const stripe = getStripe();
        if (!stripe) {
          return res
            .status(503)
            .json({ error: "Stripe not configured on the platform" });
        }

        const body = (req.body || {}) as CreateSessionBody;
        const slug = (body.slug || "").trim();
        const quoteAmountCents = Number(body.quote_amount_cents);
        const leadId = body.lead_id ? Number(body.lead_id) : null;
        const customerEmail = (body.customer_email || "").trim() || null;

        if (!slug) {
          return res.status(400).json({ error: "slug is required" });
        }
        if (
          !Number.isFinite(quoteAmountCents) ||
          quoteAmountCents <= 0
        ) {
          return res
            .status(400)
            .json({ error: "quote_amount_cents must be a positive integer" });
        }

        const calc = await storage.getCalculatorBySlug(slug);
        if (!calc) {
          return res.status(404).json({ error: "Calculator not found" });
        }

        const settings = (calc.calculator_settings as any) || {};
        const depositCfg = settings.appearance?.deposit || {};
        if (!depositCfg.enabled) {
          return res
            .status(400)
            .json({ error: "Deposit collection is not enabled" });
        }

        // Stripe Connect account is stored alongside booking settings (set
        // by the existing Connect onboarding flow in stripeRoutes.ts).
        const connectAccountId =
          settings.booking_settings?.stripe_account_id || null;
        if (!connectAccountId) {
          return res
            .status(400)
            .json({
              error:
                "Calculator owner has not connected a Stripe account. Connect Stripe to accept deposits.",
            });
        }

        // Compute deposit amount in cents.
        const mode = depositCfg.mode === "fixed" ? "fixed" : "percent";
        const cfgValue = Number(depositCfg.value);
        if (!Number.isFinite(cfgValue) || cfgValue <= 0) {
          return res
            .status(400)
            .json({ error: "Deposit value is not configured" });
        }
        let depositCents: number;
        if (mode === "percent") {
          depositCents = Math.round((quoteAmountCents * cfgValue) / 100);
        } else {
          // Fixed mode stores dollars in the wizard input → convert to cents.
          depositCents = Math.round(cfgValue * 100);
        }
        // Stripe enforces a $0.50 minimum on USD card charges.
        if (depositCents < 50) {
          return res.status(400).json({
            error:
              "Computed deposit is below Stripe's $0.50 minimum. Raise the deposit value.",
          });
        }

        const currency = (
          settings.integrations?.currency || "USD"
        ).toLowerCase();

        // Application fee never exceeds the deposit.
        const appFee = Math.min(PLATFORM_FEE_CENTS, depositCents - 1);

        // Pre-record the pending row so we have a paper trail even if the
        // customer abandons checkout. Updated by the webhook on success.
        const [pending] = await db
          .insert(widgetDeposits)
          .values({
            calculator_id: calc.id,
            lead_id: leadId ?? undefined,
            amount_cents: depositCents,
            currency,
            status: "pending",
            customer_email: customerEmail ?? undefined,
            metadata: {
              mode,
              config_value: cfgValue,
              quote_amount_cents: quoteAmountCents,
              connect_account: connectAccountId,
            },
          })
          .returning();

        const protocol = req.headers["x-forwarded-proto"] || "https";
        const host = req.headers.host;
        const baseUrl =
          process.env.APP_URL || `${protocol}://${host}`;
        const successUrl = `${baseUrl}/q/${slug}?deposit=success&deposit_id=${pending.id}`;
        const cancelUrl = `${baseUrl}/q/${slug}?deposit=cancelled&deposit_id=${pending.id}`;

        const label =
          (depositCfg.label || "").trim() ||
          (mode === "percent"
            ? `${cfgValue}% deposit`
            : `$${cfgValue} deposit`);

        const session = await stripe.checkout.sessions.create({
          mode: "payment",
          payment_method_types: ["card"],
          customer_email: customerEmail || undefined,
          line_items: [
            {
              quantity: 1,
              price_data: {
                currency,
                product_data: {
                  name: label,
                  description: `Deposit for ${calc.business_name}`,
                },
                unit_amount: depositCents,
              },
            },
          ],
          payment_intent_data: {
            application_fee_amount: appFee,
            transfer_data: {
              destination: connectAccountId,
            },
            metadata: {
              source: "widget_deposit",
              widget_deposit_id: String(pending.id),
              calculator_id: String(calc.id),
              lead_id: leadId ? String(leadId) : "",
            },
          },
          metadata: {
            source: "widget_deposit",
            widget_deposit_id: String(pending.id),
            calculator_id: String(calc.id),
            lead_id: leadId ? String(leadId) : "",
          },
          success_url: successUrl,
          cancel_url: cancelUrl,
        });

        // Persist the session id so the webhook can find this row.
        await db
          .update(widgetDeposits)
          .set({ stripe_session_id: session.id })
          .where(eq(widgetDeposits.id, pending.id));

        log.info(
          `Created widget deposit session ${session.id} for calculator ${calc.id} (${depositCents}c, fee ${appFee}c)`,
        );

        return res.json({
          session_id: session.id,
          checkout_url: session.url,
          deposit_id: pending.id,
          amount_cents: depositCents,
          currency,
        });
      } catch (err: any) {
        log.error("create-session failed", { error: err.message });
        return res
          .status(500)
          .json({ error: "Failed to create deposit session" });
      }
    },
  );
}
