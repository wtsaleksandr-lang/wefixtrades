# LinkedIn Marketing Developer Platform — Application Form

LinkedIn's Marketing Developer Platform (MDP) is the gated tier required for posting on behalf of organizations. The path is: create a Company Page → create an app on the page → apply for MDP access.

## LinkedIn Page + App

- [ ] LinkedIn Company Page: `https://www.linkedin.com/company/wefixtrades` (or whichever URL exists)
  - `[TODO: Alex confirms the LinkedIn Company Page slug for WeFixTrades]`
- [ ] App created on the Company Page: `WeFixTrades SocialSync`
- [ ] App admin: `[TODO: Alex confirms — the developer account email tied to the LinkedIn Page]`

## App Details

- [ ] App name: `WeFixTrades SocialSync`
- [ ] App logo (300x300 PNG): `https://wefixtrades.com/wefixtrades-icon.webp`
  - `[TODO: Alex confirms PNG variant uploaded]`
- [ ] App description:

  > WeFixTrades SocialSync is a managed social posting service for small trades businesses. After OAuth connect, our backend publishes weekly text + image posts to the customer's LinkedIn Company Page — sharing project highlights, hiring announcements, and industry updates. Every post originates from the customer's own content and is either explicitly approved or shipped under their autopilot setting.

- [ ] App URL: `https://wefixtrades.com`
- [ ] Business email: `support@wefixtrades.com`
- [ ] Privacy Policy URL: `https://wefixtrades.com/privacy`
- [ ] Terms of Service URL: `https://wefixtrades.com/terms`

## Products Requested

LinkedIn groups scopes into "Products" you request access to:

- [ ] **Sign In with LinkedIn using OpenID Connect** (auto-approved) — for `openid`, `profile`, `email`
- [ ] **Share on LinkedIn** (auto-approved) — for posting to the connecting user's personal feed (we don't use this but enabling it widens scope availability)
- [ ] **Community Management API** — for posting on behalf of organizations the user administers. Requires MDP approval.
- [ ] **Marketing Developer Platform** — the gated tier. Apply via the form.

## Scopes Requested

Source: `server/services/contentflow/linkedinPublisher.ts` uses the `/v2/ugcPosts` endpoint with an organization or person URN as author.

- [ ] `r_liteprofile` — read the connecting user's basic profile (display in WFT portal).
- [ ] `r_emailaddress` — confirm the connecting user's identity (optional but useful).
- [ ] `w_member_social` — publish posts as the connecting user (used only when the customer connects a personal profile rather than a company page).
- [ ] `r_organization_admin` — list the organizations the user administers, so they can pick which company page SocialSync targets.
- [ ] `w_organization_social` — publish posts on the chosen organization's behalf via UGC Posts endpoint.

## Use Case Narrative (200 words)

> WeFixTrades is a SaaS platform for small trades businesses — plumbers, electricians, HVAC, roofers. LinkedIn is increasingly important for trades looking to win commercial contracts and recruit skilled labor. Our SocialSync product publishes weekly content to the customer's LinkedIn Company Page on their behalf. The flow: the customer (typically the business owner) connects via LinkedIn OAuth. We use `r_organization_admin` to list the company pages they administer; they pick the target page. Each week our backend generates a post — project highlight, hiring announcement, industry tip — and either auto-publishes (autopilot mode) or queues it for the customer's approval in the WFT portal. Posts use the UGC Posts endpoint with the organization URN as author and the `w_organization_social` scope. Volume is modest: ~1 post per customer per week. Tokens are encrypted at rest with AES-256-GCM. Customers retain full control via the WFT disconnect flow or LinkedIn's app permissions page.

## Webhook / Callback URL

- [ ] OAuth callback: `https://wefixtrades.com/api/socialsync/oauth/linkedin/callback`
  - `[TODO: Alex confirms — LinkedIn callback route not yet implemented; follow facebook/google-business pattern]`
- [ ] LinkedIn does not require a public webhook for posting. No webhook URL needed.

## Data Storage / Retention

- [ ] Access tokens encrypted at rest (AES-256-GCM) in `socialsync_connections.token_ref`.
- [ ] Organization URN stored as plaintext metadata (the `external_account_id` column, per the linkedinPublisher code).
- [ ] Post performance metrics (impressions, reactions) cached 24 months for reporting.
- [ ] No personal LinkedIn data (connections list, messages, feed activity) ever read or stored.

## Additional Required Fields

- [ ] Estimated number of organizations served: < 1,000 at launch; < 10,000 in 12 months
- [ ] Geographic focus: North America (CA, US), expanding to UK/AU
- [ ] Demo video: see `screencast-script.md`
- [ ] Reviewer test account: `[TODO: Alex provisions LinkedIn test admin + WFT reviewer login]`

## MDP-specific questions LinkedIn will ask

- [ ] What problem does this app solve for marketing professionals? — "Trades businesses lack marketing staff. SocialSync solves the time tax of consistent LinkedIn posting."
- [ ] What measurable outcomes will customers achieve? — "Posting cadence on LinkedIn from 0 posts/month to 4 posts/month, with content tuned to their trade vertical."
- [ ] How will users discover and onboard? — "Direct signup at wefixtrades.com; SocialSync is one of nine WFT products."
- [ ] Will the app remain in production for at least 6 months? — Yes.
