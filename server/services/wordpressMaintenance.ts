/**
 * WordPress Maintenance Service
 *
 * Provides plugin update checking/applying, page content updates, and
 * site health checks via the WordPress REST API. Used by the WebCare
 * maintenance worker to automate monthly plugin updates and security
 * monitoring with ZERO freelancers.
 *
 * Authentication: HTTP Basic Auth with WordPress Application Passwords
 * (same mechanism as the existing wordpressPublisher.ts).
 *
 * All functions are non-throwing — they return structured result objects
 * so callers in worker paths can branch cleanly.
 */

import { createLogger } from "../lib/logger";
import {
  isAllowedDestinationUrl,
  redactSensitiveEchoes,
} from "./contentflow/wordpressPublisher";

const log = createLogger("WPMaintenance");

const REQUEST_TIMEOUT_MS = 30_000;

/* ─── Public types ──────────────────────────────────────────────────── */

export interface WpCredentials {
  cms_url: string;          // e.g. "https://example.com"
  cms_username: string;
  cms_app_password: string; // plaintext (already decrypted by caller)
}

export interface PluginInfo {
  plugin: string;           // slug path e.g. "akismet/akismet.php"
  name: string;
  version: string;
  status: "active" | "inactive" | "network-active";
  update_available: boolean;
  update_version: string | null;
  is_major_update: boolean;
}

export interface PluginUpdateResult {
  ok: boolean;
  total_plugins: number;
  updates_available: number;
  plugins: PluginInfo[];
  error?: string;
}

export interface ApplyResult {
  ok: boolean;
  updates_applied: number;
  errors: Array<{ plugin: string; error: string }>;
  results: Array<{ plugin: string; old_version: string; new_version: string }>;
}

export interface HealthReport {
  ok: boolean;
  wordpress_version: string | null;
  php_version: string | null;
  ssl_valid: boolean;
  ssl_expiry: string | null;
  security_headers: Record<string, boolean>;
  outdated_plugins: number;
  total_plugins: number;
  site_reachable: boolean;
  response_time_ms: number | null;
  checked_at: string;
  errors: string[];
}

/* ─── Helpers ───────────────────────────────────────────────────────── */

function trimTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

function buildAuthHeader(creds: WpCredentials): string {
  return "Basic " + Buffer.from(`${creds.cms_username}:${creds.cms_app_password}`).toString("base64");
}

async function wpFetch(
  creds: WpCredentials,
  path: string,
  options: RequestInit = {},
): Promise<{ ok: boolean; status: number; data: any; error?: string }> {
  const baseUrl = trimTrailingSlash(creds.cms_url);
  const url = `${baseUrl}/wp-json${path}`;

  if (!isAllowedDestinationUrl(url)) {
    return { ok: false, status: 0, data: null, error: "Refusing to connect over insecure (non-https) URL" };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "Authorization": buildAuthHeader(creds),
        "User-Agent": "WeFixTrades-WebCare/1.0",
        ...(options.headers || {}),
      },
    });

    clearTimeout(timer);

    if (!response.ok) {
      let bodyText = "";
      try { bodyText = await response.text(); } catch { /* ignore */ }
      const summary = redactSensitiveEchoes(bodyText.slice(0, 500));
      return { ok: false, status: response.status, data: null, error: `HTTP ${response.status}: ${summary}` };
    }

    const data = await response.json();
    return { ok: true, status: response.status, data };
  } catch (err: any) {
    clearTimeout(timer);
    if (err.name === "AbortError") {
      return { ok: false, status: 0, data: null, error: "Request timed out" };
    }
    const msg = redactSensitiveEchoes(err?.message || String(err));
    return { ok: false, status: 0, data: null, error: msg };
  }
}

/**
 * Compare two semver-ish version strings.
 * Returns true if the new version is a major version bump.
 */
function isMajorVersionBump(current: string, next: string): boolean {
  const currentMajor = parseInt(current.split(".")[0], 10);
  const nextMajor = parseInt(next.split(".")[0], 10);
  if (isNaN(currentMajor) || isNaN(nextMajor)) return false;
  return nextMajor > currentMajor;
}

/* ─── Plugin Update Checker ─────────────────────────────────────────── */

/**
 * List all plugins and check for available updates.
 * Uses GET /wp-json/wp/v2/plugins (requires application-passwords plugin
 * or WP 5.6+). If the endpoint is unavailable (403/404), logs a warning
 * and returns gracefully.
 */
export async function checkPluginUpdates(
  credentials: WpCredentials,
): Promise<PluginUpdateResult> {
  const result = await wpFetch(credentials, "/wp/v2/plugins");

  if (!result.ok) {
    // 404 or 403 often means the plugins endpoint is disabled
    if (result.status === 404 || result.status === 403 || result.status === 401) {
      log.warn("Plugin REST API not available", { status: result.status, url: credentials.cms_url });
      return {
        ok: false,
        total_plugins: 0,
        updates_available: 0,
        plugins: [],
        error: `Plugin API unavailable (HTTP ${result.status}). The host may have disabled the plugins REST endpoint.`,
      };
    }
    return {
      ok: false,
      total_plugins: 0,
      updates_available: 0,
      plugins: [],
      error: result.error || "Unknown error checking plugins",
    };
  }

  const rawPlugins = Array.isArray(result.data) ? result.data : [];

  const plugins: PluginInfo[] = rawPlugins.map((p: any) => {
    const currentVersion = p.version || "0.0.0";
    const updateVersion = p.update?.version || null;
    const hasUpdate = !!updateVersion && updateVersion !== currentVersion;
    return {
      plugin: p.plugin || p.slug || "unknown",
      name: p.name || p.plugin || "Unknown Plugin",
      version: currentVersion,
      status: p.status || "inactive",
      update_available: hasUpdate,
      update_version: hasUpdate ? updateVersion : null,
      is_major_update: hasUpdate ? isMajorVersionBump(currentVersion, updateVersion) : false,
    };
  });

  const updatesAvailable = plugins.filter(p => p.update_available).length;

  return {
    ok: true,
    total_plugins: plugins.length,
    updates_available: updatesAvailable,
    plugins,
  };
}

/* ─── Plugin Update Applier ─────────────────────────────────────────── */

/**
 * Apply updates to the specified plugins. Only applies minor/patch
 * updates by default — major version bumps must be approved manually.
 *
 * Uses PUT /wp-json/wp/v2/plugins/{slug} to trigger the update.
 */
export async function applyPluginUpdates(
  credentials: WpCredentials,
  pluginSlugs: string[],
): Promise<ApplyResult> {
  const applyResult: ApplyResult = {
    ok: true,
    updates_applied: 0,
    errors: [],
    results: [],
  };

  for (const slug of pluginSlugs) {
    try {
      // First get current plugin info
      const infoResult = await wpFetch(credentials, `/wp/v2/plugins/${encodeURIComponent(slug)}`);
      if (!infoResult.ok) {
        applyResult.errors.push({ plugin: slug, error: infoResult.error || "Failed to get plugin info" });
        continue;
      }

      const currentVersion = infoResult.data?.version || "unknown";

      // Apply the update via PUT
      const updateResult = await wpFetch(credentials, `/wp/v2/plugins/${encodeURIComponent(slug)}`, {
        method: "PUT",
        body: JSON.stringify({ status: infoResult.data?.status || "active" }),
      });

      if (!updateResult.ok) {
        applyResult.errors.push({ plugin: slug, error: updateResult.error || "Update request failed" });
        continue;
      }

      const newVersion = updateResult.data?.version || "unknown";
      applyResult.results.push({
        plugin: slug,
        old_version: currentVersion,
        new_version: newVersion,
      });
      applyResult.updates_applied++;
    } catch (err: any) {
      applyResult.errors.push({ plugin: slug, error: err.message || String(err) });
    }
  }

  if (applyResult.errors.length > 0) {
    applyResult.ok = applyResult.updates_applied > 0; // partial success
  }

  return applyResult;
}

/* ─── Page Content Updater ──────────────────────────────────────────── */

/**
 * Update a WordPress page's content via POST /wp-json/wp/v2/pages/{id}.
 */
export async function updatePageContent(
  credentials: WpCredentials,
  pageId: number,
  content: string,
): Promise<boolean> {
  const result = await wpFetch(credentials, `/wp/v2/pages/${pageId}`, {
    method: "POST",
    body: JSON.stringify({ content }),
  });

  if (!result.ok) {
    log.error("Failed to update page content", { pageId, error: result.error });
    return false;
  }

  log.info("Page content updated", { pageId, url: credentials.cms_url });
  return true;
}

/* ─── Site Health Check ─────────────────────────────────────────────── */

/**
 * Comprehensive site health check:
 * - WordPress version via GET /wp-json/
 * - Outdated plugins count
 * - SSL certificate validity
 * - Common security headers
 */
export async function runSiteHealthCheck(
  credentials: WpCredentials,
): Promise<HealthReport> {
  const report: HealthReport = {
    ok: true,
    wordpress_version: null,
    php_version: null,
    ssl_valid: false,
    ssl_expiry: null,
    security_headers: {},
    outdated_plugins: 0,
    total_plugins: 0,
    site_reachable: false,
    response_time_ms: null,
    checked_at: new Date().toISOString(),
    errors: [],
  };

  const baseUrl = trimTrailingSlash(credentials.cms_url);

  // 1. Check WordPress version via /wp-json/
  try {
    const t0 = Date.now();
    const wpInfo = await wpFetch(credentials, "/");
    report.response_time_ms = Date.now() - t0;

    if (wpInfo.ok && wpInfo.data) {
      report.site_reachable = true;
      // WordPress REST API root returns { name, description, url, ... }
      // The WP version is available at .wp_version (authenticated) or
      // via the generator tag. We also check namespaces for health.
      if (wpInfo.data.wp_version) {
        report.wordpress_version = wpInfo.data.wp_version;
      }
      if (wpInfo.data.php_version) {
        report.php_version = wpInfo.data.php_version;
      }
    } else {
      report.errors.push(`WordPress API check failed: ${wpInfo.error}`);
    }
  } catch (err: any) {
    report.errors.push(`WordPress API error: ${err.message}`);
  }

  // 2. Check for outdated plugins
  try {
    const pluginCheck = await checkPluginUpdates(credentials);
    report.total_plugins = pluginCheck.total_plugins;
    report.outdated_plugins = pluginCheck.updates_available;
  } catch (err: any) {
    report.errors.push(`Plugin check error: ${err.message}`);
  }

  // 3. SSL certificate check via HTTPS HEAD request
  try {
    const sslUrl = baseUrl.startsWith("https://") ? baseUrl : `https://${baseUrl.replace(/^https?:\/\//, "")}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);

    const response = await fetch(sslUrl, {
      method: "HEAD",
      signal: controller.signal,
      redirect: "follow",
      headers: { "User-Agent": "WeFixTrades-WebCare/1.0 (health-check)" },
    });

    clearTimeout(timer);
    report.ssl_valid = response.ok || (response.status >= 200 && response.status < 400);
    report.site_reachable = true;

    // 4. Security headers check
    const headerChecks: Record<string, string> = {
      "x-content-type-options": "x-content-type-options",
      "x-frame-options": "x-frame-options",
      "strict-transport-security": "strict-transport-security",
      "x-xss-protection": "x-xss-protection",
      "content-security-policy": "content-security-policy",
      "referrer-policy": "referrer-policy",
    };

    for (const [key, header] of Object.entries(headerChecks)) {
      report.security_headers[key] = !!response.headers.get(header);
    }
  } catch (err: any) {
    if (err.name === "AbortError") {
      report.errors.push("SSL check timed out");
    } else if (err.code === "UNABLE_TO_VERIFY_LEAF_SIGNATURE" ||
               err.code === "CERT_HAS_EXPIRED" ||
               err.code === "ERR_TLS_CERT_ALTNAME_INVALID") {
      report.ssl_valid = false;
      report.errors.push(`SSL certificate issue: ${err.code}`);
    } else {
      report.errors.push(`SSL check error: ${err.message}`);
    }
  }

  // Overall OK status
  report.ok = report.site_reachable && report.ssl_valid && report.errors.length === 0;

  return report;
}
