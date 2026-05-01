/**
 * SocialSync connection lifecycle management.
 *
 * Handles:
 * - Token expiry inspection and status transitions
 * - Disconnect flow (safe token clearing)
 * - Background expiry checks
 *
 * Status lifecycle:
 *   not_connected → connected → expiring_soon → expired
 *                             → error
 *                             → disconnected
 *
 * Meta long-lived tokens last ~60 days. "expiring_soon" is flagged
 * when a token has ≤7 days remaining. Real token refresh is NOT
 * implemented — Meta's token exchange requires the original short-lived
 * token or a fresh OAuth flow. Reconnection is the supported path.
 */
import { storage } from "../../storage";
import { sendMetaReauthEmail } from "../../lib/metaReauthEmail";
import { createLogger } from "../../lib/logger";
import { fireAlert } from "../alertService";

const log = createLogger("ConnectionLifecycle");

/** Tokens expiring within this window are flagged as "expiring_soon". */
const EXPIRY_WARNING_DAYS = 7;

/* ─── Disconnect ─── */

/**
 * Disconnect a platform connection for a client.
 * Clears token and sensitive references, preserves audit metadata.
 */
export async function disconnectPlatform(
  clientId: number,
  platform: string,
): Promise<{ ok: boolean; error?: string }> {
  const connections = await storage.listSocialSyncConnections(clientId);
  const conn = connections.find(c => c.platform === platform);

  if (!conn) {
    return { ok: false, error: `No ${platform} connection found` };
  }

  if (conn.connection_status === "disconnected" || conn.connection_status === "not_connected") {
    return { ok: true }; // Already disconnected
  }

  const previousMetadata = (conn.metadata as any) || {};

  await storage.upsertSocialSyncConnection({
    client_id: clientId,
    platform,
    connection_status: "disconnected",
    external_account_id: conn.external_account_id, // Preserve for audit
    external_page_id: null,                         // Clear selected target
    token_ref: null,                                // Clear token
    token_expires_at: null,                         // Clear expiry
    last_validated_at: conn.last_validated_at,       // Preserve for audit
    metadata: {
      disconnected_at: new Date().toISOString(),
      previous_status: conn.connection_status,
      previous_account_id: conn.external_account_id,
      previous_page_id: conn.external_page_id,
      user_name: previousMetadata.user_name || null,
    },
  } as any);

  // If disconnecting Facebook, also disconnect Instagram (it depends on FB)
  if (platform === "facebook") {
    const igConn = connections.find(c => c.platform === "instagram");
    if (igConn && igConn.connection_status !== "disconnected" && igConn.connection_status !== "not_connected") {
      await disconnectPlatform(clientId, "instagram");

      await storage.createSocialSyncLog({
        client_id: clientId,
        entity_type: "connection",
        entity_id: igConn.id,
        action: "instagram.auto_disconnected",
        status: "info",
        details: { reason: "Parent Facebook connection disconnected" },
      });
    }
  }

  await storage.createSocialSyncLog({
    client_id: clientId,
    entity_type: "connection",
    entity_id: conn.id,
    action: `${platform}.disconnected`,
    status: "success",
    details: { previous_status: conn.connection_status },
  });

  return { ok: true };
}

/* ─── Expiry Inspection ─── */

export interface ConnectionHealthStatus {
  platform: string;
  client_id: number;
  status: string;
  days_until_expiry: number | null;
  needs_attention: boolean;
  action_required: string | null;
}

/**
 * Inspect a single connection's health.
 */
export function inspectConnectionHealth(conn: {
  platform: string;
  client_id: number;
  connection_status: string;
  token_expires_at: Date | null;
  token_ref: string | null;
}): ConnectionHealthStatus {
  const now = Date.now();

  // No token stored
  if (!conn.token_ref) {
    return {
      platform: conn.platform,
      client_id: conn.client_id,
      status: conn.connection_status,
      days_until_expiry: null,
      needs_attention: conn.connection_status === "connected",
      action_required: conn.connection_status === "connected" ? "Token reference is missing — reconnect required" : null,
    };
  }

  // No expiry tracked
  if (!conn.token_expires_at) {
    return {
      platform: conn.platform,
      client_id: conn.client_id,
      status: conn.connection_status,
      days_until_expiry: null,
      needs_attention: false,
      action_required: null,
    };
  }

  const expiryMs = new Date(conn.token_expires_at).getTime();
  const msRemaining = expiryMs - now;
  const daysRemaining = Math.floor(msRemaining / (1000 * 60 * 60 * 24));

  if (msRemaining <= 0) {
    return {
      platform: conn.platform,
      client_id: conn.client_id,
      status: "expired",
      days_until_expiry: 0,
      needs_attention: true,
      action_required: "Token has expired — reconnect required",
    };
  }

  if (daysRemaining <= EXPIRY_WARNING_DAYS) {
    return {
      platform: conn.platform,
      client_id: conn.client_id,
      status: "expiring_soon",
      days_until_expiry: daysRemaining,
      needs_attention: true,
      action_required: `Token expires in ${daysRemaining} day(s) — reconnect soon`,
    };
  }

  return {
    platform: conn.platform,
    client_id: conn.client_id,
    status: "connected",
    days_until_expiry: daysRemaining,
    needs_attention: false,
    action_required: null,
  };
}

/* ─── Background Expiry Check ─── */

export interface ExpiryCheckResult {
  checked: number;
  expired: number;
  expiring_soon: number;
  errors: string[];
}

/**
 * Scan all active connections and update statuses for expired/expiring tokens.
 * Designed to be called by the scheduler on a daily basis.
 */
export async function checkConnectionExpiry(): Promise<ExpiryCheckResult> {
  const result: ExpiryCheckResult = { checked: 0, expired: 0, expiring_soon: 0, errors: [] };

  const connections = await storage.listAllSocialSyncConnections();
  result.checked = connections.length;

  for (const conn of connections) {
    try {
      const health = inspectConnectionHealth(conn);

      if (health.status === "expired" && conn.connection_status !== "expired") {
        await storage.upsertSocialSyncConnection({
          ...conn,
          connection_status: "expired",
          metadata: {
            ...(conn.metadata as any || {}),
            expired_at: new Date().toISOString(),
            auto_marked_by: "expiry_check_job",
          },
        } as any);

        await storage.createSocialSyncLog({
          client_id: conn.client_id,
          entity_type: "connection",
          entity_id: conn.id,
          action: `${conn.platform}.token_expired`,
          status: "failure",
          details: { token_expires_at: conn.token_expires_at },
        });

        // Send re-auth email to admin
        await sendReauthEmailForConnection(conn, 0);
        fireAlert({ severity: "warning", category: "oauth_expiry", title: `${conn.platform} token expired for client #${conn.client_id}`, details: `Token expired. Reconnection required.`, metadata: { client_id: conn.client_id, platform: conn.platform } }).catch(() => {});

        result.expired++;
      } else if (health.status === "expiring_soon" && conn.connection_status === "connected") {
        await storage.upsertSocialSyncConnection({
          ...conn,
          connection_status: "expiring_soon",
          metadata: {
            ...(conn.metadata as any || {}),
            expiry_warning_at: new Date().toISOString(),
            days_remaining: health.days_until_expiry,
          },
        } as any);

        await storage.createSocialSyncLog({
          client_id: conn.client_id,
          entity_type: "connection",
          entity_id: conn.id,
          action: `${conn.platform}.expiring_soon`,
          status: "info",
          details: { days_remaining: health.days_until_expiry, token_expires_at: conn.token_expires_at },
        });

        // Send re-auth email to admin
        await sendReauthEmailForConnection(conn, health.days_until_expiry ?? 0);
        fireAlert({ severity: "info", category: "oauth_expiry", title: `${conn.platform} token expiring soon for client #${conn.client_id}`, details: `Token expires in ${health.days_until_expiry} day(s).`, metadata: { client_id: conn.client_id, platform: conn.platform } }).catch(() => {});

        result.expiring_soon++;
      }
    } catch (err: any) {
      result.errors.push(`Connection ${conn.id} (${conn.platform}): ${err.message}`);
    }
  }

  return result;
}

/* ─── Re-auth Email Helper ─── */

/**
 * Look up the client's business name and send a re-auth reminder email
 * to the configured admin/alert email. Fail-safe: errors are logged
 * but never thrown so the expiry-check worker keeps running.
 */
async function sendReauthEmailForConnection(
  conn: { client_id: number; platform: string; token_expires_at: Date | null },
  daysUntilExpiry: number,
): Promise<void> {
  try {
    const recipientEmail =
      process.env.SOCIALSYNC_ALERT_EMAIL ||
      process.env.ADMIN_EMAIL ||
      null;

    if (!recipientEmail) {
      log.debug("No SOCIALSYNC_ALERT_EMAIL or ADMIN_EMAIL configured — skipping re-auth email");
      return;
    }

    const client = await storage.getClientById(conn.client_id);
    const businessName = client?.business_name || `Client #${conn.client_id}`;

    const platformLabel =
      conn.platform === "facebook" ? "Facebook"
        : conn.platform === "instagram" ? "Instagram"
          : conn.platform;

    await sendMetaReauthEmail({
      recipientEmail,
      businessName,
      platform: platformLabel,
      daysUntilExpiry,
      expiresAt: conn.token_expires_at?.toISOString() || new Date().toISOString(),
      clientId: conn.client_id,
    });
  } catch (err: any) {
    log.error("Failed to send re-auth email", {
      clientId: String(conn.client_id),
      platform: conn.platform,
      error: err.message,
    });
  }
}
