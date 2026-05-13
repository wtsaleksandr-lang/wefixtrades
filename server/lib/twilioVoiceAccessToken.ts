/**
 * Twilio Voice SDK access-token minting.
 *
 * Issues a short-lived JWT that the mobile app uses to authenticate
 * with the Twilio Voice SDK. The token grants the app the ability to:
 *   - Receive inbound calls bound to its identity (e.g., user_42)
 *   - Place outbound calls via the configured TwiML Application SID
 *
 * Requires three env vars:
 *   TWILIO_ACCOUNT_SID    your AC… account
 *   TWILIO_API_KEY        SK… (NOT auth token — separate API key SID)
 *   TWILIO_API_KEY_SECRET secret half of the API Key, only shown once at creation
 *   TWILIO_APP_SID        AP… TwiML Application SID for outbound call routing
 *
 * If any are missing the token-issue route returns 503 — the rest of
 * the server boots fine.
 */

import twilioPkg from "twilio";
import { createLogger } from "./logger";

const log = createLogger("TwilioVoice");

const ACCESS_TOKEN_TTL_SEC = 60 * 60; // 1 hour

export interface VoiceAccessTokenConfig {
  accountSid: string;
  apiKey: string;
  apiKeySecret: string;
  appSid: string;
}

export function getVoiceConfig(): VoiceAccessTokenConfig | null {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const apiKey = process.env.TWILIO_API_KEY;
  const apiKeySecret = process.env.TWILIO_API_KEY_SECRET;
  const appSid = process.env.TWILIO_APP_SID;
  if (!accountSid || !apiKey || !apiKeySecret || !appSid) return null;
  return { accountSid, apiKey, apiKeySecret, appSid };
}

export function voiceConfigMissingKeys(): string[] {
  const missing: string[] = [];
  if (!process.env.TWILIO_ACCOUNT_SID) missing.push("TWILIO_ACCOUNT_SID");
  if (!process.env.TWILIO_API_KEY) missing.push("TWILIO_API_KEY");
  if (!process.env.TWILIO_API_KEY_SECRET) missing.push("TWILIO_API_KEY_SECRET");
  if (!process.env.TWILIO_APP_SID) missing.push("TWILIO_APP_SID");
  return missing;
}

export interface AccessTokenResult {
  token: string;
  identity: string;
  expiresAt: string;
  ttlSeconds: number;
}

/**
 * Mint a Voice access token for a user identity.
 *
 * @param userId          WeFixTrades user id — used to build identity
 * @param pushCredentialSid (optional) Twilio Push Credential SID for the device's platform
 */
export function mintAccessToken(args: {
  userId: number;
  pushCredentialSid?: string;
}): AccessTokenResult {
  const cfg = getVoiceConfig();
  if (!cfg) {
    throw new Error(`Twilio Voice access-token config missing: ${voiceConfigMissingKeys().join(", ")}`);
  }

  const identity = `user_${args.userId}`;
  const AccessToken = (twilioPkg as any).jwt.AccessToken;
  const VoiceGrant = AccessToken.VoiceGrant;

  const token = new AccessToken(cfg.accountSid, cfg.apiKey, cfg.apiKeySecret, {
    identity,
    ttl: ACCESS_TOKEN_TTL_SEC,
  });

  const grant = new VoiceGrant({
    outgoingApplicationSid: cfg.appSid,
    incomingAllow: true,
    ...(args.pushCredentialSid && { pushCredentialSid: args.pushCredentialSid }),
  });
  token.addGrant(grant);

  const expiresAt = new Date(Date.now() + ACCESS_TOKEN_TTL_SEC * 1000);
  log.debug("Voice token issued", { identity, expiresAt: expiresAt.toISOString() });

  return {
    token: token.toJwt(),
    identity,
    expiresAt: expiresAt.toISOString(),
    ttlSeconds: ACCESS_TOKEN_TTL_SEC,
  };
}
