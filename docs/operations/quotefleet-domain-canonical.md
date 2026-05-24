# QuoteFleet canonical domain — 2026-05-24

> Cross-project ops note. Lives in the WeFixTrades repo because cross-project
> orchestration docs centralize here (per `CLAUDE.md` operating context).

## Decision: `quotefleet.net` is canonical

Observed state as of 2026-05-24 (per PR #687 cross-project audit):

| Host | HTTP probe | Status |
| --- | --- | --- |
| `quotefleet.net`  | 200 OK | Serving live |
| `quotefleet.com`  | Times out | DNS resolves but no TLS/HTTP response |

### Recommendation

1. **Keep `quotefleet.net` as the canonical domain.** It is already wired
   in DNS, terminates TLS, and serves a 200 — no incremental cost or DNS
   work to keep it.

2. **Defer the `.com` decision.** Options when Alex revisits:
   - **(a) Make `.com` redirect to `.net`.** Adds a Cloudflare page-rule
     or Replit redirect; one-time setup, ~5 min. Worth doing if any
     marketing material (cards, ads) ever uses the `.com` form.
   - **(b) Let the `.com` registration lapse.** Saves the renewal fee
     but loses the brand string permanently. Not recommended for a
     consumer-facing SaaS — competitors can pick up the lapsed domain.
   - **(c) Stand up an A-record / nameserver on `.com`.** Required if
     `.com` is meant to become canonical instead. Costs DNS work + a
     potential SEO migration.

3. **Do not switch canonical to `.com` until it serves 200.** All
   outbound links, OAuth redirect URIs, Stripe webhook destinations,
   Twilio SMS short-links, and SEO sitemaps point at `.net`. A switch
   touches at minimum: DNS (IONOS), Stripe webhook destination, Google
   Search Console property, social profile bios.

### Action (none required this PR)

This doc is informational. No DNS or registrar changes are being made
here — that would require Alex (registrar UI = hard-blocker per
`policies.md`). When Alex is ready to triage the `.com`, this doc is
the starting point.

### Related
- PR #687 (audit that surfaced the `.com` timeout)
- QuoteFleet repo: `wtsaleksandr-lang/quotefleet`
- DNS lives in IONOS (per Doppler `IONOS_API_KEY`, see
  `api-account-audit-2026-05-24.md` row "IONOS")
