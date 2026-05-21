# LinkedIn Marketing Developer Platform — Status

**Product gated by this approval:** SocialSync (LinkedIn publishing). Also unblocks ContentFlow's LinkedIn adapter (`server/services/contentflow/linkedinPublisher.ts`).

**Typical timeline:** 2–8 weeks. Most variable of all six platforms — LinkedIn does not publish median response times.

**Pass rate:** ~40% on first submission. LinkedIn MDP is the strictest gate in the wave. Many apps need 2–3 resubmissions.

**Risk profile:** High (relative). MDP is gated specifically to keep low-quality posting tools out of the ecosystem. Approval depends heavily on app maturity and use case clarity.

## Likely rejection reasons

1. **App appears low-quality or single-purpose.** → Emphasize WFT is a 9-product SaaS suite, not a posting-bot single-feature app. Reference the broader product line in the use case narrative.
2. **Vague projected volume.** → Concrete numbers help: "50 organizations at launch, 1 post/week each, ~200 posts/month."
3. **No clear outcome for the LinkedIn marketing professional.** → MDP exists for marketing-professional tools. Frame outcomes in marketing terms: "consistent posting cadence, content tuned to vertical."
4. **Screencast skips the OAuth consent screen.** → Hold on it for 5+ seconds.
5. **Privacy policy missing LinkedIn-specific language.** → Paste `privacy-snippet.md`.

## Files in this directory

- `application-form.md`
- `screencast-script.md`
- `permissions-justification.md`
- `privacy-snippet.md`
- `submission-checklist.md`

## Next steps for Alex

1. Confirm WFT LinkedIn Company Page exists (or create one).
2. Resolve `[TODO: Alex confirms ...]` markers.
3. Update privacy policy.
4. Build the LinkedIn OAuth callback route (currently not in codebase; the publisher exists but auth flow needs wiring).
5. Submit Step 1 (self-serve products), then Step 2 (MDP) per `submission-checklist.md`.
