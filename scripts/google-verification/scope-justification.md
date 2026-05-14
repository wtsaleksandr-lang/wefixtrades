# Scope justification — paste into Google Cloud Console verification form

For the OAuth consent screen verification submission, the "Scope justification" field is the most-scrutinized free-text input. Paste the block below verbatim. The language has been written specifically to address Google's verification reviewers' standard checklist for the `business.manage` scope.

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

### What the demo video shows

The submitted video demonstrates:

1. **Brand + product context** — the WeFixTrades homepage and the bespoke `/products/mapguard` page that explains what the product does for prospective customers.
2. **Documentation** — `/docs/mapguard`, the customer-facing help page that documents how each Google scope is used.
3. **Privacy policy** — `/privacy`, scrolled to the Section 5a Google API Services / Limited Use disclosure.
4. **Customer-initiated OAuth** — a logged-in customer on `/portal/mapguard` clicking through the consent checkbox and the Connect Google Business button.
5. **The Google consent screen** — captured with the URL bar visible so reviewers can confirm the `client_id` parameter matches the OAuth client this verification submission is for. The customer reviews the requested scope, then clicks Allow.
6. **Post-consent experience** — the customer is redirected back to `/portal/mapguard?gbp_connected=1` showing the connection succeeded. The previously-shown Connect banner is now hidden because the connection is live.
