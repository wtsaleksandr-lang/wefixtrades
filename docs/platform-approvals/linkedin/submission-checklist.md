# LinkedIn MDP — Submission Checklist

## Pre-flight

- [ ] WeFixTrades LinkedIn Company Page exists and is verified
- [ ] LinkedIn Developer account at https://www.linkedin.com/developers/apps tied to that page
- [ ] App created
- [ ] App logo (300x300 PNG) uploaded
- [ ] Privacy + Terms URLs added and load cleanly
- [ ] Privacy policy contains LinkedIn-specific section from `privacy-snippet.md`
- [ ] OAuth redirect URI added: `https://wefixtrades.com/api/socialsync/oauth/linkedin/callback`
- [ ] Screencast recorded per `screencast-script.md`, uploaded to YouTube as Unlisted

## Step 1 — Enable self-serve products (instant)

- [ ] App → Products tab → **Sign In with LinkedIn using OpenID Connect** → Request access (instant)
- [ ] App → Products tab → **Share on LinkedIn** → Request access (instant)

These two unlock basic scopes and let you test the auth flow against personal profiles.

## Step 2 — Apply for Marketing Developer Platform (the gate)

- [ ] App → Products tab → **Marketing Developer Platform** → Apply
- [ ] Fill the application form, pasting from `application-form.md`:
  - [ ] App description
  - [ ] Use case narrative
  - [ ] Per-scope justification (paste from `permissions-justification.md`)
  - [ ] Projected volume (orgs served, posts/month)
- [ ] Attach screencast URL
- [ ] Provide reviewer test instructions:

  ```
  1. Visit https://wefixtrades.com/login
  2. Use reviewer account: linkedin-review@wefixtrades.com / [TODO: Alex provisions]
  3. Portal → SocialSync → Connections → Connect LinkedIn
  4. Authorize with any LinkedIn account that admins a Company Page
  5. Pick the Company Page, approve the queued post, verify it appears
  ```

- [ ] Submit.

## Step 3 — Community Management API (if MDP approves)

- [ ] After MDP approval, request **Community Management API** for `w_organization_social` (often auto-approved once MDP is in place).

## Post-submission

- [ ] LinkedIn MDP response timeline: 2–8 weeks. Varies widely; reach out via the developer console if no response after 4 weeks.
- [ ] If rejected: most common reasons are insufficient app maturity or vague use case. Add more product detail and resubmit.
