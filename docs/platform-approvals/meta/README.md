# Meta App Review — Status

**Product gated by this approval:** SocialSync (Facebook + Instagram publishing).

**Typical timeline:** 4–8 weeks end-to-end, broken down as:

- Business Verification: 1–5 business days (if not already complete).
- Initial scope review: 4–10 business days per submission.
- Resubmission (if rejected): another 4–10 business days.

**Pass rate (Meta-published 2025 figures):** ~60–70% on first submission for use cases as concrete and well-documented as SocialSync. Resubmission pass rate is ~90% once the original rejection reason is addressed.

**Risk profile:** Medium-low. Our use case (publishing posts to a Facebook Page the customer explicitly connects, on their own behalf) is well-trodden and within the spirit of the Pages API. The riskier scopes (`pages_read_user_content`) are easily justified by duplicate-detection logic.

## Likely rejection reasons (and the fix)

1. **Screencast too short or unclear** → ensure the demo is at least 60 seconds and shows the OAuth consent screen, the page picker, and the post landing live.
2. **Privacy policy lacks Meta-specific language** → paste `privacy-snippet.md` into the privacy policy before submitting.
3. **Business Verification not complete** → finish verification first; permissions cannot be granted in advanced access otherwise.
4. **Reviewer can't test the integration** → include reviewer credentials and a step-by-step test script (already in `submission-checklist.md`).
5. **App icon wrong size or transparent background** → upload 1024x1024 PNG with solid background.

## Files in this directory

- `application-form.md` — every field with pre-filled answers.
- `screencast-script.md` — 75-second demo script.
- `permissions-justification.md` — per-scope rationale (this is the most-rejected field).
- `privacy-snippet.md` — paste into privacy policy.
- `submission-checklist.md` — click-by-click submission flow.

## Next steps for Alex

1. Resolve the `[TODO: Alex confirms ...]` markers in `application-form.md`.
2. Record the screencast.
3. Provision a Meta test user and reviewer account.
4. Run `submission-checklist.md` end-to-end.
