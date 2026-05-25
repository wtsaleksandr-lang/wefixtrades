# Meta App Review — Permissions Justification

Each scope below is requested by `server/services/socialSync/facebookService.ts` (see `REQUIRED_SCOPES`). Justifications tie directly to customer-facing features in SocialSync.

## Facebook Page Scopes

### `pages_show_list`
- **Why:** During the OAuth connect flow, we display a chooser of all pages the trades business owner manages so they can pick which page SocialSync will post to. Without this scope we cannot show the list and the connect step fails.
- **Code:** `fetchFacebookPages()` in `facebookService.ts` calls `/me/accounts` to populate the page picker UI at portal route `/portal/socialsync/connect`.

### `pages_read_engagement`
- **Why:** Customers receive a monthly performance report ("your last 4 weeks: X impressions, Y reactions") inside the WeFixTrades portal. Reading post-level engagement is the only way to populate that report.
- **Code:** `server/services/socialsyncReports.ts` reads `/insights` per published post and aggregates into a monthly summary email.

### `pages_manage_posts`
- **Why:** This is the core capability of SocialSync: publishing AI-generated weekly posts to the customer's Facebook page. We use it to create new posts and, when the customer edits a queued draft, to update or delete the corresponding scheduled post.
- **Code:** `server/services/socialSync/facebookPublisher.ts` POSTs to `/{page-id}/feed`.

### `pages_read_user_content`
- **Why:** Before scheduling a new post we check the page's recent posts to avoid duplicating content the customer (or a previous SocialSync run) already posted. This protects the customer's feed from looking spammy or repetitive.
- **Code:** Duplicate-detection inside `orchestrator.ts` calls `/{page-id}/posts` and compares hashes before queueing a new draft.

### `pages_manage_metadata`
- **Why:** The "Page Settings" tab in the customer portal lets trades businesses edit their Facebook Page's basic details (name, About / short description, category) without leaving WeFixTrades. Most trades customers manage one Page and rarely touch Meta Business Suite, so consolidating this into the portal saves time and keeps their public-facing information accurate. We do not change page roles, page admins, or any sensitive settings — only the customer-visible fields they would otherwise edit in the Page's own Settings → Page Info screen.
- **Code:** `fetchFacebookPageMetadata()` and `updateFacebookPageMetadata()` in `facebookService.ts` (GET / POST `/{page-id}`). Exposed at portal routes `GET /api/portal/socialsync/facebook-page/:pageId/metadata` and `PATCH /api/portal/socialsync/facebook-page/:pageId/metadata`. Every update writes an audit-log row (`socialsync.facebook_page.metadata_update`) capturing actor, fields changed, and before/after snapshot.
- **Reviewer test path:** Connect a Facebook Page in the portal → open "Your Social Media" → switch to the "Page Settings" tab → edit "About" → Save. The change appears on the Facebook Page within a few minutes.

## Instagram Scopes

### `instagram_basic`
- **Why:** After the customer picks their Facebook Page, we look up whether that page is linked to an Instagram Business account so we can offer "also post to Instagram" as a one-click option. Without this scope we can't detect the IG link.
- **Code:** `discoverInstagramAccounts()` in `instagramService.ts` reads `instagram_business_account` on each page.

### `instagram_content_publish`
- **Why:** When the customer enables Instagram cross-posting, we publish the same AI-generated post (re-formatted for IG aspect ratios) to their Instagram Business account. This is the only scope that allows the IG content publishing API.
- **Code:** `instagramPublisher.ts` calls `/{ig-user-id}/media` then `/{ig-user-id}/media_publish`.

## Scopes We Are Explicitly NOT Requesting

To pre-empt reviewer questions: SocialSync deliberately does not request, and does not need:

- `pages_messaging` — we never reply to DMs.
- `ads_*` — we do not run paid ads from this app.
- `user_posts` / `user_photos` — we never read personal Facebook content.
- `business_management` — we only need page-scoped access, not full business asset management.
