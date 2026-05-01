import type { Express } from "express";
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
}
