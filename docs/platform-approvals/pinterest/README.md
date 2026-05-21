# Pinterest API Standard Access — Status

**Product gated by this approval:** SocialSync (Pinterest publishing). Also unblocks ContentFlow's Pinterest adapter (`server/services/contentflow/pinterestPublisher.ts`).

**Typical timeline:** 2–4 weeks for Standard Access approval. Trial Access is instant.

**Pass rate:** ~80% on first submission for clear use cases.

**Risk profile:** Low. Pinterest's approval process is the most permissive of the six platforms in this wave because pinning is core to Pinterest's growth and they actively want third-party publishing tools.

## Likely rejection reasons

1. **Vague pin content description.** → Pin examples should be specific (before/after photos, project portfolios, seasonal tips). Be concrete in `application-form.md`.
2. **Missing Pinterest Business account.** → The connected account being managed must be a Business account (not personal).
3. **Privacy policy missing Pinterest section.** → Paste from `privacy-snippet.md`.
4. **Trial Access not exercised first.** → Pinterest expects you to have built something with Trial Access before requesting Standard. Build a working Pinterest connect flow against Trial first.

## Files in this directory

- `application-form.md`
- `screencast-script.md`
- `permissions-justification.md`
- `privacy-snippet.md`
- `submission-checklist.md`

## Next steps for Alex

1. Resolve `[TODO: Alex confirms ...]` markers.
2. Build the Pinterest OAuth callback route (currently not in codebase).
3. Exercise Trial Access end-to-end so the reviewer can confirm the integration actually works.
4. Submit Standard Access request.
