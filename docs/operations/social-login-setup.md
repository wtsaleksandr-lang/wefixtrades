# Social login setup — Microsoft + Facebook

Companion to the existing "Continue with Google" flow. The OAuth scaffolds
live in `server/routes/authRoutes.ts` (alongside the Google routes) and the
buttons are in `client/src/components/auth/{Microsoft,Facebook}SignInButton.tsx`.

Both routes return a clean `/login?<provider>_error=not_configured`
redirect when credentials are missing — they will NOT crash the server.

## Doppler vars to add (per env: `wefixtrades/dev`, `/stg`, `/prd`)

Run the rotation via the `secrets-rotator` subagent. Never paste raw values
into chat or commit them to the repo.

```
MICROSOFT_OAUTH_CLIENT_ID
MICROSOFT_OAUTH_CLIENT_SECRET
MICROSOFT_OAUTH_REDIRECT_URI       # optional; defaults to https://wefixtrades.com/api/auth/microsoft/callback
FACEBOOK_OAUTH_CLIENT_ID
FACEBOOK_OAUTH_CLIENT_SECRET
FACEBOOK_OAUTH_REDIRECT_URI        # optional; defaults to https://wefixtrades.com/api/auth/facebook/callback
```

For dev / stg envs, set the redirect URI to the appropriate
`https://<env-host>/api/auth/<provider>/callback`.

## 1. Microsoft (Entra ID)

1. Sign in to the Microsoft Entra admin center: <https://entra.microsoft.com/>
2. Go to **Identity > Applications > App registrations > New registration**.
3. Name: `WeFixTrades Sign-In`.
4. Supported account types: **Accounts in any organizational directory and personal Microsoft accounts** (multi-tenant + personal).
5. Redirect URI: pick **Web**, and add one entry per env:
   - `https://wefixtrades.com/api/auth/microsoft/callback` (prod)
   - `https://stg.wefixtrades.com/api/auth/microsoft/callback` (stg, if applicable)
   - `http://localhost:5000/api/auth/microsoft/callback` (local dev)
6. Click **Register**.
7. Copy the **Application (client) ID** → `MICROSOFT_OAUTH_CLIENT_ID`.
8. Go to **Certificates & secrets > Client secrets > New client secret**. Pick the longest expiry available (typically 24 months). Copy the **Value** (not the ID) → `MICROSOFT_OAUTH_CLIENT_SECRET`. The value is only shown once.
9. Go to **API permissions** — the defaults (`openid`, `email`, `profile`, `User.Read`) are correct. No admin consent needed for these scopes.

## 2. Facebook (Meta Developers)

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

For both providers the callback follows the same logic as Google:

1. Known `<provider>_sub` (column in `users` table) → log in.
2. Email matches an existing account → auto-link the sub column, then log in.
3. Brand-new identity → redirect to `/signup?social=<provider>&email=<addr>&name=<name>` with the email/name prefilled.

The 2FA gate still applies after social login if the user has TOTP enabled.

## DB columns (migration `0045_social_login_subs.sql`)

```
users.microsoft_sub  TEXT  (unique, nullable)
users.facebook_sub   TEXT  (unique, nullable)
```

These mirror `users.google_sub` and are populated by the OAuth callbacks.
