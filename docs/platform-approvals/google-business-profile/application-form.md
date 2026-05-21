# Google Business Profile API — Application Form

GBP API access requires two separate filings:

1. **GBP API allowlist application** at https://developers.google.com/my-business/content/prereqs (a Google form — they review and email back with a project ID that gets API access enabled).
2. **OAuth verification** (same flow as YouTube) for the `business.manage` scope, which is sensitive.

Both reference the same Google Cloud project.

## Google Cloud Project

- [ ] GCP project: `[TODO: Alex confirms project ID — the project holding GOOGLE_BUSINESS_CLIENT_ID]`
- [ ] APIs to enable (after allowlist approval):
  - [ ] `Google My Business API`
  - [ ] `My Business Account Management API`
  - [ ] `My Business Business Information API`
- [ ] OAuth consent screen: External, Production

## Allowlist Application (Step 1)

This is the unique GBP API gate. The application form lives at https://support.google.com/business/contact/api_default.

- [ ] Company name: `WeFixTrades Inc.`
- [ ] Country of incorporation: `[TODO: Alex confirms]`
- [ ] Company website: `https://wefixtrades.com`
- [ ] Contact name: `Aleksandr [TODO: Alex confirms last name]`
- [ ] Contact email: `support@wefixtrades.com` (must match the Google account that owns the GCP project)
- [ ] GCP project ID: `[TODO: Alex confirms]`
- [ ] GCP project number: `[TODO: Alex confirms]`
- [ ] Region of operation: `North America (Canada + United States)`
- [ ] Approximate number of business locations to be managed by your app: `< 1,000 at launch; < 10,000 in 12 months`
- [ ] Type of app: `Internal — we manage our customers' Google Business Profiles on their behalf (SaaS managed service)`

## App Use Case (Allowlist form free-text fields)

- [ ] What does your app do? (200 chars):

  > WeFixTrades manages Google Business Profiles for small trades businesses. Our MapGuard product handles profile optimization, weekly monitoring, and Google Posts on behalf of customers who connect their GBP via OAuth.

- [ ] How do users authenticate? (200 chars):

  > Each customer authenticates via Google OAuth from the WFT portal, granting `business.manage` to the WFT app. Tokens are encrypted at rest with AES-256-GCM. No service-account impersonation, no token sharing.

- [ ] Will you use the API for your own business locations only, or for customers' locations? — Customers' locations (the standard managed-service flow).

- [ ] Detailed use case (1000 chars):

  > MapGuard, our managed Google Business Profile service, performs the following operations via the GBP APIs on behalf of customers who have explicitly authorized our app:
  >
  > 1. List accounts/locations during onboarding so the customer can pick which GBP to connect (My Business Account Management API).
  > 2. Read profile fields (categories, hours, services, attributes) to power the weekly profile health audit (Business Information API).
  > 3. Update profile fields when the customer asks us to (e.g., update hours, add a new service category) — always with their approval in the WFT portal (Business Information API).
  > 4. Publish Local Posts (covid, offers, events, what's new) on the customer's GBP through SocialSync's GBP publishing tier (Google My Business API — Posts).
  > 5. Read reviews to power ReputationShield's review monitoring + AI-drafted reply workflow (Google My Business API — Reviews).
  >
  > Volume estimate: ~5,000 API calls/day across all customers at launch (modest).

## App Verification (OAuth Consent Screen — Step 2)

Same OAuth consent screen as YouTube. After allowlist approval, push to production with the GBP scope added.

- [ ] App name: `WeFixTrades` (shared across YouTube + GBP)
- [ ] User support email: `support@wefixtrades.com`
- [ ] App logo (120x120 PNG)
- [ ] App home page: `https://wefixtrades.com`
- [ ] Privacy Policy: `https://wefixtrades.com/privacy`
- [ ] Terms: `https://wefixtrades.com/terms`
- [ ] Authorized domain: `wefixtrades.com`
- [ ] Developer contact: `support@wefixtrades.com`

## Scopes Requested

Source: `server/services/socialSync/googleBusinessService.ts` line 110-112 — the only scope in use is `business.manage`.

- [ ] `https://www.googleapis.com/auth/business.manage` — **sensitive scope** — required for ALL GBP API operations (read + write). There is no narrower scope available; `business.manage` covers everything.

## OAuth Configuration

- [ ] Authorized redirect URI: `https://wefixtrades.com/api/socialsync/oauth/google-business/callback` (verified in `server/routes/socialSyncRoutes.ts:1192`)
- [ ] Authorized JavaScript origin: `https://wefixtrades.com`

## Use Case Narrative (200 words)

> WeFixTrades is a SaaS platform for small trades businesses. Three of our products depend on Google Business Profile API access: (1) MapGuard, our managed GBP optimization service, performs profile audits, fixes profile issues, and tracks ranking signals on the customer's connected GBP; (2) SocialSync publishes weekly Google Posts as part of its multi-platform content cadence; (3) ReputationShield reads incoming reviews so we can alert the customer to negative reviews and draft AI-powered responses they post back through our portal. All three products run against the customer's own GBP after they've connected via Google OAuth from the WeFixTrades portal. Tokens (access + refresh) are encrypted at rest with AES-256-GCM and decrypted only inside the relevant publishing/reading worker. Customers can disconnect at any time. Our projected volume is modest (~5,000 calls/day across all customers at launch), well within Google's rate limits.

## Data Storage / Retention

- [ ] Access + refresh tokens encrypted at rest (AES-256-GCM) in `socialsync_connections.token_ref`.
- [ ] GBP account ID and location ID stored as plaintext metadata.
- [ ] Profile data (hours, categories, etc.) cached for 24h then re-fetched.
- [ ] Reviews cached for 24 months for ReputationShield reporting.
- [ ] Post performance metrics cached for 24 months.
- [ ] No personal Google user data (Gmail, Drive, etc.) ever requested or stored.

## Security Assessment

`business.manage` is a sensitive scope. CASA security assessment likely required:

- `[TODO: Alex budgets ~$3,000–$5,000 USD for CASA — same vendor can cover YouTube + GBP in one engagement]`

## Verification Materials

- [ ] Screencast (`screencast-script.md`)
- [ ] OAuth consent screen screenshot showing `business.manage` scope
- [ ] Privacy policy with Google + GBP-specific section (`privacy-snippet.md`)
- [ ] MapGuard product page: https://wefixtrades.com/products/mapguard
