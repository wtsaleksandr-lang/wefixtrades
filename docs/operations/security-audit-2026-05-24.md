# Security Audit — Auth + RBAC + Session + Secret hygiene

**Date:** 2026-05-24
**Scope:** `server/auth.ts`, `server/middleware/`, `server/routes/auth*Routes.ts`, all `/api/admin/*` + `/api/portal/*` route registrations, session/CSRF/CORS setup in `server/index.ts`, webhook signature verification (Stripe, Twilio, Vapi, SendGrid), secret hygiene across `client/` and `server/`.
**Method:** Read-only static analysis on `origin/main @ d4bc5bc8`. No dynamic testing. ~50 source files reviewed.
**Bottom line:** No P0s. One P1 fixed inline (timing-safe webhook secret compare). Auth, session, and webhook signing are in good shape. The biggest gap is the absence of account lockout + complexity on top of the 10/15-min IP rate limit — credential-stuffing risk that should be addressed before public launch.

---

## P0 — exploitable now

None found.

Notable strong points encountered:

- `validateEnv()` (`server/index.ts:44`) hard-fails the process at boot if `SESSION_SECRET`, `STRIPE_SECRET_KEY`, `STRIPE_BILLING_WEBHOOK_SECRET`, or `ANTHROPIC_API_KEY` is missing in production. Hard guard against the "default-secret in prod" footgun.
- All three Stripe webhooks (`/api/billing/webhook`, `/api/bookflow/webhook/payment`, `/api/stripe/connect/webhook`) refuse to process events in production if their respective `whsec_*` env vars are unset (returns 500), and call `stripe.webhooks.constructEvent` with the raw body otherwise.
- Twilio inbound routes (`verifyTwilioSignature` in `server/twilioClient.ts`) reject on missing token + missing/invalid signature; reconstruct the canonical URL from `x-forwarded-proto` + host + original URL.
- Vapi (`server/services/vapiService.ts:153`) and SendGrid (`server/lib/sendgridWebhook.ts`) both verify signatures against the raw request body.
- Login token signing (`server/lib/loginToken.ts`) uses `crypto.timingSafeEqual` for HMAC compare. Same pattern in `verifyPassword` (`server/auth.ts:54`).
- No SQL string interpolation found: no `pool.query` with `${}` or `+` concatenation, no `sql.raw` with template-string interpolation. Drizzle parameterised queries throughout.
- No real secret values found in `client/`. The hits in `.env.example` and `docs/` are placeholders.
- `console.log` of secrets: none — only references to env var names.
- Per-route admin/portal RBAC: every `/api/admin/*` handler scanned uses `requireAdmin`, except 4 documented exceptions (Google OAuth callbacks, impersonate start/stop, outbound platform webhook). All four perform their own auth check inline.
- Portal queries scope through `withClientId(req)` then verify ownership on `:id` params (e.g. `bookflowRoutes.ts`, `portalRoutes.ts:404` adflow reports).
- Impersonation has a 60-min hard cap (`IMPERSONATION_MAX_MINUTES`), refuses to impersonate other admins, swaps `req.user` to target so storage layer sees customer identity, preserves admin identity via `req.adminImpersonating` side-channel for audit.
- Helmet enabled with custom CSP in Report-Only mode + HSTS at default 180 days; per-route CORP + X-Frame-Options DENY on `/admin` and `/portal`; embed surfaces explicitly opened up. CORS allowlist is strict.
- Password reset + magic link endpoints always return 200 (no enumeration), with per-user 60s dedupe and per-IP rate limit.

---

## P1 — should fix before public launch

### P1-1 — No account lockout / per-user credential-stuffing cap *(carryover, document)*

`/api/auth/login` is protected by `authRateLimiter` keyed by IP (`login:${ip}`) at **10 attempts / 15 min**. There is no per-account counter, no progressive delay, no temporary lockout. Implications:

- A distributed credential-stuffing attack (one attempt per IP across thousands of IPs) is not slowed at all.
- `validateEnv` does not enforce password complexity beyond the 8-char minimum in signup/reset paths.

**Recommendation:** Add `users.failed_login_attempts` + `users.locked_until` columns; bump on each `Invalid email or password` from passport-local; lock for 15 min after 8 attempts; reset on successful login. Also tighten signup to reject the top-1000 common passwords (one-time list, no API dependency).

**No inline fix** — schema change + migration touches >1 file and warrants its own PR after launch-week brand work lands.

### P1-2 — Outbound webhook secret compared with `!==` *(SHIPPED INLINE)*

`server/routes/adminOutboundRoutes.ts:1182` did `if (provided !== secret) return 401`. JS string equality is short-circuited and timing-observable — given enough requests an attacker can byte-by-byte recover the `OUTREACH_WEBHOOK_SECRET`. Replaced with a length-prefixed `crypto.timingSafeEqual` compare.

### P1-3 — Token-login + checkout-login bypass full login pipeline

`POST /api/auth/token-login` (`authRoutes.ts:864`) and `POST /api/auth/checkout-login` (`authRoutes.ts:899`) both call `req.logIn(sessionUser, …)` directly without re-checking `totp_enabled`. A user who enables 2FA *after* checkout could be auto-logged-in through this path without the second factor.

Practical exposure is low (TTL is 24h on the post-checkout token, 15min on magic links; both are one-time use and HMAC-signed; the attacker would need to intercept the email link), but for consistency with the email/password and Google flows, the 2FA gate should also apply here.

**Recommendation:** Extract the 2FA-gate block from `/api/auth/login` into a small helper and reuse it in `token-login` + `checkout-login`. Trivial change but touches 3 functions — defer to follow-up.

---

## P2 — defence in depth / hygiene

### P2-1 — CSRF protection: not enforced on state-changing routes

Express session cookies are `httpOnly: true`, `sameSite: "lax"`, `secure: <prod>`. CORS is a strict allowlist with `credentials: true`. There is **no double-submit-token / csurf middleware** on POST/PATCH/DELETE endpoints.

`sameSite: lax` blocks the common CSRF vectors (form POSTs from third-party origins) on modern browsers, and the strict CORS allowlist plus `credentials: true` requires the origin to be in `corsAllowlist` for a real browser to send the cookie. This is the minimum-viable defence; in 2026 it is what most session-cookie apps actually ship.

**Recommendation:** Acceptable for launch. Track adding `SameSite=Strict` on portal/admin routes via a per-route override, or a token-header double-submit pattern for `/api/portal/*` write paths, as a P2 follow-up after launch.

### P2-2 — CSP still in Report-Only mode

`Content-Security-Policy-Report-Only` is being collected via `/api/csp-report`. Once a week of violation data is reviewed, graduate to enforce mode. Today, an XSS would still execute.

### P2-3 — `unsafe-inline` + `unsafe-eval` in `script-src`

Required by gsap + many inline `<style>{`…`}</style>` blocks. Tightening these out is a refactor, not a hygiene fix. Document as known.

### P2-4 — Session cookie TTL is 7 days, no idle timeout

`maxAge: 7 * 24 * 60 * 60 * 1000` (7 days absolute). No rolling-idle expiry. Defensible for portal accounts, but admin sessions arguably should be shorter (24-48h with rolling refresh) given the impersonation power they hold. Low priority.

### P2-5 — `sk_live_*` historically in `wefixtrades/dev` Doppler

Per `scripts/sync-api-platform-stripe-prices.ts:36` and `SCORECARD.md`, the dev Doppler config was discovered to contain a live Stripe key. Believed cleaned per the orchestrator's running notes, but worth confirming via `doppler secrets get STRIPE_SECRET_KEY --config dev --plain | head -c 8` and asserting it begins with `sk_test_`.

### P2-6 — Microsoft email-verification not checked

`server/routes/authRoutes.ts:707` auto-links a Microsoft Entra `sub` to an existing email-password account without explicitly checking the email is verified by Microsoft (Google path does this at `:359`). Microsoft's `email` claim from `/v2.0/userinfo` is presumed verified for work/school tenants but is **not for personal Microsoft accounts** unless the OIDC `email_verified` claim is present. Today this opens a narrow account-takeover path: attacker creates an outlook.com personal account with the victim's email, runs the "Sign in with Microsoft" flow, gets auto-linked to the victim's password account. Probability is low (most victims would already have a Google or password account collision and the attacker still doesn't get the password), but worth tightening for parity.

**Recommendation:** Mirror the Google-path `email_verified` check. Trivial. Defer to follow-up so the social-login scaffold PR stays small.

### P2-7 — `helmet` `crossOriginEmbedderPolicy: false`

Required for the embed surface. Documented; no action.

### P2-8 — `pendingGoogleSignup` session pickle is 30-min TTL but unbounded growth

Each visitor who starts Google sign-up but never finishes leaves a `sess.pendingGoogleSignup` object in `connect-pg-simple`'s session table for the full 7-day session TTL. Cleanup happens on `delete sess.pendingGoogleSignup` only on completion. Not a security issue but a slow DB-bloat issue; address in a maintenance pass.

### P2-9 — `landingPathForRole` defaults unknown roles to `/portal`

Defensible since admin route is gated by `RequirePortal`, but the absence of a `portal` role in storage means any future role-string typo (`"portla"`) silently lands at the portal. Add a strict allowlist (`admin | portal | client`) and reject the rest.

### P2-10 — `pendingGoogleSignup.sub` accepted from session without re-verifying with Google

If the OAuth state has already been validated and the `sub` came directly from Google's `/userinfo` then this is fine. Re-confirmed in code — `pending.sub` is only set after a successful `exchangeCodeForProfile(code)` round-trip. No action.

---

## Sign-off

- **Stripe**: 3 webhook handlers, all use `constructEvent` with raw body; refuse in production without secret.
- **Twilio**: signature verification on every inbound voice / SMS / voicemail route.
- **SendGrid**: ECDSA signature + timestamp window verified.
- **Vapi**: HMAC over raw body verified.
- **Auth**: pbkdf2-sha512, 100k iterations, salted, constant-time compare. Acceptable today; argon2id is the modern recommendation if/when a rotation is planned.
- **Admin RBAC**: `requireAdmin` on 96%+ of `/api/admin/*` routes; 4 documented exceptions audited and pass.
- **Tenant scoping**: portal routes consistently resolve `clientId` from the session, then verify ownership on `:id` params.
- **Secrets in client code**: none.

Total findings: 1 inline fix (P1-2), 2 P1 follow-ups, 10 P2/hygiene items.
