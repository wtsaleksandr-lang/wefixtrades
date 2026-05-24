# Cross-project audit — quotefleet + accesstonorth — 2026-05-24

Read-only health sweep of the two non-WFX active Replit projects. Scope per `projects.yaml`: `quotefleet` (Cloudflare Worker front + Replit API) and `accesstonorth` (Replit-hosted Canadian biz registration site). No files modified in either project.

Companion to [`api-account-audit-2026-05-24.md`](api-account-audit-2026-05-24.md) (WFX-only, PR #670).

---

## 1. quotefleet

| dimension | observation |
| --- | --- |
| Local path | `C:\Users\Owner\.codex\quotefleet` |
| GitHub | `wtsaleksandr-lang/quotefleet` |
| Branch (local) | `main` |
| Last commit on `main` | `844f04c` — `feat: doppler runtime cutover via doppler run` (**2026-05-10**) |
| Last Replit publish | `d8df8ac` — *Published your App* (2026-05-14 13:25 UTC) |
| Local working tree | **DIRTY — 4 unresolved merge conflicts** (`UU` state on `drizzle/meta/_journal.json`, `src/db/schema.ts`, `src/server/public/app.html`, `src/server/public/app.js`) plus 2 modified widget files and 2 untracked Drizzle migrations (`0002_brand_contact_toggles.sql`, `0003_callback_requests.sql`). Read-only — not touched. |
| Stash | 1 stash: `phase-5b-quotefleet-rebase-stash` |
| Live URL | `https://quotefleet.net/` → **HTTP 200** (0.44 s). NOTE: `quotefleet.com` resolves to AWS but **times out** — public-facing domain is `.net`, not `.com`. |
| Health endpoint | `/healthz` → **HTTP 200**. `/api/healthz` returns 404 (different convention than WFX). |
| Replit-app fallback | `quotefleet.replit.app` → 404 (custom domain only). |
| Doppler `prd` config | 25 secret names, locked, last fetch 2026-05-14 |
| Open PRs | 2 — both stale (12 days): `#3 feat: recover stashed brand-toggles + callback-requests work`, `#2 chore(test): Q9 install Playwright for E2E smoke coverage` |
| Open issues | 0 |
| Local branches | `feat/q4-stash-recovery`, `feat/q9-playwright-setup`, `fix/legal-entity-name`, `main` |

### Secret inventory (quotefleet/prd — names only)

`ANTHROPIC_API_KEY`, `CLOUDFLARE_API_TOKEN`, `DATABASE_URL`, `DEEPSEEK_API_KEY`, `DOPPLER_{CONFIG,ENVIRONMENT,PROJECT}`, `EIA_API_KEY`, `GEMINI_API_KEY`, `HOST_DOMAINS`, `NODE_ENV`, `OPENAI_API_KEY`, `PUBLIC_BASE_URL`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `SESSION_SECRET`, `SMTP_{FROM,HOST,PASS,PORT,USER}`, `SUPER_ADMIN_EMAIL`, `TWILIO_{ACCOUNT_SID,AUTH_TOKEN}`, `WORKER_AUTH_SECRET`.

Common 5-tuple (DATABASE_URL / NODE_ENV / SESSION_SECRET / SMTP_* / OPENAI_API_KEY): **all present**.

`HOST_DOMAINS` contains 20 alternate domains beyond quotefleet.net — confirms `.net` as canonical and the rest as parked/SEO holds.

### Deferred maintenance — quotefleet

1. **Dirty working tree with unresolved merge conflicts** has sat since at least 2026-05-12 (stash date). Two open PRs are direct descendants of this stash. Either resolve and merge `feat/q4-stash-recovery`, or drop the stash and close the PR.
2. **Domain confusion**: `quotefleet.com` is registered (resolves to AWS IPs) but does not serve traffic. Public-facing is `.net`. Either redirect `.com → .net` at the registrar, or decide to retire the `.com` to cut renewal cost.
3. **Playwright smoke PR (#2)** open 12 days — either land it or close. No CI exists to consume the tests until then.

---

## 2. accesstonorth

| dimension | observation |
| --- | --- |
| Local path | `C:\Users\Owner\.codex\AccessToNorth` |
| GitHub | `wtsaleksandr-lang/AccessToNorth` |
| Branch (local) | `main` |
| Last commit on `main` | `7742dca` — `fix(legal): align US entity name to MR Holdings & Trade LLC (#4)` (**2026-05-14**) |
| Last Replit publish | `07c22ba` — *Published your App* (2026-05-14 13:44 UTC, same day as merge) |
| Local working tree | clean |
| Live URL | `https://accesstonorth.com/` → **HTTP 200** (0.34 s, Cloudflare-fronted) |
| Health endpoint | `/api/healthz` → **HTTP 200**. `/healthz` returns 404. |
| Doppler `prd` config | 22 secret names, locked, last fetch 2026-05-12 |
| Open PRs | 0 |
| Open issues | 0 |

### Secret inventory (accesstonorth/prd — names only)

`ADMIN_PASSWORD`, `CONNECTORS_HOSTNAME`, `DATABASE_URL`, `DOPPLER_{CONFIG,ENVIRONMENT,OVERRIDE_KEYS,PROJECT}`, `OPENAI_API_KEY`, `PG{DATABASE,HOST,PASSWORD,PORT,USER}`, `SESSION_SECRET`, `SMTP_{FROM,HOST,PASS,PORT,USER}`, `TWILIO_{ACCOUNT_SID,AUTH_TOKEN}`.

Common 5-tuple: **all present**.

Notable: `ADMIN_PASSWORD` is a single shared admin password (not per-user). `DOPPLER_OVERRIDE_KEYS` exists — this is the Doppler bootstrap shim from PR #3 (2026-05-13), opt-in env override list.

### Deferred maintenance — accesstonorth

1. **`ADMIN_PASSWORD` is a single shared secret** rather than a per-admin credential store. Functional for a single-operator site but blocks delegation. Migrate to per-user accounts when a second admin is needed.
2. **Both `DATABASE_URL` and the 5 PG split-fields (`PGHOST`/`PGUSER`/`PGPASSWORD`/`PGPORT`/`PGDATABASE`) are stored** — pick one source of truth. Risk: drift if rotated independently.
3. **No `STG`/`DEV` config probed here** — only `PRD` was in scope per task. Worth confirming non-prod has its own DB and not a shared instance.

---

## 3. Cross-project — shared key check

Per the API hygiene audit doc (PR #670), the WFX Anthropic key was historically shared with `freight-copilot`. Same check applied across quotefleet, accesstonorth, and wefixtrades for the three providers all three projects use:

| key | WFX sha-16 | quotefleet sha-16 | accesstonorth sha-16 | shared? |
| --- | --- | --- | --- | --- |
| `OPENAI_API_KEY` (len 167) | `f06250b5e929bbac` | `13a18514ad0068d7` | `9975760a8fadf33b` | **no — all 3 distinct** |
| `ANTHROPIC_API_KEY` (len 108) | `6a31a513c58847ed` | `159ee6dd732c5546` | n/a (not in AtN) | **no — distinct** |
| `TWILIO_ACCOUNT_SID` | `ACec11…a2ad` | `AC1dde…fe0e` | `ACbfd6…d935` | **no — 3 separate Twilio accounts/subaccounts** |

Hashes are 16-hex prefixes of SHA-256 only; no raw values written. Comparison run via `doppler secrets get … --plain` piped to `sha256sum`, output discarded.

**Result: no cross-project key sharing between the 3 active projects.** This is a notable improvement on the WFX↔freight-copilot situation flagged in PR #670 and the CLAUDE.md carryover items. The shared-Anthropic-key carryover concern in CLAUDE.md applies to `freight-copilot` (hobby, read-only) and the local `wefixtrades/.env`, **not** to quotefleet or accesstonorth.

---

## 4. Top recommendations

### quotefleet (priority order)
1. **Resolve the merge-conflict working tree.** 4 files in `UU` state with an attached stash. Either land `feat/q4-stash-recovery` (PR #3) or drop the stash to clear the deck. As-is, future agents on this checkout will hit the conflict immediately.
2. **Decide on `quotefleet.com` vs `.net`.** Public site is `.net`; `.com` resolves but doesn't serve. Set a 301 redirect at the registrar or retire `.com`.
3. **Close or land the Playwright PR (#2).** 12 days idle. Don't accumulate stale infra PRs against an actively-shipping app.

### accesstonorth (priority order)
1. **Collapse `DATABASE_URL` vs `PG*` split secrets** to one canonical source — they drift on rotation and the app likely only reads one. Pick the URL form and delete the 5 split fields, or vice versa.
2. **Plan migration off shared `ADMIN_PASSWORD`** before adding any second admin. Today this is fine (single operator); flag for the moment a second person needs access.
3. **Confirm `STG`/`DEV` configs use isolated DB instances** — out of scope for today, but worth a 1-pass check next maintenance window.

### Cross-project
- **No shared keys between WFX/QF/AtN.** Hygiene already correct here; no rotation needed across these 3.
- The `freight-copilot` Anthropic-key share remains the only outstanding cross-project sharing concern, already on the CLAUDE.md carryover list.

---

## Blocker

None. Both apps are live and serving 200s; no rotation-blocking findings; no data-loss signal. Quotefleet's dirty checkout is a developer-experience issue, not an outage.

---

## Methodology + safety

- Read-only on quotefleet and accesstonorth checkouts: only `git status`, `git log`, `git branch`, `git stash list`, and `doppler secrets --only-names` (+ targeted `--plain` reads piped directly into `sha256sum` for the cross-share check; no raw value ever written to disk or this doc).
- Health probes: `curl` to public URLs, no auth required.
- GitHub: `gh pr list` / `gh issue list` only.
- Worktree: `C:\Users\Owner\.codex\wfx-xaudit` from `origin/main`, branch `audit/quotefleet-accesstonorth-health`. Only this file added.
