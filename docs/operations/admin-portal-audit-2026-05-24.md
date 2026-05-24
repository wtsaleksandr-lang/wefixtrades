# Admin + Customer Portal UX / Premium-Feel Audit — 2026-05-24

Lane: `audit/admin-portal-ui-ux` (worktree `wfx-ap` from `origin/main`).

Method: code-review pass over 10 highest-traffic admin pages + 6 highest-traffic
portal pages. Auth-gated routes — Playwright login flow skipped per brief
(strategy 1, code-review only). Sourced against `DESIGN-SYSTEM.md` tokens:
brand blue `#0d3cfc`, brand-blue Tailwind alias `brand-blue`, ink near-black,
soft surfaces, 8px section spacing / 2px input-cluster spacing, every component
gets a top-left help cue, table tokens canonical, no off-brand palettes.

The audit measures four things per page:

1. **Loading state** — Skeleton / Loader2 / inline message
2. **Error state** — explicit `isError` branch with retry
3. **Empty state** — friendly copy + next action
4. **Premium-feel anti-patterns** — hardcoded hex (non-token), off-brand
   indigo/violet/purple, missing `aria-label` on icon-only buttons, label-above
   inputs violating field rules, mobile-overflowing grids, weak
   non-sortable tables

## Per-page findings

| Page | Loading | Error | Empty | Notable issues |
|---|---|---|---|---|
| `admin/ClientsPage.tsx` | OK (Skeleton rows) | implicit | OK (inline "No clients yet" + CTA) | Plain `<TableHead>` — **no sortable column headers**. `[var(--brand-blue,#0d3cfc)]` fallback hex literal works but should drop the inline fallback now that the alias is shipped. |
| `admin/ClientDetailPage.tsx` | OK (multi-card Skeleton, 69 hits) | partial | OK | **`grid-cols-4` (lines 883, 1834) without `sm:`/`md:` prefix** — KPI strip wraps poorly on small tablets. Recharts series uses hardcoded hex (`#6366F1`, `#22D3EE`, `#F59E0B`, `#22C55E`) — should pull from a chart-palette token. Two `hover:bg-[#EEF3FF]` literals (1031, 1104) — there is already a `brand-blue/10` Tailwind utility for this. |
| `admin/ProductDetailPage.tsx` | OK | partial | OK | Clean — no indigo/violet drift. Heavy `space-y-6` use (typical) but inside section cards, which is acceptable per spacing rule. |
| `admin/AdFlowOpsPage.tsx` | OK (`isLoading`) | **missing** (no `isError` branch — useQuery silently fails) | OK (`Card p-8` empty state) | Add error state with retry. Otherwise clean. |
| `admin/ContentFlowQueuePage.tsx` | OK | OK | OK | **Worst brand drift in scope** — 14 `indigo-*` literals. The bulk-action toolbar (lines 530-546) uses `bg-indigo-600`, `border-indigo-200`, `text-indigo-900` for the active selection cluster. Should be `brand-blue` / `brand-blue/10` per design system rule "Blue is the action colour … no stray palettes." Same indigo also used in sort menu (`text-indigo-700` for active sort), type-badge icons, and the calendar pill. |
| `admin/TradelineVoicesPage.tsx` | partial — inline text "Loading voices…" only, no Skeleton | **missing** | partial | Page-icon `text-indigo-600` (line 193). Voice-budget progress bar `bg-indigo-500` (line 229). "Use voice" outline button `border-indigo-200 text-indigo-600 hover:bg-indigo-50` (line 266). Should be brand-blue. Plain text loader is below the standard set by sibling product-ops pages. |
| `admin/TradelineTemplatesPage.tsx` | OK | partial | OK | Icon hover state `hover:text-indigo-700`, "User-created" badge `bg-indigo-50 ... text-indigo-800`, chat bubble preview `bg-indigo-600`. The chat preview is arguably defensible (sample chat color), but the user-created badge + hover are brand drift. |
| `admin/QuoteQuickTemplateDetailPage.tsx` | OK | OK (`detail.isError` branch + reload) | OK | 7 indigo literals — variable badge (`bg-indigo-50 text-indigo-700`), copy button (`text-indigo-600`), hover border (`hover:border-indigo-300`). Pattern recurs in 4 places suggesting a shared "variable-token" treatment — extract to a token / shared component. |
| `admin/CrmOverview.tsx` | OK (multi-card Skeleton) | OK (`isError` branch) | OK ("No clients yet" with `brand-blue` link) | `bg-purple-600` for "Outbound" pill icon (339), `bg-purple-500` for "Open Tasks" StatCard (566). Off-brand. One `hover:bg-[#235c43]` literal (244) — looks like a wrong-brand color (green) was copied from QuoteFleet. |
| `admin/AdminAuditLogPage.tsx` | OK | OK | OK | Best-in-class page in the scope — full LERE pattern (Loading, Error, Retry, Empty), all icon-only `Bot/User/Cpu` are inside descriptive spans not buttons. Use as the reference template for other admin pages. |
| `portal/PortalDashboard.tsx` | OK | OK (`error` branch + Try again button) | implicit (cards render zeros) | Clean. 3 inline `style={{}}` usages — small / scoped. |
| `portal/PortalServices.tsx` | OK | OK | OK ("No services yet" panel) | 4 indigo literals. Otherwise tight. |
| `portal/PortalChatWidgetSetup.tsx` | OK | partial | OK | 2 indigo literals. Otherwise solid. |
| `portal/PortalBilling.tsx` | OK | OK | OK | Clean. Loader2 + Skeleton both used appropriately. |
| `portal/PortalRankFlow.tsx` | OK | **missing** (no `isError` branch on the main RankFlowData query) | OK (upsell card when inactive) | No error state on the primary data fetch. Nested SearchConsole query handles error implicitly. |
| `portal/PortalTradelineKnowledgePage.tsx` | **missing** — `entriesQ.isLoading` never branched | **missing** — `entriesQ.isError` never branched | partial — only "No FAQs yet" per-kind, no global skeleton | **Worst overall.** Page-icon `text-indigo-600`. **4 icon-only buttons (ArrowUp, ArrowDown, Trash2-Archive) have no `aria-label`** (lines 208-213, 220-222). Edit/Save/Cancel dialog labels stack `<span class="font-medium">` above `<Input>` — violates field-rule #1 "title inside the input field". Uses `space-y-6` and `space-y-3` at the form-cluster level — violates the 2px stacked-input rule. No help-cue (?) anywhere — violates the global cue rule. |

## Top 10 polish recommendations (ranked)

1. **Replace all `indigo-*` Tailwind utilities in scope with `brand-blue` aliases.**
   This is the single biggest premium-feel win — three sections currently flash
   "wrong app" because they use Tailwind indigo instead of #0d3cfc. Largest
   offender: `ContentFlowQueuePage` bulk-action toolbar (lines 530-546).
   Sweep: `ContentFlowQueuePage`, `TradelineVoicesPage`, `TradelineTemplatesPage`,
   `QuoteQuickTemplateDetailPage`, `PortalTradelineKnowledgePage`,
   `PortalServices`, `PortalChatWidgetSetup`. ~30 lines, low risk.

2. **Add full LERE (loading + error + retry + empty) to
   `PortalTradelineKnowledgePage`.** Currently a customer with a network blip
   sees a frozen empty shell with no skeleton, no toast, no retry. Add
   `entriesQ.isLoading` → 6× Card skeletons; `entriesQ.isError` → red banner +
   refetch button. ~25 lines.

3. **Add `aria-label` to the 4 icon-only buttons in
   `PortalTradelineKnowledgePage`** (`ArrowUp`, `ArrowDown`, `Archive`, plus
   the dialog `X`). Screen-reader-fail today. **Shipped inline this PR.**

4. **Make the admin `ClientsPage` table sortable.** It's the highest-traffic
   admin list and the column headers are dead text. Wire up the existing
   `useListUrlState` sort param to the `Business` / `Trade` / `Status`
   `<TableHead>` cells with a chevron + URL state. ~40 lines, big UX win.

5. **Fix the mobile KPI strip in `ClientDetailPage`** — `grid grid-cols-4`
   without responsive prefix at lines 883 and 1834. Change to
   `grid-cols-2 md:grid-cols-4`. ~2 lines, prevents stat-box squish on
   tablets / phones during impersonation. Consider shipping inline.

6. **Add `isError` branches** to `AdFlowOpsPage`, `TradelineVoicesPage`,
   `PortalRankFlow` (3 pages currently show stale or blank surfaces on a
   failed initial fetch). Pattern: copy the `AdminAuditLogPage` LERE block
   verbatim (it's the cleanest in the scope).

7. **Replace `text-purple-700` / `bg-purple-500/600` pills in `CrmOverview`**
   (lines 339, 346, 566) — the "Outbound" sales pipeline tile and the "Open
   Tasks" StatCard use Tailwind purple. They should be a desaturated brand-blue
   tint, or a single distinct accent if we genuinely need a fourth category
   color (in which case add it to tokens, not inline).

8. **Drop the inline `style={{}}` color literals in the portal charts.**
   `PortalDashboard` has only 3 (acceptable), but `DispatchPage` (24),
   `InvoicesPage` (52), `InvoiceDetailPage` (69) — out of scope for this audit
   but flagged for the next sweep. Replace with semantic Tailwind classes or a
   `<StatusBadge variant="paid|sent|overdue" />` component.

9. **Upgrade `TradelineVoicesPage` loading state from text-only ("Loading
   voices…") to a 4×Skeleton card grid.** Inconsistent with sibling pages.

10. **Move recurring "variable-token" treatment in `QuoteQuickTemplateDetailPage`
    into a shared `<TemplateVar />` component.** Currently four near-identical
    `bg-indigo-50 border-indigo-200 text-indigo-700` literals — extract once
    and re-brand once.

## Inline fixes shipped this PR

- `client/src/pages/portal/PortalTradelineKnowledgePage.tsx`: added
  `aria-label` to the four icon-only buttons (Up / Down / Archive / Dialog X)
  and rebranded the page-header `BookOpen` icon from `text-indigo-600` to
  `text-brand-blue`. ~5 lines total.

## Out of scope / parking lot

- Playwright login + visual capture: skipped per brief; recommend a follow-on
  `audit/admin-portal-screenshots` lane that uses `TEST_ADMIN_*` from Doppler
  to authenticate and `page.screenshot()` each route at desktop (1440) + mobile
  (390) widths. The visual artefacts would land in
  `docs/operations/visual-audit-screenshots/admin-portal/`.
- `style={{}}` inline-color cleanup in the portal `invoice-templates/` /
  `DispatchPage` / `InvoicesPage` / `InvoiceDetailPage` — different problem
  (these are render-to-PDF templates where inline CSS is intentional for
  email/PDF compatibility) — leave as is until a separate decision.
- Help-cue audit (`?` top-left of every component) was not scored per-page —
  the rule is design-system-wide and worth a dedicated `audit/help-cue-coverage`
  lane that walks the component library, not the pages.
