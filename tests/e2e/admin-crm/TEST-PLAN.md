# Admin CRM Playwright Test Plan

## Overview
Regression test suite for the WeFixTrades Admin CRM dashboard.
Tests run against a live dev server (`localhost:5000`) with a real database.
External integrations (Stripe, AI chat) are **mocked** via `page.route()`.

---

## Setup

A `globalSetup` script runs once before all tests to:
1. Seed the admin user via `seed-admin.ts`
2. Seed the service catalog via `seed-services.ts`
3. Login in a browser and persist `storageState` for auth reuse

Tests reuse the saved session — **no per-test login overhead**.

---

## Test Inventory (12 tests)

### Tier 1 — Smoke (5 tests) — `admin-crm.smoke.spec.ts`

| ID | Test | Asserts |
|----|------|---------|
| S1 | Login + land on /admin/crm overview | Auth, redirect, page render |
| S4 | Unauthenticated redirect to /login | Route protection |
| S5 | Wrong password shows error | Error handling |
| S3 | Sidebar links navigate correctly | Client-side routing (4 links) |
| S6 | Logout returns to /login | Session destruction |

### Tier 2 — Critical E2E (5 tests) — `admin-crm.e2e.spec.ts`

| ID | Test | Asserts |
|----|------|---------|
| E1 | Create client via UI | CRUD, redirect to detail, status badge |
| E3 | Provision one-time service via UI | Dialog interaction, toast, tasks + invoice via API |
| E4 | Click "Start" on inbox task | TaskCard button, toast, status change via API |
| E5 | Mark payment as paid | API status update, billing page render |
| E6 | Provision monthly + generate tasks | Recurring generation, month-label tasks via API |

### Tier 3 — Regression (2 tests) — `admin-crm.regression.spec.ts`

| ID | Test | Asserts |
|----|------|---------|
| R1 | Open AI Copilot drawer | Drawer opens, input visible, prompt chips visible, drawer closes |
| R4 | Edit client via Edit dialog | Dialog opens, save persists, toast, API verification |

---

## Moved to Manual Testing

| Former ID | Test | Reason |
|-----------|------|--------|
| R2 | Mobile: Inbox renders | Viewport checks don't prove layout quality |
| R3 | Mobile: Client detail renders | Body width assertion only proves viewport was set |
| R5/R5b | Client search + filter by status | Had no final assertions; fragile select interaction |
| R1b | Copilot per-page prompts | Same prompt text appears on multiple pages |
| S2 | Admin lands on overview | Merged into S1 |
| E2 | Open client detail page | Merged into E3 |

---

## Mock vs Real

| System | Strategy | Why |
|--------|----------|-----|
| **Postgres** | Real | Tests need real CRUD |
| **Auth (Passport)** | Real | Full login tested in S1; session reused elsewhere |
| **Admin CRM API** | Real | Core under test |
| **Stripe checkout** | Mocked (`**/api/billing/checkout**`) | No live billing |
| **AI Chat** | Mocked (`**/api/chat**`) | Avoid API costs; deterministic |
| **Fiverr/Make/Vapi** | Not tested | External automation, out of scope |

---

## Commands

```bash
# Prerequisites: dev server running
npm run dev

# Run all admin CRM tests (seeds automatically via globalSetup)
npm run test:crm

# Run by tier
npm run test:crm:smoke
npm run test:crm:e2e
npm run test:crm:regression

# Headed mode
npx playwright test tests/e2e/admin-crm/ --project=admin-crm --headed

# Single test by name
npx playwright test --project=admin-crm -g "E4"
```

---

## Known Gaps (Manual Testing Required)

1. **Stripe checkout redirect** — requires real Stripe test keys
2. **AI Copilot streaming quality** — SSE mock is canned; verify real responses manually
3. **Mobile responsive layouts** — viewport-only tests removed; use DevTools
4. **Client search/filter** — fragile to automate reliably; verify manually
5. **Concurrent multi-admin editing** — not covered
6. **Safari/Firefox** — only Chromium tested
