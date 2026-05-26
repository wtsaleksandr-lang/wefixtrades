/**
 * Wave 32 — Web Push sender.
 *
 * Wraps the `web-push` npm package behind a dynamic import so the
 * dispatcher degrades gracefully when the dep or VAPID keys are absent
 * (build never breaks, runtime just skips web_push channel).
 *
 * VAPID keys are loaded from env at first use:
 *   - VAPID_PUBLIC_KEY  (base64url, prefix "B...")
 *   - VAPID_PRIVATE_KEY (base64url)
 *   - VAPID_CONTACT     (mailto:alerts@wefixtrades.com — fallback below)
 *
 * Alex action: generate keys once and paste into Doppler prd. The
 * `web-push` CLI prints these — run:
 *
 *     npx web-push generate-vapid-keys --json
 *
 * The PUBLIC key is also exposed to the browser via the
 * `/api/portal/notifications/vapid-public-key` endpoint so the service
 * worker can subscribe with the matching applicationServerKey.
 */

import { createLogger } from "../../lib/logger";

const log = createLogger("WebPush");

interface PushSubscriptionPayload {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

interface PushMessage {
  title: string;
  body: string;
  url?: string;
  severity?: "info" | "warning" | "critical";
}

let cachedClient: any | null = null;
let configFailed = false;

async function getClient(): Promise<any | null> {
  if (cachedClient) return cachedClient;
  if (configFailed) return null;

  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const contact = process.env.VAPID_CONTACT ?? "mailto:alerts@wefixtrades.com";

  if (!publicKey || !privateKey) {
    log.warn(
      "VAPID keys missing — web-push channel disabled. Set VAPID_PUBLIC_KEY + VAPID_PRIVATE_KEY in Doppler.",
    );
    configFailed = true;
    return null;
  }

  try {
    const mod: any = await import("web-push");
    const webpush = mod.default ?? mod;
    webpush.setVapidDetails(contact, publicKey, privateKey);
    cachedClient = webpush;
    return webpush;
  } catch (err: any) {
    log.warn(
      `web-push package not installed — web push disabled (${err?.message ?? err}). Add via npm i web-push.`,
    );
    configFailed = true;
    return null;
  }
}

/** Returns the VAPID public key suitable for browser subscription. */
export function getVapidPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY || null;
}

/**
 * Send a single web-push notification. Throws on failure so the
 * dispatcher can record per-endpoint failures.
 */
export async function sendWebPush(
  sub: PushSubscriptionPayload,
  message: PushMessage,
): Promise<void> {
  const webpush = await getClient();
  if (!webpush) {
    throw new Error("web_push_not_configured");
  }
  const payload = JSON.stringify({
    title: message.title,
    body: message.body,
    url: message.url ?? "/portal/dashboard",
    severity: message.severity ?? "info",
  });
  await webpush.sendNotification(
    { endpoint: sub.endpoint, keys: sub.keys },
    payload,
    {
      TTL: 60 * 60 * 24, // 24h delivery window
      urgency:
        message.severity === "critical"
          ? "high"
          : message.severity === "warning"
          ? "normal"
          : "low",
    },
  );
}
