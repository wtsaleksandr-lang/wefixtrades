# Privacy Policy Snippet — YouTube

Paste into `https://wefixtrades.com/privacy` under "Third-party integrations." Per Google's API Services User Data Policy, the privacy policy MUST link out to the Google Privacy Policy and MUST describe data use in clear terms.

---

## YouTube (Google)

When you connect your YouTube channel to WeFixTrades SocialSync, we use the YouTube Data API v3 (a Google API service) to publish videos to your channel and to retrieve basic performance metrics.

WeFixTrades's use of information received from Google APIs adheres to the [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy), including the Limited Use requirements.

**What we access:**

- Your YouTube channel ID, channel name, and avatar (so we can confirm the right channel is connected).
- Aggregate channel statistics (subscriber count, view count, video performance) for the monthly SocialSync performance report.

**What we publish:**

- Videos that you have either explicitly approved in your WeFixTrades portal, or that have been published under your SocialSync autopilot settings. Every video is produced from photos, video clips, and notes that you supplied to WeFixTrades.

**What we never do:**

- We never access your personal Google data (Gmail, Drive, Calendar, Contacts) — only the YouTube scopes you consent to.
- We never enumerate other YouTube channels' content via your token.
- We never share your YouTube refresh token with any third party. Tokens are encrypted at rest with AES-256-GCM and decrypted only in our publishing worker.
- We do not use Google API data for advertising, sell it to third parties, or use it to train AI/ML models.

**Your control:**

- Disconnect at any time from your WeFixTrades portal (SocialSync → Connections → Disconnect YouTube), or revoke directly at https://myaccount.google.com/permissions.
- On disconnect, your stored YouTube refresh token is wiped within 24 hours.
- Email support@wefixtrades.com to request export or deletion of all SocialSync data associated with your account.

**Data retention:**

Encrypted YouTube tokens are retained only while your subscription is active plus a 30-day grace window. Cached performance metrics are retained for 24 months and then deleted.
