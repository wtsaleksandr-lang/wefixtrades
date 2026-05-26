/* WeFixTrades service worker — Wave 32.
 *
 * Lightweight worker. Sole purpose right now is to receive Web Push
 * messages dispatched by `server/services/notifications/dispatch.ts`
 * and surface them as native browser notifications. The worker does
 * NOT cache assets or intercept fetches — that's intentional to avoid
 * any interaction with the existing Vite/React build's caching strategy.
 *
 * Push payload contract (must match server/services/notifications/webPush.ts):
 *   { title: string, body: string, url?: string, severity?: "info"|"warning"|"critical" }
 */

self.addEventListener("install", (event) => {
  // Activate immediately so the worker is ready for the very first
  // subscription after registration.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  if (!event.data) return;
  let payload;
  try {
    payload = event.data.json();
  } catch (_err) {
    payload = { title: "WeFixTrades", body: event.data.text() };
  }

  const title = payload.title || "WeFixTrades";
  const body = payload.body || "";
  const url = payload.url || "/portal/dashboard";
  const severity = payload.severity || "info";

  const options = {
    body,
    icon: "/favicon.png",
    badge: "/favicon.png",
    tag: payload.tag || undefined,
    requireInteraction: severity === "critical",
    data: { url },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) ||
    "/portal/dashboard";
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((windowClients) => {
        // Focus an existing tab if one matches.
        for (const client of windowClients) {
          if (client.url.includes(url) && "focus" in client) {
            return client.focus();
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow(url);
        }
        return null;
      }),
  );
});
