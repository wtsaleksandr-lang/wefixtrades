# Google Business Profile API — Scope Justification

## `https://www.googleapis.com/auth/business.manage` (sensitive)

This is the only scope used by `server/services/socialSync/googleBusinessService.ts` (line 110-112). It is also the only scope available for GBP API operations — Google does not offer narrower scopes.

`business.manage` is sensitive and covers read + write of accounts, locations, profile information, posts, reviews, media, and Q&A. Our app's usage maps to each subdomain as follows:

### Accounts + Locations
- **Why:** During onboarding, we list the accounts and locations the user manages so they can pick which GBP to connect to MapGuard / SocialSync / ReputationShield.
- **Customer-facing feature:** "Choose a location" step in the GBP connect wizard.

### Profile Information (Business Information API)
- **Why:** MapGuard performs weekly profile health audits — checking hours accuracy, category optimization, attribute completeness, photo recency. With customer approval, we PATCH the profile to apply optimization recommendations.
- **Customer-facing features:** MapGuard health dashboard, "Apply recommendation" buttons, monthly audit report.

### Posts (Google My Business API)
- **Why:** SocialSync publishes weekly Google Posts (what's new, offers, events) to the customer's GBP as part of the multi-platform posting cadence.
- **Customer-facing feature:** SocialSync queued Google Posts visible in the WFT content calendar.

### Reviews (Google My Business API)
- **Why:** ReputationShield reads incoming reviews so we can (1) alert the customer to negative reviews within minutes, and (2) draft AI-powered reply suggestions they review and post back via our portal.
- **Customer-facing feature:** Real-time review alerts, AI-drafted replies in `/portal/reputationshield`.

### Media
- **Why:** MapGuard uploads optimized photos (geotagged customer job photos) to the GBP profile to keep the photo gallery fresh — one of the highest-ranking signals.
- **Customer-facing feature:** Monthly photo refresh as part of MapGuard's deliverable.

## Why There's No Narrower Scope

Google has consolidated all GBP API access under a single `business.manage` scope. There is no `business.read-only` or `business.posts-only` available. Our justification is therefore based on the comprehensive use case across three products (MapGuard, SocialSync, ReputationShield) that all live behind the same OAuth grant.

## Scopes Explicitly NOT Requested

- `gmail.*` — never.
- `drive.*` — never.
- `calendar.*` — never.
- `userinfo.email` / `userinfo.profile` — we only request `business.manage`; we use the GBP API's own account-resource endpoints to identify the user.
