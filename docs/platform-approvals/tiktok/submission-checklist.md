# TikTok Content Posting API — Submission Checklist

## Pre-flight

- [ ] TikTok Developer account approved (basic developer status, not the audited Content Posting API yet)
- [ ] App created in https://developers.tiktok.com/apps/
- [ ] App icon uploaded (1024x1024 PNG)
- [ ] Privacy Policy URL loads cleanly: https://wefixtrades.com/privacy
- [ ] Terms URL loads cleanly: https://wefixtrades.com/terms
- [ ] Redirect URI added: `https://wefixtrades.com/api/socialsync/oauth/tiktok/callback`
- [ ] Screencast recorded per `screencast-script.md`, uploaded to YouTube as unlisted

## Submit Login Kit + Content Posting API audit

- [ ] In the TikTok Developer console, go to **My apps → <YourApp> → Manage → Login Kit** and add scopes:
  - [ ] `user.info.basic`
  - [ ] `user.info.profile`
  - [ ] `user.info.stats`
- [ ] Navigate to **Add Products → Content Posting API**
- [ ] Click **Apply for audit** (this triggers the manual review)
- [ ] Fill the application form fields, pasting from `application-form.md`:
  - [ ] App description (long)
  - [ ] Use case narrative
  - [ ] How users initiate posting (answer: "Users explicitly approve each post in the WeFixTrades portal OR enable autopilot in their settings; no posting happens without consent")
  - [ ] How tokens are protected (answer: "AES-256-GCM at rest, decrypted only in the publishing worker, never logged")
- [ ] Per-scope justification: paste from `permissions-justification.md`
- [ ] Attach screencast URL (unlisted YouTube link)
- [ ] Reviewer test instructions:

  ```
  1. Visit https://wefixtrades.com/login
  2. Use the reviewer account: tiktok-review@wefixtrades.com / [TODO: Alex provisions reviewer account]
  3. Navigate to Portal → SocialSync → Connections → Connect TikTok
  4. Authorize with any TikTok test account you control
  5. Approve the queued post; verify it appears on the test TikTok account
  ```

- [ ] Click **Submit for audit** at the bottom.

## Post-submission

- [ ] Note submission ID and date.
- [ ] Expect first response in 5–10 business days.
- [ ] If rejected: most common reasons are insufficient OAuth screen capture in screencast or vague autopilot description. Fix per the rejection email and resubmit.
