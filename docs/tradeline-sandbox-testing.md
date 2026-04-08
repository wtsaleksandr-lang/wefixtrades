# TradeLine v1 — Sandbox Testing Checklist

Practical QA guide for running a full Stripe sandbox simulation.

---

## Prerequisites

### 1. Stripe Test Key

Set environment variable:
```
STRIPE_SECRET_KEY=sk_test_...
```

### 2. Sync Stripe Products/Prices

Run once to create Stripe products and prices for all services:
```
npx tsx server/scripts/sync-stripe.ts
```

This populates `stripe_price_id` on `service_catalog` for:
- `tradeline-call-backup` ($97/mo)
- `tradeline-chat` ($97/mo)
- `tradeline-complete` ($197/mo)

**Verify**: Check DB — all three must have non-null `stripe_price_id`.

### 3. SMTP (optional)

For onboarding email delivery, configure SMTP env vars. If not set, emails will be skipped silently (logged as warning). Testing can proceed without SMTP.

### 4. Dev Server Running

```
npm run dev
```

Server should be accessible at `http://localhost:5000`.

---

## Test Scenarios

### A. Self-Serve Checkout Flow (tradeline-call-backup)

**1. Initiate checkout**
```
POST /api/public/checkout
{
  "business_name": "Test Plumbing Co",
  "contact_name": "John Test",
  "contact_email": "john@test-plumbing.example.com",
  "contact_phone": "+447700900123",
  "items": ["tradeline-call-backup"]
}
```

**Expected response**: `{ checkout_url, session_id }`

**2. Verify pre-provision (before payment)**

Check DB:
- [ ] `clients` row exists: status="onboarding", source="website"
- [ ] `client_services` row exists: status="pending", service_id="tradeline-call-backup"
- [ ] `client_services.metadata.tradeline.variant` = "call_backup"
- [ ] `client_services.metadata.tradeline.setupStage` = "not_started"
- [ ] `client_services.metadata.tradeline.notifications.email` = ["john@test-plumbing.example.com"]
- [ ] `client_services.metadata.tradeline.notifications.sms` = ["+447700900123"]
- [ ] `client_payments` row: status="pending"
- [ ] `onboarding_submissions` row: status="not_sent"
- [ ] `fulfillment_tasks`: 6 rows, all status="not_started"

**3. Complete payment in Stripe**

Open `checkout_url` in browser, use Stripe test card `4242 4242 4242 4242`.

**4. Verify post-payment (webhook fires)**

Check DB:
- [ ] `client_payments` row: status="paid", paid_at set
- [ ] `onboarding_submissions` row: status="sent" (if SMTP configured)
- [ ] `users` row created with role="client", email matching client
- [ ] `clients.user_id` linked to new user
- [ ] `admin_activity_log` has entries for "checkout.initiated", "portal.auto_created"

**5. Complete onboarding form**

Submit onboarding via portal or public link:
```
PUT /api/portal/onboarding/:id
{
  "responses": {
    "business_name": "Test Plumbing Co",
    "trade_type": "Plumber",
    "service_area": "London",
    "business_hours": "Mon-Fri 8am-6pm",
    "primary_phone": "+447700900456",
    "forwarding_preference": "no-answer",
    "ring_timeout": "25",
    "top_services": "Emergency plumbing, Boiler repair",
    "pricing_ranges": "£50-£200",
    "tone": "professional"
  },
  "mode": "submit"
}
```

**Expected auto-mapping to TradeLine config**:
- [ ] `phoneRouting.primaryBusinessNumber` = "+447700900456"
- [ ] `phoneRouting.forwardingMode` = "no_answer"
- [ ] `phoneRouting.ringTimeoutSeconds` = 25
- [ ] `setupStage` = "configuring"

---

### B. Self-Serve Checkout Flow (tradeline-chat)

**1. Initiate checkout** with `items: ["tradeline-chat"]`

**2. Verify defaults**:
- [ ] `variant` = "chat"
- [ ] `channels.websiteChat` = true, `channels.voice` = false
- [ ] `website.embedMode` = "direct_embed"

**3. Complete payment + onboarding** with:
```json
{
  "website_url": "https://test-plumbing.example.com",
  "website_access": "yes",
  "install_mode": "direct embed",
  "brand_colors": "#0066cc",
  "lead_destination": "both",
  "booking_enabled": "true"
}
```

**Expected auto-mapping**:
- [ ] `website.accessAvailable` = true
- [ ] `website.embedMode` = "direct_embed"
- [ ] `booking.enabled` = true
- [ ] `setupStage` = "configuring"

---

### C. Admin Provision Flow (tradeline-complete)

**1. Provision**
```
POST /api/admin/crm/clients/:id/provision
{ "service_id": "tradeline-complete" }
```

**Expected response**: includes `clientService`, `payment`, `onboarding`, `tasksCreated: 7`, `portalAccount`

**2. Verify**:
- [ ] `client_services` row with variant="complete", all channels=true
- [ ] `notifications.email` and `notifications.sms` populated from client contact
- [ ] `client_payments` row: status="pending" (manual billing)
- [ ] `onboarding_submissions` row: status="sent" (email auto-sent)
- [ ] `fulfillment_tasks`: 7 rows
- [ ] `users` row created (or existing linked)
- [ ] `portalAccount` in response shows email + temporary_password (if new)

---

### D. Install Path Decision

**Set direct embed**:
```
POST /api/admin/crm/tradeline/:csId/install-path
{ "accessAvailable": true, "embedMode": "direct_embed" }
```

**Verify**:
- [ ] `website.accessAvailable` = true
- [ ] `website.embedMode` = "direct_embed"
- [ ] `setupStage` = "configuring"

**Set hosted fallback**:
```
POST /api/admin/crm/tradeline/:csId/install-path
{ "accessAvailable": false, "embedMode": "hosted_fallback" }
```

**Verify**:
- [ ] `website.accessAvailable` = false
- [ ] `website.embedMode` = "hosted_fallback"
- [ ] `channels.hostedFallback` = true

---

### E. Readiness Check

**Check readiness (should fail)**:
```
GET /api/admin/crm/tradeline/:csId/readiness
```

**Expected** (for call-backup before setup):
```json
{
  "ready": false,
  "issues": [
    "Setup stage is \"not_started\" — must be \"ready_for_testing\" or \"live\"",
    "Primary business phone number is required"
  ]
}
```

**Fix issues** — update config:
```
POST /api/admin/crm/tradeline/:csId/config
{
  "phoneRouting": { "primaryBusinessNumber": "+447700900456" },
  "setupStage": "ready_for_testing"
}
```

**Re-check readiness**: should return `{ "ready": true, "issues": [] }`

---

### F. Go-Live

**Attempt go-live with tasks pending (should fail)**:
```
POST /api/admin/crm/tradeline/:csId/go-live
```

**Expected**: 400 with issues including "X fulfillment task(s) still pending or in progress"

**Mark all tasks delivered** via:
```
PATCH /api/admin/crm/fulfillment/:taskId
{ "status": "delivered" }
```
(repeat for each task)

**Retry go-live**:
```
POST /api/admin/crm/tradeline/:csId/go-live
```

**Expected**: 200 with updated config, `setupStage` = "live"

**Verify cascade**:
- [ ] Last task delivery triggers `checkAndCompleteService`
- [ ] `client_services.status` = "active"
- [ ] `clients.status` = "active" (if all services done)

---

### G. Portal Visibility

**Login** with auto-created portal credentials.

**Check services**:
```
GET /api/portal/services
```
- [ ] TradeLine service visible with correct name

**Check TradeLine detail**:
```
GET /api/portal/tradeline/:csId
```
- [ ] Returns config, usage, recentCalls, setupStage, readiness

**Switch mode**:
```
POST /api/portal/tradeline/:csId/mode
{ "newMode": "on_the_job" }
```
- [ ] Mode changes to "on_the_job"
- [ ] `tradeline_mode_log` entry created

---

## Quick Verification Queries

```sql
-- Check TradeLine services
SELECT id, client_id, service_id, status,
       metadata->'tradeline'->>'variant' as variant,
       metadata->'tradeline'->>'setupStage' as stage,
       metadata->'tradeline'->'notifications' as notifications
FROM client_services WHERE service_id LIKE 'tradeline%';

-- Check portal accounts
SELECT c.id, c.business_name, c.user_id, u.email, u.role
FROM clients c LEFT JOIN users u ON c.user_id = u.id
WHERE c.user_id IS NOT NULL;

-- Check onboarding status
SELECT os.id, os.client_service_id, os.status, os.sent_at, os.submitted_at
FROM onboarding_submissions os
JOIN client_services cs ON os.client_service_id = cs.id
WHERE cs.service_id LIKE 'tradeline%';

-- Check task progress
SELECT ft.client_service_id, ft.title, ft.status, ft.sort_order
FROM fulfillment_tasks ft
JOIN client_services cs ON ft.client_service_id = cs.id
WHERE cs.service_id LIKE 'tradeline%'
ORDER BY ft.client_service_id, ft.sort_order;
```

---

## Troubleshooting

| Problem | Cause | Fix |
|---------|-------|-----|
| Checkout returns "price not configured" | `stripe_price_id` not set | Run `npx tsx server/scripts/sync-stripe.ts` |
| Onboarding email not received | SMTP not configured | Check SMTP env vars; email is logged as skipped |
| Portal login fails | No portal account | Check `clients.user_id` is linked; call provision endpoint again |
| Readiness check always fails on stage | setupStage not advanced | Set via config update or submit onboarding (auto-advances to "configuring") |
| Go-live fails on tasks | Tasks not delivered | Mark all tasks as delivered via PATCH endpoint |
| Webhook not firing | Stripe CLI not running | Run `stripe listen --forward-to localhost:5000/api/billing/webhook` |
