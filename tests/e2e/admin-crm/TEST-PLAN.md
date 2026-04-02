# Admin CRM Playwright Test Plan

## Overview
Regression test suite for the WeFixTrades Admin CRM dashboard.
Tests run against a live dev server (`localhost:5000`) with a real database.
External integrations (Stripe, AI chat, Make.com, Vapi, Fiverr) are **mocked or stubbed** at the API route level to keep tests deterministic and fast.

---

## Test Tiers

### Tier 1 — Smoke Tests (`admin-crm.smoke.spec.ts`)
Fast confidence checks that the app boots and core navigation works.

| # | Test | What it proves |
|---|------|----------------|
| S1 | Login with valid admin credentials | Auth works, session cookie set |
| S2 | Redirect to /admin/crm after login | Role-based routing |
| S3 | Sidebar links navigate correctly | Client-side routing |
| S4 | Unauthenticated user redirected to /login | Route protection |
| S5 | Non-admin role denied access | RBAC enforcement |
| S6 | Logout returns user to /login | Session destruction |

### Tier 2 — Critical E2E Tests (`admin-crm.e2e.spec.ts`)
Core business workflows that must never break.

| # | Test | What it proves |
|---|------|----------------|
| E1 | Create client -> appears in list | Client CRUD |
| E2 | Open client detail page | Detail routing + data fetch |
| E3 | Provision one-time service -> tasks + invoice created | Provisioning pipeline |
| E4 | Update task status in Inbox | Fulfillment workflow |
| E5 | Mark payment as paid | Payment status lifecycle |
| E6 | Provision recurring service -> generate monthly tasks | Recurring task generation |

### Tier 3 — Lower-Priority Regression (`admin-crm.regression.spec.ts`)
UI polish, edge cases, secondary features.

| # | Test | What it proves |
|---|------|----------------|
| R1 | AI Copilot drawer opens and shows page-aware context | Copilot loads, context injection |
| R2 | Mobile viewport: Inbox renders, sidebar collapses | Responsive layout |
| R3 | Mobile viewport: Client detail page readable | Mobile layout |
| R4 | Edit client information | Client update flow |
| R5 | Client search/filter by status | List filtering |

---

## Mock vs Real Strategy

| System | Strategy | Reason |
|--------|----------|--------|
| **Database (Postgres)** | Real | Tests need real CRUD; seeded via API calls |
| **Auth (Passport sessions)** | Real | Login tested end-to-end |
| **Admin CRM API** | Real | Core under test |
| **Stripe** | Mocked (route intercept) | No live billing in tests |
| **AI Chat (Anthropic)** | Mocked (route intercept) | Avoid API costs; deterministic |
| **Fiverr / Make.com / Vapi** | Not tested | External automation; out of scope |
| **Supplier status updates** | Real API but no external calls | Status fields updated locally |

### How mocking works
Playwright's `page.route()` intercepts outgoing requests to Stripe/AI endpoints and returns canned responses. No server-side changes needed.

---

## Test Data Strategy
- Each test run creates fresh clients/services via the API
- Client names include a timestamp suffix to avoid collisions
- Tests clean up by using unique identifiers, not by deleting data
- A shared `storageState` auth file is generated once per test run

---

## Known Gaps (Manual Testing Required)
1. **Stripe checkout flow** — requires real Stripe test keys + redirect handling
2. **AI Copilot streaming responses** — SSE mocking is partial; verify manually
3. **Email/notification delivery** — no email integration tested
4. **Concurrent multi-admin editing** — not covered
5. **Database migration correctness** — covered by `db:push`, not Playwright
6. **File uploads** — no file upload features in current CRM
7. **Browser compatibility** — only Chromium; Safari/Firefox need manual spot-checks

---

## Commands

```bash
# Run all admin CRM tests
npx playwright test tests/e2e/admin-crm/

# Run by tier
npx playwright test tests/e2e/admin-crm/admin-crm.smoke.spec.ts
npx playwright test tests/e2e/admin-crm/admin-crm.e2e.spec.ts
npx playwright test tests/e2e/admin-crm/admin-crm.regression.spec.ts

# Run with UI mode (headed)
npx playwright test tests/e2e/admin-crm/ --headed

# Run a specific test by name
npx playwright test -g "should create a new client"
```
