# Pinterest API — Scope Justification

## `boards:read`
- **Why:** During the connect flow, we display the customer's existing boards so they can pick a default target for SocialSync pins.
- **Customer-facing feature:** "Choose default board" dropdown in `/portal/socialsync/connections`.

## `boards:write`
- **Why:** If the customer has no suitable board (rare but happens for brand-new accounts), we create a default board named after their business so SocialSync has somewhere to pin.
- **Customer-facing feature:** "Create 'From WeFixTrades' board" option in the setup wizard.

## `pins:read`
- **Why:** After publishing, we read back the pin status so we can show the customer a success/fail badge in their activity log, and we can detect deleted pins so we don't show stale links.
- **Customer-facing feature:** SocialSync activity log at `/portal/socialsync/activity`.

## `pins:write`
- **Why:** Core capability. We POST to `/v5/pins` to create new pins on the customer's behalf.
- **Code reference:** `server/services/contentflow/pinterestPublisher.ts` calls `POST https://api.pinterest.com/v5/pins`.
- **Customer-facing feature:** The entire weekly Pinterest publishing cadence.

## `user_accounts:read`
- **Why:** We display the connected username and avatar in the WFT portal so the customer can verify they connected the correct Pinterest Business account.
- **Customer-facing feature:** Connection card on the SocialSync connections page.

## Scopes Explicitly NOT Requested

- `ads:*` — we do not run Pinterest ads.
- `catalogs:*` — we do not manage shopping catalogs.
- Any scope that reads other users' content.
