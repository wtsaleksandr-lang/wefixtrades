/**
 * Roof-Quote widget + backend — ported into the wefixtrades Express app from
 * the proven standalone Node server at `spikes/roof-quote/serve.mjs`.
 *
 * Everything is mounted under the `/api/roofquote/` prefix and is PUBLIC (no
 * auth — same posture as quotequickPublicRoutes). The widget HTML, its ES
 * modules, and the JSON/image API routes all live here; the heavy lifting is
 * delegated to `server/services/roofQuote/roofQuoteService.ts`.
 *
 * Env keys (all read LAZILY inside handlers / the service so a missing key
 * never crashes boot):
 *   - widget        ROOFQUOTE_TILES_KEY || GOOGLE_MAPS_API_KEY  (injected for __TILES__)
 *   - geocode/solar/datalayers/geotiff/streetview/capture
 *                   ROOFQUOTE_SOLAR_KEY || GOOGLE_MAPS_API_KEY
 *   - analyze/features/airender(vision)   GEMINI_API_KEY
 *   - airender providers                  OPENAI_API_KEY (final tier), REPLICATE_API_TOKEN, FAL_KEY
 */

import type { Express, Request, Response } from "express";
import { readFileSync } from "fs";
import { createHash } from "node:crypto";
import path from "path";
import { createLogger } from "../lib/logger";
import { storage } from "../storage";
import { enqueueLeadNotificationsAndFollowups, isDuplicateSubmission } from "./leadRoutes";
import { fireLeadWebhook } from "../services/quotequickLeadWebhook";
import {
  roofQuoteAiRenderPerMinLimiter,
  roofQuoteAiRenderPerDayLimiter,
  roofQuoteAiRenderPerCalcPerDayLimiter,
  roofQuoteGooglePerMinLimiter,
  ROOFQUOTE_GOOGLE_RATE_LIMIT_WINDOW_MS,
  leadsSubmissionRateLimiter,
  leadsIpRateLimiter,
  LEADS_RATE_LIMIT_WINDOW_MS,
} from "../services/rateLimiter";
import {
  aiRender,
  captureOblique,
  CaptureUnavailableError,
  dataLayers,
  geoTiff,
  geocode,
  houseKnowledge,
  localRate,
  pvwattsProduction,
  roofFeatures,
  solarInsights,
  streetView,
  sunHours,
} from "../services/roofQuote/roofQuoteService";

const log = createLogger("RoofQuote");

// Same client-IP resolution leadRoutes uses (proxy-aware). The raw IP is never
// stored — only a SHA-256 hash, so the consent record is privacy-preserving but
// still correlatable with access logs if a TCPA/consent challenge ever arises.
function getClientIp(req: Request): string {
  return (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim()
    || req.ip
    || "unknown";
}

/**
 * Shared per-IP rate gate for the Google-billed roofquote reads
 * (solar/datalayers/geotiff/streetview/capture/analyze/features). These are
 * public, unauthenticated, and spend real Google money per uncached call, so a
 * single generous per-IP/min limiter bounds a curl-loop without touching a real
 * session (which fires each of these about once). Over-cap → 429 with a clean
 * JSON error + Retry-After.
 *
 * Returns `true` when it has ALREADY sent a 429 (the caller must `return`);
 * `false` when the request may proceed. Keying every endpoint in the group on
 * the SAME bucket (`roofquote:google:<ip>`) means a loop that rotates across
 * endpoints still trips the shared cap.
 */
async function googleRateBlocked(req: Request, res: Response): Promise<boolean> {
  const ip = getClientIp(req);
  const ok = await roofQuoteGooglePerMinLimiter.check(`roofquote:google:${ip}`);
  if (ok) return false;
  res.setHeader("Retry-After", String(Math.ceil(ROOFQUOTE_GOOGLE_RATE_LIMIT_WINDOW_MS / 1000)));
  res.status(429).json({ error: "rate_limited", code: "rate_limited" });
  return true;
}

/** Minimal limiter shape the gate helpers depend on — `RateLimiter` satisfies
 *  it, and the regression test injects fresh in-memory instances. */
export interface RateLimiterLike {
  check(key: string): Promise<boolean>;
}

export interface AiRenderGateLimiters {
  perMin: RateLimiterLike;
  perDay: RateLimiterLike;
  perCalcPerDay: RateLimiterLike;
}

/**
 * PURE cost-gate decision for /api/roofquote/airender (no express, no DB).
 * Exported so the regression gate (check:roofquote-cost-gating) can prove a
 * normal session passes while a loop trips 429 — and that the per-calc cap only
 * engages when a calc id is resolvable.
 *
 * Order matters: the per-IP min+day caps are checked first (every call), then
 * the per-calc/day cap only when `calcId != null`. `allowed:false` carries the
 * `retryAfter` seconds the handler stamps on the 429.
 */
export async function evaluateAiRenderGate(
  limiters: AiRenderGateLimiters,
  input: { ip: string; calcId: number | null },
): Promise<{ allowed: true } | { allowed: false; retryAfter: number }> {
  const minOk = await limiters.perMin.check(`roofquote:airender:${input.ip}`);
  const dayOk = await limiters.perDay.check(`roofquote:airender:day:${input.ip}`);
  if (!minOk || !dayOk) {
    // If the minute bucket is what tripped, a 60s retry clears it; otherwise the
    // day cap is exhausted, so advise an hour.
    return { allowed: false, retryAfter: minOk ? 3600 : 60 };
  }
  if (input.calcId != null) {
    const calcOk = await limiters.perCalcPerDay.check(`roofquote:airender:calc:${input.calcId}`);
    if (!calcOk) return { allowed: false, retryAfter: 3600 };
  }
  return { allowed: true };
}

/** The production limiter bundle for the airender gate. */
const aiRenderGateLimiters: AiRenderGateLimiters = {
  perMin: roofQuoteAiRenderPerMinLimiter,
  perDay: roofQuoteAiRenderPerDayLimiter,
  perCalcPerDay: roofQuoteAiRenderPerCalcPerDayLimiter,
};

const ASSET_DIR = path.join(process.cwd(), "server", "roofQuote", "assets");
const tilesKey = (): string =>
  process.env.ROOFQUOTE_TILES_KEY || process.env.GOOGLE_MAPS_API_KEY || "";

// Read the raw widget HTML lazily + cache it once (file never changes at runtime;
// only the per-request placeholder substitutions do). We cache the FILE contents,
// not the rendered output, so per-tenant requests can substitute fresh values
// without busting a shared rendered cache.
let _widgetRaw: string | null = null;
function widgetRaw(): string {
  if (_widgetRaw !== null) return _widgetRaw;
  try {
    _widgetRaw = readFileSync(path.join(ASSET_DIR, "roof3d.html"), "utf8");
  } catch (err) {
    log.error("widget html read failed", { err: (err as Error).message });
    _widgetRaw = "<!doctype html><title>Roof Quote</title><p>Widget unavailable.</p>";
  }
  return _widgetRaw;
}

// Embed a JSON value inside an inline <script> safely: prevent a `</script>` in
// the data from terminating the tag (the only real breakout vector here). Also
// escape U+2028 / U+2029 \u2014 JSON.stringify leaves them raw, but they are JS line
// terminators inside a <script>. The matchers are built via String.fromCharCode
// so no raw separator byte ever lands in THIS source file (one would terminate
// this very line). The replacement strings use a doubled backslash so the OUTPUT
// is the 6-char literal escape the browser un-escapes \u2014 NOT a raw separator.
// The widget reads window.__TENANT__ before its deferred boot module runs.
const SEP_2028 = new RegExp(String.fromCharCode(0x2028), "g");
const SEP_2029 = new RegExp(String.fromCharCode(0x2029), "g");
function escapeForScript(json: string): string {
  return json
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(SEP_2028, "\\u2028")
    .replace(SEP_2029, "\\u2029");
}

// Default (no-token) rendered HTML — memoized, tenant-agnostic, __TENANT_JSON__→null.
// This is the exact byte-output the public default widget + builder preview get today.
let _widgetHtmlDefault: string | null = null;
function widgetHtml(): string {
  if (_widgetHtmlDefault !== null) return _widgetHtmlDefault;
  _widgetHtmlDefault = widgetRaw()
    .replaceAll("__TILES__", tilesKey())
    .replace("__TENANT_JSON__", "null");
  return _widgetHtmlDefault;
}

// Per-tenant rendered HTML — NOT memoized (each tenant differs). Injects the
// calculator's persisted advanced.roofWidget as window.__TENANT__ for first-paint
// branding, alongside the same __TILES__ key substitution as the default path.
function widgetHtmlForTenant(tenant: unknown): string {
  const json = escapeForScript(JSON.stringify(tenant ?? null));
  return widgetRaw()
    .replaceAll("__TILES__", tilesKey())
    .replace("__TENANT_JSON__", json);
}

function readModule(name: string): string {
  return readFileSync(path.join(ASSET_DIR, name), "utf8");
}

export function registerRoofQuoteRoutes(app: Express) {
  /* ─── Widget HTML (tiles key injected in place of __TILES__) ───
   *
   * Default (no identifier) → memoized, tenant-agnostic HTML (unchanged behaviour).
   * Published embed passes ?calc=<id> (or ?slug=<slug>) so the widget paints the
   * trade's persisted branding/financing/features on FIRST load (window.__TENANT__
   * injected next to __TILES__; no flash of defaults). Per-tenant requests bypass
   * the static memo. A bad/unknown identifier silently degrades to the default. */
  app.get("/api/roofquote/widget", async (req: Request, res: Response) => {
    try {
      res.setHeader("Cache-Control", "no-store, must-revalidate");
      res.setHeader("Content-Type", "text/html; charset=utf-8");

      const calcParam = String(req.query.calc || "").trim();
      const slugParam = String(req.query.slug || "").trim();

      // No identifier → default widget (memoized, exactly as before).
      if (!calcParam && !slugParam) {
        return res.send(widgetHtml());
      }

      let calc;
      try {
        if (calcParam && /^\d+$/.test(calcParam)) {
          calc = await storage.getCalculatorById(Number(calcParam));
        } else if (slugParam) {
          calc = await storage.getCalculatorBySlug(slugParam);
        }
      } catch (lookupErr) {
        log.warn("widget tenant lookup failed (serving default)", {
          err: (lookupErr as Error).message,
        });
      }

      const advanced = (calc?.calculator_settings as any)?.advanced;
      const roofWidget = advanced?.roofWidget;

      // Identifier resolved but no per-tenant roof config → default widget.
      if (!roofWidget || typeof roofWidget !== "object") {
        return res.send(widgetHtml());
      }
      return res.send(widgetHtmlForTenant(roofWidget));
    } catch (err) {
      log.error("widget serve failed", { err: (err as Error).message });
      return res.status(500).send("widget error");
    }
  });

  /* ─── Client-side ES modules ─── */
  app.get("/api/roofquote/roofgeo.mjs", (_req: Request, res: Response) => {
    try {
      res.setHeader("Content-Type", "text/javascript; charset=utf-8");
      return res.send(readModule("roofgeo.mjs"));
    } catch (err) {
      log.error("roofgeo.mjs serve failed", { err: (err as Error).message });
      return res.status(503).send("// roofgeo.mjs not available");
    }
  });
  app.get("/api/roofquote/rooffeatures.mjs", (_req: Request, res: Response) => {
    try {
      res.setHeader("Content-Type", "text/javascript; charset=utf-8");
      return res.send(readModule("rooffeatures.mjs"));
    } catch (err) {
      log.error("rooffeatures.mjs serve failed", { err: (err as Error).message });
      return res.status(503).send("// rooffeatures.mjs not available");
    }
  });

  /* ─── Server-side geocode (key hidden; no referrer) ─── */
  app.get("/api/roofquote/geocode", async (req: Request, res: Response) => {
    try {
      if (await googleRateBlocked(req, res)) return;
      const addr = String(req.query.address || "");
      return res.json(await geocode(addr));
    } catch (err) {
      log.error("geocode failed", { err: (err as Error).message });
      return res.json({ error: String((err as Error).message || err) });
    }
  });

  /* ─── Solar buildingInsights passthrough ─── */
  app.get("/api/roofquote/solar", async (req: Request, res: Response) => {
    try {
      if (await googleRateBlocked(req, res)) return;
      const { ok, body, cached } = await solarInsights(String(req.query.lat || ""), String(req.query.lng || ""));
      res.setHeader("Content-Type", "application/json");
      res.setHeader("X-Cache", cached ? "HIT" : "MISS");
      return res.send(ok ? body : JSON.stringify({ error: "no_solar" }));
    } catch (err) {
      log.error("solar failed", { err: (err as Error).message });
      return res.json({ error: String((err as Error).message || err) });
    }
  });

  /* ─── Local residential electricity rate (US: live EIA; CA: provincial table) ─── */
  app.get("/api/roofquote/rates", async (req: Request, res: Response) => {
    try {
      const country = String(req.query.country || "US");
      const region = String(req.query.region || req.query.state || req.query.province || "");
      return res.json(await localRate(country, region));
    } catch (err) {
      log.error("rates failed", { err: (err as Error).message });
      return res.json({ error: String((err as Error).message || err) });
    }
  });

  /* ─── PVWatts production fallback (no Google Solar coverage) ─── */
  app.get("/api/roofquote/pvwatts", async (req: Request, res: Response) => {
    try {
      const kw = Number(req.query.kw || 6) || 6;
      return res.json(await pvwattsProduction(String(req.query.lat || ""), String(req.query.lng || ""), kw));
    } catch (err) {
      log.error("pvwatts failed", { err: (err as Error).message });
      return res.json({ error: String((err as Error).message || err) });
    }
  });

  /* ─── Peak sun-hours (NASA POWER, no key) ─── */
  app.get("/api/roofquote/sun", async (req: Request, res: Response) => {
    try {
      return res.json(await sunHours(String(req.query.lat || ""), String(req.query.lng || "")));
    } catch (err) {
      log.error("sun failed", { err: (err as Error).message });
      return res.json({ error: String((err as Error).message || err) });
    }
  });

  /* ─── Solar dataLayers passthrough ─── */
  app.get("/api/roofquote/datalayers", async (req: Request, res: Response) => {
    try {
      if (await googleRateBlocked(req, res)) return;
      const { ok, body, cached } = await dataLayers(
        String(req.query.lat || ""),
        String(req.query.lng || ""),
        req.query.fresh === "1", // client retries with fresh=1 after a stale-token 400 to re-mint URLs
      );
      res.setHeader("Content-Type", "application/json");
      res.setHeader("X-Cache", cached ? "HIT" : "MISS");
      return res.send(ok ? body : JSON.stringify({ error: "no_datalayers" }));
    } catch (err) {
      log.error("datalayers failed", { err: (err as Error).message });
      return res.json({ error: String((err as Error).message || err) });
    }
  });

  /* ─── GeoTIFF proxy (host-whitelisted to solar.googleapis.com) ─── */
  app.get("/api/roofquote/geotiff", async (req: Request, res: Response) => {
    try {
      // geotiff is fired up to ~4× per session (one per data-layer URL minted
      // by /datalayers). It shares the same generous 30/min/IP bucket as the
      // other Google reads, which comfortably covers 4 + the ~3 sibling calls a
      // real session makes while still bounding a tile-fetch loop.
      if (await googleRateBlocked(req, res)) return;
      const raw = String(req.query.u || "");
      if (!raw) return res.status(400).send("missing u");
      const r = await geoTiff(raw);
      if (!r.ok) return res.status(r.status).send(r.error);
      res.setHeader("Content-Type", r.contentType);
      res.setHeader("Cache-Control", "public, max-age=600");
      return res.send(r.buf);
    } catch (err) {
      log.error("geotiff failed", { err: (err as Error).message });
      return res.status(502).send(String((err as Error).message || err));
    }
  });

  /* ─── Street View proxy (the "before" photo) ─── */
  app.get("/api/roofquote/streetview", async (req: Request, res: Response) => {
    try {
      if (await googleRateBlocked(req, res)) return;
      const address = String(req.query.address || "");
      if (!address) return res.status(400).send("missing address");
      const r = await streetView(address);
      if (!r.ok) return res.status(r.status).send(r.error);
      res.setHeader("Content-Type", "image/jpeg");
      res.setHeader("Cache-Control", "public, max-age=3600");
      return res.send(r.buf);
    } catch (err) {
      log.error("streetview failed", { err: (err as Error).message });
      return res.status(502).send(String((err as Error).message || err));
    }
  });

  /* ─── Property Analysis Agent: House Knowledge Package ─── */
  app.get("/api/roofquote/analyze", async (req: Request, res: Response) => {
    try {
      if (await googleRateBlocked(req, res)) return;
      const address = String(req.query.address || "");
      if (!address) return res.json({ error: "no_address" });
      return res.json({ knowledge: await houseKnowledge(address) });
    } catch (err) {
      log.error("analyze failed", { err: (err as Error).message });
      return res.json({ error: String((err as Error).message || err) });
    }
  });

  /* ─── Roof feature detection (chimneys/vents/skylights/dormers) ─── */
  app.get("/api/roofquote/features", async (req: Request, res: Response) => {
    try {
      if (await googleRateBlocked(req, res)) return;
      const address = String(req.query.address || "");
      if (!address) return res.json({ error: "no_address" });
      return res.json(await roofFeatures(address));
    } catch (err) {
      log.error("features failed", { err: (err as Error).message });
      return res.json({ error: String((err as Error).message || err), ok: false });
    }
  });

  /* ─── Image Collector: oblique 3D aerial (headless capture, cached) ─── */
  app.get("/api/roofquote/capture", async (req: Request, res: Response) => {
    try {
      // Pre-warm capture fires fire-and-forget on every widget load; a 429 here
      // is swallowed by the widget's .catch and the <img> onerror just hides the
      // before/after slider (same graceful degrade as a 204/5xx).
      if (await googleRateBlocked(req, res)) return;
      const address = String(req.query.address || "");
      if (!address) return res.status(400).send("missing address");
      const buf = await captureOblique(address);
      res.setHeader("Content-Type", "image/png");
      res.setHeader("Cache-Control", "public, max-age=3600");
      return res.send(buf);
    } catch (err) {
      // Capture is a best-effort PRE-WARM (the before/after slider). The widget
      // fires it fire-and-forget on every load and hides the slider on a failed
      // image (baBefore.onerror). When the runtime can't launch a headless
      // browser (prod ships without the Playwright Chromium binary), degrade
      // CLEANLY — 204 No Content, no error log — so we don't 502-spam on every
      // widget load. A 204 satisfies the <img> onerror path just like a 5xx,
      // and the fire-and-forget fetch's .catch(()=>{}) swallows it either way.
      if (err instanceof CaptureUnavailableError) {
        return res.status(204).end();
      }
      log.error("capture failed", { err: (err as Error).message });
      return res
        .status(502)
        .type("text/plain")
        .send("capture_failed: " + String((err as Error).message || err));
    }
  });

  /* ─── AI photoreal roof material re-render (tier/cost gated) ─── */
  app.get("/api/roofquote/airender", async (req: Request, res: Response) => {
    try {
      // ── P0 COST GATE: per-IP rate limit on the PAID render ─────────────────
      // Each uncached call is a real ~$0.04 Replicate/gpt-image render, and the
      // cache is keyed on address|material|tier — so an attacker varying either
      // defeats the cache → unbounded spend. Two per-IP layers bound it:
      //   - per-minute burst  (6/min/IP)  — a real session renders a few
      //     materials back-to-back; 6/min is comfortably above that.
      //   - per-day hard cap  (40/day/IP) — ~$1.60/day worst case per IP even
      //     if it rotates address/material to bust the cache.
      // Over-cap → 429 with a clean JSON error. The widget reads r.json() and
      // checks `.url`; a 429 body has none, so it degrades to the instant
      // swatch-tint fallback (showInstantTint) exactly like a no-url render —
      // it does NOT crash the widget.
      //
      // The per-CALCULATOR daily cap is applied only when the widget src carries
      // a resolvable ?calc=<id> / ?slug=<slug> (the published embed does). It
      // bounds paid renders attributable to one trade's embed across ALL visitor
      // IPs (the per-IP caps alone can't catch a botnet hitting a single embed).
      // Resolution is best-effort — a bad/absent identifier just skips that cap.
      const ip = getClientIp(req);
      const calcParam = String(req.query.calc || "").trim();
      const slugParam = String(req.query.slug || "").trim();
      let calcId: number | null = null;
      if (calcParam && /^\d+$/.test(calcParam)) {
        calcId = Number(calcParam);
      } else if (slugParam) {
        try {
          const calc = await storage.getCalculatorBySlug(slugParam);
          calcId = calc?.id ?? null;
        } catch (lookupErr) {
          log.warn("airender calc lookup failed (skipping per-calc cap)", {
            err: (lookupErr as Error).message,
          });
        }
      }

      const gate = await evaluateAiRenderGate(aiRenderGateLimiters, { ip, calcId });
      if (!gate.allowed) {
        res.setHeader("Retry-After", String(gate.retryAfter));
        return res.status(429).json({ error: "rate_limited", code: "rate_limited" });
      }

      const address = String(req.query.address || "");
      const material = String(req.query.material || "new architectural asphalt shingles");
      if (!address) return res.json({ error: "no_address" });
      const requestedTier = String(req.query.tier || "");
      // Cost gate: only a request explicitly marked paid (paid=1/true) may reach
      // the "final" gpt-image-1 tier; everything else is forced to the cheap
      // browse chain (skips openai).
      const paid = req.query.paid === "1" || req.query.paid === "true";

      // ── Per-ACCOUNT dollar metering (NOT wired — needs owner-context plumbing)
      // server/services/quotequickAiBudget.ts gateDecision()/recordSpend() meter
      // spend per AUTHENTICATED user id (it reads ai_budget_config / ai_spend_log
      // keyed on users.id). The roof widget is anonymous and does NOT pass an
      // owner/user id on the airender request (the fetch carries only address +
      // material + tier — see roof3d.html renderOne/scheduleFinal/aiRenderHandler).
      // Resolving calcId above gives us a calculator, but not reliably its owning
      // user_id (anonymous portal calcs have user_id = null), and faking a budget
      // row for an anonymous visitor would be wrong. So per-account dollar
      // metering is DEFERRED: the per-IP (min+day) and per-calc/day caps above are
      // the anonymous spend ceiling here, mirroring how anonImageToTemplate*
      // limiters ARE the anonymous ceiling for the wizard vision path.
      // TO WIRE METERING: have the embed pass the owning user/calc context on the
      // airender request, resolve user_id from it, then call gateDecision(snapshot)
      // before aiRender() and recordSpend({ userId, imageCount: 1, ... }) after a
      // successful paid (tier==="final") render.
      return res.json(await aiRender(address, material, requestedTier, paid));
    } catch (err) {
      log.error("airender failed", { err: (err as Error).message });
      return res.json({ error: String((err as Error).message || err) });
    }
  });

  /* ─── Lead capture — real sink into the QuoteQuick lead pipeline ───
   *
   * The customer-facing path is the HOST BRIDGE: the embedded widget posts
   * `{type:'qq:lead', payload}` to its parent, the QuoteQuick host attributes it
   * to the live calculator (which it already knows) and POSTs the normal
   * `/api/leads` body — that route owns rate-limit/quota/dedup + notifications.
   *
   * This endpoint is the widget's own durable, queue-backed fallback (sendLead /
   * flushLeads in roof3d.html). When the request can be attributed to a calculator
   * — via ?calc=<id> / ?slug=<slug> on the iframe src, or a calculator_id/slug in
   * the body — we persist the lead (storage.createLead) and fire the SAME owner
   * notification + followups the wizard uses (enqueueLeadNotificationsAndFollowups,
   * which reads lead_form.delivery.primary_email i.e. settings.leadEmail). Without
   * an attributable calculator we ack so the widget's retry queue drains (a lead
   * with no owner has nowhere to route). Resolves templateLibrary.ts TODO. */
  app.post("/api/roofquote/lead", async (req: Request, res: Response) => {
    try {
      const body = (req.body && typeof req.body === "object" ? req.body : {}) as Record<string, any>;

      // ── Honeypot ──────────────────────────────────────────────────────────
      // Mirrors /api/leads: bots fill every field; legit users never see
      // `company_site` (rendered off-screen). Ack with a success-looking shape
      // so the bot doesn't learn the trap exists, but skip every side-effect
      // (no DB write, no notify, no webhook). Runs BEFORE the rate-limit checks
      // so honeypot hits don't even consume a limiter bucket.
      const honeypot = (typeof body.company_site === "string" ? body.company_site : "").trim();
      if (honeypot) {
        log.warn(`roofquote lead honeypot triggered ip=${getClientIp(req)} len=${honeypot.length}`);
        return res.json({ ok: true, persisted: false });
      }

      // ── Rate limit (same two layers /api/leads uses) ──────────────────────
      // Per-IP overall (60/hr) catches a bot from one source; the per-IP×calc
      // layer (20/hr) is applied once we resolve the owning calculator below.
      const clientIp = getClientIp(req);
      const ipOk = await leadsIpRateLimiter.check(`roofquote:lead:ip:${clientIp}`);
      if (!ipOk) {
        res.setHeader("Retry-After", String(Math.ceil(LEADS_RATE_LIMIT_WINDOW_MS / 1000)));
        return res.status(429).json({ ok: false, error: "rate_limited" });
      }

      // Resolve the owning calculator: query identifier first (iframe src), then body.
      const calcQuery = String(req.query.calc || "").trim();
      const slugQuery = String(req.query.slug || "").trim();
      const calcBody = body.calculator_id;
      const slugBody = typeof body.slug === "string" ? body.slug.trim() : "";

      let calc;
      try {
        if (calcQuery && /^\d+$/.test(calcQuery)) calc = await storage.getCalculatorById(Number(calcQuery));
        else if (typeof calcBody === "number" && Number.isInteger(calcBody)) calc = await storage.getCalculatorById(calcBody);
        else if (slugQuery) calc = await storage.getCalculatorBySlug(slugQuery);
        else if (slugBody) calc = await storage.getCalculatorBySlug(slugBody);
      } catch (lookupErr) {
        log.warn("lead calculator lookup failed", { err: (lookupErr as Error).message });
      }

      // Unattributable lead — ack so the widget's localStorage retry queue drains.
      if (!calc) {
        log.warn("roofquote lead with no resolvable calculator — acked, not persisted");
        return res.json({ ok: true, persisted: false });
      }

      // ── Per-IP×calc rate limit (the second /api/leads layer) ──────────────
      // 20/hr per (IP, calculator) — bounds a single bot pounding one calculator
      // while letting a contractor's office submit a few legit quotes in a row.
      // Applied here (vs above) because it keys on the resolved calculator id.
      const calcOk = await leadsSubmissionRateLimiter.check(`roofquote:lead:${clientIp}:${calc.id}`);
      if (!calcOk) {
        res.setHeader("Retry-After", String(Math.ceil(LEADS_RATE_LIMIT_WINDOW_MS / 1000)));
        return res.status(429).json({ ok: false, error: "rate_limited" });
      }

      // Map the widget payload onto the leads schema. name/email/phone are direct
      // columns; everything roof-specific (timeline, priorities, lead score, tier,
      // kW, price range, sqft, intent) lives in `answers` (jsonb).
      const name = typeof body.name === "string" ? body.name.trim() : null;
      const email = typeof body.email === "string" ? body.email.trim() : null;
      const phone = typeof body.phone === "string" && body.phone.trim() ? body.phone.trim() : null;
      const priceHi = Number(body.priceHi);
      const quoteAmount = Number.isFinite(priceHi) && priceHi > 0 ? Math.round(priceHi) : null;

      const answers: Record<string, any> = {
        source: "roof_visualizer",
        address: body.address ?? null,
        trade: body.trade ?? null,
        tier: body.tier ?? null,
        kw: body.kw ?? null,
        priceLo: body.priceLo ?? null,
        priceHi: body.priceHi ?? null,
        roofSqft: body.roofSqft ?? null,
        timeline: body.timeline ?? null,
        priorities: Array.isArray(body.priorities) ? body.priorities : null,
        leadScore: body.leadScore ?? null,
        intent: body.intent ?? null,
      };

      // DEDUP: a single homeowner submission can arrive via BOTH the host bridge
      // (parent → /api/leads) and this widget fallback (→ /api/roofquote/lead).
      // Route this path through the SAME in-memory dedup the wizard uses so we
      // don't double-persist + double-notify. If it's a duplicate, ack without
      // re-persisting — the host-bridge path is the canonical persister.
      if (isDuplicateSubmission(calc.id, email, phone)) {
        log.info("roofquote lead deduped — already submitted via host bridge / prior post", { calculatorId: calc.id });
        return res.json({ ok: true, persisted: false, deduped: true });
      }

      // ── Privacy/consent audit trail ───────────────────────────────────────
      // The widget's lead modal shows an always-visible consent + Privacy Policy
      // notice directly above the submit button; submitting it IS the consent
      // event. Record WHAT they agreed to (consent_text_version), WHEN
      // (consent_timestamp), HOW (consent_method="widget_submit") and WHERE
      // (consent_url = the homeowner-facing page). IP hash + user-agent are
      // computed/captured server-side (never trusted from the client), mirroring
      // the /api/leads path. sms_consent is intentionally NOT set true here — the
      // widget has no SMS opt-in checkbox, so homeowner-SMS stays fail-safe off.
      const consentTimestamp = typeof body.consent_timestamp === "string" && body.consent_timestamp.trim()
        ? new Date(body.consent_timestamp)
        : new Date();
      const consentTextVersion = typeof body.consent_text_version === "string" && body.consent_text_version.trim()
        ? body.consent_text_version.trim().slice(0, 50)
        : null;
      const consentUrl = typeof body.consent_url === "string" && body.consent_url.trim()
        ? body.consent_url.trim().slice(0, 500)
        : null;
      const consentMethod = typeof body.consent_method === "string" && body.consent_method.trim()
        ? body.consent_method.trim().slice(0, 20)
        : "widget_submit";
      const rawIp = getClientIp(req);
      const consentIpHash = rawIp && rawIp !== "unknown"
        ? createHash("sha256").update(rawIp).digest("hex")
        : null;
      const rawUserAgent = (req.headers["user-agent"] as string | undefined) ?? null;
      const consentUserAgent = rawUserAgent ? rawUserAgent.slice(0, 200) : null;

      const lead = await storage.createLead({
        calculator_id: calc.id,
        name,
        email,
        phone,
        quote_amount: quoteAmount,
        answers,
        // sms_consent left at its default (false) — no SMS opt-in in the widget.
        consent_timestamp: consentTimestamp,
        consent_text_version: consentTextVersion,
        consent_url: consentUrl,
        consent_ip_hash: consentIpHash,
        consent_user_agent: consentUserAgent,
        consent_method: consentMethod,
      });

      // Same notification/followup pipeline the wizard lead step uses — emails the
      // owner at lead_form.delivery.primary_email (settings.leadEmail) and, when the
      // owner enabled it, enqueues the owner-SMS notification (followup.notifications
      // .sms_enabled + calc.owner_phone). Best-effort.
      try {
        await enqueueLeadNotificationsAndFollowups(lead, calc.id);
      } catch (notifyErr) {
        log.warn("roofquote lead notification enqueue failed", { err: (notifyErr as Error).message });
      }

      // QuoteQuick Integrations — owner-configured OUTBOUND lead webhook
      // (Zapier/Make/n8n/HubSpot/GoHighLevel/Google Sheets/Slack/custom), stored at
      // calculator_settings.integrations.webhook and surfaced by the wizard Action
      // tab's IntegrationsPanel (now also shown for the roof widget). The generic
      // /api/leads path already fires this; the roof lead path previously skipped it
      // entirely, so roof-widget leads never reached the owner's CRM/Zapier hook.
      // Reuse the SAME signed, SSRF-guarded, non-blocking deliverer — no-op unless
      // integrations.webhook.{enabled,url,secret} is configured. Never throws.
      void fireLeadWebhook(calc, lead).catch((webhookErr) =>
        log.error("roofquote lead webhook fire threw unexpectedly", {
          err: (webhookErr as Error).message,
          calculatorId: calc.id,
          leadId: lead.id,
        }),
      );

      return res.json({ ok: true, persisted: true });
    } catch (err) {
      log.error("roofquote lead failed", { err: (err as Error).message });
      // The lead WAS attributable (we resolved a calc above) but persistence
      // threw — return a non-2xx so the widget's localStorage retry queue keeps
      // the lead and retries it, rather than draining it on a false 200. The
      // genuinely-unattributable case is handled earlier (ack-200, no retry).
      return res.status(503).json({ ok: false, persisted: false });
    }
  });
}
