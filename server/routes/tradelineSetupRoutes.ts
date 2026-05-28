/**
 * Tradeline phone-number setup wizard — backend routes.
 *
 * Three options (the user picks one in /portal/tradeline/setup):
 *   A. Provision a fresh WeFixTrades number (default, immediate)
 *   B. Forward the user's existing number to a behind-the-scenes WeFixTrades number
 *   C. Port the user's existing number into Twilio (premium-tier gated, 1-3 wk)
 *
 * All state-changing routes use dualWriteSetup() to atomically write to
 * tradeline_phone_setups (wizard journey) AND client_services.metadata
 * .tradelineConfig (canonical runtime config) inside one db.transaction().
 *
 * Analytics events fired (PostHog):
 *   - tradeline_setup_started (first GET)
 *   - tradeline_setup_option_chosen { mode } (choose-mode)
 *   - tradeline_setup_completed { mode, time_elapsed_seconds } (terminal state per option)
 */

import express, { type Express, type Request, type Response } from "express";
import { z } from "zod";
import { requireClient } from "../auth";
import { db } from "../db";
import { clients, tradelinePhoneSetups } from "@shared/schema";
import {
  tradelineSetupModeSchema,
  portStatusSchema,
} from "@shared/schema";
import { eq } from "drizzle-orm";
import { dualWriteSetup, getSetupRow } from "../services/tradelineSetup/dualWrite";
import { provisionNumber } from "../services/tradelineSetup/provisionNumber";
import { lookupCarrier } from "../services/tradelineSetup/carrierLookup";
import { placeTestCall, checkTestCallStatus } from "../services/tradelineSetup/forwardingVerifier";
import { submitPort } from "../services/tradelineSetup/portRequest";
import { uploadEncryptedBuffer, downloadDecrypted } from "../lib/objectStorage";
import { trackEvent } from "../lib/analytics";
import { createLogger } from "../lib/logger";
import { withClientIdOrPreview } from "../middleware/adminPreviewSafe";
import { getTwilioClient, isTwilioConfigured } from "../twilioClient";
import { RateLimiter, MemoryRateLimitStore } from "../services/rateLimiter";

const log = createLogger("TradelineSetup");

/* ─── Wave 85 — available-numbers cache + rate limit ─── */

/**
 * Wave 85 — 5-minute in-memory cache for Twilio availability searches.
 * Twilio's available-phone-numbers inventory doesn't change rapidly for
 * a given area code + vanity pattern, and a single user resizing/
 * refreshing the picker shouldn't burn 4-5 Twilio search calls. Key is
 * `${country}|${areaCode||''}|${contains||''}`. Inventory CAN turn over —
 * if the user picks a number that's gone, the purchase fails with a clean
 * Twilio error which the wizard surfaces as "Try a different number".
 */
const NUMBER_SEARCH_CACHE_TTL_MS = 5 * 60_000;
interface CachedSearch {
  numbers: AvailableNumber[];
  fetchedAt: number;
}
const numberSearchCache = new Map<string, CachedSearch>();

interface AvailableNumber {
  phoneNumber: string;       // E.164, exactly what Twilio returns
  friendlyName: string;      // Twilio's pretty form, e.g. "(415) 555-1234"
  locality: string | null;   // e.g. "San Francisco" — may be null/empty
  region: string | null;     // e.g. "CA"
}

function buildSearchCacheKey(country: string, areaCode?: string, contains?: string): string {
  return `${country}|${areaCode || ""}|${contains || ""}`;
}

/**
 * Wave 85 — per-user cap on POST /api/portal/tradeline/setup/available-numbers.
 * The picker fires one search per user click on "Search". 10/min/user is
 * plenty for normal use (try a handful of area codes / vanity patterns)
 * and bounds the worst case if the UI ever loops.
 */
const availableNumbersRateLimiter = new RateLimiter(
  new MemoryRateLimitStore(),
  10,
  60_000,
);

/* ─── Client-id resolution (same pattern as portalRoutes) ─── */

async function resolveClientId(userId: number): Promise<number | null> {
  const [row] = await db
    .select({ id: clients.id })
    .from(clients)
    .where(eq(clients.user_id, userId))
    .limit(1);
  return row?.id ?? null;
}

/**
 * Wave 12C: admin users without a linked clients row receive 200 with
 * `{previewMode:true, persisted:false, ...previewShape}` instead of 403.
 */
async function withClientId(
  req: Request,
  res: Response,
  previewShape: Record<string, unknown> = {},
): Promise<number | null> {
  return withClientIdOrPreview(req, res, { previewShape });
}

/* ─── Helpers ─── */

function secondsBetween(start: Date | null, end: Date): number | null {
  if (!start) return null;
  return Math.floor((end.getTime() - start.getTime()) / 1000);
}

/** distinctId for PostHog: WeFixTrades user id, prefixed for namespace clarity. */
function distinctId(userId: number): string {
  return `user_${userId}`;
}

/* ─── Routes ─── */

/**
 * Larger JSON body parser for the bill + LOA upload routes. Global
 * express.json() defaults to 100KB; phone-bill PDFs base64-encoded run
 * up to ~7 MB. Applied per-route so other endpoints keep the tighter
 * default.
 */
const LARGE_JSON = express.json({ limit: "10mb" });

export function registerTradelineSetupRoutes(app: Express) {
  /* ─── GET state (and fire _started on first visit) ─── */
  app.get(
    "/api/portal/tradeline/setup",
    requireClient,
    async (req: Request, res: Response) => {
      try {
        const clientId = await withClientId(req, res);
        if (!clientId) return;

        const existing = await getSetupRow(clientId);

        if (!existing) {
          // First visit — insert a blank row and fire _started.
          const row = await dualWriteSetup({
            clientId,
            setupPatch: {
              started_at: new Date(),
              last_step: "choice_card",
            },
          });
          trackEvent(distinctId(req.user!.id), "tradeline_setup_started", {
            client_id: clientId,
          });
          return res.json({ setup: row, testMode: process.env.TRADELINE_SETUP_TEST_MODE === "true" });
        }

        return res.json({ setup: existing, testMode: process.env.TRADELINE_SETUP_TEST_MODE === "true" });
      } catch (err) {
        log.error("GET setup failed", { err: (err as Error).message });
        return res.status(500).json({ error: "Failed to load setup state" });
      }
    },
  );

  /* ─── POST choose-mode (records pick + _option_chosen) ─── */
  const chooseModeBody = z.object({ mode: tradelineSetupModeSchema });
  app.post(
    "/api/portal/tradeline/setup/choose-mode",
    requireClient,
    async (req: Request, res: Response) => {
      try {
        const clientId = await withClientId(req, res);
        if (!clientId) return;
        const parsed = chooseModeBody.safeParse(req.body);
        if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
        const { mode } = parsed.data;

        const row = await dualWriteSetup({
          clientId,
          setupPatch: { mode, last_step: `${mode}_intro` },
        });

        trackEvent(distinctId(req.user!.id), "tradeline_setup_option_chosen", {
          client_id: clientId,
          mode,
        });

        return res.json({ setup: row });
      } catch (err) {
        log.error("choose-mode failed", { err: (err as Error).message });
        return res.status(500).json({ error: "Failed to record mode" });
      }
    },
  );

  /* ─── Wave 85 — Option A: list available numbers for the picker ─── */
  const availableNumbersBody = z.object({
    country: z.enum(["US", "CA"]),
    // 3-digit area code (NANP). Optional — leave blank for nationwide pool.
    areaCode: z
      .string()
      .regex(/^\d{3}$/, "areaCode must be exactly 3 digits")
      .optional(),
    // Vanity pattern like "777", "LOVE". Twilio accepts up to ~8 chars
    // and translates letters per the standard phone-keypad mapping.
    contains: z
      .string()
      .min(1)
      .max(8)
      .regex(/^[A-Za-z0-9*]+$/, "contains may only include letters, digits, or *")
      .optional(),
  });
  app.post(
    "/api/portal/tradeline/setup/available-numbers",
    requireClient,
    async (req: Request, res: Response) => {
      try {
        // Any signed-in client may search the inventory. Cost is bounded by
        // the 5-min cache + per-user rate limit. We don't gate on a setup
        // row existing — admins previewing the wizard for a future client
        // and brand-new clients both hit this before completing other
        // setup steps.
        if (!req.user) return res.status(401).json({ error: "Not signed in" });

        const parsed = availableNumbersBody.safeParse(req.body);
        if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
        const { country, areaCode, contains } = parsed.data;

        const limiterKey = `tradeline-available-numbers:user:${req.user.id}`;
        const allowed = await availableNumbersRateLimiter.check(limiterKey);
        if (!allowed) {
          return res
            .status(429)
            .json({ error: "Too many searches — please wait a minute and try again." });
        }

        // Cache hit short-circuits the Twilio API entirely.
        const cacheKey = buildSearchCacheKey(country, areaCode, contains);
        const cached = numberSearchCache.get(cacheKey);
        const now = Date.now();
        if (cached && now - cached.fetchedAt < NUMBER_SEARCH_CACHE_TTL_MS) {
          return res.json({
            numbers: cached.numbers,
            cached: true,
            country,
            areaCode: areaCode ?? null,
            contains: contains ?? null,
          });
        }

        // TRADELINE_SETUP_TEST_MODE — return deterministic fake numbers so
        // the wizard renders end-to-end without a real Twilio bill. The
        // provision-new path already short-circuits to the magic test
        // number in this mode, so the picked number is purely cosmetic.
        if (process.env.TRADELINE_SETUP_TEST_MODE === "true") {
          const ac = areaCode || (country === "CA" ? "416" : "415");
          const seed = (contains || "").padEnd(4, "0").slice(0, 4).toUpperCase();
          const fake: AvailableNumber[] = Array.from({ length: 8 }, (_, i) => {
            const last4 = String((parseInt(seed.replace(/[^0-9]/g, "0"), 10) + i * 13) % 10000).padStart(4, "0");
            const mid3 = String(555 + i).padStart(3, "0");
            const phone = `+1${ac}${mid3}${last4}`;
            return {
              phoneNumber: phone,
              friendlyName: `(${ac}) ${mid3}-${last4}`,
              locality: country === "CA" ? "Toronto" : "San Francisco",
              region: country === "CA" ? "ON" : "CA",
            };
          });
          numberSearchCache.set(cacheKey, { numbers: fake, fetchedAt: now });
          return res.json({
            numbers: fake,
            cached: false,
            country,
            areaCode: areaCode ?? null,
            contains: contains ?? null,
            testMode: true,
          });
        }

        if (!isTwilioConfigured()) {
          // Without Twilio credentials we can't return real numbers. The
          // wizard will hide the picker and fall back to "Pick for me",
          // which itself queues the provision until admin lands the key.
          return res.json({
            numbers: [],
            cached: false,
            country,
            areaCode: areaCode ?? null,
            contains: contains ?? null,
            unavailable: true,
            reason: "Number search isn't ready yet — use Pick for me to reserve a number.",
          });
        }

        const client = getTwilioClient();
        const searchOpts: Record<string, unknown> = {
          smsEnabled: true,
          voiceEnabled: true,
          limit: 12,
        };
        if (areaCode) searchOpts.areaCode = parseInt(areaCode, 10);
        if (contains) searchOpts.contains = contains;

        const results = await client.availablePhoneNumbers(country).local.list(searchOpts as any);
        const numbers: AvailableNumber[] = results.map((r: any) => ({
          phoneNumber: r.phoneNumber,
          friendlyName: r.friendlyName || r.phoneNumber,
          locality: r.locality || null,
          region: r.region || null,
        }));

        numberSearchCache.set(cacheKey, { numbers, fetchedAt: now });

        return res.json({
          numbers,
          cached: false,
          country,
          areaCode: areaCode ?? null,
          contains: contains ?? null,
        });
      } catch (err) {
        log.error("available-numbers failed", { err: (err as Error).message });
        return res.status(502).json({ error: "Number search failed — try a different area code or use Pick for me." });
      }
    },
  );

  /* ─── Option A: provision new number ─── */
  const provisionBody = z.object({
    countryCode: z.enum(["US", "CA"]),
    preference: z.enum(["local", "toll_free"]).optional().default("local"),
    // Wave 85 — when the wizard's number-picker step is used, the user's
    // chosen E.164 number is forwarded here so we purchase it directly
    // instead of auto-picking the first available. Optional so the
    // existing "Pick for me" path still works unchanged.
    targetPhoneNumber: z
      .string()
      .regex(/^\+[1-9]\d{6,15}$/, "Must be E.164 (e.g. +14155551234)")
      .optional(),
  });
  app.post(
    "/api/portal/tradeline/setup/provision-new",
    requireClient,
    async (req: Request, res: Response) => {
      try {
        const clientId = await withClientId(req, res);
        if (!clientId) return;
        const parsed = provisionBody.safeParse(req.body);
        if (!parsed.success) return res.status(400).json({ error: parsed.error.message });

        const result = await provisionNumber(
          parsed.data.countryCode,
          parsed.data.preference,
          parsed.data.targetPhoneNumber ? { targetPhoneNumber: parsed.data.targetPhoneNumber } : {},
        );

        if (result.ok && !result.queued) {
          const existing = await getSetupRow(clientId);
          const elapsed = secondsBetween(existing?.started_at ?? null, new Date());
          const row = await dualWriteSetup({
            clientId,
            setupPatch: {
              mode: "new",
              assigned_number: result.number,
              assigned_number_sid: result.sid,
              provisioning_status: "provisioned",
              provisioned_at: new Date(),
              completed_at: new Date(),
              last_step: "new_provisioned",
            },
            tradelineConfigPatch: {
              setupStage: "configuring",
              phoneRouting: { primaryBusinessNumber: result.number },
            },
          });
          trackEvent(distinctId(req.user!.id), "tradeline_setup_completed", {
            client_id: clientId,
            mode: "new",
            time_elapsed_seconds: elapsed,
          });
          return res.json({
            setup: row,
            queued: false,
            ...(result.warning ? { warning: result.warning } : {}),
          });
        }

        if (result.ok && result.queued) {
          const row = await dualWriteSetup({
            clientId,
            setupPatch: {
              mode: "new",
              provisioning_status: "queued",
              provisioning_failed_reason: result.reason,
              last_step: "new_queued",
            },
            tradelineConfigPatch: { setupStage: "awaiting_client_action" },
          });
          return res.json({ setup: row, queued: true, reason: result.reason });
        }

        // ok=false
        await dualWriteSetup({
          clientId,
          setupPatch: {
            provisioning_status: "failed",
            provisioning_failed_reason: result.error,
            last_step: "new_failed",
          },
        });
        return res.status(502).json({ error: result.error });
      } catch (err) {
        log.error("provision-new failed", { err: (err as Error).message });
        return res.status(500).json({ error: "Provisioning failed" });
      }
    },
  );

  /* ─── Option B: lookup carrier ─── */
  const lookupBody = z.object({ phoneNumber: z.string().min(10).max(20) });
  app.post(
    "/api/portal/tradeline/setup/forward/lookup-carrier",
    requireClient,
    async (req: Request, res: Response) => {
      try {
        const clientId = await withClientId(req, res);
        if (!clientId) return;
        const parsed = lookupBody.safeParse(req.body);
        if (!parsed.success) return res.status(400).json({ error: parsed.error.message });

        const result = await lookupCarrier(parsed.data.phoneNumber);
        if (!result.ok) return res.status(502).json({ error: result.error });

        // Option B needs a hidden WeFixTrades number for the customer's carrier
        // code to forward TO. Provision now so the tel: URI on the next screen
        // is real. Queued state is acceptable — UI surfaces a waiting message.
        const existing = await getSetupRow(clientId);
        let provisionStatus: "queued" | "provisioned" | "failed" | null = (existing?.provisioning_status as any) ?? null;
        let provisionPatch: Partial<{
          assigned_number: string;
          assigned_number_sid: string;
          provisioning_status: "queued" | "provisioned" | "failed";
          provisioning_failed_reason: string | null;
          provisioned_at: Date | null;
        }> = {};

        if (!existing?.assigned_number) {
          const provision = await provisionNumber(result.market === "CA" ? "CA" : "US", "local");
          if (provision.ok && !provision.queued) {
            provisionStatus = "provisioned";
            provisionPatch = {
              assigned_number: provision.number,
              assigned_number_sid: provision.sid,
              provisioning_status: "provisioned",
              provisioning_failed_reason: null,
              provisioned_at: new Date(),
            };
          } else if (provision.ok && provision.queued) {
            provisionStatus = "queued";
            provisionPatch = {
              provisioning_status: "queued",
              provisioning_failed_reason: provision.reason,
            };
          } else {
            provisionStatus = "failed";
            provisionPatch = {
              provisioning_status: "failed",
              provisioning_failed_reason: provision.error,
            };
          }
        }

        const updated = await dualWriteSetup({
          clientId,
          setupPatch: {
            mode: "forward",
            customer_number: result.phoneNumber,
            carrier: result.carrierKey,
            carrier_country: result.market,
            last_step: "forward_carrier_identified",
            ...provisionPatch,
          },
        });

        return res.json({
          carrierKey: result.carrierKey,
          carrierEntry: result.carrierEntry,
          market: result.market,
          carrierName: result.carrierName,
          assignedNumber: updated.assigned_number,
          provisioningStatus: provisionStatus,
        });
      } catch (err) {
        log.error("lookup-carrier failed", { err: (err as Error).message });
        return res.status(500).json({ error: "Carrier lookup failed" });
      }
    },
  );

  /* ─── Option B: verify test call (auto) ─── */
  app.post(
    "/api/portal/tradeline/setup/forward/verify-test-call",
    requireClient,
    async (req: Request, res: Response) => {
      try {
        const clientId = await withClientId(req, res);
        if (!clientId) return;
        const existing = await getSetupRow(clientId);
        if (!existing?.customer_number) {
          return res.status(400).json({ error: "No customer number on file — pick a carrier first" });
        }

        const placed = await placeTestCall(existing.customer_number);
        if (!placed.ok) {
          return res.status(502).json({ error: placed.error, retryable: placed.retryable });
        }

        // Record the SID; verification status is polled separately or comes back
        // via Twilio webhook in Phase 4. For test-mode, the placed call is the verification.
        const verifyMethod = process.env.TRADELINE_SETUP_TEST_MODE === "true" ? "twilio_test_call" : null;
        const verifiedAt = verifyMethod ? new Date() : null;
        const completed = !!verifyMethod;

        const row = await dualWriteSetup({
          clientId,
          setupPatch: {
            forwarding_activation_attempted_at: new Date(),
            forwarding_test_call_sid: placed.callSid ?? null,
            ...(verifyMethod && { forwarding_verified_method: verifyMethod, forwarding_verified_at: verifiedAt }),
            ...(completed && { completed_at: verifiedAt }),
            last_step: completed ? "forward_verified" : "forward_test_call_placed",
          },
          ...(completed && {
            tradelineConfigPatch: { setupStage: "ready_for_testing" },
          }),
        });

        if (completed) {
          const elapsed = secondsBetween(existing?.started_at ?? null, new Date());
          trackEvent(distinctId(req.user!.id), "tradeline_setup_completed", {
            client_id: clientId,
            mode: "forward",
            verified_method: "twilio_test_call",
            time_elapsed_seconds: elapsed,
          });
        }

        return res.json({ setup: row, callSid: placed.callSid, verified: completed });
      } catch (err) {
        log.error("verify-test-call failed", { err: (err as Error).message });
        return res.status(500).json({ error: "Test call failed" });
      }
    },
  );

  /* ─── Option B: poll status (called by client after ~30s) ─── */
  app.get(
    "/api/portal/tradeline/setup/forward/test-call-status",
    requireClient,
    async (req: Request, res: Response) => {
      try {
        const clientId = await withClientId(req, res);
        if (!clientId) return;
        const existing = await getSetupRow(clientId);
        if (!existing?.forwarding_test_call_sid) {
          return res.status(400).json({ error: "No test call placed yet" });
        }

        const status = await checkTestCallStatus(existing.forwarding_test_call_sid);
        if (status.verified && !existing.forwarding_verified_at) {
          await dualWriteSetup({
            clientId,
            setupPatch: {
              forwarding_verified_method: "twilio_test_call",
              forwarding_verified_at: new Date(),
              completed_at: new Date(),
              last_step: "forward_verified",
            },
            tradelineConfigPatch: { setupStage: "ready_for_testing" },
          });
          const elapsed = secondsBetween(existing.started_at ?? null, new Date());
          trackEvent(distinctId(req.user!.id), "tradeline_setup_completed", {
            client_id: clientId,
            mode: "forward",
            verified_method: "twilio_test_call",
            time_elapsed_seconds: elapsed,
          });
        }

        return res.json({
          verified: status.verified,
          status: status.status,
          checkedAt: new Date().toISOString(),
        });
      } catch (err) {
        log.error("test-call-status failed", { err: (err as Error).message });
        return res.status(500).json({ error: "Status check failed" });
      }
    },
  );

  /* ─── Option B: manual confirmation fallback ─── */
  app.post(
    "/api/portal/tradeline/setup/forward/manual-confirm",
    requireClient,
    async (req: Request, res: Response) => {
      try {
        const clientId = await withClientId(req, res);
        if (!clientId) return;
        const existing = await getSetupRow(clientId);
        if (!existing) return res.status(400).json({ error: "No setup row" });

        const row = await dualWriteSetup({
          clientId,
          setupPatch: {
            forwarding_verified_method: "manual_user_confirmation",
            forwarding_verified_at: new Date(),
            completed_at: new Date(),
            last_step: "forward_manual_confirmed",
          },
          tradelineConfigPatch: { setupStage: "ready_for_testing" },
        });
        const elapsed = secondsBetween(existing.started_at ?? null, new Date());
        trackEvent(distinctId(req.user!.id), "tradeline_setup_completed", {
          client_id: clientId,
          mode: "forward",
          verified_method: "manual_user_confirmation",
          time_elapsed_seconds: elapsed,
        });

        return res.json({ setup: row });
      } catch (err) {
        log.error("manual-confirm failed", { err: (err as Error).message });
        return res.status(500).json({ error: "Manual confirmation failed" });
      }
    },
  );

  /* ─── Option C: upload phone bill (base64) ─── */
  const billUploadBody = z.object({
    /** base64-encoded PDF/JPEG. Capped at 5 MB raw (~7 MB base64). */
    fileBase64: z.string().min(1).max(7_500_000),
    contentType: z.enum(["application/pdf", "image/jpeg", "image/png"]),
  });
  app.post(
    "/api/portal/tradeline/setup/port/upload-bill",
    LARGE_JSON,
    requireClient,
    async (req: Request, res: Response) => {
      try {
        const clientId = await withClientId(req, res);
        if (!clientId) return;
        const parsed = billUploadBody.safeParse(req.body);
        if (!parsed.success) return res.status(400).json({ error: parsed.error.message });

        const buf = Buffer.from(parsed.data.fileBase64, "base64");
        const objectKey = `tradeline-ports/${clientId}/bill-${Date.now()}.bin`;
        const uploaded = await uploadEncryptedBuffer(objectKey, buf);
        if (!uploaded.ok) return res.status(502).json({ error: uploaded.error });

        const row = await dualWriteSetup({
          clientId,
          setupPatch: {
            mode: "port",
            port_bill_object_key: objectKey,
            port_bill_uploaded_at: new Date(),
            port_status: "bill_uploaded",
            last_step: "port_bill_uploaded",
          },
          tradelineConfigPatch: { setupStage: "port_in_progress" },
        });
        return res.json({ setup: row, objectKey });
      } catch (err) {
        log.error("upload-bill failed", { err: (err as Error).message });
        return res.status(500).json({ error: "Bill upload failed" });
      }
    },
  );

  /* ─── Option C: sign LOA (signature PNG as base64) ─── */
  const loaSignBody = z.object({
    signatureBase64: z.string().min(1).max(2_000_000),
    signerName: z.string().min(1).max(120),
  });
  app.post(
    "/api/portal/tradeline/setup/port/sign-loa",
    LARGE_JSON,
    requireClient,
    async (req: Request, res: Response) => {
      try {
        const clientId = await withClientId(req, res);
        if (!clientId) return;
        const parsed = loaSignBody.safeParse(req.body);
        if (!parsed.success) return res.status(400).json({ error: parsed.error.message });

        // For v1 the LOA "document" is the signature PNG plus typed name.
        // Future: render a full PDF LOA combining signer info + signature into
        // a Twilio-portable LOA document. Captured as a TODO in batch 3+.
        const buf = Buffer.from(parsed.data.signatureBase64, "base64");
        const objectKey = `tradeline-ports/${clientId}/loa-${Date.now()}.png`;
        const uploaded = await uploadEncryptedBuffer(objectKey, buf);
        if (!uploaded.ok) return res.status(502).json({ error: uploaded.error });

        const row = await dualWriteSetup({
          clientId,
          setupPatch: {
            port_loa_object_key: objectKey,
            port_loa_signed_at: new Date(),
            port_status: "loa_signed",
            last_step: "port_loa_signed",
          },
        });
        return res.json({ setup: row, objectKey, signerName: parsed.data.signerName });
      } catch (err) {
        log.error("sign-loa failed", { err: (err as Error).message });
        return res.status(500).json({ error: "LOA submission failed" });
      }
    },
  );

  /* ─── Option C: submit port to Twilio ─── */
  const portSubmitBody = z.object({
    authorizedSignerName: z.string().min(1).max(120),
    businessName: z.string().min(1).max(200),
  });
  app.post(
    "/api/portal/tradeline/setup/port/submit",
    requireClient,
    async (req: Request, res: Response) => {
      try {
        const clientId = await withClientId(req, res);
        if (!clientId) return;
        const parsed = portSubmitBody.safeParse(req.body);
        if (!parsed.success) return res.status(400).json({ error: parsed.error.message });

        const existing = await getSetupRow(clientId);
        if (!existing?.customer_number || !existing.port_bill_object_key || !existing.port_loa_object_key) {
          return res.status(400).json({ error: "customer_number, bill, and LOA must all be present before submitting" });
        }

        const result = await submitPort({
          customerNumber: existing.customer_number,
          billObjectKey: existing.port_bill_object_key,
          loaObjectKey: existing.port_loa_object_key,
          authorizedSignerName: parsed.data.authorizedSignerName,
          businessName: parsed.data.businessName,
        });
        if (!result.ok) return res.status(502).json({ error: result.error });

        const row = await dualWriteSetup({
          clientId,
          setupPatch: {
            port_request_id: result.portRequestId,
            port_status: result.status,
            port_submitted_at: new Date(),
            completed_at: new Date(),
            last_step: "port_submitted",
          },
          tradelineConfigPatch: { setupStage: "port_in_progress" },
        });
        const elapsed = secondsBetween(existing.started_at ?? null, new Date());
        trackEvent(distinctId(req.user!.id), "tradeline_setup_completed", {
          client_id: clientId,
          mode: "port",
          port_status: result.status,
          time_elapsed_seconds: elapsed,
        });

        // 14-21 day window for v1 — Twilio porting timelines vary by source
        // carrier; we'll narrow this per-carrier once real porting data comes
        // back from the admin Twilio integration in batch 3+.
        return res.json({
          setup: row,
          portRequestId: result.portRequestId,
          estimatedResolutionDays: { min: 14, max: 21 },
        });
      } catch (err) {
        log.error("port submit failed", { err: (err as Error).message });
        return res.status(500).json({ error: "Port submission failed" });
      }
    },
  );

  /* ─── Option C: bill / LOA download proxy (ownership-checked) ─── */
  app.get(
    "/api/portal/tradeline/setup/port/bill-download/:objectKey",
    requireClient,
    async (req: Request, res: Response) => {
      try {
        const clientId = await withClientId(req, res);
        if (!clientId) return;
        const objectKey = decodeURIComponent(String(req.params.objectKey));

        // Ownership check: the object key must belong to this client's setup row.
        const setup = await getSetupRow(clientId);
        if (!setup) return res.status(404).json({ error: "Not found" });
        const owned = objectKey === setup.port_bill_object_key || objectKey === setup.port_loa_object_key;
        if (!owned) return res.status(403).json({ error: "Object does not belong to this client" });

        const result = await downloadDecrypted(objectKey);
        if (!result.ok) {
          if (result.notFound) return res.status(404).json({ error: "Object not found" });
          return res.status(502).json({ error: result.error });
        }
        // Best-effort content-type; the actual bytes are the source of truth.
        res.setHeader("Content-Type", "application/octet-stream");
        res.setHeader("Cache-Control", "private, no-store");
        return res.send(result.data);
      } catch (err) {
        log.error("bill-download failed", { err: (err as Error).message });
        return res.status(500).json({ error: "Download failed" });
      }
    },
  );

  log.info("Tradeline setup routes registered");
}
