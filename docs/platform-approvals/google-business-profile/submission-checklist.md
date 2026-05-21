# Google Business Profile API — Submission Checklist

Two filings:

1. **Allowlist application** (the GBP-specific gate)
2. **OAuth verification + CASA** (same machinery as YouTube)

Both reference the same Google Cloud project. File #1 first; #2 cannot succeed without it.

## Pre-flight

- [ ] Google Cloud project created with billing enabled
- [ ] Privacy + Terms URLs validated, with GBP-specific section from `privacy-snippet.md`
- [ ] OAuth consent screen configured (External, Production)
- [ ] Domain ownership verified in Google Search Console for `wefixtrades.com`
- [ ] Screencast recorded per `screencast-script.md`, uploaded to YouTube as Unlisted

## Filing #1 — GBP Allowlist Application

- [ ] Go to https://support.google.com/business/contact/api_default
- [ ] Sign in with the Google account that owns the GCP project
- [ ] Fill the form, pasting from `application-form.md` (Allowlist section):
  - [ ] Company name, website, contact, country
  - [ ] GCP project ID and project number
  - [ ] App use case (paste from `application-form.md`)
  - [ ] Volume estimate (~5,000 calls/day)
- [ ] Submit. Expect response in 1–4 weeks (email).

Once approved, Google enables the GBP APIs in your project automatically.

## Filing #2 — OAuth Verification

After allowlist approval (or in parallel — verification status doesn't depend on allowlist):

- [ ] In https://console.cloud.google.com/apis/credentials/consent, push to Production if currently Testing
- [ ] Add scope: `https://www.googleapis.com/auth/business.manage`
- [ ] Paste justification from `permissions-justification.md` into the per-scope field
- [ ] Paste use case narrative from `application-form.md`
- [ ] Attach screencast URL (unlisted YouTube link)
- [ ] Confirm domain ownership in the verification flow
- [ ] Provide reviewer test instructions:

  ```
  1. Visit https://wefixtrades.com/login
  2. Use reviewer account: gbp-review@wefixtrades.com / [TODO: Alex provisions]
  3. Portal → MapGuard → Connect Google Business Profile
  4. Authorize with any Google account that manages a GBP location
  5. Verify the location is connected and the MapGuard health audit runs
  6. Optionally: approve a queued Google Post in SocialSync
  ```

- [ ] Click **Submit for verification**.

## CASA assessment (likely required)

- [ ] Use the same assessor as YouTube; one engagement can cover both.
- [ ] Budget: $3,000–$5,000 USD total for YT + GBP combined
- [ ] Timeline: 4–8 weeks

## Post-submission

- [ ] Allowlist approval comes via email.
- [ ] Verification status visible in Google Cloud Console.
- [ ] If allowlist is rejected: most often because the use case is too vague or the volume estimate is unrealistic. Be specific.
- [ ] If verification is rejected: usually missing privacy policy language or unverified domain. Fix and resubmit.
