# Meta App Review — Submission Checklist

Do these in order. Each step should take 1–3 minutes.

## Pre-flight (one-time)

- [ ] Confirm Meta Business Verification is complete at https://business.facebook.com/settings/security_center
  - If not: complete it first. Verification typically takes 1–5 business days.
- [ ] Confirm App is in `Live` mode (not Development) at https://developers.facebook.com/apps/
- [ ] Confirm App icon is 1024x1024 PNG and uploaded under Settings → Basic
- [ ] Confirm Privacy Policy URL loads cleanly: https://wefixtrades.com/privacy
- [ ] Confirm Terms URL loads cleanly: https://wefixtrades.com/terms
- [ ] Confirm Data Deletion URL loads cleanly: https://wefixtrades.com/privacy#data-deletion
- [ ] Record screencast per `screencast-script.md` → upload to YouTube as unlisted, copy URL

## Submit the review

- [ ] Log in to https://developers.facebook.com/apps/<APP_ID>/app-review/permissions/
- [ ] Click **Request advanced access** next to each scope:
  - [ ] `pages_show_list`
  - [ ] `pages_read_engagement`
  - [ ] `pages_manage_posts`
  - [ ] `pages_read_user_content`
  - [ ] `pages_manage_metadata`
  - [ ] `business_management`
  - [ ] `pages_messaging`
  - [ ] `whatsapp_business_messaging`
  - [ ] `instagram_basic`
  - [ ] `instagram_content_publish`
- [ ] For each scope, paste the matching justification from `permissions-justification.md` into the "How will you use this permission?" field.
- [ ] In the global submission notes, paste the use case narrative from `application-form.md` (Use Case Narrative section).
- [ ] Attach the screencast URL (unlisted YouTube link) — Meta also accepts direct MP4 upload up to 100MB.
- [ ] Provide step-by-step reviewer instructions in the "How to test" field:

  ```
  1. Visit https://wefixtrades.com/login
  2. Use the reviewer account: meta-review@wefixtrades.com / [TODO: Alex provisions reviewer account]
  3. Navigate to Portal → SocialSync → Connect
  4. Click "Connect Facebook" and authorize with the Meta test user provided
  5. Pick the test page "WeFixTrades Demo Plumbing"
  6. On the SocialSync dashboard, click "Approve" on the queued post
  7. Within 5 seconds the post will appear on the test page
  ```

- [ ] Click **Submit for Review** at the bottom of the page.

## Post-submission

- [ ] Note submission ID and date in `wip/` log.
- [ ] Expect first response in 4–8 business days.
- [ ] If rejected: read the rejection reason carefully, fix the specific issue (usually screencast or privacy text), and resubmit — no penalty for resubmission.
