# Scope justifications — paste into Google Cloud Console verification form

For the OAuth consent screen verification submission, the per-scope "Scope justification" fields are the most-scrutinized free-text inputs. Paste each block below verbatim for its scope. Every claim is backed by shipping code (file references are noted per section for our own audit trail — strip the "Code" lines if the form's character limit is tight; the rest stands alone).

**Scopes this app's code actually requests (verified against source 2026-06-10):**

| Scope | Classification | Requested by | OAuth client |
|---|---|---|---|
| `https://www.googleapis.com/auth/business.manage` | Sensitive | Customer MapGuard connect (`server/services/googleBusinessService.ts`, `server/services/socialSync/googleBusinessService.ts`) + admin SEO integrations (`server/lib/seo/googleOauth.ts`) | `GOOGLE_BUSINESS_CLIENT_ID` + `GOOGLE_OAUTH_CLIENT_ID` |
| `https://www.googleapis.com/auth/webmasters.readonly` | Sensitive | Customer MapGuard/RankFlow connect (`server/services/googleBusinessService.ts` `SCOPES`) | `GOOGLE_BUSINESS_CLIENT_ID` |
| `https://www.googleapis.com/auth/webmasters` | Sensitive | Admin SEO integrations (`server/lib/seo/googleOauth.ts` `GOOGLE_SCOPES`) | `GOOGLE_OAUTH_CLIENT_ID` |
| `https://www.googleapis.com/auth/analytics.edit` | Sensitive | Admin SEO integrations (`server/lib/seo/googleOauth.ts`) | `GOOGLE_OAUTH_CLIENT_ID` |
| `https://www.googleapis.com/auth/analytics.readonly` | Sensitive | Admin SEO integrations (`server/lib/seo/googleOauth.ts`) | `GOOGLE_OAUTH_CLIENT_ID` |
| `openid`, `email`, `profile` | Non-sensitive | Google sign-in (`server/lib/googleSignin.ts`) + admin flow | both |

The consent screen is **project-wide**, so all five sensitive scopes above must be declared and justified in one submission, even though no single OAuth authorization requests all of them. The "Continue with Google" sign-in flow requests only the non-sensitive identity scopes and needs no justification.

---

## `https://www.googleapis.com/auth/business.manage`

### Why we need this scope

WeFixTrades operates a managed-service product called **MapGuard** that customers (small trades businesses — plumbers, electricians, HVAC contractors) explicitly subscribe to so we can monitor and grow their Google Business Profile on their behalf. The `business.manage` scope is the *only* way for our application to deliver the three core functions customers pay for:

1. **Publishing Google Business posts on a scheduled cadence** (2–4/month per the tier they purchased). We use `accounts.locations.localPosts:create` to post the AI-drafted updates we've prepared for them.

2. **Posting owner replies to customer reviews.** We pull new reviews via `accounts.locations.reviews:list`, classify them, AI-draft an appropriate reply, and publish using `accounts.locations.reviews.updateReply`. Reviews flagged as needing human attention (legal threats, defamation, extreme complaints) are held back from auto-reply and routed to internal human review.

3. **Reading the customer's listing for monitoring purposes** — pulling business info, location data, and verification status via `accounts.locations:get` so we can detect profile drift (missing description, missing photos, hours changes, unwanted edits) and notify the customer.

### Why a narrower scope won't work

Google currently exposes the Business Profile read + write surface only through the single `business.manage` scope. There is no read-only variant or per-action scope. Our application uses both read and write paths of this scope, so we cannot narrow the request.

### How we limit risk

- The customer triggers the OAuth flow themselves from inside their authenticated WeFixTrades portal (`/portal/mapguard`) after explicitly checking a consent box that says: *"I authorise WeFixTrades to act as a Manager on my Google Business Profile — posting updates, replying to reviews, and editing listing information on my behalf. I can revoke this access any time from my Google account."*
- We display this consent banner only to customers with an active paid MapGuard subscription.
- Tokens are encrypted at rest with AES-GCM using a key not stored alongside the database.
- Refresh tokens are used only by scheduled internal workers (post fan-out, post drainer, review responder) — never by interactive code paths.
- We send the customer a heads-up email the first time each automated action fires.
- Customers can revoke our access any time from `myaccount.google.com/permissions` (linked from our privacy policy).
- We use the data exclusively for the user-facing MapGuard functions described above. We do not sell, transfer, or repurpose Google user data. Our privacy policy contains the explicit Google API Services User Data Policy / Limited Use disclosure at `/privacy` (Section 5a).

---

## `https://www.googleapis.com/auth/webmasters.readonly`

### Why we need this scope

WeFixTrades operates a customer-facing SEO product called **RankFlow**. Customers connect their Google account once (the same authorization that connects MapGuard) so RankFlow can show them, inside their WeFixTrades portal dashboard (`/portal/rankflow`):

1. **Search performance for their own website** — clicks, impressions, click-through rate, and average position for their top queries and top pages, read via the Search Analytics query API (`webmasters.searchanalytics.query`). This powers the customer's RankFlow dashboard charts and the AI-generated SEO recommendations we produce from that data.
2. **Verified-property checks** — confirming the customer's site is a verified Search Console property before we attempt reads (`webmasters.sites.get`).
3. **Index-status checks** — determining whether the customer's individual pages are indexed, not indexed, or blocked (URL Inspection API in read mode), so the dashboard can flag pages that aren't earning Google traffic and explain why.

What is accessed and stored: aggregate query/page metrics (query string, page URL, clicks, impressions, CTR, position) and per-URL index verdicts for the customer's own property. We store only these aggregates to render the dashboard and compute deltas; no other Search Console data is read.

### Why a narrower scope won't work

`webmasters.readonly` **is** the narrowest Search Console scope. The customer-facing flow is read-only by design — RankFlow never submits sitemaps or modifies anything on behalf of customers, which is why this flow does not request the broader `webmasters` scope.

### How we limit risk

- Read-only scope; the application cannot modify the customer's Search Console data.
- The customer initiates the connection from their authenticated portal; tokens are encrypted at rest (AES-GCM) per customer.
- Data is used solely to render the customer's own RankFlow dashboard and recommendations. Limited Use disclosure at `/privacy` Section 5a applies.

---

## `https://www.googleapis.com/auth/webmasters`

### Why we need this scope

This scope is used by WeFixTrades' **internal admin SEO console** (`/admin/integrations/google`), an operator-facing surface where the WeFixTrades site operator connects the company's own Google account to automate Search Console operations for `wefixtrades.com` itself:

1. **Sitemap submission** — when the marketing site ships new pages, the SEO automation submits the updated sitemap (`sitemaps.submit`) and lists submission state (`sitemaps.list`).
2. **Index requests / inspection** — the automation inspects key URLs (`urlInspection.index.inspect`) and records verdicts in an audit history shown on the admin console.
3. **Property listing** — `sites.list` to confirm which properties the connected account can manage.

What is accessed and stored: sitemap submission status and per-URL inspection verdicts for properties the operator's own account manages. These are written to an internal `seo_indexing_history` audit table.

### Why a narrower scope won't work

Sitemap submission is a **write** operation; the read-only `webmasters.readonly` scope cannot submit sitemaps. The write-capable `webmasters` scope is the narrowest scope that supports sitemap submission.

### How we limit risk

- This scope is granted only by WeFixTrades' own operator accounts on an admin-only surface (`/admin/integrations/google`, behind admin authentication). End customers are never asked for this scope — their flow requests `webmasters.readonly` only.
- Tokens are encrypted at rest; every automated action is recorded in an audit history visible on the admin console.

---

## `https://www.googleapis.com/auth/analytics.edit`

### Why we need this scope

Used by the same internal admin SEO console (`/admin/integrations/google`) for **one-time Google Analytics 4 bootstrap**: after the operator connects the company Google account, the application can programmatically create a GA4 property and a web data stream for the site (`analyticsadmin.properties.create`, `properties.dataStreams.create`) and read back the resulting Measurement ID, which is then wired into the site's tag. This removes a multi-step manual Analytics console setup and guarantees the data stream is configured consistently.

What is accessed and stored: the created property resource name, the data-stream resource name, and the Measurement ID. Nothing else is modified.

### Why a narrower scope won't work

Creating GA4 properties and data streams via the Admin API requires `analytics.edit`. The read-only scope cannot provision anything. We request it alongside `analytics.readonly` so routine status reads use the read-only path and the edit capability is exercised only during explicit, operator-triggered provisioning.

### How we limit risk

- Operator-only admin surface; never requested from end customers.
- The edit capability is exercised only by an explicit "create property" action clicked by the operator — no background job performs Analytics writes.
- Tokens encrypted at rest; actions logged.

---

## `https://www.googleapis.com/auth/analytics.readonly`

### Why we need this scope

Used by the internal admin SEO console to **read** Google Analytics 4 configuration and status for the company's own properties:

1. **Listing the account's GA4 properties** (`analyticsadmin.accountSummaries.list`) so the operator can pick the property the site reports into, or confirm the bootstrap created it.
2. **Verifying the wired Measurement ID** matches an existing web data stream, surfaced on the admin integrations status card.

What is accessed and stored: property/account display names and identifiers, and the Measurement ID. (Day-to-day GA4 *report* reads in production use a Google Cloud service account on a property that account was explicitly granted access to — not this OAuth grant — so this scope's OAuth usage is limited to the admin configuration views above.)

### Why a narrower scope won't work

`analytics.readonly` is the narrowest Analytics scope that permits listing account summaries and data streams. We deliberately split read paths onto it so the broader `analytics.edit` scope is touched only during provisioning.

### How we limit risk

- Operator-only admin surface; never requested from end customers.
- Read-only; tokens encrypted at rest.

---

## What the demo video shows

The submission includes recordings produced by `record-demo.spec.ts` (plus one short manual segment), demonstrating every sensitive scope:

1. **Brand + product context** — the WeFixTrades homepage and the bespoke `/products/mapguard` page that explains what the product does for prospective customers.
2. **Documentation** — `/docs/mapguard`, the customer-facing help page that documents how each Google scope is used.
3. **Privacy policy** — `/privacy`, scrolled to the Section 5a Google API Services / Limited Use disclosure.
4. **Customer-initiated OAuth (`business.manage` + `webmasters.readonly`)** — a logged-in customer on `/portal/mapguard` clicking through the consent checkbox and the Connect Google Business button; the Google consent screen captured with the URL bar visible so reviewers can confirm the `client_id`; the post-consent redirect back to `/portal/mapguard?gbp_connected=1`.
5. **RankFlow dashboard (`webmasters.readonly` in use)** — the customer's `/portal/rankflow` dashboard rendering Search Console-derived metrics for their connected site.
6. **Admin-initiated OAuth (`webmasters`, `analytics.edit`, `analytics.readonly`)** — the operator on `/admin/integrations/google` clicking "Connect Google", the consent screen listing all requested scopes (URL bar visible), and the post-consent admin console showing the connected GSC/GA4 cards plus the sitemap/indexing audit history that `webmasters` powers.
7. **GA4 provisioning (`analytics.edit` in use)** — shown via the admin GA4 card displaying the provisioned property / Measurement ID (the creation action itself is demonstrated manually if the reviewer requests a live run, since it creates a real GA4 property — see submission-checklist.md Step 4b).
