# Pinterest API Standard Access — Submission Checklist

## Pre-flight

- [ ] Pinterest Developer account at https://developers.pinterest.com/ created and verified
- [ ] Pinterest Business account exists for WeFixTrades (or `[TODO: Alex creates one]`)
- [ ] App created in Pinterest Developer console
- [ ] App logo (250x250 PNG min) uploaded
- [ ] Redirect URI added: `https://wefixtrades.com/api/socialsync/oauth/pinterest/callback`
- [ ] Privacy + Terms URLs validated
- [ ] Privacy policy includes Pinterest-specific section from `privacy-snippet.md`
- [ ] Screencast recorded per `screencast-script.md`, uploaded to YouTube as Unlisted

## Trial Access (instant — needed to build)

- [ ] In Pinterest Developer console, select your app → **Set up an app** → Trial Access
- [ ] Add scopes: `boards:read`, `boards:write`, `pins:read`, `pins:write`, `user_accounts:read`
- [ ] Confirm trial access works in development

## Standard Access (the actual approval)

- [ ] In your Pinterest app → **Manage Access** → **Request Standard Access**
- [ ] Fill the request form, pasting from `application-form.md`:
  - [ ] App description (long)
  - [ ] Use case narrative
  - [ ] Per-scope justification — paste each from `permissions-justification.md`
  - [ ] Expected pin volume / API call volume
- [ ] Attach screencast URL
- [ ] Reviewer test instructions:

  ```
  1. Visit https://wefixtrades.com/login
  2. Use reviewer account: pinterest-review@wefixtrades.com / [TODO: Alex provisions]
  3. Portal → SocialSync → Connections → Connect Pinterest
  4. Authorize with any Pinterest Business test account
  5. Pick a target board, approve the queued pin, verify it appears
  ```

- [ ] Submit.

## Post-submission

- [ ] Pinterest typically responds in 5–15 business days.
- [ ] On approval, Standard Access is activated; no code changes required.
- [ ] On rejection: read the reason, fix, resubmit.
