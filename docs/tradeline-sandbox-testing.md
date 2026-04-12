# TradeLine v1 — Sandbox Testing Checklist

Practical QA guide for running a full Stripe sandbox simulation.

---

## Quick Start

```bash
# 1. Seed services (if not done)
npx tsx server/scripts/seed-services.ts

# 2. Sync Stripe prices (requires STRIPE_SECRET_KEY=sk_test_...)
STRIPE_SECRET_KEY=sk_test_... npx tsx server/scripts/sync-stripe.ts

# 3. Start dev server
npm run dev

# 4. Run automated test
npx tsx server/scripts/test-tradeline-flow.ts
```

---

## Prerequisites

| Requirement | How to check | Fix |
|-------------|-------------|-----|
| Service catalog seeded | DB: `SELECT id FROM service_catalog WHERE id LIKE 'tradeline%'` | `npx tsx server/scripts/seed-services.ts` |
| Stripe prices synced | DB: `SELECT id, stripe_price_id FROM service_catalog WHERE id LIKE 'tradeline%'` | `STRIPE_SECRET_KEY=sk_test_... npx tsx server/scripts/sync-stripe.ts` |
| Dev server running | `curl http://localhost:5000/api/vapi/status` | `npm run dev` |
| STRIPE_SECRET_KEY set | Env var present | Set `STRIPE_SECRET_KEY=sk_test_...` |
| SMTP (optional) | Onboarding emails will be logged but not sent if not configured | Set SMTP env vars |
| VAPI_API_KEY (optional) | Assistant build works locally without it; Vapi push is skipped | Set `VAPI_API_KEY=...` |

---

## Automated Test Script

```bash
npx tsx server/scripts/test-tradeline-flow.ts
```

**What it tests:**

**Scenario 1 — tradeline-complete (self-serve checkout)**
1. Public checkout → creates client + service + payment + onboarding + tasks
2. Simulated webhook → marks payment paid, creates portal account
3. Verifies: config defaults, notifications populated, 7 tasks created
4. Submits onboarding via public link → maps config, triggers assistant build
5. Verifies: phone routing mapped, setupStage advanced, assistant built
6. Readiness check → reports issues
7. Marks tasks delivered → go-live → setupStage=live, service=active

**Scenario 2 — tradeline-call-backup (admin provision)**
1. Admin creates client + provisions service
2. Verifies: portal account, onboarding email, config defaults
3. Sets phone routing via config update
4. Triggers manual assistant build
5. Marks tasks delivered → go-live

Both scenarios clean up test data on completion.

---

## Manual Test Scenarios

### A. tradeline-complete — Self-Serve Checkout (Primary)

#### Step 1: Initiate checkout
```
POST /api/public/checkout
{
  "business_name": "Test Plumbing Co",
  "contact_name": "John Test",
  "contact_email": "john@test-plumbing.example.com",
  "contact_phone": "+447700900123",
  "items": ["tradeline-complete"]
}
```

**Expected**: `{ checkout_url, session_id }`

#### Step 2: Complete payment

Open `checkout_url` in browser, use Stripe test card `4242 4242 4242 4242`.
Or: forward webhooks via `stripe listen --forward-to localhost:5000/api/billing/webhook`

#### Step 3: Verify provisioning

| Check | Expected |
|-------|----------|
| `client_services` row | status=pending, variant=complete, setupStage=not_started |
| `client_services.metadata.tradeline.assistant.status` | not_built |
| `client_services.metadata.tradeline.notifications` | email + phone populated |
| `client_payments` | status=paid |
| `onboarding_submissions` | status=sent (if SMTP) or not_sent |
| `fulfillment_tasks` | 7 rows, all not_started |
| `clients.user_id` | linked (portal account created) |

#### Step 4: Submit onboarding

Via public link (`GET /api/onboarding/:token` then `POST /api/onboarding/:token`) or portal.

```json
{
  "responses": {
    "business_name": "Test Plumbing Co",
    "trade_type": "Plumber",
    "service_area": "London",
    "business_hours": "Mon-Fri 8am-6pm",
    "primary_phone": "+447700900456",
    "forwarding_preference": "no-answer",
    "ring_timeout": "25",
    "website_url": "https://test-plumbing.example.com",
    "website_access": "yes",
    "install_mode": "direct embed",
    "top_services": "Emergency plumbing, Boiler repair",
    "pricing_ranges": "£50-£300",
    "escalation_number": "+447700900999",
    "booking_enabled": "true",
    "tone": "friendly"
  }
}
```

**Expected after submit**:

| Check | Expected |
|-------|----------|
| `phoneRouting.primaryBusinessNumber` | +447700900456 |
| `phoneRouting.forwardingMode` | no_answer |
| `phoneRouting.ringTimeoutSeconds` | 25 |
| `website.accessAvailable` | true |
| `website.embedMode` | direct_embed |
| `booking.enabled` | true |
| `setupStage` | configuring or ready_for_testing |
| `assistant.status` | built (after ~1s) |
| `assistant.templateId` | plumbing |

#### Step 5: Check readiness

```
GET /api/admin/crm/tradeline/:csId/readiness
```

**Expected**: `{ ready: true/false, issues: [...] }`

#### Step 6: Go-live

```bash
# Mark all tasks delivered first
PATCH /api/admin/crm/fulfillment/:taskId  { "status": "delivered" }
# (repeat for each of the 7 tasks)

# Set stage if not already advanced
POST /api/admin/crm/tradeline/:csId/config  { "setupStage": "ready_for_testing" }

# Go-live
POST /api/admin/crm/tradeline/:csId/go-live
```

**Expected**: `{ config: { setupStage: "live", ... } }`
**Also**: `client_services.status` = active (from task cascade)

---

### B. tradeline-call-backup — Admin Provision

#### Step 1: Create client + provision
```
POST /api/admin/crm/clients  { "business_name": "Test Electrics", ... }
POST /api/admin/crm/clients/:id/provision  { "service_id": "tradeline-call-backup" }
```

**Expected response** includes: `clientService`, `payment`, `onboarding` (status=sent), `tasksCreated: 6`, `portalAccount`

#### Step 2: Configure + build
```
POST /api/admin/crm/tradeline/:csId/config
{ "phoneRouting": { "primaryBusinessNumber": "+447700900456" }, "setupStage": "ready_for_testing" }

POST /api/admin/crm/tradeline/:csId/build-assistant
```

#### Step 3: Deliver tasks + go-live
Same as Scenario A steps 5-6, but with 6 tasks.

---

### C. tradeline-chat — Hosted Fallback Path

#### Step 1: Provision (self-serve or admin)

#### Step 2: Set hosted fallback path
```
POST /api/admin/crm/tradeline/:csId/install-path
{ "accessAvailable": false, "embedMode": "hosted_fallback" }
```

#### Step 3: Configure hosted URL
```
POST /api/admin/crm/tradeline/:csId/config
{
  "website": { "hostedUrl": "https://app.wefixtrades.com/tl/test-client", "domainStatus": "connected" },
  "setupStage": "ready_for_testing"
}
```

#### Step 4: Build + deliver tasks + go-live
Same pattern as above.

---

## Expected System Outcomes — Step by Step

### After checkout created (pre-payment)

| Record | State |
|--------|-------|
| `clients` | status=onboarding, source=website |
| `client_services` | status=pending, metadata.tradeline populated |
| `client_payments` | status=pending |
| `onboarding_submissions` | status=not_sent |
| `fulfillment_tasks` | 6-7 rows, status=not_started |
| `setupStage` | not_started |
| `assistant.status` | not_built |

### After payment completed (webhook)

| Record | State |
|--------|-------|
| `client_payments` | status=paid, paid_at set |
| `onboarding_submissions` | status=sent (if SMTP) |
| `users` | portal account created, linked to client |
| `admin_activity_log` | portal.auto_created entry |

### After onboarding submitted

| Record | State |
|--------|-------|
| `onboarding_submissions` | status=submitted, responses populated |
| `metadata.tradeline` config | phone/website/booking fields mapped from answers |
| `setupStage` | configuring (or ready_for_testing if everything valid) |
| `assistant.status` | building → built (or failed) |
| `assistant.templateId` | plumbing/electrical/hvac/generic |
| `admin_activity_log` | tradeline.assistant_built entry |

### After readiness passes

| Check | Requirement |
|-------|-------------|
| `setupStage` | ready_for_testing or live |
| Phone number | set (call-backup/complete) |
| Website embed | set and valid (chat/complete) |
| `assistant.status` | built |
| Fulfillment tasks | all delivered or cancelled |

### After go-live

| Record | State |
|--------|-------|
| `setupStage` | live |
| `client_services.status` | active (from task cascade) |
| `clients.status` | active (if all services done) |

---

## Verification Queries

```sql
-- Full TradeLine state
SELECT cs.id, cs.service_id, cs.status,
  metadata->'tradeline'->>'variant' as variant,
  metadata->'tradeline'->>'setupStage' as stage,
  metadata->'tradeline'->'assistant'->>'status' as assistant_status,
  metadata->'tradeline'->'assistant'->>'templateId' as template,
  metadata->'tradeline'->'assistant'->>'lastBuildError' as build_error,
  metadata->'tradeline'->'phoneRouting'->>'primaryBusinessNumber' as phone
FROM client_services cs WHERE cs.service_id LIKE 'tradeline%';

-- Task progress
SELECT ft.client_service_id, ft.title, ft.status
FROM fulfillment_tasks ft
JOIN client_services cs ON ft.client_service_id = cs.id
WHERE cs.service_id LIKE 'tradeline%'
ORDER BY ft.client_service_id, ft.sort_order;

-- Activity log for TradeLine
SELECT action, summary, created_at
FROM admin_activity_log
WHERE action LIKE 'tradeline.%'
ORDER BY created_at DESC LIMIT 20;
```

---

## Troubleshooting

| Problem | Cause | Fix |
|---------|-------|-----|
| Checkout returns "price not configured" | `stripe_price_id` not set | Run `sync-stripe.ts` |
| Webhook returns 503 | `STRIPE_SECRET_KEY` not set | Set env var |
| Onboarding email not sent | SMTP not configured | Check SMTP env vars; use public link directly |
| Config not mapped after onboarding | Used wrong endpoint | Use `POST /api/onboarding/:token` (public) or `PUT /api/portal/onboarding/:id` (portal) |
| Assistant status = "failed" | Build error | Check `assistant.lastBuildError` in config; try `POST /build-assistant` |
| Go-live fails: "assistant not built" | Auto-build failed or skipped | Run `POST /build-assistant` manually |
| Go-live fails: "tasks pending" | Not all tasks delivered | Mark remaining tasks as delivered |
| Go-live fails: "stage not ready" | setupStage not advanced | Set via config: `{ "setupStage": "ready_for_testing" }` |
