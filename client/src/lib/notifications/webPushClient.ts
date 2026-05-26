/**
 * Wave 32 — Web Push subscription helper (browser side).
 *
 * Used by the unified notifications page when a customer clicks
 * "Enable browser notifications". Steps:
 *   1. Register `/sw.js` (the service worker that displays pushes).
 *   2. Call `subscribe()` on the PushManager with the VAPID public key.
 *   3. POST the subscription JSON to /api/portal/notifications/push/subscribe.
 *
 * Notes:
 *   - Never auto-subscribe — only call this in response to a user gesture
 *     (button click). Browsers reject permission prompts triggered without
 *     a user gesture, and the UX should be explicit anyway.
 *   - We only register the SW on demand, not at app startup, to avoid
 *     shipping a worker to users who aren't logged in.
 *   - Subscription endpoints contain no PII but are still scoped per-
 *     browser, so we never log them.
 */

import { apiRequest } from "@/lib/queryClient";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

async function ensureRegistration(): Promise<ServiceWorkerRegistration> {
  if (!("serviceWorker" in navigator)) {
    throw new Error("Service workers aren't supported in this browser.");
  }
  // Scope at root so push events can navigate the customer to any portal URL.
  const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  await navigator.serviceWorker.ready;
  return reg;
}

export async function subscribeToWebPush(vapidPublicKey: string): Promise<void> {
  if (!("Notification" in window)) {
    throw new Error("Notifications aren't supported in this browser.");
  }
  if (Notification.permission === "denied") {
    throw new Error(
      "Notifications are blocked for this site. Re-enable them in your browser settings.",
    );
  }
  const permission =
    Notification.permission === "granted"
      ? "granted"
      : await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error("Notification permission was denied.");
  }

  const reg = await ensureRegistration();
  const existing = await reg.pushManager.getSubscription();
  const sub =
    existing ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    }));

  const json = sub.toJSON() as {
    endpoint?: string;
    keys?: { p256dh?: string; auth?: string };
  };
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
    throw new Error("Subscription payload was incomplete.");
  }

  await apiRequest("POST", "/api/portal/notifications/push/subscribe", {
    endpoint: json.endpoint,
    keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
    userAgent: navigator.userAgent,
  });
}

export async function unsubscribeFromWebPush(): Promise<void> {
  if (!("serviceWorker" in navigator)) return;
  const reg = await navigator.serviceWorker.getRegistration("/");
  if (!reg) return;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;
  const endpoint = sub.endpoint;
  await sub.unsubscribe().catch(() => undefined);
  try {
    await apiRequest("POST", "/api/portal/notifications/push/unsubscribe", {
      endpoint,
    });
  } catch {
    /* swallow — local unsubscribe already succeeded */
  }
}
