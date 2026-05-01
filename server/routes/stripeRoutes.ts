import type { Express, Request, Response } from "express";
import Stripe from "stripe";
import { storage } from "../storage";
import { createLogger } from "../lib/logger";

const log = createLogger("StripeConnect");

function getStripeClient(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  return new Stripe(key, { apiVersion: "2025-01-27.acacia" as any });
}

export function registerStripeRoutes(app: Express): void {
  app.post("/api/stripe/connect", async (req, res) => {
    try {
      const token = req.body.token;
      if (!token) return res.status(401).json({ error: "Token required" });
      const calc = await storage.getCalculatorByToken(token);
      if (!calc) return res.status(404).json({ error: "Calculator not found" });

      const stripe = getStripeClient();
      if (!stripe) return res.status(500).json({ error: "Stripe not configured. Set STRIPE_SECRET_KEY." });

      const account = await stripe.accounts.create({
        type: "express",
        capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
      });

      const protocol = req.headers["x-forwarded-proto"] || "https";
      const host = req.headers.host;
      const baseUrl = `${protocol}://${host}`;

      const accountLink = await stripe.accountLinks.create({
        account: account.id,
        refresh_url: `${baseUrl}/api/stripe/connect/refresh?token=${token}&account_id=${account.id}`,
        return_url: `${baseUrl}/api/stripe/connect/callback?token=${token}&account_id=${account.id}`,
        type: "account_onboarding",
      });

      res.json({ url: accountLink.url, account_id: account.id });
    } catch (err: any) {
      log.error("[Stripe Connect]", err);
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/stripe/connect/callback", async (req, res) => {
    try {
      const token = req.query.token as string;
      const accountId = req.query.account_id as string;
      if (!token || !accountId) return res.status(400).send("Missing token or account_id");

      const calc = await storage.getCalculatorByToken(token);
      if (!calc) return res.status(404).send("Calculator not found");

      const settings = (calc.calculator_settings as any) || {};
      const bookingSettings = settings.booking_settings || {};
      bookingSettings.stripe_account_id = accountId;
      settings.booking_settings = bookingSettings;
      await storage.updateCalculator(calc.id, { calculator_settings: settings });

      res.redirect(`/?stripe_connected=1`);
    } catch (err: any) {
      log.error("[Stripe Callback]", err);
      res.status(500).send("Error connecting Stripe");
    }
  });

  app.get("/api/stripe/connect/refresh", async (req, res) => {
    try {
      const token = req.query.token as string;
      const accountId = req.query.account_id as string;
      if (!token || !accountId) return res.status(400).send("Missing params");

      const stripe = getStripeClient();
      if (!stripe) return res.status(500).send("Stripe not configured");

      const protocol = req.headers["x-forwarded-proto"] || "https";
      const host = req.headers.host;
      const baseUrl = `${protocol}://${host}`;

      const accountLink = await stripe.accountLinks.create({
        account: accountId,
        refresh_url: `${baseUrl}/api/stripe/connect/refresh?token=${token}&account_id=${accountId}`,
        return_url: `${baseUrl}/api/stripe/connect/callback?token=${token}&account_id=${accountId}`,
        type: "account_onboarding",
      });

      res.redirect(accountLink.url);
    } catch (err: any) {
      res.status(500).send("Error refreshing Stripe link");
    }
  });

  app.get("/api/stripe/connect/status", async (req, res) => {
    try {
      const token = req.query.token as string;
      if (!token) return res.status(401).json({ error: "Token required" });
      const calc = await storage.getCalculatorByToken(token);
      if (!calc) return res.status(404).json({ error: "Calculator not found" });

      const settings = (calc.calculator_settings as any) || {};
      const bookingSettings = settings.booking_settings || {};
      const connected = !!bookingSettings.stripe_account_id;

      res.json({ connected, account_id: bookingSettings.stripe_account_id || null });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  /* ═══════════════════════════════════════════
     Stripe Connect Webhook — account.updated etc.
     ═══════════════════════════════════════════ */

  app.post("/api/stripe/connect/webhook", async (req: Request, res: Response) => {
    const stripe = getStripeClient();
    if (!stripe) return res.status(503).send("Stripe not configured");

    const sig = req.headers["stripe-signature"];
    const webhookSecret = process.env.STRIPE_CONNECT_WEBHOOK_SECRET;

    let event: Stripe.Event;

    if (webhookSecret && sig) {
      try {
        event = stripe.webhooks.constructEvent(
          (req as any).rawBody,
          sig as string,
          webhookSecret,
        );
      } catch (err: any) {
        log.error("Connect webhook signature verification failed", { error: err.message });
        return res.status(400).send("Invalid signature");
      }
    } else if (process.env.NODE_ENV === "production") {
      log.error("STRIPE_CONNECT_WEBHOOK_SECRET not set — rejecting in production");
      return res.status(500).send("Webhook secret not configured");
    } else {
      event = req.body as Stripe.Event;
      log.warn("No STRIPE_CONNECT_WEBHOOK_SECRET — skipping verification (dev only)");
    }

    try {
      switch (event.type) {
        case "account.updated":
          await handleAccountUpdated(stripe, event.data.object as Stripe.Account, event.id);
          break;
        default:
          break;
      }
      res.json({ received: true });
    } catch (err: any) {
      log.error(`Connect webhook error handling ${event.type}`, { error: err.message });
      res.status(500).json({ error: "Webhook handler failed" });
    }
  });
}

/* ─── Connect Webhook Handlers ─── */

async function handleAccountUpdated(
  stripe: Stripe,
  account: Stripe.Account,
  eventId: string,
): Promise<void> {
  const accountId = account.id;
  const chargesEnabled = account.charges_enabled ?? true;
  const payoutsEnabled = account.payouts_enabled ?? true;

  // Log every account.updated event to the activity log
  await storage.logAdminActivity({
    actor_type: "system",
    actor_name: "Stripe Connect Webhook",
    action: "stripe_connect.account_updated",
    entity_type: "stripe_account",
    entity_id: 0,
    summary: `Stripe Connect account ${accountId} updated — charges_enabled=${chargesEnabled}, payouts_enabled=${payoutsEnabled}`,
    metadata: {
      stripe_account_id: accountId,
      stripe_event_id: eventId,
      charges_enabled: chargesEnabled,
      payouts_enabled: payoutsEnabled,
      capabilities: account.capabilities ?? {},
    },
  });

  // If capabilities are disabled, find the calculator(s) using this Connect account
  // and update their metadata to flag the issue
  if (!chargesEnabled) {
    log.warn("Connect account capabilities disabled", { accountId, chargesEnabled, payoutsEnabled });

    // Find all calculators that reference this Stripe Connect account
    const allCalculators = await storage.getAllCalculatorsForAdmin();
    for (const calc of allCalculators) {
      const settings = (calc.calculator_settings as any) || {};
      const bookingSettings = settings.booking_settings || {};
      if (bookingSettings.stripe_account_id === accountId) {
        bookingSettings.stripe_charges_enabled = false;
        bookingSettings.stripe_capabilities_disabled_at = new Date().toISOString();
        settings.booking_settings = bookingSettings;
        await storage.updateCalculator(calc.id, { calculator_settings: settings });

        log.info("Flagged calculator with disabled Connect capabilities", {
          calculatorId: String(calc.id),
          accountId,
        });
      }
    }
  }
}
