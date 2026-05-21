# LinkedIn — Scope Justification

## `r_liteprofile`
- **Why:** During the OAuth connect flow, we display the connecting user's name and avatar in the WFT portal so they can verify the correct LinkedIn identity was authorized.
- **Customer-facing feature:** Connection card on the SocialSync Connections page.

## `r_emailaddress`
- **Why:** Cross-check that the email tied to the LinkedIn authorization matches the WFT account email — flag mismatches so the customer doesn't accidentally link a coworker's LinkedIn.
- **Customer-facing feature:** "Authorized as: dave@apexroofing.com" displayed on the connection card.

## `r_organization_admin`
- **Why:** After the user authorizes, we need to list the LinkedIn Company Pages they administer so they can pick which page SocialSync targets. Without this scope we cannot show the picker and the integration cannot be configured.
- **Code reference:** Setup flow reads `/v2/organizationAcls?q=roleAssignee` to populate the picker.
- **Customer-facing feature:** "Choose a company page" step in the SocialSync setup wizard.

## `w_organization_social`
- **Why:** Core capability for the organization use case. We POST to `/v2/ugcPosts` with the selected organization URN as the `author` field. This is the only scope that allows publishing as an organization.
- **Code reference:** `server/services/contentflow/linkedinPublisher.ts` calls `POST /v2/ugcPosts` with author = organization URN.
- **Customer-facing feature:** Weekly organization-page posts.

## `w_member_social`
- **Why:** Fallback for customers who don't have a Company Page yet (rare for established trades but common for sole proprietors). Allows posting to the user's personal profile instead. Same code path; just a different URN.
- **Customer-facing feature:** Personal-profile posting tier in SocialSync (used when no Company Page is connected).

## Scopes Explicitly NOT Requested

- `r_ads`, `rw_ads` — we do not run LinkedIn ads.
- `r_basicprofile` — superseded by `r_liteprofile`.
- `r_compliance` — not relevant.
- Any scope that reads the user's connections list, messages, or feed.
