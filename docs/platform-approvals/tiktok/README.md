# TikTok Content Posting API — Status

**Product gated by this approval:** SocialSync (TikTok publishing tier — planned).

**Typical timeline:** 3–6 weeks.

- Developer account: instant.
- Login Kit scope additions: 2–5 business days.
- Content Posting API audit: 2–4 weeks.

**Pass rate:** ~50% on first submission. TikTok is stricter than Meta because direct-post abuse is more common. Resubmission pass rate ~85% once the original issue is addressed.

**Risk profile:** Medium. The `video.publish` scope (direct posting without manual user finalize step) is what auditors scrutinize hardest. Our autopilot rationale — customers explicitly buy a done-for-you service — is well-aligned with TikTok's stated approval criteria.

## Likely rejection reasons

1. **Screencast doesn't show the OAuth consent screen fully.** → Re-record showing every permission line for at least 5 seconds.
2. **Use case described as "for our users to post their content."** → Reframe: each "user" is a trades business customer who has consented in advance through their WFT subscription agreement, and every video originates from photos/notes they supplied.
3. **No clear opt-out / disconnect flow.** → `privacy-snippet.md` includes the disconnect path; ensure the WFT portal UI matches before screencasting.
4. **Privacy policy missing TikTok-specific language.** → Paste `privacy-snippet.md` first.
5. **Token storage description vague.** → Use the exact wording from `privacy-snippet.md` ("AES-256-GCM at rest").

## Files in this directory

- `application-form.md`
- `screencast-script.md`
- `permissions-justification.md`
- `privacy-snippet.md`
- `submission-checklist.md`

## Next steps for Alex

1. Resolve `[TODO: Alex confirms ...]` markers.
2. Build the TikTok OAuth callback route + publisher (currently not in codebase — this approval also drives the engineering work).
3. Record the screencast against a working sandbox.
4. Submit.
