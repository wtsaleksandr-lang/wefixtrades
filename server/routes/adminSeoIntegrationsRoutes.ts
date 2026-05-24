/**
 * SEO integrations admin API — the backend for /admin/integrations/google.
 *
 * Wires the four-provider OAuth/key flow: Google (one OAuth grant
 * covering GSC + GA4 + GBP scopes), Bing (per-user API key), GA4
 * property bootstrap, GBP listing-draft prep + future activation.
 *
 * Endpoints (all admin-only):
 *
 *   GET    /api/admin/integrations/status
 *   GET    /api/admin/integrations/google/authorize
 *   GET    /api/admin/integrations/google/callback
 *   POST   /api/admin/integrations/bing/connect
 *   POST   /api/admin/integrations/ga4/setup
 *   POST   /api/admin/integrations/gbp/prepare
 *   POST   /api/admin/integrations/disconnect/:provider
 *
 * The Google callback is the OAuth redirect_uri — keep the path stable.
 * State is signed with TOKEN_ENCRYPTION_KEY-backed HMAC and stored in
 * an httpOnly cookie for the round-trip; the legacy session would also
 * work but the cookie keeps this module self-contained.
 */

import type { Express, Request, Response } from "express";
import { z } from "zod";
import crypto from "crypto";
import { requireAdmin } from "../auth";
import { db } from "../db";
import { seoIndexingHistory } from "@shared/schema";
import { desc } from "drizzle-orm";
import { createLogger } from "../lib/logger";
import {
  buildAuthorizeUrl,
  exchangeCode,
  isGoogleOauthConfigured,
  persistInitialTokens,
} from "../lib/seo/googleOauth";
import { getToken, deleteToken, type Provider } from "../lib/seo/oauthTokenStore";
import {
  validateApiKey as validateBingKey,
  submitUrl as bingSubmitUrl,
  submitUrls as bingSubmitUrls,
  getQuota as bingGetQuota,
  getSitemaps as bingGetSitemaps,
  submitSitemap as bingSubmitSitemap,
  getUrlInfo as bingGetUrlInfo,
  BING_SITE_URL,
} from "../lib/seo/bingClient";
import { runBingIndexingTick } from "../cron/seoIndexing";
import { upsertToken } from "../lib/seo/oauthTokenStore";
import { createPropertyAndStream, listProperties as listGa4Properties } from "../lib/seo/ga4Client";
import {
  generateListingDraft,
  isApiAvailable as gbpIsApiAvailable,
  isGbpSaConfigured,
  getGbpSaEmail,
  probeGbpSaAccess,
  type GbpSaProbe,
} from "../lib/seo/gbpClient";
import { isCloudflareConfigured } from "../lib/seo/cloudflareDns";
import {
  getSessionsAndPageviews,
  getTopPages,
  isGa4DataApiConfigured,
} from "../lib/analytics/ga4DataClient";

// Production GA4 property id — single hardcoded constant. There's exactly
// one prod property (537753613 / "WeFixTrades Production") for the
// foreseeable future; if a second property is ever needed, this becomes
// an env var.
const GA4_PROD_PROPERTY_ID = "537753613";

const log = createLogger("AdminSeoIntegrations");

const STATE_COOKIE = "wft_seo_oauth_state";
const STATE_TTL_MS = 10 * 60 * 1000;

function signState(payload: string): string {
  const keyHex = process.env.TOKEN_ENCRYPTION_KEY ?? "dev-key";
  const mac = crypto.createHmac("sha256", keyHex).update(payload).digest("hex");
  return `${payload}.${mac}`;
}

function verifyState(signed: string): boolean {
  const idx = signed.lastIndexOf(".");
  if (idx === -1) return false;
  const payload = signed.slice(0, idx);
  const mac = signed.slice(idx + 1);
  const expected = signState(payload).split(".").pop();
  if (!expected) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(mac, "hex"), Buffer.from(expected, "hex"));
  } catch {
    return false;
  }
}

interface ProviderStatus {
  connected: boolean;
  account_email: string | null;
  expires_at: string | null;
  scopes: string[];
  connected_at: string | null;
}

async function loadProviderStatus(provider: Provider): Promise<ProviderStatus> {
  const tok = await getToken(provider);
  if (!tok) {
    return { connected: false, account_email: null, expires_at: null, scopes: [], connected_at: null };
  }
  return {
    connected: true,
    account_email: tok.account_email,
    expires_at: tok.expires_at ? tok.expires_at.toISOString() : null,
    scopes: tok.scopes,
    connected_at: tok.connected_at.toISOString(),
  };
}

export function registerAdminSeoIntegrationsRoutes(app: Express): void {
  // ─── Status panel ───────────────────────────────────────────────
  app.get("/api/admin/integrations/status", requireAdmin, async (_req: Request, res: Response) => {
    try {
      const [google, bing, gbp] = await Promise.all([
        loadProviderStatus("google"),
        loadProviderStatus("bing"),
        loadProviderStatus("gbp"),
      ]);

      const recentHistory = await db
        .select()
        .from(seoIndexingHistory)
        .orderBy(desc(seoIndexingHistory.performed_at))
        .limit(20);

      const gbpApiAvailable = await gbpIsApiAvailable().catch(() => false);
      const gbpSaConfigured = isGbpSaConfigured();
      const gbpSaProbe: GbpSaProbe | null = gbpSaConfigured
        ? await probeGbpSaAccess().catch(() => "error" as GbpSaProbe)
        : null;

      res.json({
        google,
        bing,
        gbp,
        ga4: {
          measurement_id: process.env.GA4_MEASUREMENT_ID ?? null,
          configured: Boolean(process.env.GA4_MEASUREMENT_ID),
        },
        gbp_api_available: gbpApiAvailable,
        gbp_sa: {
          configured: gbpSaConfigured,
          email: gbpSaConfigured ? getGbpSaEmail() : null,
          probe: gbpSaProbe,
        },
        google_oauth_configured: isGoogleOauthConfigured(),
        cloudflare_configured: isCloudflareConfigured(),
        recent_history: recentHistory,
      });
    } catch (err) {
      log.error("status read failed", { err: err instanceof Error ? err.message : String(err) });
      res.status(500).json({ error: "status_failed" });
    }
  });

  // ─── Google OAuth ──────────────────────────────────────────────
  app.get("/api/admin/integrations/google/authorize", requireAdmin, async (_req: Request, res: Response) => {
    if (!isGoogleOauthConfigured()) {
      return res.status(503).json({
        error: "oauth_not_configured",
        message:
          "GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET must be added to Doppler wefixtrades/prd",
      });
    }
    const nonce = crypto.randomBytes(16).toString("hex");
    const payload = `${nonce}:${Date.now()}`;
    const state = signState(payload);
    res.cookie(STATE_COOKIE, state, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: STATE_TTL_MS,
      path: "/",
    });
    const url = buildAuthorizeUrl(state);
    res.json({ authorize_url: url });
  });

  app.get("/api/admin/integrations/google/callback", async (req: Request, res: Response) => {
    const code = typeof req.query.code === "string" ? req.query.code : null;
    const state = typeof req.query.state === "string" ? req.query.state : null;
    const cookieState = (req.cookies?.[STATE_COOKIE] as string | undefined) ?? null;

    if (!code || !state || !cookieState || state !== cookieState || !verifyState(state)) {
      log.warn("OAuth callback rejected — state mismatch");
      return res.redirect("/admin/integrations/google?status=state-mismatch");
    }

    const [_nonce, tsStr] = state.split(".")[0].split(":");
    const ts = parseInt(tsStr ?? "0", 10);
    if (!ts || Date.now() - ts > STATE_TTL_MS) {
      return res.redirect("/admin/integrations/google?status=state-expired");
    }

    try {
      const tokens = await exchangeCode(code);
      await persistInitialTokens(tokens);
      res.clearCookie(STATE_COOKIE, { path: "/" });
      res.redirect("/admin/integrations/google?status=connected");
    } catch (err) {
      log.error("OAuth callback exchange failed", {
        err: err instanceof Error ? err.message : String(err),
      });
      res.redirect("/admin/integrations/google?status=exchange-failed");
    }
  });

  // ─── Bing connect ──────────────────────────────────────────────
  const bingConnectSchema = z.object({
    apiKey: z.string().trim().min(8).max(256),
    accountEmail: z.string().email().max(320).optional(),
  });

  app.post("/api/admin/integrations/bing/connect", requireAdmin, async (req: Request, res: Response) => {
    const parsed = bingConnectSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "invalid_input", details: parsed.error.flatten() });
    }
    const { apiKey, accountEmail } = parsed.data;

    const ok = await validateBingKey(apiKey);
    if (!ok) {
      return res.status(400).json({ error: "invalid_api_key", message: "Bing Webmaster Tools rejected this key" });
    }

    await upsertToken({
      provider: "bing",
      account_email: accountEmail ?? null,
      access_token: apiKey,
      refresh_token: null,
      expires_at: null,
      scopes: ["bing.webmaster"],
    });
    res.json({ connected: true });
  });

  // ─── GA4 setup ─────────────────────────────────────────────────
  const ga4SetupSchema = z.discriminatedUnion("mode", [
    z.object({
      mode: z.literal("existing"),
      measurement_id: z.string().regex(/^G-[A-Z0-9]{6,16}$/),
    }),
    z.object({
      mode: z.literal("create"),
      account_name: z.string().min(1), // "accounts/12345"
      display_name: z.string().min(1).max(100),
      website_url: z.string().url(),
      timezone: z.string().min(1).default("America/Chicago"),
    }),
  ]);

  app.post("/api/admin/integrations/ga4/setup", requireAdmin, async (req: Request, res: Response) => {
    const parsed = ga4SetupSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "invalid_input", details: parsed.error.flatten() });
    }

    const google = await getToken("google");
    if (!google) {
      return res.status(412).json({ error: "google_not_connected", message: "Connect Google first" });
    }

    try {
      if (parsed.data.mode === "existing") {
        // Process-local cache; the operator must also add GA4_MEASUREMENT_ID
        // to Doppler wefixtrades/prd so it persists across deploys.
        process.env.GA4_MEASUREMENT_ID = parsed.data.measurement_id;
        return res.json({
          measurement_id: parsed.data.measurement_id,
          persistence_note: "Add GA4_MEASUREMENT_ID to Doppler wefixtrades/prd to persist across deploys.",
        });
      }
      const result = await createPropertyAndStream(
        parsed.data.account_name,
        parsed.data.display_name,
        parsed.data.website_url,
        parsed.data.timezone,
      );
      process.env.GA4_MEASUREMENT_ID = result.measurementId;
      res.json({
        measurement_id: result.measurementId,
        property_name: result.propertyName,
        persistence_note: "Add GA4_MEASUREMENT_ID to Doppler wefixtrades/prd to persist across deploys.",
      });
    } catch (err) {
      log.error("GA4 setup failed", { err: err instanceof Error ? err.message : String(err) });
      res.status(500).json({ error: "ga4_setup_failed", message: err instanceof Error ? err.message : "unknown" });
    }
  });

  // ─── GA4 live summary (Data API, service-account auth) ───
  // Powers the admin SEO Integrations GA4 card with last-7-day numbers
  // plus top pages. Service-account auth means no per-operator OAuth
  // dance; as long as GOOGLE_APPLICATION_CREDENTIALS_JSON is in Doppler
  // the card always renders live data.
  app.get(
    "/api/admin/seo/ga4/summary",
    requireAdmin,
    async (_req: Request, res: Response) => {
      if (!isGa4DataApiConfigured()) {
        return res.status(503).json({
          error: "ga4_data_api_unconfigured",
          message:
            "GOOGLE_APPLICATION_CREDENTIALS_JSON is not set in Doppler — GA4 live summary unavailable.",
        });
      }
      try {
        const [agg, topPages] = await Promise.all([
          getSessionsAndPageviews({ propertyId: GA4_PROD_PROPERTY_ID, daysBack: 7 }),
          getTopPages({ propertyId: GA4_PROD_PROPERTY_ID, daysBack: 7, limit: 5 }),
        ]);
        res.json({
          propertyId: GA4_PROD_PROPERTY_ID,
          measurement_id: process.env.GA4_MEASUREMENT_ID ?? null,
          sessions7d: agg.sessions,
          pageviews7d: agg.pageviews,
          newUsers7d: agg.newUsers,
          topPages,
          generatedAt: new Date().toISOString(),
        });
      } catch (err) {
        log.warn("GA4 Data API summary failed", {
          err: err instanceof Error ? err.message : String(err),
        });
        res.status(502).json({
          error: "ga4_summary_failed",
          message: err instanceof Error ? err.message : "unknown",
        });
      }
    },
  );

  app.get("/api/admin/integrations/ga4/properties", requireAdmin, async (_req: Request, res: Response) => {
    try {
      const props = await listGa4Properties();
      res.json({ properties: props });
    } catch (err) {
      res.status(500).json({ error: "ga4_list_failed", message: err instanceof Error ? err.message : "unknown" });
    }
  });

  // ─── GBP prepare ───────────────────────────────────────────────
  app.post("/api/admin/integrations/gbp/prepare", requireAdmin, async (_req: Request, res: Response) => {
    const draft = generateListingDraft();
    res.json({
      draft,
      next_steps: draft.manual_steps,
      api_available: await gbpIsApiAvailable().catch(() => false),
    });
  });

  // ─── Bing Webmaster automation ─────────────────────────────────
  // The API key for these endpoints is read from BING_WEBMASTER_API_KEY
  // (Doppler-injected) inside the client; the older oauth_tokens flow is
  // preserved above for back-compat. Each handler is admin-only and
  // returns a tidy JSON body.

  const bingSubmitUrlSchema = z.object({
    url: z.string().url().max(2048),
  });
  app.post("/api/admin/seo/bing/submit-url", requireAdmin, async (req: Request, res: Response) => {
    const parsed = bingSubmitUrlSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "invalid_input", details: parsed.error.flatten() });
    }
    try {
      await bingSubmitUrl(parsed.data.url);
      await db.insert(seoIndexingHistory).values({
        url: parsed.data.url,
        action: "index-requested",
        source: "bing",
        status: "submitted",
        details: { siteUrl: BING_SITE_URL, channel: "admin" },
      });
      res.json({ submitted: true, url: parsed.data.url });
    } catch (err) {
      log.error("Bing submit-url failed", { err: err instanceof Error ? err.message : "unknown" });
      res.status(502).json({ error: "bing_submit_failed", message: err instanceof Error ? err.message : "unknown" });
    }
  });

  const bingSubmitBatchSchema = z.object({
    urls: z.array(z.string().url().max(2048)).min(1).max(100),
  });
  app.post("/api/admin/seo/bing/submit-batch", requireAdmin, async (req: Request, res: Response) => {
    const parsed = bingSubmitBatchSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "invalid_input", details: parsed.error.flatten() });
    }
    try {
      await bingSubmitUrls(parsed.data.urls);
      await db.insert(seoIndexingHistory).values(
        parsed.data.urls.map((u) => ({
          url: u,
          action: "index-requested" as const,
          source: "bing" as const,
          status: "submitted" as const,
          details: { siteUrl: BING_SITE_URL, channel: "admin-batch" } as Record<string, unknown>,
        })),
      );
      res.json({ submitted: parsed.data.urls.length });
    } catch (err) {
      log.error("Bing submit-batch failed", { err: err instanceof Error ? err.message : "unknown" });
      res.status(502).json({ error: "bing_batch_failed", message: err instanceof Error ? err.message : "unknown" });
    }
  });

  const bingUrlInfoSchema = z.object({ url: z.string().url().max(2048) });
  app.get("/api/admin/seo/bing/url-info", requireAdmin, async (req: Request, res: Response) => {
    const parsed = bingUrlInfoSchema.safeParse({ url: req.query.url });
    if (!parsed.success) {
      return res.status(400).json({ error: "invalid_input", details: parsed.error.flatten() });
    }
    try {
      const info = await bingGetUrlInfo(parsed.data.url);
      res.json({ url: parsed.data.url, info });
    } catch (err) {
      log.error("Bing url-info failed", { err: err instanceof Error ? err.message : "unknown" });
      res.status(502).json({ error: "bing_url_info_failed", message: err instanceof Error ? err.message : "unknown" });
    }
  });

  app.get("/api/admin/seo/bing/quota", requireAdmin, async (_req: Request, res: Response) => {
    try {
      const q = await bingGetQuota();
      res.json({ daily: q.DailyQuota, monthly: q.MonthlyQuota });
    } catch (err) {
      log.error("Bing quota fetch failed", { err: err instanceof Error ? err.message : "unknown" });
      res.status(502).json({ error: "bing_quota_failed", message: err instanceof Error ? err.message : "unknown" });
    }
  });

  app.get("/api/admin/seo/bing/sitemaps", requireAdmin, async (_req: Request, res: Response) => {
    try {
      const sitemaps = await bingGetSitemaps();
      res.json({ sitemaps });
    } catch (err) {
      log.error("Bing get-sitemaps failed", { err: err instanceof Error ? err.message : "unknown" });
      res.status(502).json({ error: "bing_sitemaps_failed", message: err instanceof Error ? err.message : "unknown" });
    }
  });

  const bingSitemapSchema = z.object({ sitemapUrl: z.string().url().max(2048) });
  app.post("/api/admin/seo/bing/sitemap", requireAdmin, async (req: Request, res: Response) => {
    const parsed = bingSitemapSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "invalid_input", details: parsed.error.flatten() });
    }
    try {
      await bingSubmitSitemap(parsed.data.sitemapUrl);
      await db.insert(seoIndexingHistory).values({
        url: parsed.data.sitemapUrl,
        action: "sitemap-submitted",
        source: "bing",
        status: "ok",
        details: { siteUrl: BING_SITE_URL, channel: "admin" },
      });
      res.json({ submitted: true, sitemapUrl: parsed.data.sitemapUrl });
    } catch (err) {
      log.error("Bing submit-sitemap failed", { err: err instanceof Error ? err.message : "unknown" });
      res.status(502).json({ error: "bing_sitemap_failed", message: err instanceof Error ? err.message : "unknown" });
    }
  });

  // Manual cron trigger — admin can fire one pass without waiting for :17 */6h.
  app.post("/api/admin/seo/bing/run-cron", requireAdmin, async (_req: Request, res: Response) => {
    try {
      const result = await runBingIndexingTick();
      res.json(result);
    } catch (err) {
      log.error("Bing cron manual trigger failed", { err: err instanceof Error ? err.message : "unknown" });
      res.status(500).json({ error: "bing_cron_failed", message: err instanceof Error ? err.message : "unknown" });
    }
  });

  // ─── Disconnect ────────────────────────────────────────────────
  const disconnectParamsSchema = z.object({
    provider: z.enum(["google", "bing", "gbp"]),
  });

  app.post("/api/admin/integrations/disconnect/:provider", requireAdmin, async (req: Request, res: Response) => {
    const parsed = disconnectParamsSchema.safeParse(req.params);
    if (!parsed.success) {
      return res.status(400).json({ error: "invalid_provider" });
    }
    await deleteToken(parsed.data.provider);
    res.json({ disconnected: true });
  });
}
