# Google Business Profile API — Status

**Products gated by this approval:** MapGuard, SocialSync (GBP publishing tier), ReputationShield (review monitoring + reply). This is the single most important approval in the wave — three live products depend on it.

**Typical timeline:**

- Allowlist application: 1–4 weeks.
- OAuth verification (no CASA): 4–6 weeks.
- OAuth verification + CASA: 8–12 weeks.

Allowlist and OAuth verification can run in parallel.

**Pass rate:**

- Allowlist: ~75% on first submission for well-described managed-service use cases.
- OAuth verification: ~70%.

**Risk profile:** High importance, medium risk. The use case is well-established (many SaaS tools manage GBPs on behalf of customers), but `business.manage` is sensitive and the allowlist gate adds an extra step relative to other Google APIs.

## Likely rejection reasons

1. **Allowlist application too vague.** → The form's free-text fields demand specifics. Paste from `application-form.md`'s "Detailed use case" section verbatim.
2. **OAuth privacy policy missing Google language.** → Paste from `privacy-snippet.md` — the link to Google's User Data Policy is required.
3. **Domain ownership not verified in Search Console.** → Do this before submitting verification.
4. **Reviewer can't test the integration.** → Provide reviewer credentials + working test GBP.
5. **No clear separation between this app and YouTube.** → Both use the same OAuth consent screen; ensure the consent screen description covers BOTH product use cases.

## Why this approval matters most

- MapGuard is a current product (already sold). Without GBP API, MapGuard runs on manual labor (Alex / WFT staff manually editing GBPs through the GBP web UI). API access turns it into a scalable managed service.
- ReputationShield's "respond to Google reviews" feature requires the API for the one-click reply experience.
- SocialSync's "post to Google" tier — currently advertised on the product page — depends on this.

Three "Coming Soon" features become "Live" the day this clears.

## Files in this directory

- `application-form.md`
- `screencast-script.md`
- `permissions-justification.md`
- `privacy-snippet.md`
- `submission-checklist.md`

## Next steps for Alex

1. Resolve `[TODO: Alex confirms ...]` markers (esp. GCP project ID + number).
2. Verify wefixtrades.com in Google Search Console.
3. Update privacy policy.
4. File the allowlist application first (highest-leverage step).
5. Once allowlist returns, submit OAuth verification.
6. Plan CASA budget (combined with YouTube).
