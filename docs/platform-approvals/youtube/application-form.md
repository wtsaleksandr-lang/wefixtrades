# YouTube Data API v3 — Audit + Quota Extension Application

This is filed as a "Google API Services User Data and Developer Policy compliance audit" via the standard Google OAuth verification flow. Project is the same Google Cloud project that hosts GBP.

## Google Cloud Project

- [ ] Google Cloud project: `[TODO: Alex confirms project ID — likely the project that holds GOOGLE_BUSINESS_CLIENT_ID]`
- [ ] Project owner email: `support@wefixtrades.com`
- [ ] APIs enabled: `YouTube Data API v3`
- [ ] Existing OAuth consent screen configured: yes (shared with GBP)

## App Verification (OAuth Consent Screen)

- [ ] App name: `WeFixTrades SocialSync` (or generic `WeFixTrades`)
- [ ] User support email: `support@wefixtrades.com`
- [ ] App logo (120x120 PNG): `https://wefixtrades.com/wefixtrades-icon.webp`
  - `[TODO: Alex confirms 120x120 PNG variant uploaded]`
- [ ] App home page: `https://wefixtrades.com`
- [ ] App privacy policy: `https://wefixtrades.com/privacy`
- [ ] App terms of service: `https://wefixtrades.com/terms`
- [ ] Authorized domains: `wefixtrades.com`
- [ ] Developer contact: `support@wefixtrades.com`

## Scopes Requested

Source: `server/services/contentflow/youtubePublisher.ts` uses `googleapis` with `youtube.videos.insert` and `youtube.thumbnails.set`. Required scope is `https://www.googleapis.com/auth/youtube.upload` (sensitive).

- [ ] `https://www.googleapis.com/auth/youtube.upload` — **sensitive scope** — required to upload videos to the connected channel.
- [ ] `https://www.googleapis.com/auth/youtube.readonly` — read channel metadata for the SocialSync performance report (views, likes, subscribers gained).
  - `[TODO: Alex confirms whether to include readonly — current code only does upload + thumbnail. Recommend include for future reporting.]`

## Quota Extension (separate from audit)

- [ ] Default quota: 10,000 units/day.
- [ ] Requested quota: `100,000 units/day`
- [ ] Justification: A single video upload costs ~1,600 units. With ~50 customers each uploading 2 videos/week, plus reporting reads, we project ~30,000–50,000 units/day at steady state. 100k gives 2x headroom.
- [ ] Form: https://support.google.com/youtube/contact/yt_api_form

## OAuth Configuration

- [ ] Authorized redirect URI: `https://wefixtrades.com/api/socialsync/oauth/youtube/callback`
  - `[TODO: Alex confirms — current code reuses GOOGLE_BUSINESS_CLIENT_ID; either add a YouTube-specific redirect or document that YouTube connect uses the same callback]`
- [ ] Authorized JavaScript origin: `https://wefixtrades.com`

## Use Case Narrative (200 words)

> WeFixTrades is a SaaS platform for small trades businesses. SocialSync, our managed social posting product, includes optional YouTube publishing for customers who want to ship their before/after job clips, seasonal explainer videos, and customer testimonial reels to YouTube as well as their other social channels. The flow: a trades customer (e.g. a plumber) connects their YouTube channel via Google OAuth from the WFT portal. Our backend, which already produces short-form video for the customer via SocialSync's AI pipeline, uploads the finished video to their channel using YouTube Data API v3 (`videos.insert`). Customers can choose default privacy (unlisted / public) and we always honor it. We use `youtube.upload` for the upload itself and `thumbnails.set` for custom thumbnails. Optional `youtube.readonly` powers the monthly performance summary inside the WFT portal — total views and subscriber delta per month. Every video originates from media the customer supplied to WeFixTrades, and every upload is either explicitly approved by the customer or shipped under their autopilot setting that they enabled. Tokens are encrypted at rest with AES-256-GCM, separate from any other secret in the system.

## Data Storage / Retention

- [ ] OAuth refresh tokens encrypted at rest (AES-256-GCM) in `socialsync_connections.token_ref`.
- [ ] YouTube channel ID and channel name cached as plaintext metadata (non-sensitive).
- [ ] Video performance metrics (views, likes, watch time) cached for 24 months for reporting; deleted thereafter.
- [ ] No personal Google user data (email, contacts, calendar, drive) ever requested or stored.

## Security Assessment Eligibility

The YouTube audit triggers a Google CASA (Cloud Application Security Assessment) only if:

- The app is public (yes, will be public)
- The app uses sensitive or restricted scopes (yes — `youtube.upload` is sensitive)
- The app expects > 100 users (yes)

- [ ] CASA assessment required: likely yes. `[TODO: Alex budgets ~$3,000–$5,000 USD for the third-party security assessor — Google maintains a list of approved labs.]`

## Verification Materials

- [ ] Screencast (see `screencast-script.md`)
- [ ] OAuth consent screen screenshot showing the requested scopes
- [ ] Privacy policy URL (with YouTube-specific section per `privacy-snippet.md`)
- [ ] Public-facing documentation explaining how the integration works: WFT's product page at https://wefixtrades.com/products/socialsync covers this for customers
