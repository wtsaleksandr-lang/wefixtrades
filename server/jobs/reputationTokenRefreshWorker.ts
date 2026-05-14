/**
 * Proactive Google OAuth token refresh for ReputationShield clients.
 *
 * The existing `getGoogleAccessToken()` already refreshes on-demand when
 * a call detects an expired token — but that means the first request
 * after expiry can fail (and customers don't see useful errors on the
 * background sync). This worker runs daily, finds connections with a
 * token expiring inside the next 24 hours, and triggers a refresh ahead
 * of time. A failed refresh marks the connection `expired` so the
 * portal nudges the customer to reconnect.
 *
 * Wired into scheduler.ts via the standard cron pattern.
 */

import { storage } from "../storage";
import { getGoogleAccessToken } from "../services/socialSync/googleBusinessService";
import { createLogger } from "../lib/logger";
import { notifyTokenRefreshFailure, notifyTokenExpiringSoon } from "../services/reputation/reputationAlerts";

const log = createLogger("ReputationTokenRefresh");

const REFRESH_HORIZON_MS = 24 * 60 * 60 * 1000; // refresh tokens expiring within 24h
const ALERT_HORIZON_MS = 7 * 24 * 60 * 60 * 1000; // alert when token has <7d left and no refresh token

export interface RefreshResult {
  checked: number;
  refreshed: number;
  failed: number;
  alerted: number;
}

export async function runReputationTokenRefresh(): Promise<RefreshResult> {
  const result: RefreshResult = { checked: 0, refreshed: 0, failed: 0, alerted: 0 };

  // Find clients with an active ReputationShield service + a Google connection
  // expiring soon. We piggy-back on existing storage helpers rather than a
  // bespoke query — adds one extra in-memory filter step but keeps schema
  // touchpoints minimal.
  const clients = await storage.listClientsForReviewSync(500);
  const now = Date.now();

  for (const client of clients) {
    try {
      const connections = await storage.listSocialSyncConnections(client.id);
      const gbp = connections.find((c: any) => c.platform === "google_business" && c.connection_status === "connected");
      if (!gbp) continue;
      result.checked++;

      const expiresAt = gbp.token_expires_at ? new Date(gbp.token_expires_at).getTime() : 0;
      if (!expiresAt) continue;

      // <7d remaining, no refresh token = customer must reconnect. Alert once
      // (fireAlert dedupes 1h on category+title).
      const metadata = (gbp.metadata as any) || {};
      if (expiresAt - now < ALERT_HORIZON_MS && !metadata.refresh_token_ref) {
        await notifyTokenExpiringSoon({
          clientId: client.id,
          businessName: client.business_name || `Client #${client.id}`,
          expiresAt: new Date(expiresAt),
        });
        result.alerted++;
        continue;
      }

      // Expiring inside 24h → trigger a refresh via the existing on-demand path.
      // getGoogleAccessToken handles encryption + storage update + state flip
      // on failure; we just consume the side effect.
      if (expiresAt - now < REFRESH_HORIZON_MS) {
        const token = await getGoogleAccessToken(client.id);
        if (token) {
          result.refreshed++;
          log.info(`Refreshed Google token for client ${client.id} (${client.business_name})`);
        } else {
          result.failed++;
          await notifyTokenRefreshFailure({
            clientId: client.id,
            businessName: client.business_name || `Client #${client.id}`,
            error: "Refresh returned null — connection marked expired",
          });
        }
      }
    } catch (err: any) {
      result.failed++;
      log.error(`Token refresh error for client ${client.id}: ${err.message}`);
    }
  }

  if (result.refreshed > 0 || result.failed > 0 || result.alerted > 0) {
    log.info(`Refresh sweep complete — checked=${result.checked} refreshed=${result.refreshed} failed=${result.failed} alerted=${result.alerted}`);
  }
  return result;
}
