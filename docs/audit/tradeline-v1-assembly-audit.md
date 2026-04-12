# TradeLine v1 — Final Assembly Audit

Comprehensive lifecycle verification from order to go-live.
Grounded in the current codebase as of April 2026.

---

## A. Executive Summary

TradeLine v1 is structurally complete for sandbox testing. The full path from checkout through Stripe webhook to provisioning, onboarding, fulfillment, and go-live exists and connects. The three variants (call-backup, chat, complete) all provision correctly with variant-specific defaults, onboarding templates, and task templates.

**What works end-to-end:**
- Self-serve checkout creates client + service + payment + onboarding + tasks
- Stripe webhook confirms payment and sends onboarding email
- Admin provision does the same (minus Stripe + email)
- TradeLine config is set with correct variant defaults
- Admin can update config, set install path, check readiness, go live
- Portal can view TradeLine data, switch modes, see readiness
- Task completion cascade activates the service

**What's missing (glue gaps, not architecture gaps):**
1. Portal login not auto-created during provisioning — admin must manually trigger
2. Onboarding email not sent in admin-provision flow — only sent via Stripe webhook
3. Onboarding answers not mapped into TradeLine config — admin must manually copy
4. setupStage never advances automatically — only manual updates
5. go-live doesn't check that fulfillment tasks are delivered

None of these are blockers for sandbox testing. They are operational polish items.

---

## B. Full Lifecycle Trace

### B1. tradeline-call-backup

| Step | What happens | File | Automated? | Notes |
|------|-------------|------|------------|-------|
| **1. Order placement** | Client fills checkout form (business_name, email, phone, items=["tradeline-call-backup"]) | `publicCheckoutRoutes.ts:38` | Yes | |
| **2. Client created** | Find-or-create client by email, status="lead" | `publicCheckoutRoutes.ts:71-91` | Yes | |
| **3. Stripe customer** | Creates Stripe customer if none exists | `publicCheckoutRoutes.ts:96-103` | Yes | Requires `stripe_price_id` on catalog |
| **4. Service provisioned** | `client_services` row: status=pending, metadata.tradeline with variant=call_backup, voice=true, sms=true, websiteChat=false, embedMode=none, setupStage=not_started | `publicCheckoutRoutes.ts:116-125` | Yes | |
| **5. Payment created** | `client_payments` row: status=pending, type=invoice | `publicCheckoutRoutes.ts:128-136` | Yes | |
| **6. Onboarding created** | `onboarding_submissions` row: status=not_sent, 12-field template | `publicCheckoutRoutes.ts:139-148` | Yes | Email NOT sent yet |
| **7. Tasks created** | 6 fulfillment tasks: collect onboarding → configure assistant → phone routing → notifications → test → QA+go-live | `publicCheckoutRoutes.ts:151-166` | Yes | |
| **8. Client status** | Updated to "onboarding" | `publicCheckoutRoutes.ts:169-172` | Yes | |
| **9. Stripe checkout** | Session created with metadata (crm_client_id, service_catalog_id) | `publicCheckoutRoutes.ts:174-202` | Yes | mode=subscription (monthly) |
| **10. Payment completed** | Webhook: checkout.session.completed → finds existing service, marks payment=paid | `stripeBillingRoutes.ts:187-198` | Yes | Idempotent |
| **11. Onboarding email** | Sent with access_token link, submission status→sent | `stripeBillingRoutes.ts:220, 326-356` | Yes | Only via webhook path |
| **12. Client submits onboarding** | Client fills 12 fields via portal | `portalRoutes.ts:486+` | Yes (form) | Answers stored but NOT auto-mapped to config |
| **13. Admin configures** | Manually updates config (phoneRouting, notifications, etc.) | `adminCrmRoutes.ts:726-758` | Manual | |
| **14. Install path** | Not applicable for call-backup (no website) | — | N/A | embedMode stays "none" |
| **15. Readiness check** | GET /readiness → checks phone number set, setupStage=ready_for_testing | `adminCrmRoutes.ts:877` | Yes (check) | Admin must set setupStage manually |
| **16. Go-live** | POST /go-live → validates readiness, sets setupStage=live | `adminCrmRoutes.ts:901` | Yes (gate) | Does NOT set client_services.status |
| **17. Tasks delivered** | Admin marks all 6 tasks delivered → checkAndCompleteService → service status=active → client status=active | `adminCrmRoutes.ts:205-235`, `storage.ts:1209-1280` | Yes (cascade) | |
| **18. Portal visibility** | Client sees service, can switch modes, view calls | `portalRoutes.ts:756-837` | Yes | |

### B2. tradeline-chat

Same as call-backup through steps 1-11, with these differences:

| Step | Difference |
|------|-----------|
| **4. Service provisioned** | variant=chat, voice=false, websiteChat=true, websiteVoice=true, sms=false, embedMode=direct_embed |
| **6. Onboarding** | 11-field template: includes website_url, website_access, install_mode, brand_colors, lead_destination |
| **7. Tasks** | 6 tasks: collect onboarding → configure assistant → prepare widget/hosted → install widget/provision link → configure notifications → QA+go-live |
| **14. Install path** | Admin calls POST /install-path with accessAvailable + embedMode → sets configuring stage | `adminCrmRoutes.ts:831` |
| **15. Readiness** | Checks embedMode≠none; if hosted_fallback checks hostedUrl + domainStatus connected/live |

### B3. tradeline-complete

Same as call-backup through steps 1-11, with these differences:

| Step | Difference |
|------|-----------|
| **4. Service provisioned** | variant=complete, ALL channels true, embedMode=direct_embed |
| **6. Onboarding** | 17-field template: phone + website + routing + notifications combined |
| **7. Tasks** | 7 tasks: collect onboarding → configure assistant → phone routing → prepare widget/hosted → notifications+callback → end-to-end testing → QA+go-live |
| **14. Install path** | Same as chat |
| **15. Readiness** | Checks BOTH phone number AND website path |

---

## C. Glue Gaps

Grounded issues only — things that exist in code but don't connect.

### C1. Portal login not auto-created

**Problem**: After provisioning, the client has no portal login. Admin must manually call `POST /api/admin/crm/clients/:id/portal-account` to create credentials and then communicate them to the client.

**Evidence**: No `createUser` call in `publicCheckoutRoutes.ts` or `stripeBillingRoutes.ts`. Portal account creation only exists in `adminCrmRoutes.ts:598-677`.

**Impact**: Client receives onboarding email but cannot log into portal to view their service, switch modes, or see calls until admin manually creates their account.

### C2. Onboarding email not sent on admin provision

**Problem**: When admin provisions via `POST /api/admin/crm/clients/:id/provision`, the onboarding submission is created with status="not_sent" but no email is sent. The email-sending logic only exists in the Stripe webhook handler.

**Evidence**: `adminCrmRoutes.ts:486-494` creates submission but has no email call. `sendOnboardingEmail` is only imported in `stripeBillingRoutes.ts`.

**Impact**: Admin must manually send onboarding link to client, or the submission sits in not_sent state.

### C3. Onboarding answers not mapped to config

**Problem**: Client submits onboarding form with key fields (primary_phone, forwarding_preference, website_access, install_mode, lead_destination, tone) but these answers are stored in `onboarding_submissions.responses` and never written into `metadata.tradeline` config.

**Evidence**: No code reads `onboarding_submissions.responses` and calls `updateTradeLineConfig`. Search for "responses" + "updateTradeLineConfig" in the codebase yields zero results.

**Impact**: Admin must manually read onboarding answers and type them into config. This is the single biggest operational friction point.

### C4. setupStage never auto-advances

**Problem**: `setupStage` starts at "not_started" and only changes via:
- `POST /install-path` → always sets "configuring"
- `POST /go-live` → sets "live"
- Manual config update

There is no auto-advancement when:
- Onboarding is submitted (should → "onboarding" or "configuring")
- Tasks are delivered (should → "ready_for_testing")

**Evidence**: No code in `portalRoutes.ts` (onboarding submit) or `storage.ts` (task completion) updates setupStage.

**Impact**: Admin must manually update setupStage at each transition, or the readiness check always fails on the stage check.

### C5. go-live doesn't verify fulfillment tasks

**Problem**: `POST /go-live` only checks `getTradeLineReadiness()` (config fields) but does not verify that all fulfillment tasks are delivered.

**Evidence**: `getTradeLineReadiness()` in `adminCrm.ts:379-410` checks setupStage, phone number, and website fields only. No task query.

**Impact**: Admin can go-live while tasks like "End-to-end testing" or "Configure notifications" are still pending. The cascade from task completion (`checkAndCompleteService`) is the separate mechanism that sets `client_services.status = "active"`.

### C6. setupStage "live" ≠ client_services.status "active"

**Problem**: Two independent paths to "live":
1. `POST /go-live` sets `metadata.tradeline.setupStage = "live"` (config readiness gate)
2. `checkAndCompleteService()` sets `client_services.status = "active"` (task completion cascade)

These don't interact. A service can be `setupStage: "live"` with `status: "pending"` (tasks incomplete), or `status: "active"` with `setupStage: "configuring"` (tasks delivered but readiness not checked).

**Evidence**: `go-live` endpoint at `adminCrmRoutes.ts:901` does not call `checkAndCompleteService`. `checkAndCompleteService` at `storage.ts:1209` does not check setupStage.

**Impact**: Complementary by design, but requires admin to use both paths correctly. Not a bug, but a potential confusion point.

### C7. Notifications config always empty

**Problem**: `notifications.sms` and `notifications.email` default to empty arrays and are never auto-populated from client contact info or onboarding answers.

**Evidence**: Default config has `notifications: { sms: [], email: [] }`. No code in provisioning or onboarding writes to these fields.

**Impact**: Admin must manually set notification recipients. Could easily auto-populate from `client.contact_email` and `client.contact_phone`.

---

## D. Order-to-Delivery Checklist

### D-A. Self-Serve Checkout Flow

| # | Step | Implemented? | Files |
|---|------|-------------|-------|
| 1 | Client record created/updated | Yes | `publicCheckoutRoutes.ts:71-91` |
| 2 | Stripe customer created | Yes | `publicCheckoutRoutes.ts:96-103` |
| 3 | client_services row with TradeLine config | Yes | `publicCheckoutRoutes.ts:112-125` |
| 4 | Pending payment record | Yes | `publicCheckoutRoutes.ts:128-136` |
| 5 | Onboarding submission created | Yes | `publicCheckoutRoutes.ts:139-148` |
| 6 | Fulfillment tasks from template | Yes | `publicCheckoutRoutes.ts:151-166` |
| 7 | Client status → onboarding | Yes | `publicCheckoutRoutes.ts:169-172` |
| 8 | Stripe checkout session with metadata | Yes | `publicCheckoutRoutes.ts:174-202` |
| 9 | Webhook marks payment paid | Yes | `stripeBillingRoutes.ts:192-198` |
| 10 | Onboarding email sent | Yes | `stripeBillingRoutes.ts:220` |
| 11 | Portal login created | **No** | Manual: `adminCrmRoutes.ts:598-677` |
| 12 | setupStage advanced to onboarding | **No** | Must be done manually |
| 13 | Onboarding answers → config | **No** | Must be done manually |
| 14 | Notifications auto-populated | **No** | Must be done manually |

### D-B. Admin-Provision Flow

| # | Step | Implemented? | Files |
|---|------|-------------|-------|
| 1 | Client already exists (lookup) | Yes | `adminCrmRoutes.ts:451-452` |
| 2 | client_services row with TradeLine config | Yes | `adminCrmRoutes.ts:461-470` |
| 3 | Invoice created (pending) | Yes | `adminCrmRoutes.ts:473-481` |
| 4 | Onboarding submission created | Yes | `adminCrmRoutes.ts:486-494` |
| 5 | Fulfillment tasks from template | Yes | `adminCrmRoutes.ts:497-514` |
| 6 | Client status → onboarding | Yes | `adminCrmRoutes.ts:517-519` |
| 7 | Activity logged | Yes | `adminCrmRoutes.ts:522-531` |
| 8 | Onboarding email sent | **No** | Not called in admin path |
| 9 | Portal login created | **No** | Separate manual step |
| 10 | setupStage advanced | **No** | Must be done manually |
| 11 | Onboarding answers → config | **No** | Must be done manually |
| 12 | Notifications auto-populated | **No** | Must be done manually |

---

## E. Sandbox Test Readiness

### Ready

| Component | Status | Notes |
|-----------|--------|-------|
| Checkout route | Ready | `POST /api/public/checkout` handles TradeLine variants |
| Stripe price sync | Ready | `sync-stripe.ts` creates products/prices from catalog |
| Webhook handler | Ready | Handles checkout.session.completed, marks paid, sends email |
| Client creation | Ready | Find-or-create by email |
| Service provisioning | Ready | Correct TradeLine defaults per variant |
| Onboarding creation | Ready | Templates exist for all 3 variants |
| Task creation | Ready | Templates exist for all 3 variants (6-7 tasks each) |
| Config management | Ready | Deep-merge update, all fields settable |
| Install-path endpoint | Ready | Sets embedMode, accessAvailable, hostedFallback |
| Readiness endpoint | Ready | Checks phone, website, stage |
| Go-live endpoint | Ready | Validates readiness, sets stage=live |
| Task cascade | Ready | checkAndCompleteService → service active → client active |
| Portal TradeLine view | Ready | Config, usage, calls, mode switching, widget config |
| Mode switching | Ready | Both admin and portal, with mode log |
| Test script exists | Partial | `test-stripe-flow.ts` tests MapGuard only, not TradeLine |

### Blockers for sandbox simulation

| # | Blocker | Severity | Why it blocks |
|---|---------|----------|--------------|
| 1 | **stripe_price_id must be set** | Hard blocker | Checkout fails without it. Must run `sync-stripe.ts` with `STRIPE_SECRET_KEY=sk_test_...` first. |
| 2 | **No TradeLine-specific test script** | Soft blocker | Existing `test-stripe-flow.ts` hardcodes `mapguard-setup`. Need to adapt or extend for TradeLine variants. |
| 3 | **SMTP must be configured** | Soft blocker | Onboarding email will silently fail without SMTP. Not a crash, but onboarding link won't reach client. |
| 4 | **Portal login is manual** | Soft blocker | Can't test portal view without manually creating portal account first. |

### Not blockers (operational gaps, not test blockers)

- setupStage doesn't auto-advance — can test by manually setting it
- Onboarding answers not mapped — can test by manually updating config
- Notifications empty — can test by manually setting them

---

## F. Implementation Plan to Close Gaps

10 steps, ordered by priority for sandbox readiness.

| # | Purpose | Files | Effort |
|---|---------|-------|--------|
| 1 | **Run sync-stripe.ts in sandbox** — populate stripe_price_id for all 3 TradeLine services | `server/scripts/sync-stripe.ts` (run, not edit) | Small |
| 2 | **Auto-create portal login on provision** — after client_services creation, call createUser with temp password + link to client. Return credentials in response. | `publicCheckoutRoutes.ts`, `stripeBillingRoutes.ts`, `adminCrmRoutes.ts` (provision endpoint) | Medium |
| 3 | **Send onboarding email on admin provision** — import sendOnboardingEmail, call it after onboarding submission is created | `adminCrmRoutes.ts` (provision endpoint) | Small |
| 4 | **Auto-populate notifications from client contact** — after provisioning, set notifications.email=[contact_email] and notifications.sms=[contact_phone] if present | `publicCheckoutRoutes.ts`, `stripeBillingRoutes.ts`, `adminCrmRoutes.ts` | Small |
| 5 | **Map onboarding answers to config** — when onboarding is submitted, extract known keys (primary_phone → phoneRouting.primaryBusinessNumber, forwarding_preference → forwardingMode, website_access → accessAvailable, etc.) and call updateTradeLineConfig | `portalRoutes.ts` (onboarding submit handler) or new helper | Medium |
| 6 | **Auto-advance setupStage** — on onboarding submit → "configuring"; on install-path set (only if current stage is earlier) → "configuring"; when all tasks except QA are delivered → "ready_for_testing" | `portalRoutes.ts`, `adminCrmRoutes.ts`, `storage.ts` | Medium |
| 7 | **Add task check to go-live** — in go-live endpoint, verify all non-cancelled tasks are delivered before allowing go-live | `adminCrmRoutes.ts` (go-live endpoint) | Small |
| 8 | **Prevent setupStage regression in install-path** — only advance to "configuring" if current stage is earlier (not_started, onboarding), don't regress from later stages | `adminCrmRoutes.ts` (install-path endpoint) | Small |
| 9 | **Create TradeLine sandbox test script** — adapt test-stripe-flow.ts for tradeline-call-backup, testing full checkout → webhook → provision → config → readiness → go-live | `server/scripts/test-tradeline-flow.ts` (new file) | Medium |
| 10 | **Add welcome email with portal credentials** — send email with temp password + portal link after auto-creating portal login | `server/lib/` (new or extend onboardingEmail) | Medium |

### Recommended execution order for pre-sandbox

**Must do before sandbox**: #1 (sync-stripe)
**Should do before sandbox**: #2, #3, #9
**Nice to have before sandbox**: #4, #5, #6, #7, #8, #10

---

## Appendix: Key File Reference

| File | Role |
|------|------|
| `server/routes/publicCheckoutRoutes.ts` | Self-serve checkout, pre-provisioning |
| `server/routes/stripeBillingRoutes.ts` | Stripe webhook, payment confirmation, email trigger |
| `server/routes/adminCrmRoutes.ts` | Admin provision, config updates, install-path, readiness, go-live |
| `server/routes/portalRoutes.ts` | Portal views, mode switching, onboarding |
| `server/storage.ts` | DB operations, deep merge, task cascade |
| `shared/schemas/adminCrm.ts` | TradeLine config schema, defaults, readiness checker |
| `server/scripts/seed-services.ts` | Service catalog, task templates, onboarding templates |
| `server/scripts/sync-stripe.ts` | Stripe product/price sync |
| `server/scripts/test-stripe-flow.ts` | Existing MapGuard test script (needs TradeLine version) |
| `server/lib/onboardingEmail.ts` | Onboarding email sender |

---

**Confirmation**: No pricing/product/marketing pages changed. No code modified. This is an audit document only.
