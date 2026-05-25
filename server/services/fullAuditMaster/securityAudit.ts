/**
 * Security section — fetches the homepage and inspects HTTPS posture,
 * security headers, Set-Cookie flags, and TLS certificate expiry.
 *
 * Wave 3.6 (2026-05-25). Uses Node's built-in `tls` module for the cert
 * peek (no new deps) + the shared fetchWithTimeout for the headers GET.
 */
import * as tls from "node:tls";
import { URL } from "node:url";
import type { SectionResult, SectionFinding } from "./types";
import { fetchWithTimeout } from "./httpUtil";

const fail = (summary: string): SectionResult => ({
  score: 0, status: "fail", summary, findings: [],
});

interface CertInfo {
  validTo: string | null;
  daysUntilExpiry: number | null;
  issuer: string | null;
}

async function peekCertificate(hostname: string): Promise<CertInfo> {
  return new Promise<CertInfo>((resolve) => {
    const socket = tls.connect({
      host: hostname,
      port: 443,
      servername: hostname,
      timeout: 8000,
      rejectUnauthorized: false, // we want to inspect even invalid certs
    }, () => {
      try {
        const cert = socket.getPeerCertificate();
        const validTo = cert?.valid_to || null;
        let daysUntilExpiry: number | null = null;
        if (validTo) {
          const ms = new Date(validTo).getTime() - Date.now();
          daysUntilExpiry = Math.floor(ms / (1000 * 60 * 60 * 24));
        }
        const issuer = cert?.issuer?.O || cert?.issuer?.CN || null;
        socket.end();
        resolve({ validTo, daysUntilExpiry, issuer });
      } catch {
        socket.end();
        resolve({ validTo: null, daysUntilExpiry: null, issuer: null });
      }
    });
    socket.on("error", () => resolve({ validTo: null, daysUntilExpiry: null, issuer: null }));
    socket.on("timeout", () => { try { socket.destroy(); } catch {/* noop */} resolve({ validTo: null, daysUntilExpiry: null, issuer: null }); });
  });
}

export async function runSecurityAudit(websiteUrl: string): Promise<SectionResult> {
  let url: URL;
  try { url = new URL(websiteUrl); } catch { return fail("Security audit unavailable — invalid URL."); }

  const findings: SectionFinding[] = [];
  let score = 100;

  // 1. HTTPS — if the canonical site URL isn't https://, that's a P0.
  if (url.protocol !== "https:") {
    findings.push({
      severity: "critical",
      title: "Site is not served over HTTPS",
      description: "Browsers flag http:// pages as \"Not secure\" and Google ranks them lower.",
      suggestedFix: "Install a TLS certificate (Let's Encrypt is free) and force https:// in your web server config.",
    });
    score -= 35;
  }

  // 2. Headers (GET the homepage and read response.headers)
  const r = await fetchWithTimeout(websiteUrl, { method: "GET", timeoutMs: 12_000 });
  if (!r) {
    return fail("Security audit unavailable — homepage didn't respond.");
  }
  const h = r.headers;
  const get = (k: string) => h.get(k) || h.get(k.toLowerCase()) || null;

  const hsts = get("strict-transport-security");
  if (!hsts) {
    findings.push({
      severity: "warning",
      title: "Missing Strict-Transport-Security (HSTS) header",
      description: "Without HSTS the browser can still be downgraded to http on the first visit.",
      suggestedFix: "Send `Strict-Transport-Security: max-age=31536000; includeSubDomains` from your web server.",
    });
    score -= 10;
  }

  const csp = get("content-security-policy");
  if (!csp) {
    findings.push({
      severity: "warning",
      title: "No Content-Security-Policy header",
      description: "CSP is the modern defence against XSS. Without it any injected <script> tag runs.",
      suggestedFix: "Start with `Content-Security-Policy: default-src 'self'` and loosen as needed for your CDN/embeds.",
    });
    score -= 10;
  }

  const xfo = get("x-frame-options");
  const cspFrameAncestors = csp && /frame-ancestors/i.test(csp);
  if (!xfo && !cspFrameAncestors) {
    findings.push({
      severity: "warning",
      title: "Missing X-Frame-Options (clickjacking protection)",
      description: "Without X-Frame-Options or CSP frame-ancestors, an attacker can embed your site in an invisible iframe and trick users into clicking hidden buttons.",
      suggestedFix: "Send `X-Frame-Options: SAMEORIGIN` (or set `frame-ancestors 'self'` in your CSP).",
    });
    score -= 8;
  }

  const xcto = get("x-content-type-options");
  if (!xcto || !/nosniff/i.test(xcto)) {
    findings.push({
      severity: "info",
      title: "Missing X-Content-Type-Options: nosniff",
      description: "Without nosniff the browser may guess MIME types and execute resources as scripts.",
      suggestedFix: "Send `X-Content-Type-Options: nosniff`.",
    });
    score -= 4;
  }

  // 3. Cookie flags — if the server sets any cookies, check Secure + HttpOnly.
  const setCookie = h.get("set-cookie");
  if (setCookie) {
    const cookies = setCookie.split(/,(?=\s*\w+=)/); // crude split — good enough for flag-check
    let insecure = 0;
    let noHttpOnly = 0;
    for (const c of cookies) {
      if (!/;\s*Secure/i.test(c)) insecure++;
      if (!/;\s*HttpOnly/i.test(c)) noHttpOnly++;
    }
    if (insecure > 0) {
      findings.push({
        severity: "warning",
        title: `${insecure} cookie${insecure === 1 ? "" : "s"} missing Secure flag`,
        description: "Cookies without Secure can be sent over http and intercepted on shared networks.",
        suggestedFix: "Add the `Secure` attribute to every Set-Cookie header.",
      });
      score -= 5;
    }
    if (noHttpOnly > 0) {
      findings.push({
        severity: "info",
        title: `${noHttpOnly} cookie${noHttpOnly === 1 ? "" : "s"} missing HttpOnly flag`,
        description: "HttpOnly prevents JavaScript from reading the cookie — important for session cookies.",
        suggestedFix: "Add the `HttpOnly` attribute to session / auth cookies.",
      });
      score -= 3;
    }
  }

  // 4. Cert expiry
  let cert: CertInfo = { validTo: null, daysUntilExpiry: null, issuer: null };
  if (url.protocol === "https:") {
    cert = await peekCertificate(url.hostname);
    if (cert.daysUntilExpiry != null && cert.daysUntilExpiry < 30) {
      findings.push({
        severity: cert.daysUntilExpiry < 7 ? "critical" : "warning",
        title: `TLS certificate expires in ${cert.daysUntilExpiry} day${cert.daysUntilExpiry === 1 ? "" : "s"}`,
        description: "Expired certificates make the browser block the site entirely.",
        suggestedFix: "Renew via Let's Encrypt (`certbot renew`) or your CA before expiry.",
      });
      score -= cert.daysUntilExpiry < 7 ? 20 : 8;
    }
  }

  score = Math.max(0, Math.min(100, score));
  const status: SectionResult["status"] = score >= 85 ? "pass" : score >= 60 ? "warning" : "fail";

  return {
    score,
    status,
    summary: `Security score ${score}/100. ${findings.length} issue${findings.length === 1 ? "" : "s"} flagged across HTTPS, headers, cookies, and TLS.`,
    findings,
    rawData: {
      protocol: url.protocol,
      hasHsts: !!hsts,
      hasCsp: !!csp,
      hasXFrameOptions: !!xfo,
      hasNosniff: !!xcto && /nosniff/i.test(xcto),
      certDaysUntilExpiry: cert.daysUntilExpiry,
      certIssuer: cert.issuer,
    },
  };
}
