/**
 * QuoteQuick hosted-link wildcard proxy
 * ----------------------------------------------------------------------
 * Cloudflare Worker that fronts `*.your-quote.net` (the QuoteQuick hosted
 * calculator domain) and proxies every request to the Replit deployment.
 *
 * Why this exists: Replit custom domains cannot contain a `*`, so a
 * wildcard subdomain (`joes-plumbing.your-quote.net`) cannot be added to
 * the deployment directly. Cloudflare answers DNS for the wildcard
 * (`* CNAME wefixtrades.replit.app`, proxied) and this Worker runs on the
 * `*.your-quote.net/*` route. It rewrites the `Host` header to the value
 * Replit's edge recognises so the request is routed to the app, while the
 * browser URL stays on the customer's `*.your-quote.net` subdomain.
 *
 * The QuoteQuick client resolves the calculator slug from
 * `window.location.hostname` via `slugFromHost()` — that only works when
 * the build is compiled with `VITE_QQ_HOSTING_DOMAIN=your-quote.net`.
 *
 * Account: loadmode (653c7ef13d4439532fb4a1a78b0555ad)
 * Zone:    your-quote.net (61353d3cacd20dda1174a99616864f9b)
 * Route:   *.your-quote.net/*
 */
addEventListener('fetch', (event) => {
  event.respondWith(handleRequest(event.request));
});

const ORIGIN = 'wefixtrades.replit.app';

async function handleRequest(request) {
  const incomingHost = new URL(request.url).hostname;

  const target = new URL(request.url);
  target.hostname = ORIGIN;
  target.port = '';

  const headers = new Headers(request.headers);
  headers.set('Host', ORIGIN);
  headers.set('X-Forwarded-Host', incomingHost);
  headers.set('X-Forwarded-Proto', 'https');

  return fetch(
    new Request(target.toString(), {
      method: request.method,
      headers,
      body: request.body,
      redirect: 'manual',
    }),
  );
}
