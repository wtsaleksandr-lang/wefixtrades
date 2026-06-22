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
import path from "path";
import { createLogger } from "../lib/logger";
import {
  aiRender,
  captureOblique,
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

const ASSET_DIR = path.join(process.cwd(), "server", "roofQuote", "assets");
const tilesKey = (): string =>
  process.env.ROOFQUOTE_TILES_KEY || process.env.GOOGLE_MAPS_API_KEY || "";

// Read the widget HTML lazily + cache once the tiles key is known (key is filled
// at boot by bootstrapDoppler, but we still read lazily so a missing key on a
// cold path degrades to an empty placeholder rather than crashing).
let _widgetHtml: string | null = null;
function widgetHtml(): string {
  if (_widgetHtml !== null) return _widgetHtml;
  try {
    _widgetHtml = readFileSync(path.join(ASSET_DIR, "roof3d.html"), "utf8").replaceAll(
      "__TILES__",
      tilesKey(),
    );
  } catch (err) {
    log.error("widget html read failed", { err: (err as Error).message });
    _widgetHtml = "<!doctype html><title>Roof Quote</title><p>Widget unavailable.</p>";
  }
  return _widgetHtml;
}

function readModule(name: string): string {
  return readFileSync(path.join(ASSET_DIR, name), "utf8");
}

export function registerRoofQuoteRoutes(app: Express) {
  /* ─── Widget HTML (tiles key injected in place of __TILES__) ─── */
  app.get("/api/roofquote/widget", (_req: Request, res: Response) => {
    try {
      res.setHeader("Cache-Control", "no-store, must-revalidate");
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.send(widgetHtml());
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
      const { ok, body } = await solarInsights(String(req.query.lat || ""), String(req.query.lng || ""));
      res.setHeader("Content-Type", "application/json");
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
      const { ok, body } = await dataLayers(String(req.query.lat || ""), String(req.query.lng || ""));
      res.setHeader("Content-Type", "application/json");
      return res.send(ok ? body : JSON.stringify({ error: "no_datalayers" }));
    } catch (err) {
      log.error("datalayers failed", { err: (err as Error).message });
      return res.json({ error: String((err as Error).message || err) });
    }
  });

  /* ─── GeoTIFF proxy (host-whitelisted to solar.googleapis.com) ─── */
  app.get("/api/roofquote/geotiff", async (req: Request, res: Response) => {
    try {
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
      const address = String(req.query.address || "");
      if (!address) return res.status(400).send("missing address");
      const buf = await captureOblique(address);
      res.setHeader("Content-Type", "image/png");
      res.setHeader("Cache-Control", "public, max-age=3600");
      return res.send(buf);
    } catch (err) {
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
      const address = String(req.query.address || "");
      const material = String(req.query.material || "new architectural asphalt shingles");
      if (!address) return res.json({ error: "no_address" });
      const requestedTier = String(req.query.tier || "");
      // Cost gate: only a request explicitly marked paid (paid=1/true) may reach
      // the "final" gpt-image-1 tier; everything else is forced to the cheap
      // browse chain (skips openai). The widget does not yet pass owner context.
      // TODO(roofquote): integrate server/services/quotequickAiBudget.ts
      // gateDecision()/recordSpend() once the widget passes a calculatorId/owner
      // context so spend can be attributed + budget-capped per tenant.
      const paid = req.query.paid === "1" || req.query.paid === "true";
      return res.json(await aiRender(address, material, requestedTier, paid));
    } catch (err) {
      log.error("airender failed", { err: (err as Error).message });
      return res.json({ error: String((err as Error).message || err) });
    }
  });

  /* ─── Lead capture — no-op sink (the spike appended to leads.jsonl; the
   *     widget fires this best-effort inside a try/catch, so we accept + ack
   *     without persisting. TODO(roofquote): wire to the real CRM/contact
   *     pipeline once the widget carries owner/calculator context). ─── */
  app.post("/api/roofquote/lead", (_req: Request, res: Response) => {
    return res.json({ ok: true });
  });
}
