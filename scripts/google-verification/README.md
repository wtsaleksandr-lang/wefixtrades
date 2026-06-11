# Google OAuth verification kit — all sensitive scopes

This folder is everything needed to submit WeFixTrades' Google OAuth consent-screen verification for project `acx-audiobooks`. The submission unlocks **all five sensitive scopes the codebase requests** (verified against source 2026-06-10), so real customers and operators can connect without the "unverified app" warning:

- `…/auth/business.manage` — MapGuard GBP posting / review replies / listing monitoring (customer flow + admin)
- `…/auth/webmasters.readonly` — RankFlow Search Console reads for the customer dashboard (customer flow)
- `…/auth/webmasters` — sitemap submission + URL inspection on the admin SEO console
- `…/auth/analytics.edit` — GA4 property/stream provisioning on the admin SEO console
- `…/auth/analytics.readonly` — GA4 status reads on the admin SEO console

(`openid email profile`, used by "Continue with Google" sign-in, are non-sensitive and need no justification.)

## TL;DR

1. Read [`submission-checklist.md`](./submission-checklist.md) end-to-end — **Step 0 first**: `GOOGLE_OAUTH_CLIENT_ID/_SECRET` are missing from Doppler (verified 2026-06-10), so the admin flow must be wired up before it can be demoed.
2. Verify `wefixtrades.com` in Google Search Console (one-time, if not already).
3. Fill out the OAuth consent screen in Google Cloud Console (all 5 sensitive scopes).
4. Record the demo videos:
   ```bash
   # Customer flow (business.manage + webmasters.readonly)
   DEMO_PORTAL_EMAIL=<your-test-portal-account> \
   DEMO_PORTAL_PASSWORD=<password> \
   DEMO_INCLUDE_RANKFLOW=1 \
   npm run record:google-verification

   # Admin flow (webmasters + analytics.edit + analytics.readonly) —
   # add admin creds and re-run; the second test activates:
   DEMO_ADMIN_EMAIL=<admin-account> DEMO_ADMIN_PASSWORD=<password> \
   npm run record:google-verification
   ```
5. Watch the resulting `.webm`s (in `test-results/google-verification/<...>/video.webm`).
6. Convert/merge to `.mp4`, upload as Unlisted to YouTube.
7. Paste the URL + the per-scope text in [`scope-justification.md`](./scope-justification.md) into the verification form.
8. Submit. Wait 3–7 business days (budget 2 weeks with 5 sensitive scopes).

## What's in this folder

| File | Purpose |
|---|---|
| [`README.md`](./README.md) | This file |
| [`submission-checklist.md`](./submission-checklist.md) | Step-by-step, every field, every Cloud Console screen |
| [`scope-justification.md`](./scope-justification.md) | Paste-able text for the verification form |
| [`record-demo.spec.ts`](./record-demo.spec.ts) | Playwright test that records the demo video |
| [`playwright.config.ts`](./playwright.config.ts) | Recording-specific Playwright config (headed, video on, 15 min timeout) |

## Why semi-automated, not fully-automated?

Google blocks fully-automated logins to Google accounts. The script auto-drives the WeFixTrades side of the flow (homepage tour → portal login → consent checkbox → click Connect), then **pauses** on the Google consent screen and hands the browser to you (the operator). You manually sign in to the demo Google account, click Allow, and the script resumes recording the post-consent experience.

Total operator time per recording: about **60 seconds of attention** during the manual section.

## Pre-flight checklist before running

- [ ] You have a demo Google account that owns at least one Google Business Profile.
- [ ] You have a WeFixTrades portal account with an active MapGuard subscription (so the Connect banner is visible).
- [ ] For the RankFlow scene (`DEMO_INCLUDE_RANKFLOW=1`): the same portal account has RankFlow access so `/portal/rankflow/dashboard` renders data.
- [ ] For the admin recording: an admin account, and `GOOGLE_OAUTH_CLIENT_ID/_SECRET` configured in Doppler + the `/api/admin/integrations/google/callback` redirect URI added to the OAuth client (submission-checklist.md Step 0).
- [ ] You've installed Playwright locally: `npm install && npx playwright install chromium`.
- [ ] You're running this from your local machine, NOT Replit (needs a real visible browser).
- [ ] Optional: install ffmpeg if you want to convert/merge the .webm(s) to .mp4 before uploading (YouTube accepts both).

## Re-running

The script is fully idempotent. If something goes wrong:

- Close any open Playwright Inspector windows.
- Re-run the npm script.
- A fresh video is saved under a new folder in `test-results/google-verification/`.

The "old" recordings stay until you delete `test-results/`.

## Privacy / safety notes

- The script reads `DEMO_PORTAL_EMAIL` and `DEMO_PORTAL_PASSWORD` from env vars only — never commit them.
- The recording is fully local until you upload it to YouTube. Watch it first.
- The recording shows a small amount of demo customer data (business name, score, last scan date) on the portal dashboard. Use a test customer, not a real production customer.

## Privacy policy support

The `/privacy` page contains the required Google API Services User Data Policy / Limited Use disclosure at Section 5a. This was added as part of this kit's PR.

## What this kit does NOT cover

- Recording the actual onboarding flow from `/signup` (the verification only needs the OAuth flow itself).
- Demonstrating bulk post publishing or review reply publishing — the audit reviewers don't need to see the cron-driven background workers, only the consent + connection.
- Restricted scope submissions (CASA security assessment, etc.). `business.manage` is **sensitive**, not **restricted**, so the lighter sensitive-scope review path applies.
