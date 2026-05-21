# YouTube Data API v3 — Scope Justification

## `https://www.googleapis.com/auth/youtube.upload` (sensitive)

- **Why:** Core capability. We upload finished videos produced by SocialSync's video generation pipeline to the customer's connected YouTube channel using `youtube.videos.insert`. The integration cannot function without this scope.
- **Code reference:** `server/services/contentflow/youtubePublisher.ts` lines 101–115 — calls `youtube.videos.insert` with `part: ["snippet", "status"]` and a video body stream.
- **Customer-facing feature:** "Connect YouTube" inside SocialSync → Connections; queued videos auto-publish (or wait for approval) to the connected channel weekly.

## `https://www.googleapis.com/auth/youtube.readonly`

- **Why:** Powers the monthly SocialSync performance report inside the WFT portal: total channel views, subscribers gained, and which videos are performing best. Read-only access to the customer's own channel metadata.
- **Code reference:** `server/services/socialsyncReports.ts` (planned reporting endpoint will read `channels.list` and `videos.list` filtered to videos we published).
- **Customer-facing feature:** Monthly report widget at `/portal/socialsync/reports`.

## Thumbnails (uses the same `youtube.upload` scope)

- **Why:** We set a custom thumbnail per video using `youtube.thumbnails.set` immediately after upload. This uses the existing `youtube.upload` scope; no additional scope is required.
- **Code reference:** `youtubePublisher.ts` lines 131–137.

## Scopes Explicitly NOT Requested

To pre-empt reviewer questions:

- `youtube.force-ssl` — we use HTTPS for all requests anyway; no need for this scope.
- `youtubepartner` — we are not a YouTube partner-program affiliate.
- `youtube` (full edit) — we only need upload + readonly, not full channel edit (like deleting other videos, managing playlists, etc).
- `youtube.channel-memberships.creator` — no membership functionality.
