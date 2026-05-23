/**
 * NAP Consistency Checker — Free Audit tab tool (#3 of 5).
 *
 * GET /api/audit/nap-consistency?reportId=<id>
 *   → { ok, sources: NapRow[], summary, mismatchCount }
 *
 * For the business attached to `reportId`, normalise (Name / Address /
 * Phone) returned by each directory we can check and flag mismatches.
 *
 * Source matrix:
 *   - google      Google Places Details (live; requires GOOGLE_PLACES_API_KEY)
 *   - facebook    Soft-deferred (FB Graph not wired) — always returns "unable to check"
 *   - yelp        Yelp public business page (HTML scrape, best-effort)
 *   - bbb         BBB public profile (HTML scrape, best-effort)
 *   - yellowpages YellowPages public profile (HTML scrape, best-effort)
 *
 * Each source returns one row with its findings; rows that 404 or get
 * rate-limited come back as `"not-found"` rather than failing the tool.
 */

import type { Express, Request, Response } from "express";
import * as cheerio from "cheerio";
import { createLogger } from "../lib/logger";
import {
  rateOk,
  loadBusinessFromReport,
  fetchWithTimeout,
} from "./auditTabsShared";

const log = createLogger("audit-nap");

export type NapField = "match" | "mismatch" | "missing" | "unknown";

export interface NapRow {
  source: string;
  label: string;
  status: "found" | "not-found" | "unable-to-check";
  name?: string;
  nameMatch: NapField;
  address?: string;
  addressMatch: NapField;
  phone?: string;
  phoneMatch: NapField;
  note?: string;
}

/* ─── Normalisation helpers ─── */

function normPhone(p?: string | null): string {
  if (!p) return "";
  return p.replace(/[^\d]/g, "").replace(/^1/, "");
}

function normAddress(a?: string | null): string {
  if (!a) return "";
  return a.toLowerCase()
    .replace(/[.,#]/g, " ")
    .replace(/\b(suite|ste|unit|apt|apartment|#)\b\s*\S+/g, " ")
    .replace(/\b(street|st)\b/g, "st")
    .replace(/\b(road|rd)\b/g, "rd")
    .replace(/\b(avenue|ave)\b/g, "ave")
    .replace(/\b(boulevard|blvd)\b/g, "blvd")
    .replace(/\b(drive|dr)\b/g, "dr")
    .replace(/\b(highway|hwy)\b/g, "hwy")
    .replace(/\s+/g, " ")
    .trim();
}

function normName(n?: string | null): string {
  if (!n) return "";
  return n.toLowerCase()
    .replace(/\b(inc|llc|ltd|corp|co|company|the)\b/g, "")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function compareField(canonical: string, candidate?: string): NapField {
  if (!candidate) return "missing";
  if (!canonical) return "unknown";
  if (canonical === candidate) return "match";
  // soft contains for names + addresses
  if (canonical.length > 6 && candidate.length > 6 && (canonical.includes(candidate) || candidate.includes(canonical))) {
    return "match";
  }
  return "mismatch";
}

/* ─── Source fetchers ─── */

async function fetchGooglePlace(placeId: string | null): Promise<NapRow | null> {
  if (!placeId) {
    return {
      source: "google",
      label: "Google Business Profile",
      status: "not-found",
      nameMatch: "missing",
      addressMatch: "missing",
      phoneMatch: "missing",
      note: "No Google place id linked.",
    };
  }
  const key = process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_MAPS_API_KEY;
  if (!key) {
    return {
      source: "google",
      label: "Google Business Profile",
      status: "unable-to-check",
      nameMatch: "unknown",
      addressMatch: "unknown",
      phoneMatch: "unknown",
      note: "Places key unavailable.",
    };
  }
  try {
    const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(placeId)}&fields=name,formatted_address,formatted_phone_number,international_phone_number&key=${key}`;
    const r = await fetchWithTimeout(url, { timeoutMs: 6000 });
    if (!r || !r.ok) {
      return {
        source: "google",
        label: "Google Business Profile",
        status: "unable-to-check",
        nameMatch: "unknown",
        addressMatch: "unknown",
        phoneMatch: "unknown",
        note: "Places API request failed.",
      };
    }
    const j: any = await r.json();
    const result = j.result;
    if (!result) {
      return {
        source: "google",
        label: "Google Business Profile",
        status: "not-found",
        nameMatch: "missing",
        addressMatch: "missing",
        phoneMatch: "missing",
      };
    }
    return {
      source: "google",
      label: "Google Business Profile",
      status: "found",
      name: result.name,
      address: result.formatted_address,
      phone: result.formatted_phone_number || result.international_phone_number,
      nameMatch: "match",
      addressMatch: "match",
      phoneMatch: "match",
    };
  } catch {
    return {
      source: "google",
      label: "Google Business Profile",
      status: "unable-to-check",
      nameMatch: "unknown",
      addressMatch: "unknown",
      phoneMatch: "unknown",
    };
  }
}

function fetchFacebookSoft(): NapRow {
  return {
    source: "facebook",
    label: "Facebook Page",
    status: "unable-to-check",
    nameMatch: "unknown",
    addressMatch: "unknown",
    phoneMatch: "unknown",
    note: "Facebook Page check not connected — coming soon.",
  };
}

/**
 * Generic best-effort directory scraper. Searches the directory's
 * site-search via Google (using Serper if available) for the business
 * name + city, then fetches the top result and tries to pull NAP from
 * structured data on the page. Fails soft.
 */
async function scrapeDirectory(
  source: string,
  label: string,
  domain: string,
  businessName: string,
  city: string,
): Promise<NapRow> {
  const apiKey = process.env.SERPER_API_KEY;
  if (!apiKey) {
    return {
      source,
      label,
      status: "unable-to-check",
      nameMatch: "unknown",
      addressMatch: "unknown",
      phoneMatch: "unknown",
      note: "Directory search unavailable right now.",
    };
  }
  try {
    const q = `site:${domain} ${businessName} ${city || ""}`.trim();
    const sr = await fetchWithTimeout("https://google.serper.dev/search", {
      method: "POST",
      headers: { "X-API-KEY": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ q, num: 3 }),
      timeoutMs: 6000,
    });
    if (!sr || !sr.ok) {
      return {
        source,
        label,
        status: "unable-to-check",
        nameMatch: "unknown",
        addressMatch: "unknown",
        phoneMatch: "unknown",
      };
    }
    const sj: any = await sr.json();
    const target = sj?.organic?.[0]?.link;
    if (!target) {
      return {
        source,
        label,
        status: "not-found",
        nameMatch: "missing",
        addressMatch: "missing",
        phoneMatch: "missing",
        note: `No ${label} listing found.`,
      };
    }
    const pageResp = await fetchWithTimeout(target, { timeoutMs: 7000 });
    if (!pageResp || !pageResp.ok) {
      return {
        source,
        label,
        status: "unable-to-check",
        nameMatch: "unknown",
        addressMatch: "unknown",
        phoneMatch: "unknown",
        note: `${label} blocked our request — common with anti-scrape protection.`,
      };
    }
    const html = (await pageResp.text()).slice(0, 1_000_000);
    const $ = cheerio.load(html);
    let name: string | undefined;
    let address: string | undefined;
    let phone: string | undefined;
    // Try JSON-LD first
    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        const parsed = JSON.parse($(el).contents().text());
        const items = Array.isArray(parsed) ? parsed : [parsed];
        for (const item of items) {
          if (!item) continue;
          name = name || item.name;
          if (item.address) {
            if (typeof item.address === "string") address = address || item.address;
            else {
              const parts = [item.address.streetAddress, item.address.addressLocality, item.address.addressRegion, item.address.postalCode].filter(Boolean);
              if (parts.length) address = address || parts.join(", ");
            }
          }
          phone = phone || item.telephone;
        }
      } catch {
        /* ignore */
      }
    });
    // Fallback meta tags
    if (!name) name = $('meta[property="og:title"]').attr("content") || $("title").first().text();
    return {
      source,
      label,
      status: "found",
      name,
      address,
      phone,
      // These get filled in by the comparison pass below
      nameMatch: "unknown",
      addressMatch: "unknown",
      phoneMatch: "unknown",
    };
  } catch {
    return {
      source,
      label,
      status: "unable-to-check",
      nameMatch: "unknown",
      addressMatch: "unknown",
      phoneMatch: "unknown",
    };
  }
}

/* ─── Summary builder ─── */

function buildSummary(rows: NapRow[]): { summary: string; mismatchCount: number } {
  let phoneMismatch = 0;
  let addressMismatch = 0;
  let nameMismatch = 0;
  for (const r of rows) {
    if (r.phoneMatch === "mismatch") phoneMismatch++;
    if (r.addressMatch === "mismatch") addressMismatch++;
    if (r.nameMatch === "mismatch") nameMismatch++;
  }
  const total = phoneMismatch + addressMismatch + nameMismatch;
  if (total === 0) {
    return { summary: "Your business info is consistent across the directories we could check. Strong local-SEO foundation.", mismatchCount: 0 };
  }
  const parts: string[] = [];
  if (phoneMismatch) parts.push(`phone is inconsistent across ${phoneMismatch} director${phoneMismatch === 1 ? "y" : "ies"}`);
  if (addressMismatch) parts.push(`address is inconsistent across ${addressMismatch} director${addressMismatch === 1 ? "y" : "ies"}`);
  if (nameMismatch) parts.push(`business name varies across ${nameMismatch} director${nameMismatch === 1 ? "y" : "ies"}`);
  return {
    summary: `Your ${parts.join(", and your ")} — inconsistent NAP confuses search engines and hurts local pack rankings.`,
    mismatchCount: total,
  };
}

export function registerAuditNapConsistencyRoutes(app: Express): void {
  app.get("/api/audit/nap-consistency", async (req: Request, res: Response) => {
    if (!rateOk("nap-consistency", req, res)) return;

    const reportId = String(req.query.reportId || "");
    const biz = await loadBusinessFromReport(reportId);
    if (!biz) return res.status(404).json({ ok: false, error: "Report not found" });

    const canonical = {
      name: normName(biz.name),
      address: normAddress(biz.address),
      phone: normPhone(biz.phone),
    };

    const [google, yelp, bbb, yellowpages] = await Promise.all([
      fetchGooglePlace(biz.placeId || null),
      scrapeDirectory("yelp", "Yelp", "yelp.com", biz.name, biz.city || ""),
      scrapeDirectory("bbb", "BBB", "bbb.org", biz.name, biz.city || ""),
      scrapeDirectory("yellowpages", "YellowPages", "yellowpages.com", biz.name, biz.city || ""),
    ]);

    // Compare scraped rows against canonical
    const compareRow = (row: NapRow): NapRow => {
      if (row.status !== "found") return row;
      const n = normName(row.name);
      const a = normAddress(row.address);
      const p = normPhone(row.phone);
      // Don't override Google — it's the source of truth so already "match"
      if (row.source === "google") return row;
      return {
        ...row,
        nameMatch: compareField(canonical.name, n),
        addressMatch: compareField(canonical.address, a),
        phoneMatch: canonical.phone && p ? (canonical.phone === p ? "match" : "mismatch") : (p ? "unknown" : "missing"),
      };
    };

    const rows: NapRow[] = [
      compareRow(google || { source: "google", label: "Google Business Profile", status: "unable-to-check", nameMatch: "unknown", addressMatch: "unknown", phoneMatch: "unknown" }),
      fetchFacebookSoft(),
      compareRow(yelp),
      compareRow(bbb),
      compareRow(yellowpages),
    ];

    const { summary, mismatchCount } = buildSummary(rows);
    log.info("[nap-consistency] computed", { arg0: reportId, arg1: `${mismatchCount} mismatches` });

    return res.json({ ok: true, sources: rows, summary, mismatchCount });
  });
}
