# TikTok Content Posting API — Permissions Justification

## Login Kit Scopes

### `user.info.basic`
- **Why:** Required minimum to establish an OAuth connection. Without it we cannot identify which TikTok account the customer just authorized.
- **Customer-facing feature:** "Connected" state in the SocialSync → Connections panel.

### `user.info.profile`
- **Why:** We display the connected TikTok username and avatar in the WFT portal so the customer can verify they connected the correct business account (not their personal one by accident).
- **Customer-facing feature:** Connection card showing "@theirhandle • avatar" — prevents costly mis-connections.

### `user.info.stats`
- **Why:** SocialSync delivers a monthly performance report inside the WFT portal: "this month you gained X followers and your top video earned Y likes." Follower count is the most-requested metric.
- **Customer-facing feature:** Monthly SocialSync report widget at `/portal/socialsync/reports`.

## Content Posting API Scopes

### `video.upload`
- **Why:** Core to the product. We need to upload the video binary produced from the customer's job photos and notes into their TikTok account.
- **Customer-facing feature:** The entire weekly posting cadence — without `video.upload` SocialSync cannot ship to TikTok at all.

### `video.publish`
- **Why:** Customers who buy SocialSync are explicitly buying a done-for-you service. Requiring them to manually finalize each upload inside the TikTok app defeats the purpose of the product. `video.publish` allows direct posting on the customer's behalf after they approve in our portal (or after autopilot approves automatically per their settings).
- **Customer-facing feature:** "Approve & Post" button → video goes live without the customer ever opening TikTok.

## Scopes Explicitly NOT Requested

To pre-empt reviewer questions:

- `video.list` — we track which videos we published via our own DB; we never enumerate the customer's full TikTok feed.
- `comment.list` / `comment.create` — SocialSync does not engage with comments.
- `research.*` — we are not a research platform.
- Any scope that reads other users' content or interactions.
