# TikTok Content Posting API — Application Form (SocialSync)

> Note: TikTok integration is **planned** for SocialSync (not yet shipped). No publisher exists in the codebase yet — this approval unlocks the work. All scope/endpoint references below are based on the TikTok Developer docs as of submission, not on existing WFT code.

## Developer Account Setup

- [ ] TikTok Developer account email: `support@wefixtrades.com`
- [ ] Organization name: `WeFixTrades Inc.`
- [ ] Country: `[TODO: Alex confirms country of incorporation]`
- [ ] Industry: `Software / SaaS`
- [ ] Company website: `https://wefixtrades.com`

## App Details

- [ ] App name: `WeFixTrades SocialSync`
- [ ] App icon (1024x1024 PNG): `https://wefixtrades.com/wefixtrades-icon.webp`
  - `[TODO: Alex confirms 1024x1024 PNG variant uploaded]`
- [ ] App description (short, 80 chars): `Done-for-you social posting for trades businesses.`
- [ ] App description (long, 200–300 chars):

  > WeFixTrades SocialSync is a managed publishing service for small trades businesses (plumbers, electricians, HVAC). After OAuth connect, our backend publishes weekly short-form videos showcasing the customer's work, seasonal tips, and behind-the-scenes content on their behalf. Customers always retain control: every video is reviewable in the WFT portal and connections are revocable in one click.

- [ ] Platform: `Web` (server-side OAuth + Content Posting API)
- [ ] Privacy Policy URL: `https://wefixtrades.com/privacy`
- [ ] Terms of Service URL: `https://wefixtrades.com/terms`
- [ ] Data Deletion URL: `https://wefixtrades.com/privacy#data-deletion`
- [ ] Support contact: `support@wefixtrades.com`

## OAuth Configuration

- [ ] Redirect URI: `https://wefixtrades.com/api/socialsync/oauth/tiktok/callback`
  - `[TODO: Alex confirms — TikTok callback endpoint is not yet implemented; will follow the same pattern as facebook/google-business callbacks]`
- [ ] Login Kit scopes requested:
  - [ ] `user.info.basic` — minimum identity for connection display
  - [ ] `user.info.profile` — username, display name (shown in WFT portal)
  - [ ] `user.info.stats` — follower count for performance reporting
- [ ] Content Posting API scopes requested:
  - [ ] `video.upload` — upload videos to user's draft folder
  - [ ] `video.publish` — directly publish videos (requires Content Posting API audit)

## Use Case Narrative (200 words)

> WeFixTrades is a SaaS platform for small trades businesses — plumbers, electricians, HVAC, roofers, landscapers. Our SocialSync product takes over their social media posting end-to-end: the customer connects their accounts once, and our backend publishes weekly content on their behalf. TikTok is a critical channel for these trades — short clips of unclogging a drain, before/after roof repairs, and seasonal HVAC tips perform exceptionally well in the trades vertical. We will use the Content Posting API to upload videos that our team and AI produce from the customer's photos and job notes. Every video is reviewed in the WFT portal before posting (or shipped automatically if the customer enables autopilot). We request `video.publish` (rather than only `video.upload` to drafts) because the autopilot use case is the core promise of SocialSync — customers who specifically buy a "done-for-you" service want the post to actually go live without their daily intervention. Tokens are encrypted at rest using AES-256-GCM. Customers can disconnect any time from the WFT portal or directly from TikTok account settings.

## Permissions / Scopes

- [ ] `user.info.basic` — required minimum for OAuth connection.
- [ ] `user.info.profile` — display "Connected as @username" in the WFT portal so customers can verify the right account is linked.
- [ ] `user.info.stats` — power the SocialSync monthly performance report ("you gained X followers this month").
- [ ] `video.upload` — upload the video binary to the customer's TikTok account (Direct Post or Drafts).
- [ ] `video.publish` — publish the uploaded video directly when the customer has approved or enabled autopilot.

## Webhook / Callback URL

- [ ] OAuth callback: `https://wefixtrades.com/api/socialsync/oauth/tiktok/callback`
- [ ] Webhook URL (for post-status updates, if TikTok requires): `https://wefixtrades.com/api/socialsync/webhooks/tiktok`
- [ ] Webhook signing secret: `[TODO: Alex stores in Doppler as TIKTOK_WEBHOOK_SECRET after approval]`

## Data Storage / Retention

- [ ] Access tokens encrypted at rest (AES-256-GCM), stored in `socialsync_connections.token_ref`.
- [ ] Refresh tokens encrypted separately, used by the publishing worker to refresh expired access tokens.
- [ ] TikTok video metadata (video ID, view count, like count) cached for 24 months for reporting.
- [ ] No personal TikTok content (DMs, comments, other users' videos) ever read or stored.

## Additional Required Fields

- [ ] Target region for app: `Global` (English-speaking trades initially; CA, US, UK, AU primary)
- [ ] Estimated MAU at launch: `< 1,000` (private alpha)
- [ ] Estimated MAU at 6 months: `< 10,000`
- [ ] Will the app be available in the TikTok App Store: `No — direct web onboarding only`
- [ ] Demo video / screencast: see `screencast-script.md`
- [ ] Reviewer test account: `[TODO: Alex provisions a TikTok test account that the reviewer can use to test the OAuth flow]`
