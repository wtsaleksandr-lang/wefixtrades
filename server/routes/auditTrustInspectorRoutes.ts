/**
 * Trust Inspector — Free Audit tab tool (#5 of 5).
 *
 * GET /api/audit/trust-inspector?reportId=<id>
 *   → { ok, grade, scores: TrustScores, fixes: string[], summary }
 *
 * Computes a trust grade (A+ to F) from five free signals:
 *   1. domainAge      — WHOIS via the free `whoisjson.com` public endpoint
 *                       (no key required for `/whois?domain=...`). Soft-fail.
 *   2. ssl            — TLS cert `notAfter` via `tls.connect`.
 *   3. dns            — MX + SPF (TXT) + DMARC (TXT at `_dmarc.<domain>`)
 *                       via Node's `dns/promises`. No external deps.
 *   4. wayback        — First snapshot date from the Internet Archive's
 *                       `/wayback/available` endpoint (free, no key).
 *   5. ipGeolocation  — ipinfo.io free endpoint (no key required).
 *
 * Each signal is graded individually (A+/A/B/C/D/F) and the overall grade
 * is the weighted average. No paid APIs and every signal fails-soft.
 */

import type { Express, Request, Response } from "express";
import * as dnsPromises from "node:dns/promises";
import * as tls from "node:tls";
import { createLogger } from "../lib/logger";
import {
  rateOk,
  loadBusinessFromReport,
  normalizeWebsite,
  hostnameOf,
  fetchWithTimeout,
} from "./auditTabsShared";

const log = createLogger("audit-trust");

export type TrustGrade = "A+" | "A" | "B" | "C" | "D" | "F" | "?";

export interface TrustSubScore {
  id: string;
  label: string;
  grade: TrustGrade;
  detail: string;
  /** 0-100, used to compute overall grade */
  score: number;
}

export interface TrustScores {
  domainAge: TrustSubScore;
  ssl: TrustSubScore;
  dns: TrustSubScore;
  wayback: TrustSubScore;
  ipGeo: TrustSubScore;
}

function gradeFromScore(score: number): TrustGrade {
  if (score >= 95) return "A+";
  if (score >= 85) return "A";
  if (score >= 70) return "B";
  if (score >= 55) return "C";
  if (score >= 40) return "D";
  return "F";
}

/* ─── 1. Domain age (WHOIS) ───────────────────────────────────────────── */

async function checkDomainAge(domain: string): Promise<TrustSubScore> {
  try {
    // whoisjson.com offers a free tier without key for low volume
    const r = await fetchWithTimeout(`https://www.whoisjson.com/api/v1/whois?domain=${encodeURIComponent(domain)}`, {
      timeoutMs: 7000,
    });
    if (!r || !r.ok) {
      return {
        id: "domainAge",
        label: "Domain age",
        grade: "?",
        score: 50,
        detail: "Couldn't check WHOIS right now.",
      };
    }
    const j: any = await r.json();
    const created = j?.created || j?.creation_date || j?.created_date;
    if (!created) {
      return {
        id: "domainAge",
        label: "Domain age",
        grade: "?",
        score: 50,
        detail: "Domain creation date not available.",
      };
    }
    const createdDate = new Date(created);
    if (Number.isNaN(createdDate.getTime())) {
      return { id: "domainAge", label: "Domain age", grade: "?", score: 50, detail: "Could not parse creation date." };
    }
    const ageYears = (Date.now() - createdDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
    let score: number;
    let detail: string;
    if (ageYears >= 10) { score = 100; detail = `Domain is ${Math.round(ageYears)} years old — excellent trust signal.`; }
    else if (ageYears >= 5) { score = 90; detail = `Domain is ${ageYears.toFixed(1)} years old — strong trust signal.`; }
    else if (ageYears >= 2) { score = 75; detail = `Domain is ${ageYears.toFixed(1)} years old — good trust signal.`; }
    else if (ageYears >= 1) { score = 60; detail = `Domain is ${ageYears.toFixed(1)} years old — moderate.`; }
    else { score = 30; detail = `Domain is less than a year old — search engines and customers treat new domains with caution.`; }
    return { id: "domainAge", label: "Domain age", grade: gradeFromScore(score), score, detail };
  } catch {
    return { id: "domainAge", label: "Domain age", grade: "?", score: 50, detail: "WHOIS lookup failed." };
  }
}

/* ─── 2. SSL cert ─────────────────────────────────────────────────────── */

function checkSsl(host: string): Promise<TrustSubScore> {
  return new Promise((resolve) => {
    const timeoutId = setTimeout(() => {
      try { socket.destroy(); } catch { /* noop */ }
      resolve({ id: "ssl", label: "SSL certificate", grade: "?", score: 50, detail: "SSL handshake timed out." });
    }, 7000);

    const socket = tls.connect({
      host,
      port: 443,
      servername: host,
      rejectUnauthorized: false,
    }, () => {
      const cert = socket.getPeerCertificate();
      clearTimeout(timeoutId);
      try { socket.end(); } catch { /* noop */ }
      if (!cert || !cert.valid_to) {
        return resolve({ id: "ssl", label: "SSL certificate", grade: "F", score: 0, detail: "No valid certificate found." });
      }
      const expiry = new Date(cert.valid_to).getTime();
      const daysLeft = Math.floor((expiry - Date.now()) / (24 * 60 * 60 * 1000));
      let score: number;
      let detail: string;
      if (daysLeft <= 0) { score = 0; detail = "SSL certificate is expired."; }
      else if (daysLeft < 7) { score = 30; detail = `SSL expires in ${daysLeft} days — renew immediately.`; }
      else if (daysLeft < 30) { score = 60; detail = `SSL expires in ${daysLeft} days — renew soon.`; }
      else if (daysLeft < 90) { score = 85; detail = `SSL valid for ${daysLeft} more days.`; }
      else { score = 100; detail = `SSL valid for ${daysLeft} more days — well-maintained.`; }
      resolve({ id: "ssl", label: "SSL certificate", grade: gradeFromScore(score), score, detail });
    });
    socket.on("error", () => {
      clearTimeout(timeoutId);
      resolve({ id: "ssl", label: "SSL certificate", grade: "F", score: 0, detail: "No SSL — site served over HTTP only." });
    });
  });
}

/* ─── 3. DNS health (MX + SPF + DMARC) ───────────────────────────────── */

async function checkDns(domain: string): Promise<TrustSubScore> {
  let hasMx = false;
  let hasSpf = false;
  let hasDmarc = false;
  try {
    const mx = await dnsPromises.resolveMx(domain).catch(() => []);
    hasMx = Array.isArray(mx) && mx.length > 0;
  } catch { /* noop */ }
  try {
    const txt = await dnsPromises.resolveTxt(domain).catch(() => []);
    for (const arr of txt) {
      const joined = (arr as string[]).join("").toLowerCase();
      if (joined.startsWith("v=spf1")) hasSpf = true;
    }
  } catch { /* noop */ }
  try {
    const dmarc = await dnsPromises.resolveTxt(`_dmarc.${domain}`).catch(() => []);
    for (const arr of dmarc) {
      const joined = (arr as string[]).join("").toLowerCase();
      if (joined.startsWith("v=dmarc1")) hasDmarc = true;
    }
  } catch { /* noop */ }
  const presentCount = [hasMx, hasSpf, hasDmarc].filter(Boolean).length;
  const score = presentCount === 3 ? 100 : presentCount === 2 ? 75 : presentCount === 1 ? 50 : 20;
  const missing = [
    !hasMx ? "MX (email delivery)" : null,
    !hasSpf ? "SPF (email anti-spoofing)" : null,
    !hasDmarc ? "DMARC (email anti-phishing)" : null,
  ].filter(Boolean) as string[];
  const detail = missing.length === 0
    ? "MX + SPF + DMARC all present — excellent email hygiene."
    : `Missing: ${missing.join(", ")}.`;
  return { id: "dns", label: "DNS health", grade: gradeFromScore(score), score, detail };
}

/* ─── 4. Wayback Machine ─────────────────────────────────────────────── */

async function checkWayback(domain: string): Promise<TrustSubScore> {
  try {
    const r = await fetchWithTimeout(`https://archive.org/wayback/available?url=${encodeURIComponent(domain)}&timestamp=19960101`, {
      timeoutMs: 7000,
    });
    if (!r || !r.ok) {
      return { id: "wayback", label: "Wayback Machine history", grade: "?", score: 50, detail: "Wayback Machine unreachable." };
    }
    const j: any = await r.json();
    const ts = j?.archived_snapshots?.closest?.timestamp;
    if (!ts || typeof ts !== "string" || ts.length < 8) {
      return { id: "wayback", label: "Wayback Machine history", grade: "F", score: 20, detail: "No Wayback snapshot — site is very new or hasn't been crawled." };
    }
    const year = parseInt(ts.substring(0, 4), 10);
    const month = parseInt(ts.substring(4, 6), 10) - 1;
    const day = parseInt(ts.substring(6, 8), 10);
    const first = new Date(year, month, day);
    const ageYears = (Date.now() - first.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
    let score: number;
    let detail: string;
    if (ageYears >= 8) { score = 100; detail = `First snapshot ${first.toISOString().substring(0, 10)} — over ${Math.round(ageYears)} years of history.`; }
    else if (ageYears >= 4) { score = 85; detail = `First snapshot ${first.toISOString().substring(0, 10)} — ${ageYears.toFixed(1)} years of history.`; }
    else if (ageYears >= 2) { score = 70; detail = `First snapshot ${first.toISOString().substring(0, 10)} — building history.`; }
    else if (ageYears >= 1) { score = 50; detail = `First snapshot ${first.toISOString().substring(0, 10)} — limited history yet.`; }
    else { score = 30; detail = `Very recent first snapshot (${first.toISOString().substring(0, 10)}).`; }
    return { id: "wayback", label: "Wayback Machine history", grade: gradeFromScore(score), score, detail };
  } catch {
    return { id: "wayback", label: "Wayback Machine history", grade: "?", score: 50, detail: "Wayback check failed." };
  }
}

/* ─── 5. IP geolocation (ipinfo.io free tier) ────────────────────────── */

async function checkIpGeo(domain: string): Promise<TrustSubScore> {
  try {
    const addrs = await dnsPromises.resolve4(domain).catch(() => []);
    const ip = addrs[0];
    if (!ip) {
      return { id: "ipGeo", label: "Hosting & IP geolocation", grade: "?", score: 50, detail: "Could not resolve domain to an IP address." };
    }
    const r = await fetchWithTimeout(`https://ipinfo.io/${ip}/json`, { timeoutMs: 5000 });
    if (!r || !r.ok) {
      return { id: "ipGeo", label: "Hosting & IP geolocation", grade: "?", score: 50, detail: `Domain resolves to ${ip}, but couldn't fetch geolocation.` };
    }
    const j: any = await r.json();
    const org = j?.org || "unknown host";
    const country = j?.country || "??";
    const city = j?.city;
    // Reasonable hosts (Cloudflare, AWS, Google, Vercel, etc.) get full marks.
    const goodHostHints = ["cloudflare", "amazon", "google", "aws", "vercel", "netlify", "fastly", "azure", "digitalocean", "linode", "hetzner", "ovh", "godaddy", "wordpress", "squarespace", "wix", "shopify", "ionos", "namecheap"];
    const orgLower = String(org).toLowerCase();
    const recognised = goodHostHints.some((h) => orgLower.includes(h));
    const score = recognised ? 95 : 70;
    const detail = `Hosted by ${org} in ${city ? city + ", " : ""}${country}.`;
    return { id: "ipGeo", label: "Hosting & IP geolocation", grade: gradeFromScore(score), score, detail };
  } catch {
    return { id: "ipGeo", label: "Hosting & IP geolocation", grade: "?", score: 50, detail: "IP geolocation check failed." };
  }
}

/* ─── Aggregation ─────────────────────────────────────────────────────── */

function buildFixes(s: TrustScores): string[] {
  const out: string[] = [];
  if (s.ssl.score < 70) out.push("Renew or install an SSL cert — most hosts offer free Let's Encrypt in one click.");
  if (s.dns.score < 100) {
    if (s.dns.detail.includes("SPF")) out.push("Add an SPF record — takes 5 minutes with your DNS host. Stops your emails landing in spam.");
    if (s.dns.detail.includes("DMARC")) out.push("Add a DMARC record (`v=DMARC1; p=none;` to start) — blocks phishing of your domain.");
    if (s.dns.detail.includes("MX")) out.push("Configure MX records so your domain can receive email.");
  }
  if (s.domainAge.score < 60) out.push("Domain is young — focus on consistent business signals (NAP, reviews, GBP) to compensate.");
  if (s.wayback.score < 50) out.push("Submit your site to the Internet Archive — establishes an independent timeline of your business.");
  return out.slice(0, 4);
}

function buildSummary(grade: TrustGrade): string {
  switch (grade) {
    case "A+":
      return "Excellent trust profile — search engines and customers will see your business as established and legitimate.";
    case "A":
      return "Strong trust profile with just a couple of small wins to lock in.";
    case "B":
      return "Solid foundation, but a few trust signals could be strengthened.";
    case "C":
      return "Mixed trust signals — some baseline items still need attention.";
    case "D":
      return "Several trust signals are missing or weak — these are quick wins that compound over time.";
    case "F":
      return "Trust signals are largely missing — fixing the items below will compound into stronger rankings + customer confidence.";
    default:
      return "Trust check incomplete — try again in a minute.";
  }
}

export function registerAuditTrustInspectorRoutes(app: Express): void {
  app.get("/api/audit/trust-inspector", async (req: Request, res: Response) => {
    if (!rateOk("trust-inspector", req, res)) return;

    const reportId = String(req.query.reportId || "");
    const biz = await loadBusinessFromReport(reportId);
    if (!biz) return res.status(404).json({ ok: false, error: "Report not found" });

    const website = normalizeWebsite(biz.website);
    const host = hostnameOf(website || "") || hostnameOf(biz.website || "");
    if (!host) {
      return res.json({
        ok: true,
        unavailable: true,
        grade: "?",
        summary: "No website on file — can't run a trust check without a domain.",
        scores: null,
        fixes: [],
      });
    }

    const [domainAge, ssl, dns, wayback, ipGeo] = await Promise.all([
      checkDomainAge(host),
      checkSsl(host),
      checkDns(host),
      checkWayback(host),
      checkIpGeo(host),
    ]);

    const scores: TrustScores = { domainAge, ssl, dns, wayback, ipGeo };
    // Weighted overall — SSL & DNS weigh slightly higher (they're table stakes)
    const overall = (
      domainAge.score * 0.20 +
      ssl.score * 0.25 +
      dns.score * 0.25 +
      wayback.score * 0.15 +
      ipGeo.score * 0.15
    );
    const grade = gradeFromScore(overall);
    const fixes = buildFixes(scores);
    const summary = buildSummary(grade);

    log.info("[trust-inspector] computed", { arg0: reportId, arg1: host, arg2: grade });

    return res.json({ ok: true, grade, overallScore: Math.round(overall), scores, fixes, summary, host });
  });
}
