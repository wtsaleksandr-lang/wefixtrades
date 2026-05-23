/**
 * Service-Area Market Sizer — Free Audit tab tool (#4 of 5).
 *
 * GET /api/audit/market-sizer?reportId=<id>
 *   → { ok, households, medianIncome, competitors: {r5,r10,r25}, insight, region }
 *
 * Demographics: US Census ACS 5-year (free, no key required) when we can
 * resolve the business to a state+county. Non-US businesses (or US ones
 * where the Census lookup fails) get a graceful "Demographics not
 * available outside US" envelope.
 *
 * Competitor counts: Google Places Nearby Search at three radii
 * (5 / 10 / 25 miles). Falls back to omitting the bar chart when the
 * Places key is unavailable.
 */

import type { Express, Request, Response } from "express";
import { createLogger } from "../lib/logger";
import {
  rateOk,
  loadBusinessFromReport,
  fetchWithTimeout,
} from "./auditTabsShared";

const log = createLogger("audit-market-sizer");

interface CompetitorBuckets {
  r5: number;
  r10: number;
  r25: number;
}

interface CensusPair {
  households: number | null;
  medianIncome: number | null;
}

const MILES_TO_METERS = 1609.34;

async function geocodeAddress(address: string): Promise<{ lat: number; lng: number; country?: string; state?: string; county?: string } | null> {
  const key = process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_PLACES_API_KEY;
  if (!key) return null;
  try {
    const r = await fetchWithTimeout(
      `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${key}`,
      { timeoutMs: 6000 },
    );
    if (!r || !r.ok) return null;
    const j: any = await r.json();
    const result = j.results?.[0];
    if (!result?.geometry?.location) return null;
    const components = result.address_components || [];
    let country: string | undefined;
    let state: string | undefined;
    let county: string | undefined;
    for (const c of components) {
      const types: string[] = c.types || [];
      if (types.includes("country")) country = c.short_name;
      if (types.includes("administrative_area_level_1")) state = c.short_name;
      if (types.includes("administrative_area_level_2")) county = c.long_name;
    }
    return {
      lat: result.geometry.location.lat,
      lng: result.geometry.location.lng,
      country,
      state,
      county,
    };
  } catch {
    return null;
  }
}

/* ─── Census ACS lookup (state+county FIPS) ───────────────────────────── */

// Subset of state name → FIPS code (no key needed for ACS endpoint).
const STATE_FIPS: Record<string, string> = {
  AL: "01", AK: "02", AZ: "04", AR: "05", CA: "06", CO: "08", CT: "09", DE: "10",
  FL: "12", GA: "13", HI: "15", ID: "16", IL: "17", IN: "18", IA: "19", KS: "20",
  KY: "21", LA: "22", ME: "23", MD: "24", MA: "25", MI: "26", MN: "27", MS: "28",
  MO: "29", MT: "30", NE: "31", NV: "32", NH: "33", NJ: "34", NM: "35", NY: "36",
  NC: "37", ND: "38", OH: "39", OK: "40", OR: "41", PA: "42", RI: "44", SC: "45",
  SD: "46", TN: "47", TX: "48", UT: "49", VT: "50", VA: "51", WA: "53", WV: "54",
  WI: "55", WY: "56", DC: "11",
};

async function fetchCensus(state: string | undefined, lat: number, lng: number): Promise<CensusPair> {
  if (!state) return { households: null, medianIncome: null };
  const fips = STATE_FIPS[state.toUpperCase()];
  if (!fips) return { households: null, medianIncome: null };
  try {
    // Use the FCC Area API (no key) to resolve county FIPS from lat/lng
    const fccUrl = `https://geo.fcc.gov/api/census/area?lat=${lat}&lon=${lng}&format=json`;
    const fccResp = await fetchWithTimeout(fccUrl, { timeoutMs: 6000 });
    let countyFips: string | null = null;
    if (fccResp && fccResp.ok) {
      const fcc: any = await fccResp.json();
      const block = fcc?.results?.[0]?.block_fips;
      // block_fips is 15-char string: state(2) + county(3) + tract(6) + block(4)
      if (typeof block === "string" && block.length >= 5) {
        countyFips = block.substring(2, 5);
      }
    }
    if (!countyFips) return { households: null, medianIncome: null };

    // ACS 5-year — B11001_001E (households), B19013_001E (median income)
    const acsUrl = `https://api.census.gov/data/2022/acs/acs5?get=B11001_001E,B19013_001E&for=county:${countyFips}&in=state:${fips}`;
    const acsResp = await fetchWithTimeout(acsUrl, { timeoutMs: 6000 });
    if (!acsResp || !acsResp.ok) return { households: null, medianIncome: null };
    const j: any = await acsResp.json();
    // Response shape: [["B11001_001E","B19013_001E","state","county"], ["12345","68000","06","081"]]
    const row = Array.isArray(j) && Array.isArray(j[1]) ? j[1] : null;
    if (!row) return { households: null, medianIncome: null };
    const households = Number(row[0]);
    const medianIncome = Number(row[1]);
    return {
      households: Number.isFinite(households) && households > 0 ? households : null,
      medianIncome: Number.isFinite(medianIncome) && medianIncome > 0 ? medianIncome : null,
    };
  } catch {
    return { households: null, medianIncome: null };
  }
}

/* ─── Competitor count via Places Nearby ──────────────────────────────── */

async function nearbyCount(lat: number, lng: number, radiusMeters: number, keyword: string): Promise<number | null> {
  const key = process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return null;
  try {
    const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=${radiusMeters}&keyword=${encodeURIComponent(keyword)}&key=${key}`;
    const r = await fetchWithTimeout(url, { timeoutMs: 7000 });
    if (!r || !r.ok) return null;
    const j: any = await r.json();
    const results = Array.isArray(j.results) ? j.results : [];
    return results.length;
  } catch {
    return null;
  }
}

async function fetchCompetitors(lat: number, lng: number, trade: string): Promise<CompetitorBuckets> {
  // Run all three radii in parallel.
  const [r5, r10, r25] = await Promise.all([
    nearbyCount(lat, lng, Math.round(5 * MILES_TO_METERS), trade),
    nearbyCount(lat, lng, Math.round(10 * MILES_TO_METERS), trade),
    nearbyCount(lat, lng, Math.round(25 * MILES_TO_METERS), trade),
  ]);
  return {
    r5: r5 ?? 0,
    r10: r10 ?? 0,
    r25: r25 ?? 0,
  };
}

function buildInsight(households: number | null, medianIncome: number | null, comps: CompetitorBuckets, trade: string): string {
  const t = trade && trade.trim() ? trade.trim() : "your trade";
  const parts: string[] = [];
  if (households && households > 0) {
    parts.push(`Your service area has roughly ${households.toLocaleString()} households`);
  } else {
    parts.push("Your service area");
  }
  if (medianIncome && medianIncome > 0) {
    parts.push(`with a $${medianIncome.toLocaleString()} median income`);
  }
  if (comps.r5 > 0 || comps.r10 > 0) {
    parts.push(`and ${comps.r5} direct ${t} competitors within 5 miles (${comps.r25} within 25)`);
  }
  let viability = "";
  if (comps.r5 <= 5 && (households ?? 0) > 5000) {
    viability = " — that's a strong market with low local competition.";
  } else if (comps.r5 <= 10) {
    viability = " — that's a viable, competitive market.";
  } else if (comps.r5 > 0) {
    viability = " — competitive market; ranking matters even more here.";
  } else {
    viability = ".";
  }
  return parts.join(", ") + viability;
}

export function registerAuditMarketSizerRoutes(app: Express): void {
  app.get("/api/audit/market-sizer", async (req: Request, res: Response) => {
    if (!rateOk("market-sizer", req, res)) return;

    const reportId = String(req.query.reportId || "");
    const biz = await loadBusinessFromReport(reportId);
    if (!biz) return res.status(404).json({ ok: false, error: "Report not found" });

    if (!biz.address) {
      return res.json({
        ok: true,
        unavailable: true,
        reason: "No business address on file.",
        insight: "We need a business address to size your local market.",
      });
    }

    const loc = await geocodeAddress(biz.address);
    if (!loc) {
      return res.json({
        ok: true,
        unavailable: true,
        reason: "Could not geocode business address.",
        insight: "We couldn't resolve your business address to a map location.",
      });
    }

    const isUs = (loc.country || "").toUpperCase() === "US";

    const [census, comps] = await Promise.all([
      isUs ? fetchCensus(loc.state, loc.lat, loc.lng) : Promise.resolve<CensusPair>({ households: null, medianIncome: null }),
      fetchCompetitors(loc.lat, loc.lng, biz.trade || "service"),
    ]);

    const insight = isUs
      ? buildInsight(census.households, census.medianIncome, comps, biz.trade || "")
      : `Your service area has ${comps.r5} direct ${biz.trade || "service"} competitors within 5 miles (${comps.r25} within 25 miles). Demographics are not available outside the US right now — competitor density is still a useful read on market size.`;

    log.info("[market-sizer] computed", { arg0: reportId, arg1: `${comps.r5}/${comps.r10}/${comps.r25} comps` });

    return res.json({
      ok: true,
      households: census.households,
      medianIncome: census.medianIncome,
      competitors: comps,
      insight,
      region: {
        country: loc.country || null,
        state: loc.state || null,
        county: loc.county || null,
        isUs,
      },
    });
  });
}
