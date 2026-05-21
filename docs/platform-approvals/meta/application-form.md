# Meta App Review — Application Form (SocialSync)

Pre-filled with WeFixTrades details. Where information is unknown, a `[TODO: Alex confirms <field>]` marker appears so you can resolve it during filing.

## Business Verification (prerequisite)

- [ ] Legal business name: `WeFixTrades Inc.`
- [ ] Country of registration: `[TODO: Alex confirms country of incorporation — Canada vs. US]`
- [ ] Business registration / incorporation number: `[TODO: Alex confirms corp number]`
- [ ] Tax ID / EIN / BN: `[TODO: Alex confirms tax ID]`
- [ ] Business address: `[TODO: Alex confirms registered address]`
- [ ] Business phone: `[TODO: Alex confirms business phone listed on incorporation docs]`
- [ ] Business website: `https://wefixtrades.com`
- [ ] Verification document type (one of): `Articles of incorporation` / `Business license` / `Tax document`
- [ ] Document upload: `[TODO: Alex uploads scan/PDF of incorporation docs]`

> Meta Business Verification is the gating step for almost every advanced permission. Submit this first if not already verified.

## App Details

- [ ] App name: `WeFixTrades SocialSync`
- [ ] App icon (1024x1024 PNG): `https://wefixtrades.com/wefixtrades-icon.webp` — confirm PNG copy is uploaded; the favicon is webp.
  - `[TODO: Alex confirms a 1024x1024 PNG variant of the icon exists at /wefixtrades-icon-1024.png or attaches a fresh export]`
- [ ] App category: `Business and Pages`
- [ ] App URL: `https://wefixtrades.com`
- [ ] App tagline (short): `Done-for-you social posting for trades businesses.`
- [ ] Privacy Policy URL: `https://wefixtrades.com/privacy`
- [ ] Terms of Service URL: `https://wefixtrades.com/terms`
- [ ] Data Deletion Instructions URL: `https://wefixtrades.com/privacy#data-deletion`
  - `[TODO: Alex confirms an explicit data-deletion section/anchor exists in the privacy policy]`
- [ ] User Support email: `support@wefixtrades.com`
- [ ] Business contact email: `support@wefixtrades.com`
- [ ] Platforms used by the app: `Website` (server-side OAuth)

## Use Case (SocialSync)

- [ ] Use case selected: `Posts to Facebook Pages` + `Instagram content publishing`
- [ ] Short description (255 chars):

  > WeFixTrades SocialSync lets trades businesses (plumbers, electricians, HVAC) connect their Facebook Page and Instagram Business account so our platform can publish AI-generated weekly content on their behalf — keeping their presence active without manual posting.

- [ ] Long description (200–300 chars):

  > SocialSync is a managed posting service for trades businesses. After a customer connects their Facebook Page and linked Instagram Business account via OAuth, our backend uses page-scoped tokens to publish weekly maintenance tips, seasonal reminders, and job photos. Customers retain full control: every post is reviewable and connections can be revoked at any time from the WeFixTrades admin dashboard or directly from Facebook Business Settings.

## Permissions / Scopes Requested

Sourced from `server/services/socialSync/facebookService.ts`:

- [ ] `pages_show_list` — list pages the user manages so they can pick which to connect.
- [ ] `pages_read_engagement` — read post insights for the monthly performance report.
- [ ] `pages_manage_posts` — publish, edit, and delete posts on the selected page.
- [ ] `pages_read_user_content` — read existing posts to detect duplicate scheduling.
- [ ] `instagram_basic` — discover Instagram Business accounts linked to the page.
- [ ] `instagram_content_publish` — publish photo posts to the linked Instagram Business account.

See `permissions-justification.md` for the per-scope rationale.

## Webhook / Callback URL

- [ ] OAuth redirect URI: `https://wefixtrades.com/api/socialsync/oauth/facebook/callback` (verified in `server/routes/socialSyncRoutes.ts:648`)
- [ ] Webhook callback URL (if Meta requires): `https://wefixtrades.com/api/socialsync/webhooks/facebook`
  - `[TODO: Alex confirms whether a webhook endpoint is required for SocialSync — current code only uses OAuth, no realtime webhook]`
- [ ] Verify token: `[TODO: Alex confirms verify token from Doppler secret FACEBOOK_WEBHOOK_VERIFY_TOKEN if applicable]`

## Use Case Narrative (200 words)

> WeFixTrades is a SaaS platform for small trades businesses — plumbers, electricians, HVAC technicians, roofers. Most of our customers have no marketing staff and have never posted on Facebook or Instagram in months. Our SocialSync product solves this: after a one-time OAuth connection, our backend generates and publishes one weekly post to their Facebook Page (and, if linked, their Instagram Business account). Posts are professionally written by AI, quality-checked against a brand profile, and scheduled at the right time of week for their trade and timezone. We use `pages_manage_posts` to publish, `instagram_content_publish` to mirror to Instagram, `pages_read_engagement` to show the customer monthly reach and engagement metrics, and the discovery scopes (`pages_show_list`, `instagram_basic`) so the customer can pick the right Page and IG account during setup. No third party ever receives the customer's tokens; they are encrypted at rest with AES-256-GCM and decrypted only inside the publishing worker.

## Data Storage / Retention

- [ ] Storage: Page-level access tokens are encrypted at rest using AES-256-GCM (`server/services/socialSync/tokenEncryption.ts`) and stored in Postgres column `socialsync_connections.token_ref`. The encryption key is held in Doppler, not in source control.
- [ ] Retention: Tokens are retained only while the customer's subscription is active. On cancellation, the connection row is set to `revoked` within 24h and the encrypted token is wiped within 30 days.
- [ ] Data we read but do not persist: page engagement metrics (we cache aggregate counts only — not user-level data).
- [ ] User content: We do not store any Facebook/Instagram user data beyond the page-level metadata (page ID, page name, IG business account ID).

## Other Required Fields

- [ ] App domains: `wefixtrades.com`
- [ ] App icon dimensions confirmed: 1024x1024
- [ ] Test users: `[TODO: Alex creates a Meta test user account or shares a sandbox page with the reviewer]`
- [ ] Reviewer credentials note: include a sentence saying "Sandbox tenant available on request — email support@wefixtrades.com."
- [ ] Screencast (60–90s): see `screencast-script.md` — file: `wefixtrades-socialsync-screencast.mp4`
