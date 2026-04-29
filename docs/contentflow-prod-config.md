# ContentFlow — Production Config Reference

**Sprint 19 deliverable.** This document lists every env var ContentFlow
reads, what it's required for, and the exact operator steps to wire
real APIs in production.

> **Important:** none of the values below should be committed to git.
> Use Replit Secrets / your secret manager.

---

## Required env vars

### Core

| Var | Required for | Notes |
|---|---|---|
| `DATABASE_URL` | everything | Postgres connection string |
| `SESSION_SECRET` | admin + portal auth | random 32+ chars |
| `TOKEN_ENCRYPTION_KEY` | SocialSync connection storage | 32-byte key, base64 or hex; rotation breaks all stored tokens |
| `APP_PUBLIC_URL` | Instagram publishing | the publicly-reachable origin Meta will fetch images from |
| `ADMIN_EMAIL` | internal alerts + email fallback | comma-separated list allowed |
| `NODE_ENV` | gating (`production` disables all dev overrides) | must be `production` in prod |

### AI

| Var | Required for | Notes |
|---|---|---|
| `ANTHROPIC_API_KEY` | content generation (caption + repurposer) | Claude API key |
| `OPENAI_API_KEY` | image generation (`gpt-image-1`) + AI fallback | OpenAI key with image-generation scope |
| `CLAUDE_MODEL` | content generation | optional, defaults to a project default |
| `IMAGE_MODEL` | image generation | optional, defaults to `gpt-image-1` |
| `IMAGE_SIZE` | image generation | optional, defaults to `1024x1024` |

### Cloudflare R2 (image storage)

| Var | Required for | Notes |
|---|---|---|
| `R2_ACCESS_KEY_ID` | image upload | from R2 → Manage R2 API Tokens |
| `R2_SECRET_ACCESS_KEY` | image upload | |
| `R2_BUCKET_NAME` | image upload | |
| `R2_ENDPOINT` | image upload | `https://<accountid>.r2.cloudflarestorage.com` |
| `R2_PUBLIC_URL` | image upload | the public origin that serves bucket objects (custom domain or workers.dev) |

### SMTP / email

| Var | Required for | Notes |
|---|---|---|
| `SMTP_HOST` | email channel | |
| `SMTP_PORT` | email channel | typically 587 (STARTTLS) or 465 (TLS) |
| `SMTP_USER` | email channel | |
| `SMTP_PASS` | email channel | |
| `SMTP_FROM` | email channel | RFC-5322 `Name <addr@domain>` allowed |

### Facebook OAuth (admin + future self-serve)

| Var | Required for | Notes |
|---|---|---|
| `FACEBOOK_APP_ID` | FB OAuth flow | from Meta App dashboard |
| `FACEBOOK_APP_SECRET` | FB OAuth flow | |
| `FACEBOOK_REDIRECT_URI` | FB OAuth flow | https URL registered in the Meta App |

### Google Business Profile OAuth

| Var | Required for | Notes |
|---|---|---|
| `GOOGLE_BUSINESS_CLIENT_ID` | GBP OAuth flow | from Google Cloud Console |
| `GOOGLE_BUSINESS_CLIENT_SECRET` | GBP OAuth flow | |
| `GOOGLE_BUSINESS_REDIRECT_URI` | GBP OAuth flow | https URL registered with the OAuth client |

### Performance feedback (Sprint 17 toggles)

| Var | Required for | Notes |
|---|---|---|
| `CONTENTFLOW_FB_INSIGHTS` | future Graph Insights API | leave unset for now (Sprint 17 + 18 ship without insights) |
| `CONTENTFLOW_IG_INSIGHTS` | future Graph Insights API | same |

### Repurposer (Sprint 13)

| Var | Required for | Notes |
|---|---|---|
| `REPURPOSER_AUTO_FIRE` | auto-fan-out on RankFlow article approval | **leave OFF for v1**; flip to `1` only after Sprint 20 quality controls |

---

## Forbidden in production

These flags **must be unset (or absent)** in production. They are dev/test stubs:

| Var | What it does | Risk if set in prod |
|---|---|---|
| `FB_GRAPH_API_BASE_OVERRIDE` | redirects FB calls to dev mock | no real FB posts |
| `IG_GRAPH_API_BASE_OVERRIDE` | redirects IG calls to dev mock | no real IG posts |
| `GBP_API_BASE_OVERRIDE` | redirects GBP review-reply to dev mock | no real GBP replies |
| `GBP_POST_API_BASE_OVERRIDE` | redirects GBP local-post to dev mock | no real GBP posts |
| `IMAGE_API_BASE_OVERRIDE` | redirects image gen to dev mock | placeholder PNGs only |
| `EMAIL_TEST_SIMULATE_SUCCESS` | bypasses SMTP, fakes `250 OK` | no real emails sent |
| `REPURPOSER_AI_STUB` | bypasses Anthropic, returns deterministic stub | low-quality content |
| `DEV_TOOLS_ENABLED` | exposes `/__dev/...` routes | admin endpoints leak (bypass channel logic) |

The env audit script (`scripts/contentflow-env-audit.ts`) will flag any of these as
**blocking** when `NODE_ENV=production`.

---

## How to validate production wiring

### Step 1 — env audit (always safe)

```bash
NODE_ENV=production npx tsx scripts/contentflow-env-audit.ts
```

This is read-only. It prints a table of every required var, whether it's
present + format-valid, and lists blockers. No API calls, no secret values.

### Step 2 — dry-run smoke (no public side-effects)

```bash
CONTENTFLOW_REAL_API_SMOKE=1 DRY_RUN=1 npx tsx scripts/contentflow-smoke-all.ts
```

Each script verifies token + endpoint reachability without posting anything.
Image gen + R2 are not gated by `ALLOW_REAL_POSTS` and may produce a
test object — see image script header for cleanup steps.

### Step 3 — full smoke (will produce real test posts)

⚠️ **Only after dry-run passes.** Provide the operator-supplied `SMOKE_*`
env vars listed in each script header. Then:

```bash
CONTENTFLOW_REAL_API_SMOKE=1 ALLOW_REAL_POSTS=1 npx tsx scripts/contentflow-smoke-all.ts
```

A successful run produces ONE test artifact per channel on TEST destinations
(test FB page, test IG account, test GBP location, test WP staging,
test inbox). The orchestrator writes a JSON summary to
`data/contentflow-smoke-report.json`.

**Each script prints its own cleanup step** — delete the test posts/draft
after verification.

---

## Smoke script env reference (operator-supplied)

These are **separate from production env vars**. They identify the test
destinations the smoke scripts should hit:

| Var | Used by | Description |
|---|---|---|
| `SMOKE_WP_URL` | wordpress | https://staging.example.com (NOT a customer site) |
| `SMOKE_WP_USERNAME` | wordpress | admin user on the staging site |
| `SMOKE_WP_APP_PASSWORD` | wordpress | Application Password from Users → Profile |
| `SMOKE_FB_PAGE_ID` | facebook | numeric id of test page |
| `SMOKE_FB_PAGE_TOKEN` | facebook | Page Access Token (NOT user token) |
| `SMOKE_FB_GRAPH_VERSION` | facebook + instagram | optional, defaults to `v19.0` |
| `SMOKE_IG_USER_ID` | instagram | numeric IG Business account id (linked to test page) |
| `SMOKE_IG_TOKEN` | instagram | long-lived user token (`instagram_basic` + `instagram_content_publish`) |
| `SMOKE_IG_IMAGE_URL` | instagram | PUBLIC https URL of a 1024x1024 jpg/png |
| `SMOKE_GBP_LOCATION_NAME` | gbp_post | `accounts/{a}/locations/{b}` |
| `SMOKE_GBP_REVIEW_NAME` | gbp_review_reply | `accounts/{a}/locations/{b}/reviews/{c}` |
| `SMOKE_GBP_ACCESS_TOKEN` | gbp_post + gbp_review_reply | OAuth access token (1h lifetime) |
| `SMOKE_GBP_API_BASE` | gbp_post + gbp_review_reply | optional, defaults to `https://mybusiness.googleapis.com` |
| `SMOKE_EMAIL_TO` | email | a test inbox you control |

---

## Manual operator checklist (private-beta launch)

1. ✅ Set core env (`DATABASE_URL`, `SESSION_SECRET`, `TOKEN_ENCRYPTION_KEY`, `APP_PUBLIC_URL`, `ADMIN_EMAIL`, `NODE_ENV=production`).
2. ✅ Set AI keys (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`).
3. ✅ Set R2 5-tuple (`R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_ENDPOINT`, `R2_PUBLIC_URL`).
4. ✅ Set SMTP 5-tuple (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`).
5. ✅ Set FB OAuth 3-tuple (`FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET`, `FACEBOOK_REDIRECT_URI`).
6. ✅ Set GBP OAuth 3-tuple (`GOOGLE_BUSINESS_CLIENT_ID`, `GOOGLE_BUSINESS_CLIENT_SECRET`, `GOOGLE_BUSINESS_REDIRECT_URI`).
7. ✅ Confirm `NODE_ENV=production` and ALL dev overrides unset.
8. ✅ Run env audit — must show 0 blockers.
9. ✅ Provision **test destinations** (test FB page, test IG account, test GBP location, test WP staging, test inbox). Do **not** use customer accounts.
10. ✅ Set `SMOKE_*` vars + run `smoke-all.ts` in `DRY_RUN=1` mode — must show all `ok` or `skipped` with no `failed`.
11. ✅ Run `smoke-all.ts` with `ALLOW_REAL_POSTS=1` — verify each channel produces ONE test artifact and clean it up.
12. ✅ Hand-onboard the first paying customer's connections via admin UI / direct DB insert.
13. ✅ Watch `/api/admin/contentflow/health` — status must be `ok` or `degraded` (alerts visible).

After these 13 steps, ContentFlow is ready for hand-onboarded private beta.
**Self-serve onboarding is NOT in this sprint** — defer to Sprint 20.

---

## Known limitations after Sprint 19

- **Self-serve OAuth UI** is not built. Customer connections require manual provisioning by ops.
- **FB / IG insights API** is stubbed (`CONTENTFLOW_FB_INSIGHTS` / `CONTENTFLOW_IG_INSIGHTS` left unset). Sprint 17 feedback loop runs with the no-data baseline until this is wired.
- **WordPress page-views** are not collected. Articles publish but performance signal for WP is post-only (no views).
- **Repurposer** stays OFF (`REPURPOSER_AUTO_FIRE` unset). Sprint 20 enables it with quality controls.
- **Multi-location clients** are not supported.
