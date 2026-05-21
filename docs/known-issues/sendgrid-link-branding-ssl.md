# Known issue — SendGrid link-branding SSL not provisioned

**Status:** Hard-blocked on Alex (registrar UI + SendGrid dashboard).
**Tracked in:** SCORECARD.md, audit `docs/audit/email-infra-audit-2026-05-21.md` gap #1.
**Surfaced by:** W-AX-2 (audit AU-6 follow-up). NOT fixable in code — this doc captures the manual fix steps.

## Root cause

SendGrid issues a per-account "branded link" subdomain of the sending domain
(e.g. `url1527.wefixtrades.com`) and is supposed to auto-provision a Let's
Encrypt SSL cert for it. Provisioning has not completed for our account,
so any click-tracked URL SendGrid rewrites would resolve to an HTTPS
endpoint with no valid certificate — browsers show a security warning and
deliverability is hit.

Until link branding is fully provisioned, SendGrid click + open tracking
is **globally disabled per-message** via the `X-SMTPAPI` header set in
`server/lib/emailTransport.ts`. Our own pixel + redirect tracking via
`emailTracking.ts` runs through `${APP_URL}/api/email/click/:id`, which
uses the main `wefixtrades.com` cert — that part works.

## Current mitigation (already in code)

- `X-SMTPAPI: {"filters":{"clicktrack":{"settings":{"enable":0}},"opentrack":{"settings":{"enable":0}}}}`
  is added to every outbound send in `server/lib/emailTransport.ts`.
- All click-through analytics route through our own `/api/email/click/:id`
  redirect tracked by `emailTracking.ts` — no SendGrid link rewriting.
- Open-rate analytics are off until link branding is fixed.

## Fix steps (Alex must perform — manual, hard-block)

These cannot be automated because they require interactive logins to a
domain registrar and to SendGrid's dashboard.

### 1. SendGrid dashboard — start the Link Branding flow

1. Log in at <https://app.sendgrid.com/>.
2. Navigate: **Settings → Sender Authentication → Link Branding**.
3. Click **Get Started** (or **Add a Branded Link** if one already exists in error).
4. Domain: `wefixtrades.com`.
5. Subdomain: leave as the SendGrid default (`url####` — auto-generated).
6. Click **Next**. SendGrid will show 3 CNAME records to add at the registrar.

### 2. Registrar — add the CNAME records

Records look like (exact subdomain numbers will differ — copy from the
SendGrid screen, do not hand-roll):

```
url####.wefixtrades.com         CNAME   sendgrid.net
####.wefixtrades.com            CNAME   sendgrid.net
em####.wefixtrades.com          CNAME   uXXXXXXX.wl###.sendgrid.net
```

TTL: 3600 (or registrar default). Add all three under the
`wefixtrades.com` zone at the active registrar (see `capabilities.yaml`
→ `wefixtrades.registrar` for the current vendor).

### 3. SendGrid dashboard — verify

1. Back at the Link Branding screen, click **Verify**.
2. SendGrid issues a Let's Encrypt cert (5–15 min, sometimes longer).
3. Status flips to **Verified** + **Valid Certificate**.

### 4. Re-enable click + open tracking in code

Once SendGrid shows the cert as valid:

1. In `server/lib/emailTransport.ts`, remove the `X-SMTPAPI` disable
   header (or flip both `clicktrack` and `opentrack` settings to
   `enable:1`). Re-enable per-message overrides where they exist.
2. Remove (or leave for safety, but mark as redundant) the in-app
   `/api/email/click/:id` redirect — SendGrid's link rewriter will
   replace it.
3. Smoke-test: send a marketing email to a seed inbox, click the link,
   confirm the URL resolves cleanly through `url####.wefixtrades.com`
   over HTTPS with no cert warning.
4. Confirm a `click` event arrives at the SendGrid Event Webhook
   (`POST /api/email/sendgrid-webhook`).

### 5. Update SCORECARD + remove this doc

- Mark the SendGrid link-branding-SSL row green on SCORECARD.md.
- Delete this file (or move to `docs/known-issues/archive/`).

## Why this is NOT a code fix

Every step above is an interactive dashboard click or registrar DNS edit.
There is no API on our side that can complete the Link Branding flow —
SendGrid's domain-verification handshake requires the dashboard. The
registrar's DNS UI is also human-only (no zone-edit API token wired up
for this domain at present).

## Estimated time

- Registrar DNS edit + SendGrid verify: ~15 min active work, ~30 min cert provisioning.
- Code re-enable + smoke test: ~10 min.
