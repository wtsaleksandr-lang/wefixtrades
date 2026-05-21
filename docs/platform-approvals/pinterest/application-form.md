# Pinterest API Standard Access — Application Form

Pinterest API access has two tiers: **Trial Access** (instant) and **Standard Access** (requires application). SocialSync needs Standard.

## Account / Developer Setup

- [ ] Pinterest Developer account email: `support@wefixtrades.com`
- [ ] Pinterest Business account: `[TODO: Alex confirms — Pinterest Business account exists for WeFixTrades, or one will be created]`
- [ ] Organization: `WeFixTrades Inc.`
- [ ] Country: `[TODO: Alex confirms]`
- [ ] Industry: `Software / SaaS`

## App Details

- [ ] App name: `WeFixTrades SocialSync`
- [ ] App description (short): `Done-for-you Pinterest publishing for trades businesses.`
- [ ] App description (long, 200–300 chars):

  > WeFixTrades SocialSync publishes weekly Pinterest pins on behalf of trades businesses (plumbers, electricians, roofers, landscapers). After the customer connects their Pinterest Business account, our backend creates pins from their job photos — before/after renovations, project portfolios, seasonal tips — driving discovery traffic back to their website without manual posting.

- [ ] App logo (250x250 minimum PNG): `https://wefixtrades.com/wefixtrades-icon.webp`
  - `[TODO: Alex confirms PNG variant uploaded]`
- [ ] App URL: `https://wefixtrades.com`
- [ ] Privacy Policy URL: `https://wefixtrades.com/privacy`
- [ ] Terms of Service URL: `https://wefixtrades.com/terms`
- [ ] Support contact email: `support@wefixtrades.com`

## OAuth Configuration

- [ ] Redirect URI: `https://wefixtrades.com/api/socialsync/oauth/pinterest/callback`
  - `[TODO: Alex confirms — Pinterest callback route not yet in codebase; follow same pattern as facebook/google-business callbacks]`

## Scopes Requested

Based on `server/services/contentflow/pinterestPublisher.ts` (POSTs to `/v5/pins`):

- [ ] `boards:read` — list the customer's boards so they can pick a target during setup.
- [ ] `boards:write` — create a default "From WeFixTrades" board if the customer has no suitable board.
- [ ] `pins:read` — read previously-published pin status (success/failure) for the WFT activity log.
- [ ] `pins:write` — core: create pins on the selected board.
- [ ] `user_accounts:read` — display the connected account username in WFT portal.

## Use Case Narrative (200 words)

> WeFixTrades SocialSync is a managed social publishing service for small trades businesses. Pinterest is a particularly valuable channel for visual trades — kitchen remodels, bathroom renovations, landscaping projects, custom cabinetry — because Pinterest users actively search for project inspiration before they hire. Our backend uses customer-supplied job photos to create pins with titles, descriptions, and link URLs that drive traffic back to the customer's website. Specifically: the customer connects their Pinterest Business account via OAuth. They (or our system) select a target board, typically named after their business. Our orchestrator generates pin metadata (title, description tuned to local SEO keywords for their trade and service area) and creates the pin via `POST /v5/pins` with their photo as the image source. Customers can preview each pin in the WFT portal before it goes live, or enable autopilot for hands-off operation. We expect to publish 1–4 pins per customer per week. Tokens are encrypted at rest with AES-256-GCM. Customers can disconnect any time from the WFT portal or from Pinterest's app permissions page.

## Permissions / Scopes Justification

See `permissions-justification.md` for the per-scope rationale.

## Webhook / Callback URL

- [ ] OAuth callback: `https://wefixtrades.com/api/socialsync/oauth/pinterest/callback`
- [ ] Pinterest does not require a public webhook for content publishing. No webhook URL needed.

## Data Storage / Retention

- [ ] OAuth access + refresh tokens encrypted at rest (AES-256-GCM).
- [ ] Board IDs cached as plaintext (non-sensitive).
- [ ] Pin performance metrics (impressions, saves, clicks) cached 24 months for reporting.
- [ ] No personal Pinterest data (followed boards, saved pins from other users) ever read or stored.

## Estimated Volume

- [ ] Expected pins published per month at launch: ~200 (50 customers × 4 pins)
- [ ] Expected API call volume: ~5,000 calls/day across all customers (well below Standard Access limits)

## Additional Required Fields

- [ ] App category: `Marketing / Content automation`
- [ ] Target audience: `Small trades businesses in North America (CA, US) and English-speaking markets`
- [ ] Demo video URL: see `screencast-script.md`
- [ ] Reviewer test account: `[TODO: Alex provisions Pinterest Business test account + WFT reviewer login]`
