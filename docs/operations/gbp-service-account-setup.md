# GBP service-account access setup

Google Business Profile (GBP) is the last of the four SEO integrations
(GSC / GA4 / Bing / GBP) without service-account auth. This doc covers
moving GBP onto the same SA used for GA4 + GSC so we don't have to ship
an OAuth-only path.

**Service account:** `wefixtrades@acx-audiobooks.iam.gserviceaccount.com`
**GCP project:** `acx-audiobooks` (project number `439916428886`)
**Credential source:** Doppler `wefixtrades/prd` → `GOOGLE_APPLICATION_CREDENTIALS_JSON`

The codebase auto-detects the SA key at boot and prefers it over the
operator OAuth path (see `server/lib/seo/gbpClient.ts`). The moment both
manual prereqs below are satisfied, every GBP cron + admin status card
flips green with zero additional configuration.

---

## Prereqs (both required)

### 1. Invite the SA as a Manager on the GBP location

GBP doesn't use IAM — it uses an in-product invitation flow that mirrors
"share with another user". The SA's `client_email` is a real email
address and Google's Business Profile UI accepts it like any other user.

Steps:

1. Open <https://business.google.com> signed in as the GBP owner.
2. Pick the WeFixTrades listing → **Users** (gear icon → People).
3. Click **Add user**.
4. Email: `wefixtrades@acx-audiobooks.iam.gserviceaccount.com`.
5. Role: **Manager** (Owner works too but Manager is sufficient for all
   automation we need: posts, hours, reviews).
6. **Invite**. Google sends an invitation email to the SA address — the
   SA can't accept it from a browser, but Google auto-accepts when the
   first API call from the SA includes the right scope.

If the listing isn't created or verified yet, do that first — the
invitation flow only appears for verified listings.

### 2. Request a GBP API quota increase

Google ships the GBP APIs **enabled with zero per-minute quota** by
default. Until a quota request is approved, every call returns:

```
HTTP 429 RESOURCE_EXHAUSTED
quota_metric:      mybusinessaccountmanagement.googleapis.com/default_requests
quota_limit_value: 0
```

This is the GBP API quirk — separate from API enablement and separate
from the OAuth scope review. APIs that need the bump:

- `mybusinessaccountmanagement.googleapis.com`
- `mybusinessbusinessinformation.googleapis.com`

Steps:

1. Open <https://console.cloud.google.com/apis/api/mybusinessaccountmanagement.googleapis.com/quotas?project=acx-audiobooks>.
2. Tick the **Requests per minute per project** row → **Edit quota**.
3. Request a sensible bump (e.g. `300/min` — well above what our crons
   need, low enough that Google approves quickly).
4. Fill the application form (purpose: "internal admin automation for
   a single verified GBP listing — daily posts, hourly review sync,
   nightly hours sync"). Approval is typically a few business days.
5. Repeat for `mybusinessbusinessinformation.googleapis.com`.

---

## Wire-up status (one-time, already shipped)

- [x] `server/lib/seo/gbpClient.ts` mints `business.manage` tokens via
      the SA JWT (`google.auth.JWT`) when
      `GOOGLE_APPLICATION_CREDENTIALS_JSON` is present.
- [x] `getAutomationContext()` prefers SA → OAuth fallback. All three
      crons (`runDailyPostTick`, `runReviewMonitorTick`, `runHoursSyncTick`)
      activate automatically once the SA is reachable.
- [x] `GET /api/admin/integrations/status` returns `gbp_sa` with the
      probe outcome (`ok` / `quota_zero` / `no_access` / `unconfigured`
      / `error`).
- [x] `/admin/integrations/google` GBP card surfaces the probe so the
      operator always sees which prereq is the current blocker.

## Required env var (one-time)

The crons need `GBP_LOCATION_NAME` (full resource name) to know which
listing to target. After Alex completes the invitation flow, get the
location name with:

```bash
TOKEN=$(gcloud auth print-access-token wefixtrades@acx-audiobooks.iam.gserviceaccount.com \
  --scopes=https://www.googleapis.com/auth/business.manage)

# 1. list accounts
curl -s -H "Authorization: Bearer $TOKEN" \
  "https://mybusinessaccountmanagement.googleapis.com/v1/accounts"
# -> grab the "name" field, e.g. "accounts/1234567890"

# 2. list locations under that account
curl -s -H "Authorization: Bearer $TOKEN" \
  "https://mybusinessbusinessinformation.googleapis.com/v1/accounts/<ACCOUNT_ID>/locations?readMask=name,title"
# -> grab the "name" field, e.g. "accounts/123/locations/456"
```

Then:

```bash
doppler secrets set GBP_LOCATION_NAME="accounts/<acct>/locations/<loc>" \
  --project wefixtrades --config prd
```

Redeploy. The admin card flips to "Connected via service account" and
all three crons start running on schedule.

---

## Why SA + invitation (not OAuth)

- **OAuth route** requires a Google sensitive-scope review for
  `business.manage` — a 3–14 day audit Google sometimes rejects for
  single-tenant business tools. Token refresh also depends on the
  operator never revoking access.
- **SA route** sidesteps both: Google treats the SA as a "user" of the
  listing, and the SA's JWT-signed tokens never expire on the operator
  side. Same pattern that already works for GA4 (Editor) and GSC
  (Owner) on this same SA.

The trade is the one-time quota request and the one-time invitation
flow above — both are pure clicks, no code, no review queue.
