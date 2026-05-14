# Google OAuth verification submission — step-by-step checklist

Estimated total time: **45–60 minutes of your active time**, then **1–2 weeks of waiting** for Google's review team.

This walks you through every Google Cloud Console screen field-by-field. Do the steps in order — domain verification has to land before OAuth verification will pass.

---

## Step 1 — Domain verification (Search Console)

If `wefixtrades.com` is not already verified in Google Search Console under the same Google account you'll use to submit OAuth verification:

1. Open https://search.google.com/search-console and sign in with the account that owns the Google Cloud project.
2. Click **Add property** → **Domain** (not URL prefix; the Domain method covers all subdomains).
3. Enter `wefixtrades.com`.
4. Google shows a TXT record to add to your DNS. Add it via Cloudflare / IONOS / wherever your DNS lives.
5. Wait 5–15 min for propagation, then click **Verify**.

When verified, the property name shows up in the list. Don't proceed until this is green.

---

## Step 2 — OAuth consent screen content

Open Google Cloud Console for the project that owns `GOOGLE_BUSINESS_CLIENT_ID`:

https://console.cloud.google.com/apis/credentials/consent

If you've never filled this in past the basics, you'll see an **EDIT APP** button.

### Page 1 — OAuth consent screen

| Field | Value |
|---|---|
| **App name** | `WeFixTrades` |
| **User support email** | `support@wefixtrades.com` (must be a real, monitored inbox — Google verifies this) |
| **App logo** | Upload the WeFixTrades square logo (PNG, 120×120 or larger, < 1MB) |
| **Application home page** | `https://wefixtrades.com` |
| **Application privacy policy link** | `https://wefixtrades.com/privacy` |
| **Application terms of service link** | `https://wefixtrades.com/terms` |
| **Authorized domains** | `wefixtrades.com` (already verified above) |
| **Developer contact information** | The Gmail you're using to manage Google Cloud — usually your work account |

Save and continue.

### Page 2 — Scopes

Click **ADD OR REMOVE SCOPES** and add:

- `https://www.googleapis.com/auth/business.manage`

Mark it as a **Sensitive** scope (Google's UI may auto-classify it). No other scopes should be added unless you have a separate justification ready.

Save and continue.

### Page 3 — Test users (only matters before verification approves)

Add the demo Google account you'll use during the video recording, plus any internal testers. These accounts can use the app right now while the app is in "Testing" status. After verification approves and the app is in "Production", this list is ignored.

Save and continue.

### Page 4 — Summary

Review and click **BACK TO DASHBOARD**.

---

## Step 3 — Push the consent screen to "In production"

On the OAuth consent screen dashboard:

- If status shows **Testing**, click **PUBLISH APP**. Confirm the warning. The app moves to "In production — needs verification".
- This unlocks the **Prepare for verification** button.

---

## Step 4 — Record the demo video

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
5. Manually sign in to the demo Google account. On the consent screen, pause ~5 sec with the scope visible, then click Allow.
6. The browser redirects back to `/portal/mapguard?gbp_connected=1`.
7. Close the Playwright Inspector window to resume the script.
8. The script captures a final ~6 sec of the connected dashboard, then ends.
9. Video file is saved under `test-results/google-verification/.../video.webm`.

### Convert and review

```bash
ffmpeg -i test-results/google-verification/<...>/video.webm \
       -c:v libx264 -preset slow -crf 22 \
       google-verification-demo.mp4
```

Watch the mp4. Check that:

- [ ] The URL bar is **visible** through the entire Google consent screen frames.
- [ ] The URL bar shows `accounts.google.com/o/oauth2/...?client_id=<your-id>...` — your reviewers will verify this matches the client_id you submit.
- [ ] The consent screen shows **"WeFixTrades wants to access your Google Account"** (your app name).
- [ ] The requested scope description ("Manage your business listings on Google" or similar) is **clearly readable**.
- [ ] Allow / Continue is clicked.
- [ ] The redirect lands on `/portal/mapguard` and the banner switches to connected state.

If anything is wrong, re-record (the script is idempotent).

### Upload to YouTube

1. Upload as **Unlisted** at https://studio.youtube.com.
2. Copy the share URL.

---

## Step 5 — Submit for verification

Back on the OAuth consent screen dashboard, click **PREPARE FOR VERIFICATION**. Walk through each step.

### Sensitive / restricted scopes step

For `business.manage`, Google asks:

| Field | Paste from |
|---|---|
| **What features/functionality does this scope enable?** | `scope-justification.md` → "Why we need this scope" section |
| **Are there any narrower scopes that could work?** | `scope-justification.md` → "Why a narrower scope won't work" section |
| **Demo video URL** | The YouTube unlisted link from Step 4 |

### Other questions

- **Are you using OAuth or App Engine?** → OAuth.
- **Public-facing privacy policy URL** → `https://wefixtrades.com/privacy`
- **Public-facing terms URL** → `https://wefixtrades.com/terms`
- **How do users access this scope's functionality?** → They subscribe to MapGuard, then click "Connect Google Business" in their authenticated portal.

Submit.

---

## Step 6 — Wait & monitor

- Google typically responds within **3–7 business days**.
- Responses go to the **Developer contact information** email on the consent screen.
- Common follow-ups:
  - "Privacy policy doesn't explicitly mention Google API data" → it does (Section 5a). Point to the exact heading.
  - "Demo video doesn't show consent screen URL bar clearly" → re-record at higher resolution.
  - "App name doesn't match what's on the homepage" → ensure the consent screen says exactly `WeFixTrades`.

During this waiting period, your existing test users (Step 2 → Page 3) can still use the app normally. Real customers attempting to connect will see the "unverified app" warning screen and have to click through "Advanced → Go to wefixtrades.com (unsafe)". That works but doesn't convert well — which is why we want approval.

When approved, the warning disappears and the consent flow is clean for everyone.

---

## Reference — what's in this kit

| File | Purpose |
|---|---|
| `record-demo.spec.ts` | Playwright test that records the demo video |
| `playwright.config.ts` | Dedicated config for the recording (headed, video on, long timeout) |
| `scope-justification.md` | Paste-able text for the verification form |
| `submission-checklist.md` | This file |
| `README.md` | Quick-start for the kit |

## Reference — files modified to support verification

| File | Why |
|---|---|
| `client/src/pages/marketing/privacy.tsx` | Added Section 5a — Google API Services / Limited Use disclosure with required Google policy language |
| `client/src/pages/portal/PortalMapguard.tsx` | TOS click-through consent before Connect button (PR #171) |
| `client/src/pages/marketing/docs/mapguard.tsx` | Public help docs explaining scope usage (PR #171) |
