/**
 * ReputationShield-specific alert wrappers around the platform-wide
 * `fireAlert()` helper. Same Slack/email/DB pipeline as everything else;
 * just gives reputation events a consistent category prefix
 * (`reputationshield_*`) so the Slack channel can filter them and so
 * the systemAlerts dashboard groups them.
 *
 * fireAlert already dedupes (category + title) for 1 hour — that's
 * usually fine for noisy upstream issues (Google API outage = one ping
 * per hour, not one per failed sync). Pass distinct titles per client
 * if per-client granularity is needed.
 */

import { fireAlert } from "../alertService";

export async function notifyReviewSyncFailure(input: {
  clientId: number;
  businessName: string;
  platform: string;
  error: string;
}): Promise<void> {
  await fireAlert({
    severity: "warning",
    category: "reputationshield_sync_failure",
    title: `Review sync failed for ${input.businessName}`,
    details: `Platform: ${input.platform}\nClient: ${input.businessName} (#${input.clientId})\nError: ${input.error}`,
    metadata: { clientId: input.clientId, platform: input.platform, error: input.error },
  });
}

export async function notifyReplyPostFailure(input: {
  clientId: number;
  businessName: string;
  reviewId: number;
  error: string;
  retryable: boolean;
}): Promise<void> {
  await fireAlert({
    severity: input.retryable ? "warning" : "critical",
    category: "reputationshield_post_failure",
    title: `Google reply post failed for ${input.businessName}`,
    details:
      `Client: ${input.businessName} (#${input.clientId})\n` +
      `Review: #${input.reviewId}\n` +
      `Error: ${input.error}\n` +
      `${input.retryable ? "Queued for retry." : "Manual intervention required."}`,
    metadata: { clientId: input.clientId, reviewId: input.reviewId, retryable: input.retryable, error: input.error },
  });
}

export async function notifyTokenRefreshFailure(input: {
  clientId: number;
  businessName: string;
  error: string;
}): Promise<void> {
  await fireAlert({
    severity: "warning",
    category: "reputationshield_token_refresh_failure",
    title: `Google OAuth token refresh failed for ${input.businessName}`,
    details:
      `Client: ${input.businessName} (#${input.clientId})\n` +
      `Error: ${input.error}\n` +
      `Customer needs to reconnect Google Business Profile via portal.`,
    metadata: { clientId: input.clientId, error: input.error },
  });
}

export async function notifyTokenExpiringSoon(input: {
  clientId: number;
  businessName: string;
  expiresAt: Date;
}): Promise<void> {
  await fireAlert({
    severity: "info",
    category: "reputationshield_token_expiring",
    title: `Google token expiring soon for ${input.businessName}`,
    details:
      `Client: ${input.businessName} (#${input.clientId})\n` +
      `Token expires at: ${input.expiresAt.toISOString()}`,
    metadata: { clientId: input.clientId, expires_at: input.expiresAt.toISOString() },
  });
}
