# Google OAuth verification submission — step-by-step checklist

Estimated total time: **60–90 minutes of your active time**, then **1–2 weeks of waiting** for Google's review team.

This walks you through every Google Cloud Console screen field-by-field. Do the steps in order — domain verification has to land before OAuth verification will pass.

**Google Cloud project: `acx-audiobooks` (project number `439916428886`).** Every console link below should be opened with that project selected (append `?project=acx-audiobooks` or pick it in the top bar). The production OAuth client `GOOGLE_BUSINESS_CLIENT_ID` lives in this project — verified 2026-06-10 by matching the client-id's numeric prefix to the project number.

**Scopes being verified (all five sensitive scopes any client in this project requests — verified against source 2026-06-10):**

| Scope | Flow that requests it |
|---|---|
| `…/auth/business.manage` | Customer MapGuard connect + admin SEO console |
| `…/auth/webmasters.readonly` | Customer MapGuard/RankFlow connect |
| `…/auth/webmasters` | Admin SEO console (`/admin/integrations/google`) |
| `…/auth/analytics.edit` | Admin SEO console |
| `…/auth/analytics.readonly` | Admin SEO console |

(`openid`, `email`, `profile` are also requested by the sign-in flow — they are non-sensitive and need no justification, but they must still be listed on the consent screen's scope page.)

---

## Step 0 — OAuth client prerequisites (blocker found 2026-06-10)

Two server flows use two different env-var client pairs:

1. **`GOOGLE_BUSINESS_CLIENT_ID` / `GOOGLE_BUSINESS_CLIENT_SECRET`** — customer-facing MapGuard/RankFlow connect + Google sign-in. ✅ Present in Doppler `wefixtrades/prd`; client belongs to `acx-audiobooks`.
2. **`GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET`** — admin SEO console flow (`server/lib/seo/googleOauth.ts`). ❌ **Missing from Doppler (`dev`, `stg`, and `prd` checked 2026-06-10)** — the admin flow is currently unconfigured everywhere, so the `webmasters` / `analytics.*` features cannot be demoed until this is fixed.

**Fix (10 min, recommended option — reuse the existing client):** Google scopes are requested per-authorization, so one client can serve both flows (the sign-in flow already reuses the business client this way).

1. Open https://console.cloud.google.com/apis/credentials?project=acx-audiobooks → click the existing web-app OAuth client.
2. Under **Authorized redirect URIs**, confirm these are all present; add any missing:
   - `https://wefixtrades.com/api/socialsync/oauth/google/callback` (or whatever `GOOGLE_BUSINESS_REDIRECT_URI` is set to in Doppler — keep as-is)
   - `https://wefixtrades.com/api/auth/google/callback` (sign-in)
   - `https://wefixtrades.com/api/admin/integrations/google/callback` (admin SEO flow — this is the one most likely missing)
3. In Doppler `wefixtrades` (all three configs), set `GOOGLE_OAUTH_CLIENT_ID` and `GOOGLE_OAUTH_CLIENT_SECRET` to the same values as `GOOGLE_BUSINESS_CLIENT_ID` / `GOOGLE_BUSINESS_CLIENT_SECRET`. (Use the secrets-rotator flow; never paste values into chat/files.)
4. Redeploy so the server picks the values up (`isGoogleOauthConfigured()` gates the admin Connect button).

Also confirm these APIs are enabled in `acx-audiobooks` (Console → APIs & Services → Enabled APIs, or `gcloud services list --project=acx-audiobooks`):

- [ ] Google Search Console API (`searchconsole.googleapis.com`)
- [ ] Google Analytics Admin API (`analyticsadmin.googleapis.com`)
- [ ] Google Analytics Data API (`analyticsdata.googleapis.com`)
- [ ] My Business APIs for GBP (`mybusinessbusinessinformation.googleapis.com`, `mybusinessaccountmanagement.googleapis.com`) — note the separate GBP API quota case (default 0 req/min) is tracked independently and does not block consent-screen verification.

---

## Step 1 — Domain verification (Search Console)

If `wefixtrades.com` is not already verified in Google Search Console under the same Google account you'll use to submit OAuth verification:

1. Open https://search.google.com/search-console and sign in with the account that owns the Google Cloud project.
2. Click **Add property** → **Domain** (not URL prefix; the Domain method covers all subdomains).
3. Enter `wefixtrades.com`.
4. Google shows a TXT record to add to your DNS. Add it via Cloudflare / IONOS / wherever your DNS lives.
5. Wait 5–15 min for propagation, then click **Verify**.

When verified, the property name shows up in the list. Don't proceed until this is green.

Then add `wefixtrades.com` under **Authorized domains** on the consent screen (Step 2) — Google cross-checks it against Search Console ownership.

---

## Step 2 — OAuth consent screen content

Open Google Cloud Console for `acx-audiobooks`:

https://console.cloud.google.com/apis/credentials/consent?project=acx-audiobooks

If you've never filled this in past the basics, you'll see an **EDIT APP** button.

### Page 1 — OAuth consent screen

| Field | Value | Status |
|---|---|---|
| **App name** | `WeFixTrades` | must exactly match the brand shown on the homepage |
| **User support email** | `support@wefixtrades.com` (must be a real, monitored inbox — Google verifies this) | |
| **App logo** | Upload the WeFixTrades square logo (PNG, 120×120 or larger, < 1MB) | ⚠ uploading a logo is itself a trigger for verification — fine, we're verifying anyway |
| **Application home page** | `https://wefixtrades.com` | ✅ verified 200 on 2026-06-10 |
| **Application privacy policy link** | `https://wefixtrades.com/privacy` | ✅ verified 200 on 2026-06-10; contains Google API Limited-Use disclosure (Section 5a) |
| **Application terms of service link** | `https://wefixtrades.com/terms` | ✅ verified 200 on 2026-06-10 |
| **Authorized domains** | `wefixtrades.com` (verified in Step 1) | |
| **Developer contact information** | The Gmail you're using to manage Google Cloud | |

Save and continue.

### Page 2 — Scopes

Click **ADD OR REMOVE SCOPES** and add **all** of these:

Sensitive (each will demand a justification at verification time — paste from `scope-justification.md`):

- `https://www.googleapis.com/auth/business.manage`
- `https://www.googleapis.com/auth/webmasters.readonly`
- `https://www.googleapis.com/auth/webmasters`
- `https://www.googleapis.com/auth/analytics.edit`
- `https://www.googleapis.com/auth/analytics.readonly`

Non-sensitive (no justification needed, but declare them since the sign-in flow requests them):

- `openid`
- `…/auth/userinfo.email`
- `…/auth/userinfo.profile`

No other scopes should be added unless you have a separate justification ready. (We deliberately do NOT request any *restricted* scopes — sensitive-tier review only, no CASA security assessment.)

Save and continue.

### Page 3 — Test users (only matters before verification approves)

Add the demo Google account you'll use during the video recordings, plus any internal testers. These accounts can use the app right now while the app is in "Testing" status. After verification approves and the app is in "Production", this list is ignored.

Save and continue.

### Page 4 — Summary

Review and click **BACK TO DASHBOARD**.

---

## Step 3 — Push the consent screen to "In production"

On the OAuth consent screen dashboard:

- If status shows **Testing**, click **PUBLISH APP**. Confirm the warning. The app moves to "In production — needs verification".
- This unlocks the **Prepare for verification** button.

---

## Step 4 — Record the demo videos

Google requires the video(s) to demonstrate the OAuth grant **and each sensitive scope's in-product functionality**. The recorder now produces **two recordings** (one per OAuth flow); a third short segment is manual. You can upload them as separate unlisted YouTube links (the form accepts one URL — concatenate with ffmpeg into a single video if you prefer one link; command below).

### 4a — Customer flow (`business.manage` + `webmasters.readonly`)

1. From your machine (NOT Replit — needs the local browser):
   ```bash
   cd <repo>
   npm install   # ensure playwright is installed
   npx playwright install chromium   # one-time
   ```
2. Export the demo credentials in your shell (do NOT put them in any file):
   ```bash
   export DEMO_PORTAL_EMAIL="<your test-portal-customer email>"
   export DEMO_PORTAL_PASSWORD="<password>"
   export DEMO_INCLUDE_RANKFLOW=1   # appends the RankFlow dashboard scene (webmasters.readonly)
   ```
3. Run:
   ```bash
   npm run record:google-verification
   ```
4. A browser opens. The script will:
   - Navigate the homepage, `/products/mapguard`, `/docs/mapguard`, `/privacy`.
   - Log in to the portal.
   - Open `/portal/mapguard`, scroll to the Connect banner, check consent, click Connect.
   - Land on `accounts.google.com` and **pause**.
5. Manually sign in to the demo Google account. On the consent screen, pause ~5 sec with the scopes visible (both "Manage your business listings" and "View Search Console data" entries must be readable), then click Allow.
6. The browser redirects back to `/portal/mapguard?gbp_connected=1`.
7. Close the Playwright Inspector window to resume the script.
8. The script captures the connected dashboard, then (with `DEMO_INCLUDE_RANKFLOW=1`) visits `/portal/rankflow` to show the Search Console data rendered in-product, then ends.

### 4b — Admin flow (`webmasters` + `analytics.edit` + `analytics.readonly`)

Prerequisite: Step 0 completed (admin flow configured), and you have an admin portal account.

1. Export the admin credentials:
   ```bash
   export DEMO_ADMIN_EMAIL="<admin account email>"
   export DEMO_ADMIN_PASSWORD="<password>"
   ```
2. Re-run `npm run record:google-verification` — the second test ("Admin SEO integrations") now runs. It will:
   - Log in and open `/admin/integrations/google`.
   - Click **Connect Google** and land on `accounts.google.com`, then **pause**.
3. Manually sign in with the company Google account. Pause ~5 sec on the consent screen with all scope entries visible (Search Console, Analytics edit/read, Business Profile), then Allow.
4. Close the Inspector; the script resumes and captures the connected admin console — the GSC card (connected account + recent sitemap/indexing history rows = `webmasters` in use) and the GA4 card (Measurement ID = `analytics.readonly` in use).

**Manual segment — `analytics.edit`:** property creation makes a real GA4 property, so it is not auto-driven. If you want the edit scope's action on film (recommended; reviewers sometimes ask), record 15 seconds with any screen recorder: on `/admin/integrations/google`, trigger the GA4 "create property" action against a disposable Analytics account and show the resulting Measurement ID appearing on the card. Delete the throwaway property afterwards in the Analytics admin UI. If you skip this, the justification text already explains the operator-triggered provisioning and the connected card demonstrates the outcome.

### Convert / merge and review

```bash
# convert one recording
ffmpeg -i test-results/google-verification/<...>/video.webm -c:v libx264 -preset slow -crf 22 google-verification-demo.mp4

# OR merge both recordings + manual clip into one file
printf "file 'customer.mp4'\nfile 'admin.mp4'\nfile 'manual-ga4.mp4'\n" > list.txt
ffmpeg -f concat -safe 0 -i list.txt -c copy google-verification-demo.mp4
```

Watch the result. Check that:

- [ ] The URL bar is **visible** through the entire Google consent screen frames (both flows).
- [ ] The URL bar shows `accounts.google.com/o/oauth2/...?client_id=<your-id>...` — reviewers verify this matches the client_id you submit.
- [ ] The consent screen shows **"WeFixTrades wants to access your Google Account"** (your app name).
- [ ] Every requested scope's description is **clearly readable** in at least one flow (GBP manage, Search Console view, Search Console manage, Analytics edit, Analytics read).
- [ ] Allow / Continue is clicked in both flows.
- [ ] Customer flow lands on `/portal/mapguard` connected state; RankFlow dashboard shows GSC-derived data.
- [ ] Admin flow lands on `/admin/integrations/google` with the Google card showing "Connected as …".

If anything is wrong, re-record (the scripts are idempotent).

### Upload to YouTube

1. Upload as **Unlisted** at https://studio.youtube.com.
2. Copy the share URL.

---

## Step 5 — Submit for verification

Back on the OAuth consent screen dashboard, click **PREPARE FOR VERIFICATION**. Walk through each step.

### Sensitive scopes step

Google asks the same questions **per scope**. Paste from `scope-justification.md`:

| Scope | Paste from |
|---|---|
| `business.manage` | scope-justification.md → its "Why we need this scope" + "Why a narrower scope won't work" sections |
| `webmasters.readonly` | its sections |
| `webmasters` | its sections |
| `analytics.edit` | its sections |
| `analytics.readonly` | its sections |
| **Demo video URL** | The YouTube unlisted link from Step 4 (one merged video covers all scopes) |

### Other questions

- **Are you using OAuth or App Engine?** → OAuth.
- **Public-facing privacy policy URL** → `https://wefixtrades.com/privacy`
- **Public-facing terms URL** → `https://wefixtrades.com/terms`
- **How do users access this functionality?** → Customers subscribe to MapGuard/RankFlow, then click "Connect Google Business" in their authenticated portal (`business.manage`, `webmasters.readonly`). WeFixTrades operators use the admin-only SEO console at `/admin/integrations/google` for the site's own Search Console and Analytics automation (`webmasters`, `analytics.edit`, `analytics.readonly`).

Submit.

---

## Step 6 — Wait & monitor

- Google typically responds within **3–7 business days** (longer when multiple sensitive scopes are in one submission — budget 2 weeks; with launch on 2026-07-15, submit no later than mid-June).
- Responses go to the **Developer contact information** email on the consent screen.
- Common follow-ups:
  - "Privacy policy doesn't explicitly mention Google API data" → it does (Section 5a). Point to the exact heading.
  - "Demo video doesn't show consent screen URL bar clearly" → re-record at higher resolution.
  - "App name doesn't match what's on the homepage" → ensure the consent screen says exactly `WeFixTrades`.
  - "Video doesn't demonstrate scope X" → point to the timestamp; if the analytics.edit action wasn't filmed, attach the 15-second manual clip from Step 4b.

During this waiting period, your existing test users (Step 2 → Page 3) can still use the app normally. Real customers attempting to connect will see the "unverified app" warning screen and have to click through "Advanced → Go to wefixtrades.com (unsafe)". That works but doesn't convert well — which is why we want approval.

When approved, the warning disappears and the consent flow is clean for everyone.

---

## Reference — what's in this kit

| File | Purpose |
|---|---|
| `record-demo.spec.ts` | Playwright tests that record the demo videos (customer flow + admin flow) |
| `playwright.config.ts` | Dedicated config for the recording (headed, video on, long timeout) |
| `scope-justification.md` | Paste-able per-scope text for the verification form (all 5 sensitive scopes) |
| `submission-checklist.md` | This file |
| `README.md` | Quick-start for the kit |

## Reference — files modified to support verification

| File | Why |
|---|---|
| `client/src/pages/marketing/privacy.tsx` | Section 5a — Google API Services / Limited Use disclosure with required Google policy language |
| `client/src/pages/portal/PortalMapguard.tsx` | TOS click-through consent before Connect button (PR #171) |
| `client/src/pages/marketing/docs/mapguard.tsx` | Public help docs explaining scope usage (PR #171) |

## Reference — where each scope lives in code (audit trail)

| Scope | Requested in | Exercised in |
|---|---|---|
| `business.manage` | `server/services/googleBusinessService.ts`, `server/services/socialSync/googleBusinessService.ts`, `server/lib/seo/googleOauth.ts` | GBP post/review/location calls (MapGuard workers), `server/lib/seo/gbpClient.ts` |
| `webmasters.readonly` | `server/services/googleBusinessService.ts` | `server/services/rankflow/searchConsoleService.ts` (search analytics, sites.get, index status) |
| `webmasters` | `server/lib/seo/googleOauth.ts` | `server/lib/seo/gscClient.ts` (sitemaps.submit/list, urlInspection, sites.list) |
| `analytics.edit` | `server/lib/seo/googleOauth.ts` | `server/lib/seo/ga4Client.ts` (`properties.create`, `dataStreams.create`) |
| `analytics.readonly` | `server/lib/seo/googleOauth.ts` | `server/lib/seo/ga4Client.ts` (`accountSummaries.list`); production GA4 *reports* use a service account instead (`server/lib/analytics/ga4DataClient.ts`) |
| `openid email profile` | `server/lib/googleSignin.ts` (non-sensitive — no verification needed) | portal sign-in |
