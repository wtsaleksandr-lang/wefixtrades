# Migrations + Dead-Code Audit — 2026-05-24

Two cleanup audits in one PR:

1. `migrations/` file hygiene + idempotency verification.
2. Dead-code sweep across client + server (unused exports, dead components, orphan routes).

Scope: this doc only. Inline deletions are limited to files with **zero references** anywhere in the codebase (verified by grep across `client/`, `server/`, `shared/`, `tests/`, and `scripts/`).

---

## Part 1 — Migrations review

### Inventory

52 SQL migrations on `main`: `0000_initial_schema.sql` through `0051_jsonb_gin_indexes.sql`. (Task brief said 53 / 0000–0052; the latest on `origin/main` at audit time is `0051`. No gap.)

### Idempotency: clean

Pattern checks across all 52 files:

| Risk pattern | Hits | Status |
| --- | --- | --- |
| `CREATE TABLE` without `IF NOT EXISTS` | 0 | clean |
| `CREATE INDEX` / `CREATE UNIQUE INDEX` without `IF NOT EXISTS` | 0 | clean |
| `ALTER TABLE ... ADD COLUMN` without `IF NOT EXISTS` | 0 | clean |
| `CREATE TYPE` without `IF NOT EXISTS` (Postgres requires DO-block wrap) | 0 | none defined |
| `CREATE SEQUENCE` without `IF NOT EXISTS` | 0 | clean |
| `ADD CONSTRAINT` outside an idempotency wrapper | 0 | every one is wrapped in `DO $$ ... EXCEPTION WHEN duplicate_object THEN NULL; END $$;` or an `IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints ...)` guard |

### Destructive ops: clean

| Risk pattern | Hits | Notes |
| --- | --- | --- |
| `DROP TABLE` | 0 | none |
| `DROP COLUMN` / `DROP CONSTRAINT` / `DROP TYPE` / `DROP SEQUENCE` / `DROP VIEW` / `DROP FUNCTION` / `DROP TRIGGER` | 0 | none |
| `TRUNCATE` | 0 | none |
| `DELETE FROM` | 0 | none |
| `DROP INDEX` | 1 | `0010_suppression_index_fix.sql:24` — uses `DROP INDEX IF EXISTS` and is documented in a 20-line comment block explaining the operator-class bug in `0006`. Safe + intentional. |

### Seed data inserts: all idempotent

Migrations with `INSERT` / `UPDATE` side-effects:

| File | Pattern | Idempotent |
| --- | --- | --- |
| `0010_suppression_index_fix.sql` | `UPDATE ... WHERE customer_email <> lower(customer_email)` | yes — conditional |
| `0012_quotequick_ai_budget.sql` | `INSERT ... ON CONFLICT ("scope") DO NOTHING` | yes |
| `0013_quotequick_slug_lifecycle.sql` | `UPDATE calculators WHERE updated_at IS NULL` | yes — conditional |
| `0014_quotequick_starter_to_pro.sql` | `UPDATE calculators WHERE plan_tier = 'starter'` | yes — converges (and verifies via `SELECT COUNT(*)`) |
| `0026_ai_system_gates.sql` | `INSERT ... ON CONFLICT (surface) DO NOTHING` | yes |
| `0027_tradeline_voice_settings.sql` | `INSERT ... ON CONFLICT ("id") DO NOTHING` | yes |
| `0030_ai_channel_gates.sql` | `INSERT ... ON CONFLICT ("channel") DO NOTHING` | yes |
| `0031_ai_cost_ledger.sql` | `INSERT ... ON CONFLICT (model) DO NOTHING` | yes |
| `0042_invoice_templates_and_contacts_billing.sql` | `INSERT ... ON CONFLICT DO NOTHING` | yes |

### Verdict

**No compaction migration needed.** Every existing migration is safely re-runnable. The team has been disciplined about `IF NOT EXISTS` + `DO $$ ... EXCEPTION duplicate_object ... END $$` wrappers, and every seed insert ships with `ON CONFLICT DO NOTHING`. The single `DROP INDEX` is guarded and documented.

No migration files modified by this PR (per scope hard-constraint).

### Orphan tables

Out of scope ("hard to be sure, skip if unclear") — left unaudited.

---

## Part 2 — Dead-code sweep

### Methodology

For every `.tsx` under `client/src/components/` (307 files) and `client/src/pages/` (139 files):

1. Derive the export base name from the filename (excluding `index.tsx`).
2. Grep `client/src`, `server/`, `shared/`, `tests/`, `scripts/` for `\bBaseName\b`.
3. Subtract the file's own self-references.
4. Hit count of zero → unreferenced.

Same approach for `server/routes/*.ts` (cross-checked against `server/routes/index.ts` registrations).

### Orphan routes — none

All 115 files under `server/routes/` are either:
- Registered in `server/routes/index.ts` (the canonical registrar), or
- Shared utilities (`auditTabsShared.ts`, `twilioBookingHelper.ts`, `index.ts`) imported by sibling route files.

No orphan routes.

### Orphan components — 15 deletions shipped

All confirmed: zero references outside their own file (lint baseline + plan docs only).

| File | Notes |
| --- | --- |
| `client/src/components/themeUtils.tsx` | `getEffectiveTheme()` wrapper around `getWidgetTheme()` from `@/theme/widgetTheme` — no consumers; consumers call `getWidgetTheme` directly |
| `client/src/components/booking/BookNowButton.tsx` | Standalone booking button, never wired into any page |
| `client/src/components/marketing/AnimatedLogo.tsx` | Marketing-hero animation, never imported |
| `client/src/components/marketing/BentoGrid.tsx` | Marketing layout, never imported |
| `client/src/components/marketing/CapabilitiesGrid.tsx` | Marketing layout, never imported |
| `client/src/components/marketing/ProductCategoryChip.tsx` | Marketing chip, never imported |
| `client/src/components/marketing/ProductHeroShell.tsx` | Marketing hero shell, never imported |
| `client/src/components/marketing/ProductVisualPreview.tsx` | 750-line product preview, never imported |
| `client/src/components/marketing/ServiceHighlights.tsx` | Marketing service grid, never imported |
| `client/src/components/marketing/StackedFlowCards.tsx` | Marketing flow cards, never imported |
| `client/src/components/marketing/StepTimeline.tsx` | Marketing step timeline, never imported |
| `client/src/components/marketing/TradelineAgentGrid.tsx` | Marketing agent grid, never imported |
| `client/src/components/marketing/TypingReplace.tsx` | Typing animation; only the CSS rule `.blinking-caret` in `index.css` mentions the name in a comment |
| `client/src/components/marketing/globe/GlobeCard.tsx` | Orphan inside the globe subdir; `GlobeSection.tsx` no longer uses it |
| `client/src/pages/products/ProductPageTemplate.tsx` | Planned reusable product template; never wired into the router |

### shadcn UI primitives — left in place (documented, not deleted)

These show as unreferenced in the dependency graph but are part of the shadcn-style component library (drop-in primitives kept for future use). Convention is to retain the whole library; deleting them gives ~zero bundle savings (tree-shaking already excludes them) and creates re-add friction.

- `client/src/components/ui/context-menu.tsx`
- `client/src/components/ui/hover-card.tsx`
- `client/src/components/ui/input-otp.tsx`
- `client/src/components/ui/menubar.tsx`
- `client/src/components/ui/navigation-menu.tsx`
- `client/src/components/ui/scroll-area.tsx`
- `client/src/components/ui/toggle-group.tsx`

If a future bundle-size pass wants to trim, these are the candidates — but each is a single small file that's already pruned by Vite.

### Test files showing as "unreferenced"

Test runner picks tests up by glob, not by import. The following are intentional, not dead:

- `client/src/components/marketing/__tests__/*.test.tsx`
- `client/src/components/portal/__tests__/*.test.tsx`
- `client/src/components/primitives/__tests__/*.test.tsx`
- `client/src/components/shared/__tests__/*.test.tsx`
- `client/src/components/ui/__tests__/confirm-dialog.test.tsx`
- `client/src/components/wizard/elfsight/__tests__/fieldTypes.test.tsx`
- `client/src/pages/admin/MobilePreview/__tests__/PreviewScreens.test.tsx`

### Large files (>1000 lines) — candidates for future splits

Not removed; flagged for future refactor. These remain in use.

| File | Lines | Suggestion |
| --- | --- | --- |
| `server/routes/portalRoutes.ts` | 5,624 | Split per-domain (settings / billing / users / ...) |
| `server/storage.ts` | 5,192 | Split per-table cluster — the god-class of the project |
| `client/src/components/wizard/elfsight/StyleTab.tsx` | 4,674 | Split into per-section subcomponents |
| `server/routes/adminCrmRoutes.ts` | 4,627 | Split per-entity (leads / accounts / contacts / opportunities) |
| `shared/templatePresets.ts` | 4,468 | Already structured as a data file — leave |
| `client/src/components/quote-widget/AdvancedCalculator.tsx` | 3,358 | Split per-tab / per-step |
| `client/src/pages/marketing/ReportView.tsx` | 3,343 | Split per-tab |
| `client/src/pages/admin/ClientDetailPage.tsx` | 3,141 | Split per-tab |
| `client/src/components/wizard/legacy/WizardCard.tsx` | 3,034 | Legacy wizard — kept at `/wizard/legacy`. Delete if/when legacy retires (currently still routed) |
| `server/auditRoutes.ts` | 3,028 | Split per-tool |
| `client/src/components/wizard/elfsight/WizardShell.tsx` | 2,632 | Extract subcomponents |
| `client/src/components/wizard/elfsight/PreviewPane.tsx` | 2,581 | Extract per-device preview blocks |
| `client/src/components/wizard/legacy/DesignStudio.tsx` | 2,233 | Legacy — see WizardCard note |
| `client/src/pages/dashboard.tsx` | 2,122 | Split per-section |

These are not addressed here. Out of scope.

---

## Summary

- **Migrations:** 0 non-idempotent files. 0 risky destructive ops. No compaction needed.
- **Dead code shipped:** 15 file deletions (12 marketing + 1 booking + 1 wrapper + 1 page template).
- **Dead code documented (not shipped):** 7 shadcn UI primitives (library-style; leave in place).
- **Routes:** 0 orphans.
- **Large-file refactor candidates:** 14 files >1000 lines — flagged, not touched.
