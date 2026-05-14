# ReputationShield operator runbook

Ground-truth for everything operators need to know to onboard a customer
to ReputationShield, fulfil the service day-to-day, and recover from the
common failure modes.

Source of truth for the underlying mechanics is the code; this doc is
the operator-facing summary. When code drifts, **update both**.

---

## 1. What the product does

For each subscribed customer:

- **Monitors** Google Business Profile reviews (every 6 hours)
- **Alerts** the customer on every 1–2★ review (instant email)
- **Drafts AI replies** for every review (Pro/Premium only)
- **Posts approved replies** to Google on the customer's behalf
- **Sends review requests** (SMS or email) to recent customers
- **Tracks attribution** — links our requests back to the reviews they produce
- **Mails a periodic report** — monthly (Basic), biweekly (Pro), weekly (Premium)

## 2. Tier-by-tier feature gating

| Feature | Basic ($79) | Pro ($129) | Premium ($179) |
|---|---|---|---|
| Review monitoring | ✅ | ✅ | ✅ |
| Review requests (SMS + email) | ✅ | ✅ | ✅ |
| Low-rating alerts | ✅ | ✅ | ✅ |
| Reminders / follow-ups | ✅ | ✅ | ✅ |
| AI draft responses | ❌ | ✅ | ✅ |
| Review widget | ❌ | ✅ | ✅ |
| Direct Google posting (no manual approval) | ❌ | ❌ | ✅ |
| Competitor tracking | ❌ | ❌ | ✅ |
| Report cadence | Monthly | Biweekly | Weekly |

Gates live in `shared/reputationConfig.ts`. Adding a tier means editing
that file + adding the tier ID to `shared/pricing.ts`.

---

## 3. Onboarding a new customer

The Stripe webhook + the welcome email do most of this automatically.
Operator just verifies and unblocks if needed.

1. **Customer pays.** `customer.subscription.created` lands; Stripe sends
   the standard order-confirmation receipt; our own
   `reputationshield-welcome` email goes out via
   [reputationShieldKickoff](../server/services/reputation/reputationShieldKickoff.ts)
   with a "Connect Google Business Profile" CTA.
2. **Customer connects Google** via the OAuth flow at
   `/portal/reviews?action=connect-google`. Token is encrypted at rest
   (key: `TOKEN_ENCRYPTION_KEY`).
3. **Operator collects the Place ID** if the customer can't find it
   themselves. Paste it into the admin
   `Reputation` → `Review Link Config` panel. The PUT endpoint validates
   the place_id against the Google Places API on save (fails closed on
   `NOT_FOUND` or `INVALID_REQUEST`). Override with
   `skip_place_validation: true` only when recovering from a Places API
   outage.
4. **First sync runs within 6 hours** via `reviewMonitorWorker`. To
   accelerate, hit `POST /api/admin/crm/clients/:id/reviews/sync` —
   pulls reviews immediately.
5. **Confirm reports are enabled** in the customer's
   `reputation_settings.report_enabled` flag (defaults true).

Common stuck states:

- Customer skipped the welcome email's Google connect step → portal
  shows "Google not connected" banner. Re-send welcome via the admin
  "Resend kickoff" action.
- Place ID wrong → silent zero reviews. The validation we landed in
  Sprint 1 prevents this at onboarding; for older clients, hit the
  validate endpoint and check.
- Google token expired and no `refresh_token_ref` present → connection
  marked `expired`. Customer must reconnect from the portal. Operator
  cannot fix this server-side — the OAuth scope requires the customer
  to re-authorize.

---

## 4. Daily fulfillment loop

The cron does this; operators are exception-handlers.

### When a low-rating review lands
1. `reviewMonitorWorker` upserts the review with `requires_human_attention=true`.
2. Customer gets the low-rating alert email (if `settings.low_rating_alerts`).
3. Operator sees the review in `/admin/reviews` with a red shield icon.
4. Generate an AI draft via the "Draft Response" button (Pro/Premium only).
5. **Approval gate**: 1–4★ drafts default to `approval_status='unreviewed'`
   and must be explicitly approved before `post-to-google` will publish.
   5★ + positive-tone drafts auto-stamp `auto_approved` (mirrors
   `reviewCore.eligible_for_auto_reply`).
6. Edit if needed (any human edit resets approval back to unreviewed),
   click "Approve", then "Post to Google".
7. Audit trail lives in `review_response_edits` — every change is logged
   with actor + edit_kind. Read it via
   `GET /api/admin/crm/monitored-reviews/:id/edit-history`.

### When a Google post fails
- 4xx errors (`INVALID_ARGUMENT`, `PERMISSION_DENIED`): not retryable.
  Check Google connection status; customer may need to reconnect.
- 5xx / `RATE_LIMIT_EXCEEDED` / timeout: retryable. Alert is fired with
  `retryable: true` so Slack signals "wait and retry."
  Today, operator manually retries. A retry-queue is on the Sprint 2-3
  roadmap.
- Slack channel `#alerts-reputationshield` receives every post failure
  (1-hour dedup window via `fireAlert`).

### When a customer asks "stop messaging this person"
- Add them to the per-client suppression list:
  `POST /api/reputation/clients/:id/suppression` with
  `customer_email` and/or `customer_phone` + `reason`.
- Future enqueues from any source (booking-completion, portal manual
  request, batch scan) check this list first via
  `storage.isReviewRequestSuppressed`.
- To remove: `DELETE /api/reputation/clients/:id/suppression/:row_id`.

---

## 5. Safety rails

These guards are in code; document them so operators don't fight them.

| Guard | Where | What it prevents |
|---|---|---|
| Daily SMS cap (50/client) | `reviewRequestService.isEligible` | Twilio cost blowout |
| Daily email cap (200/client) | same | SendGrid abuse complaint |
| 60-day customer cooldown | same | Repeat-request fatigue |
| Suppression list | same + booking trigger | Honour explicit opt-outs |
| Place ID validation on save | `placeIdValidator` | Silent zero-review syncs |
| Approval gate on post-to-google | `adminCrmRoutes.ts:post-to-google` | Unreviewed AI drafts going live |
| Auto-approve only 5★ + positive | same | Tone-deaf replies on negative reviews |
| Token refresh dailies | `reputationTokenRefreshWorker` (03:15 UTC) | Stale-token sync failures |

To force a send past the daily cap (e.g., recovery): pass
`force=true` to the admin enqueue endpoint, or temporarily lift the
caps in `reviewRequestService.ts` (`DAILY_SEND_CAP_SMS` /
`DAILY_SEND_CAP_EMAIL`).

---

## 6. Alert catalogue

Slack categories (deduped 1h on category+title):

| Category | Severity | Trigger | Action |
|---|---|---|---|
| `reputationshield_sync_failure` | warning | `reviewMonitorWorker` catches per-client error | Check error; if same client repeats, look at their Google connection. |
| `reputationshield_post_failure` | warning (retryable) / critical (non-retryable) | `post-to-google` returns non-OK | Retryable: try again later. Non-retryable: inspect drafted text + reconnect Google. |
| `reputationshield_token_refresh_failure` | warning | Daily refresh job hit the refresh endpoint and got an error | Mark the client for reconnect; portal banner will guide. |
| `reputationshield_token_expiring` | info | <7 days remaining + no refresh token | Ping customer to reconnect proactively. |

---

## 7. Known limits and roadmap

| Limit | Sprint to address | Notes |
|---|---|---|
| Single Google Business location per client | 2–3 | Multi-location schema is in flight. |
| Only Google Business Profile is fully native | 2–3 | Trustpilot/Yelp clients scaffolded but key-gated. |
| Facebook reviews can be fetched but not replied to | 2–3 | Graph API integration pending. |
| Review widget exists in schema but no embeddable JS yet | 2–3 | Pro-tier feature waiting on widget host. |
| Booking-completion trigger goes through the older review-request service | Done (Sprint 4) | Sprint 4 added suppression + rate-limit checks to that path so both routes are equally safe. |

---

## 8. Quick reference — admin endpoints

```
GET    /api/admin/crm/monitored-reviews                 # list
POST   /api/admin/crm/monitored-reviews/:id/draft-response   # generate AI draft
PATCH  /api/admin/crm/monitored-reviews/:id/draft-response   # edit (resets approval)
POST   /api/admin/crm/monitored-reviews/:id/approve     # approve for posting
POST   /api/admin/crm/monitored-reviews/:id/reject      # reject (requires reason)
GET    /api/admin/crm/monitored-reviews/:id/edit-history # audit trail
POST   /api/admin/crm/monitored-reviews/:id/post-to-google  # publish (gated)

GET    /api/reputation/clients/:id/dashboard            # client metrics
PUT    /api/reputation/clients/:id/review-link/config   # set GBP / link (validates place_id)
GET    /api/reputation/clients/:id/suppression          # list DNC entries
POST   /api/reputation/clients/:id/suppression          # add DNC entry
DELETE /api/reputation/clients/:id/suppression/:rowId   # remove DNC entry
POST   /api/reputation/internal/process-reviews         # manual cron trigger (testing)
POST   /api/reputation/internal/process-review-requests # manual cron trigger (testing)
```
