# Design System Compliance Sweep — 2026-05-24

Audit-only PR. Surfaces every current DESIGN-SYSTEM.md violation
detectable by the three CI guards (`check:layout-rules`,
`check:hardcoded-colors`, `check:copilot-forms`), categorises the
NEW-vs-baseline counts, lists top remediation candidates, and ships
four trivial inline fixes (3 color-token swaps + 1 exempt list entry).

Source documents consulted:
- `C:\Users\Owner\claude-orchestrator\DESIGN-SYSTEM.md`
- `~/.claude/projects/c--Users-Owner-claude-orchestrator/memory/feedback_input_field_rules.md`
- `~/.claude/projects/c--Users-Owner-claude-orchestrator/memory/feedback_recurring_ui_violations.md`
- `~/.claude/projects/c--Users-Owner-claude-orchestrator/memory/brand-badges-icons-locked.md`

## CI guard baseline vs current

| Guard | Baseline entries | Current NEW violations | Delta |
|---|---|---|---|
| `check:layout-rules` (rule-a/b/c) | 158 in `scripts/layout-violations-baseline.txt` | **44 NEW** above baseline | +44 |
| `check:hardcoded-colors` (tailwind/prop) | 6 in `scripts/contrast-violations-baseline.txt` | **13 NEW** above baseline (was 16 before inline fixes) | +13 |
| `check:copilot-forms` | 120 exempt entries in `scripts/copilot-form-exempt.txt` | **0 offenders** after this PR (was 1 before fix) | 0 |

Net: **57 NEW violations** post-fix vs the locked baselines. None of these
fail CI by themselves on PRs that don't touch the offending lines, but
they will fail any PR that re-touches an offending file without fixing it,
and they raise the bar for any new wave brief that wants to add UI.

## Violation categories (rule-keyed)

### 1. `rule-c` — Raw icon sizes outside the semantic ladder (40 of 44 layout violations)

Lucide `size={N}` and Tailwind `w-N h-N` outside {12,14,16,20,24,32} for SVG
or {3,3.5,4,5,6,8} for w/h utilities. Most common forms:

| Pattern | Count | Example file |
|---|---|---|
| `square w-2 h-2` / `w-1.5 h-1.5` / `w-2.5 h-2.5` (status dots) | 19 | `ContentFlowQueuePage.tsx:1033-1101`, `TradelineTemplatesPage.tsx:681-683` |
| `square w-7 h-7` (medium avatar/icon) | 6 | `AdminLayout.tsx:1221`, `ContentFlowPreviewModal.tsx:307`, `PortalRankFlow.tsx:602`, `TradelineTemplatesPage.tsx:289,304` |
| `square w-9 h-9` / `w-10 h-10` (large icon containers) | 9 | `BookingCalendarPage.tsx:138`, `PortalChatWidgetSetup.tsx:252`, `QuoteQuickTradesPage.tsx:227,347`, `TradeLineOpsPage.tsx:63,147` |
| `square w-12/14/16 h-12/14/16` (oversize logo-like marks) | 3 | `LucideIconPicker.tsx:163`, `ContentFlowPreviewModal.tsx:306`, `PortalRankFlow.tsx:601` |
| Lucide `size={18}` literal | 3 | `QuoteQuickTemplateDetailPage.tsx:958`, `QuoteQuickTradesPage.tsx:233,353` |

### 2. `rule-b` — Multiple help cues in same parent block (2 violations)

- `client/src/pages/admin/ClientDetailPage.tsx:779` — 2 cues inside `<div>` (likely tab-header pair; either collapse to one cue per tab or add `data-cue-allowed-multiple` if the layout intentionally surfaces two help affordances).
- `client/src/pages/portal/FreeTools/ServiceAreaMap.tsx:242` — 3 cues inside the page `<div data-theme="light">` (one per major panel; same call — collapse or annotate).

### 3. `rule-a` — Excessive input-cluster spacing (0 NEW above baseline)

Clean. The 158-entry baseline is the accepted debt; no NEW occurrences.

### 4. Hardcoded colors (13 NEW above baseline, post-fix)

| Pattern | Count | Notes |
|---|---|---|
| `bg-white` outside `data-theme` scope | 7 | `ContentFlowPreviewModal.tsx` (3), `WidgetStylePreviewModal.tsx` (1), `TradelineTemplatesPage.tsx` (1), `QuoteQuickTemplateDetailPage.tsx:1128`, `_shared.tsx` (fixed) |
| `text-white` outside `data-theme` scope | 5 | `ContentFlowPreviewModal.tsx` (2), `WidgetStylePreviewModal.tsx` (2), `TradelineTemplatesPage.tsx:679` |
| `bg-black` outside `data-theme` scope | 1 | `ContentFlowPreviewModal.tsx:325` |
| Inline `background: "#FFFFFF"` prop | 2 | `FacebookSignInButton.tsx:28`, `MicrosoftSignInButton.tsx:28` |

Context flags:
- `ContentFlowPreviewModal.tsx` (5 hits) is a deliberate social-media-chrome mockup (Twitter/Instagram/Facebook card lookalike). These look like brand-locked external visuals — recommend wrapping the entire content area in `<div data-theme="light">` rather than refactoring, OR adding to the colour-guard allowlist (a 2-line bump in `scripts/check-hardcoded-colors.mjs` if confirmed brand-locked).
- `WidgetStylePreviewModal.tsx` (3 hits) renders a dark phone-preview surface (`bg-gray-900`). `text-white` on dark bg is correct in context — same recommendation: scope under `data-theme="dark"` or allowlist.
- `TradelineTemplatesPage.tsx:669-689` is a chat-bubble preview — `text-white` on `bg-brand-blue-600` AI bubble is intentional and high-contrast. Same recommendation.
- `Facebook/MicrosoftSignInButton.tsx` use a `#FFFFFF` background for the social-login pill. Per `brand-badges-icons-locked.md` these are functional brand surfaces — recommend keeping but moving to allowlist.

### 5. Copilot form-fill (resolved this PR)

`client/src/pages/portal/FreeTools/_shared.tsx` was an unwired offender —
but it's a shared primitive module (not a page with a form). Added to
`scripts/copilot-form-exempt.txt` with a one-line reason.

### 6. Big-gap audit (manual sweep)

- 125 files use `gap-[3-9]` and 120 files use `space-y-6`. That's wave-by-wave
  debt — primary offenders (>=10 hits each): `ClientDetailPage.tsx`,
  `PortalDashboard.tsx`, `PortalSettings.tsx`, `PortalMapguard.tsx`,
  `PortalBilling.tsx`, `PortalArticles.tsx`, `PortalReviews.tsx`,
  `BookingCalendarPage.tsx`, `ProductDetailPage.tsx`,
  `QuoteQuickTemplateDetailPage.tsx`, `SuppliersPage.tsx`,
  `SettingsPage.tsx`.
- `space-y-8` / `gap-12+` are essentially absent from `client/src` (only 1 hit
  for `gap-8` in `PhoneFrame.tsx`). Good — the louder gaps are gone, but
  the medium `space-y-6` cluster still violates the recurring-violations
  rule §1 inside property panels / settings columns.

### 7. Mixed help-cue patterns (manual sweep)

Sample of pages cross-importing more than one cue component:
- `PortalSettings.tsx` — imports both `HelpCueRow` (primitive) AND `InfoCue` (wizard). Inspected: always used as `HelpCueRow cue={<InfoCue/>}` — that's the canonical pair (HelpCueRow forces top-left position, InfoCue provides the popover body). **Not a violation.**
- `PortalOnboarding.tsx` — uses its own `FieldHelpCue` exclusively. **OK.**
- Free Tools `_shared.tsx` exports its own `FieldHelpCue` used by 7 Free Tools pages. **OK** (per-surface single pattern).

No mixed-pattern violations found in spot-check. The lint pre-condition
(2+ cues in same `<div>`) already catches the only structural failure;
component-import mixing is acceptable when wrapped via HelpCueRow.

### 8. Bright-fill selected-state sweep (manual)

- `client/src/pages/portal/SocialSyncSetup.tsx:259` — uses `bg-brand-blue text-white` for selected pill-chip. Per DESIGN-SYSTEM.md §5 "Button-choice fields … selected state in brand blue #0d3cfc" — **chip-pills explicitly allow bright fill**. Not a violation.
- `client/src/pages/portal/TradelineSetup/VoicePicker.tsx:104` — uses the canonical pattern: `ring-2 ring-brand-blue-500 bg-brand-blue-50/50`. **Compliant.**
- No instances of a clicked row/section header collapsing into solid brand-blue fill were found in this sweep. The recurring bug appears contained for now.

### 9. Label-above + raw `<label className>` sweep (manual)

288 occurrences of `<label className=...>` across 60 files. Spot-check
shows most are floating-label wrappers OR axis-labels in chart UIs OR
checkbox-side labels (`<input type=checkbox/> <label>...</label>`), which
are the only sanctioned exceptions to the title-in-field rule. No
systemic regression detected — but per-component compliance still needs
a per-component pass.

## Top 20 specific fix recommendations

Ranked by lowest effort × highest signal.

1. **`client/src/components/ai/AiResponseRating.tsx:191`** — `bg-white` → `bg-card`. [shipped this PR]
2. **`client/src/components/ai/AiResponseRating.tsx:215`** — `bg-white` → `bg-card`. [shipped this PR]
3. **`client/src/pages/portal/FreeTools/_shared.tsx:301`** — `bg-white` → `bg-card`. [shipped this PR]
4. **`client/src/pages/portal/FreeTools/_shared.tsx`** — add to copilot-form-exempt.txt. [shipped this PR]
5. **`client/src/components/contentflow/ContentFlowPreviewModal.tsx:188-395`** — wrap the entire preview body in `<div data-theme="light">` to scope all 5 white/black hardcoded colors at once (single line addition + matching close tag).
6. **`client/src/components/tradeline/WidgetStylePreviewModal.tsx:70-109`** — wrap the dark phone-preview block in `<div data-theme="dark">` to legitimise the 3 `text-white` hits.
7. **`client/src/pages/admin/TradelineTemplatesPage.tsx:656-688`** — wrap the chat-bubble transcript container in `data-theme="light"` (or use a `bg-brand-blue-600/text-white` semantic util — `text-brand-on-blue` if it exists).
8. **`client/src/pages/admin/QuoteQuickTemplateDetailPage.tsx:1128`** — single `bg-white` → `bg-card`.
9. **`client/src/components/auth/FacebookSignInButton.tsx:28`** + **`MicrosoftSignInButton.tsx:28`** — move both files to `scripts/check-hardcoded-colors.mjs` ALLOWLIST (functional social-brand pills, identity-locked per `brand-badges-icons-locked.md`).
10. **`client/src/components/admin/AdminLayout.tsx:1221`** — `w-7 h-7` → `w-6 h-6` (round to semantic ladder).
11. **`client/src/components/admin/LucideIconPicker.tsx:159,163`** — `w-2.5 h-2.5` → `w-3 h-3`; `w-12 h-12` → `w-8 h-8` (or move to ALLOWLIST if intrinsic to picker UI).
12. **`client/src/pages/admin/ContentFlowQueuePage.tsx:1033-1101`** — 9 status-dot violations (`w-1.5 h-1.5`, `w-2 h-2`); collapse to a single `<StatusDot size="xs">` primitive (use w-2 → semantic w-2 IS already in the ladder; check guard rule for `w-2`).
13. **`client/src/pages/admin/QuoteQuickTradesPage.tsx:227,233,347,353`** — 4-pack: replace `w-10 h-10` and `size={18}` with `w-8 h-8` + `size={20}` (or `size={16}`).
14. **`client/src/pages/admin/TradeLineOpsPage.tsx:63,147`** — duplicate `w-10 h-10` → `w-8 h-8` (matches existing primitives spec).
15. **`client/src/pages/admin/MobilePreview/PreviewScreens.tsx:960,1039`** — `w-7 h-7`, `w-10 h-10` → `w-6 h-6`, `w-8 h-8`. (or ALLOWLIST — phone-preview is brand-spec mockup).
16. **`client/src/pages/portal/PortalRankFlow.tsx:601,602`** — `w-14 h-14`, `w-7 h-7` → `w-12 h-12` (not in ladder either; consider w-8) and `w-6 h-6`.
17. **`client/src/pages/portal/PortalChatWidgetSetup.tsx:252`** — `w-9 h-9` → `w-8 h-8`.
18. **`client/src/pages/admin/BookingCalendarPage.tsx:138`** — `w-10 h-10` → `w-8 h-8`.
19. **`client/src/pages/admin/InboxPage.tsx:191,192`** — `w-2.5 h-2.5` → `w-3 h-3`.
20. **`client/src/pages/admin/SystemWorkersPage.tsx:199,405`** — same `w-2.5 h-2.5` → `w-3 h-3`.

## Inline fixes shipped this PR

| File | Change | Lines |
|---|---|---|
| `client/src/components/ai/AiResponseRating.tsx` | `bg-white` → `bg-card` on textarea (line 191) | 1 |
| `client/src/components/ai/AiResponseRating.tsx` | `bg-white` → `bg-card` on Skip button (line 215) | 1 |
| `client/src/pages/portal/FreeTools/_shared.tsx` | `bg-white` → `bg-card` on `<select>` (line 301) | 1 |
| `scripts/copilot-form-exempt.txt` | Add `_shared.tsx` with one-line reason | 5 |

Result: `check:hardcoded-colors` NEW violations 16 → 13; `check:copilot-forms` 1 offender → 0.

## What was NOT touched

- Layout-rule violations (44) — every fix requires per-component judgement (semantic ladder vs ALLOWLIST). Recommendations 10-20 above stage these for follow-up waves.
- ContentFlowPreviewModal / WidgetStylePreviewModal / TradelineTemplatesPage chat-bubble — these are legitimately styled mock surfaces. Best fixed with one `data-theme` wrapper each, but that needs design-QA sign-off that the inner styling is correct under both light AND dark global themes.
- Brand badge files — per `brand-badges-icons-locked.md`, untouchable.

## Suggested follow-up waves

- **Wave DS-1**: ContentFlow + WidgetStyle + Tradeline chat-bubble theme-scoping (3 files, ~6 edits, drops color guard from 13 → 5).
- **Wave DS-2**: Status-dot primitive consolidation (`<StatusDot size>` in `client/src/components/primitives/`), kills 19 rule-c violations across ContentFlowQueuePage / InboxPage / SystemWorkersPage / TradelineLearningPage / SupportTicketDetailPage / ProductDetailPage.
- **Wave DS-3**: Lucide-icon-size migration sweep — bulk replace `size={18}`, `w-7 h-7`, `w-9 h-9`, `w-10 h-10` with ladder values, paired with screenshot diff under Playwright.
- **Wave DS-4**: Section-rhythm tightening — convert `space-y-6` inside property panels / settings groups to `<Stack gap="section">` (1px hairline) per the recurring-violations rule §1. Estimated 40-50 file touches.
