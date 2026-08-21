# Social login setup — Facebook

Companion to the existing "Continue with Google" flow. The OAuth scaffold
lives in `server/routes/authRoutes.ts` (alongside the Google routes) and the
button is in `client/src/components/auth/FacebookSignInButton.tsx`.

> **Microsoft sign-in was removed (2026-08).** The routes, config, button and
> `MICROSOFT_OAUTH_*` env vars are gone. The `users.microsoft_sub` DB column is
> intentionally retained as a harmless unused/legacy column (no migration to
> drop it).

The Facebook route returns a clean `/login?facebook_error=not_configured`
redirect when credentials are missing — it will NOT crash the server.

## Doppler vars to add (per env: `wefixtrades/dev`, `/stg`, `/prd`)

Run the rotation via the `secrets-rotator` subagent. Never paste raw values
into chat or commit them to the repo.

```
FACEBOOK_OAUTH_CLIENT_ID
FACEBOOK_OAUTH_CLIENT_SECRET
FACEBOOK_OAUTH_REDIRECT_URI        # optional; defaults to https://wefixtrades.com/api/auth/facebook/callback
```

For dev / stg envs, set the redirect URI to the appropriate
`https://<env-host>/api/auth/facebook/callback`.

## Facebook (Meta Developers)

1. Sign in to <https://developers.facebook.com/apps/>.
2. **Create App > Consumer > Next**.
3. App name: `WeFixTrades`. Contact email: a monitored address.
4. After creation, go to **Add Product > Facebook Login > Set up > Web**.
5. Site URL: `https://wefixtrades.com`. Save and continue.
6. Open **Facebook Login > Settings**. Add to **Valid OAuth Redirect URIs**:
   - `https://wefixtrades.com/api/auth/facebook/callback`
   - `https://stg.wefixtrades.com/api/auth/facebook/callback` (if applicable)
   - `http://localhost:5000/api/auth/facebook/callback`
7. Save changes.
8. Go to **App settings > Basic**. Copy:
   - **App ID** → `FACEBOOK_OAUTH_CLIENT_ID`
   - **App Secret** (click "Show") → `FACEBOOK_OAUTH_CLIENT_SECRET`
9. Switch the app from **Development** to **Live** (top toggle) when ready to accept real users. Requires a privacy-policy URL and a few other compliance items — see the Meta dashboard checklist.

## Account resolution rules

The Facebook callback follows the same logic as Google:

1. Known `facebook_sub` (column in `users` table) → log in.
2. Email matches an existing account → auto-link the sub column, then log in.
3. Brand-new identity → redirect to `/signup?social=facebook&email=<addr>&name=<name>` with the email/name prefilled.

The 2FA gate still applies after social login if the user has TOTP enabled.

## DB columns (migration `0045_social_login_subs.sql`)

```
users.microsoft_sub  TEXT  (unique, nullable)   # legacy — retained, no longer written
users.facebook_sub   TEXT  (unique, nullable)
```

`facebook_sub` mirrors `users.google_sub` and is populated by the OAuth
callback. `microsoft_sub` is retained but no longer read or written after the
Microsoft flow was removed.
