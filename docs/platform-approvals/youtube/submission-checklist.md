# YouTube Data API v3 — Verification + Quota Extension Checklist

Two filings happen here:

1. **OAuth Verification + Brand Verification + CASA assessment** (for the sensitive `youtube.upload` scope)
2. **Quota extension request** (separate form)

Do #1 first; #2 can run in parallel.

## Pre-flight

- [ ] YouTube Data API v3 enabled in the Google Cloud project at https://console.cloud.google.com/apis/library/youtube.googleapis.com
- [ ] OAuth consent screen status: External, Production (not Testing)
- [ ] Logo uploaded (120x120 PNG)
- [ ] Privacy URL loads: https://wefixtrades.com/privacy
- [ ] Terms URL loads: https://wefixtrades.com/terms
- [ ] Privacy policy contains YouTube/Google language from `privacy-snippet.md`
- [ ] App home page loads: https://wefixtrades.com
- [ ] Domain ownership verified in Google Search Console for `wefixtrades.com`
- [ ] Screencast recorded per `screencast-script.md`, uploaded to YouTube as Unlisted

## Submission #1 — OAuth Verification

- [ ] Go to https://console.cloud.google.com/apis/credentials/consent
- [ ] Click **Prepare for verification** (or **Push to production** if currently in Testing)
- [ ] In the scopes section, add:
  - [ ] `https://www.googleapis.com/auth/youtube.upload`
  - [ ] `https://www.googleapis.com/auth/youtube.readonly` (if including readonly)
- [ ] For each sensitive scope, paste the justification text from `permissions-justification.md` into the per-scope field.
- [ ] In "How will this scope be used?" paste the use case narrative from `application-form.md`.
- [ ] Attach screencast URL (the unlisted YouTube link)
- [ ] Confirm domain ownership in the verification flow.
- [ ] Provide reviewer instructions:

  ```
  1. Visit https://wefixtrades.com/login
  2. Use reviewer account: youtube-review@wefixtrades.com / [TODO: Alex provisions]
  3. Navigate to Portal → SocialSync → Connections → Connect YouTube
  4. Authorize with any Google test account that owns a YouTube channel
  5. Approve the queued video; verify it appears on the test channel
  ```

- [ ] Click **Submit for verification**.

## CASA assessment (if required)

Google will email Alex if a CASA security assessment is required (likely yes for `youtube.upload`).

- [ ] Pick an assessor from Google's approved list: https://cloud.google.com/find-a-partner
- [ ] Budget: $3,000–$5,000 USD
- [ ] Timeline: 4–8 weeks
- [ ] Provide assessor with: codebase access OR a security questionnaire (CASA Tier 2 in most cases)

## Submission #2 — Quota Extension

- [ ] Go to https://support.google.com/youtube/contact/yt_api_form
- [ ] Fill out the form with:
  - [ ] Project ID: `[TODO: Alex confirms GCP project ID]`
  - [ ] Default quota currently: 10,000 units/day
  - [ ] Requested quota: 100,000 units/day
  - [ ] Use case: paste the narrative from `application-form.md`
  - [ ] Math justification: ~50 customers × 2 videos/week × 1,600 units = ~16k/week base; plus reporting reads pushes daily peak to ~30–50k. Buffer to 100k.
- [ ] Submit. Expect response in 1–3 weeks.

## Post-submission

- [ ] OAuth verification status visible in console; ETA shown.
- [ ] Quota extension response by email.
- [ ] If rejected: read reason, fix, resubmit (no penalty).
