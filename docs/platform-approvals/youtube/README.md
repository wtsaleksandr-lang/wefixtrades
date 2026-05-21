# YouTube Data API v3 — Status

**Product gated by this approval:** SocialSync (YouTube publishing) and the existing ContentFlow YouTube adapter (`server/services/contentflow/youtubePublisher.ts`).

**Typical timeline:**

- OAuth verification (no CASA needed): 4–6 weeks.
- OAuth verification + CASA Tier 2: 8–12 weeks.
- Quota extension: 1–3 weeks (independent of verification).

**Pass rate:** ~70% on first submission for verification; ~95% for quota extensions with reasonable math.

**Risk profile:** Medium. The `youtube.upload` scope is sensitive, and the CASA security assessment adds 4–8 weeks of third-party work. Plan the budget and timeline early.

## Likely rejection reasons

1. **Privacy policy missing the Google API Services User Data Policy link.** → `privacy-snippet.md` includes it; ensure it's pasted verbatim.
2. **Screencast doesn't show the OAuth consent screen for at least 3 seconds.** → Re-record with the consent screen on display.
3. **Domain not verified in Google Search Console.** → Verify before submitting.
4. **OAuth consent screen still in "Testing" state.** → Push to "Production" first.
5. **App home page doesn't clearly describe the YouTube integration.** → Add a small section on https://wefixtrades.com/products/socialsync.

## CASA assessment

For `youtube.upload` (sensitive), Google typically requires CASA Tier 2. This is a real-cost, real-timeline item:

- $3,000–$5,000 USD
- 4–8 weeks
- Choose from Google's approved assessors

`[TODO: Alex picks a CASA assessor and budgets]`

## Files in this directory

- `application-form.md`
- `screencast-script.md`
- `permissions-justification.md`
- `privacy-snippet.md`
- `submission-checklist.md`

## Next steps for Alex

1. Resolve `[TODO: Alex confirms ...]` markers (GCP project ID, reviewer account, etc).
2. Update privacy policy with the YouTube section before submitting.
3. Verify wefixtrades.com in Google Search Console.
4. Record screencast.
5. Submit OAuth verification + quota extension in parallel.
6. Plan CASA budget for the inevitable assessment requirement.
