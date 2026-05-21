# Privacy Policy Snippet — Google Business Profile

Paste into `https://wefixtrades.com/privacy` under "Third-party integrations." If you already have a Google/YouTube section per `docs/platform-approvals/youtube/privacy-snippet.md`, you can combine them or keep them separate — the language is similar but the scope is different.

---

## Google Business Profile

When you connect your Google Business Profile (GBP) to WeFixTrades, our products (MapGuard, SocialSync, ReputationShield) use the Google Business Profile API and related APIs to manage your business listing on your behalf.

WeFixTrades's use of information received from Google APIs adheres to the [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy), including the Limited Use requirements.

**What we access:**

- The list of GBP accounts and locations you manage (so you can pick which one to connect).
- The profile fields of the selected location (categories, hours, attributes, services, descriptions) — read for audits and written when you approve an optimization recommendation.
- Local posts published to the location and their performance metrics (impressions, views).
- Reviews left by customers on the location, for ReputationShield monitoring and AI-drafted replies.
- Photos and media on the location.

**What we publish or modify:**

- Profile field updates (e.g., hours, categories, services) — only when you explicitly approve a MapGuard recommendation in your WFT portal.
- Local posts (offers, what's new, events) created by SocialSync — either with your approval or under your autopilot setting.
- Review responses you draft (with AI assistance) and explicitly post via ReputationShield.
- Photos uploaded by MapGuard as part of our monthly optimization cycle.

**What we never do:**

- We never access your personal Google data — no Gmail, Drive, Calendar, Contacts, or other Google products. Only `business.manage` scope is requested.
- We never share your GBP access or refresh tokens with any third party. Tokens are encrypted at rest using AES-256-GCM.
- We never use Google API data for advertising, sell it to third parties, or use it to train AI/ML models.

**Your control:**

- Disconnect at any time from your WeFixTrades portal, or revoke directly at https://myaccount.google.com/permissions.
- On disconnect, all stored GBP tokens are wiped within 24 hours.

**Data retention:**

Encrypted GBP tokens are retained only while your subscription is active plus a 30-day grace window. Reviews, profile snapshots, and post performance metrics are retained for 24 months for reporting and then deleted.
