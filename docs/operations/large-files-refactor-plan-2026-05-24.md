# Large-files refactor plan (2026-05-24)

Read-only audit + decomposition strategy for the 5 largest TS/TSX files in
`acx-audiobooks` / WeFixTrades. Per PR #699's dead-code-audit flag, these
files have grown past the threshold where any single change carries
unbounded blast radius. No actual refactors are proposed in this PR — all
work below must be staged as small, sequenced, behaviour-preserving PRs.

## Top 5 — current sizes

| Rank | Path | LOC | Imports / consumers |
| ---- | ---- | --- | ------------------- |
| 1 | `server/routes/portalRoutes.ts` | 5,624 | 1 (registered from `server/routes/index.ts`) |
| 2 | `server/storage.ts` | 5,192 | **151 files** import the `storage` singleton |
| 3 | `client/src/components/wizard/elfsight/StyleTab.tsx` | 4,674 | 1 (`WizardShell.tsx`) |
| 4 | `server/routes/adminCrmRoutes.ts` | 4,627 | 1 (registered from `server/routes/index.ts`) |
| 5 | `shared/templatePresets.ts` | 4,468 | 47 (deep cross-stack: shared, server, 14 client surfaces, 1 test) |

Both runner-ups are also large enough to flag for the same treatment in a
follow-up wave: `client/src/components/quote-widget/AdvancedCalculator.tsx`
(3,358 LOC) and `client/src/pages/marketing/ReportView.tsx` (3,343 LOC).

## Cross-cutting rules for every refactor below

1. **Behaviour-preserving only.** Move code, do not change it. Diffs must be
   reviewable as pure-rename / pure-extract.
2. **One module per PR.** Never split two large files in the same PR; never
   mix a split with a logic change.
3. **Re-export shim stays in place for one release.** When a chunk moves
   out, the parent file re-exports the same names so external imports keep
   working. The shim can be deleted only after a full release with no
   incident.
4. **Tests must stay green at every commit**, not just the tip. Smoke tests
   (`tests/smoke-runner.mjs`) + the relevant e2e file are the floor; the
   `admin-crm.e2e.spec.ts` and `portal-settings.e2e.spec.ts` specs are the
   minimum gate for routes work.
5. **No `npm install`.** All splits use existing modules; we do not need
   `koa-router`, `tsx-glob`, or any other helper.

---

## 1. `server/routes/portalRoutes.ts` — 5,624 LOC

### Top-level structure

Single exported function `registerPortalRoutes(app: Express)` that imperatively
registers ~70 `app.METHOD()` handlers, plus 3 helpers (`getClientIp`,
`resolveClientId`, `withClientId`) and ~95 top-level imports.

### Natural seams (clusters by URL prefix)

| Cluster | URL prefix | Approx LOC | Handlers |
| ------- | ---------- | ---------- | -------- |
| Overview / services | `/api/portal/overview`, `/api/portal/services*`, `/api/portal/adflow/*` | 130–438 (~310) | 4 |
| Billing | `/api/portal/billing*` | 438–565 (~125) | 3 |
| Settings + notifications + password | `/api/portal/settings`, `/api/portal/notification-preferences`, `/api/portal/password` | 565–745 (~180) | 5 |
| Onboarding | `/api/portal/onboarding*` | 745–1000 (~255) | 3 |
| QuoteQuick | `/api/portal/quotequick/*` | 1000–1116 (~115) | 2 |
| Support tickets | `/api/portal/tickets*` | 1116–1462 (~345) | 4 |
| AI chat (Copilot) | `/api/portal/ai-chat*` | 1462–2087 (~625) | 3 |
| TradeLine | `/api/portal/tradeline/*` | 2087–2240 (~155) | 5 |
| Thread / reputation list | `/api/portal/thread`, `/api/portal/reputation` (legacy summary) | 2240–2371 (~130) | 2 |
| SocialSync | `/api/portal/socialsync*` | 2371–2752 (~380) | 8 |
| MapGuard | `/api/portal/mapguard*` | 2752–3160 (~410) | 7 |
| Reputation (full surface) | `/api/portal/reputation/*` | 3160–3910 (~750) | 17 |
| RankFlow | `/api/portal/rankflow*` | 3910–4278 (~370) | 4 |
| Articles + review-replies | `/api/portal/articles*`, `/api/portal/review-replies*` | 4278–4602 (~325) | 9 |
| ContentFlow brand / videos | `/api/portal/contentflow/*` | 4602–4753 (~150) | 5 |
| Approval / revision | `/api/portal/tasks/:taskId/*` | 4753–4886 (~135) | 2 |
| Uptime + automation toggles | `/api/portal/services/:id/uptime`, `/api/portal/automation-status`, `/api/portal/.../settings`, `/api/portal/settings/automation` | 4886–5164 (~280) | 6 |
| Catalog + logo | `/api/portal/catalog*`, `/api/portal/logo*` | 5164–end (~460) | 4 |

### Proposed file map (target avg 400–700 LOC per file)

```
server/routes/portal/
  index.ts                      // single export: registerPortalRoutes(app), composes the 16 sub-registrars
  _helpers.ts                   // getClientIp, resolveClientId, withClientId, log
  overview.ts                   // overview, services, adflow reports
  billing.ts                    // billing, billing/send-link, billing/portal-session
  settings.ts                   // settings, notification-prefs, password
  onboarding.ts                 // onboarding x3
  quotequick.ts                 // summary + leads
  tickets.ts                    // tickets + messages
  ai-chat.ts                    // ai-chat, history, confirm  (the 625-LOC cluster)
  tradeline.ts                  // tradeline/* x5
  reputation.ts                 // /reputation/* (17 handlers — the biggest cluster, ~750 LOC)
  socialsync.ts                 // socialsync/* x8
  mapguard.ts                   // mapguard/* x7
  rankflow.ts                   // rankflow/* x4
  contentflow.ts                // articles, review-replies, contentflow/brand-profile, contentflow/videos, tasks/*
  automation.ts                 // services/:id/uptime, automation-status, automation toggles (the 4 PATCH endpoints)
  catalog-and-logo.ts           // catalog, logo, logo/upload
```

### Duplicated code → extract to `_helpers.ts`

- `withClientId(req, res)` already exists but is duplicated **inline** at
  the top of nearly every handler (`if (!clientId) return …`). Keep helper
  as the single gate; that's already correct, but several handlers
  reimplement the no-client-linked 403 branch. Extract a shared 403
  middleware so handlers receive `req.clientId` typed via module
  augmentation.
- Each handler has a near-identical `try { … } catch (err: any) { log.error(…); res.status(500).json({ error: … }) }` envelope. Extract a
  `wrap(handler, errMessage)` HOF (no new deps — pure local helper) and
  apply incrementally per file in follow-up PRs (PR-N+1, not part of the
  split itself).
- The "audit-log write after a state change" pattern (e.g., notification
  prefs updated, password changed, ticket created) is repeated. Defer this
  consolidation — it's a logic change, not a split.

### Dead branches / deletions

- Two `/reputation` endpoints exist: a legacy summary at line 2264 (under
  the comment "Reputation list") and the full `/reputation/*` cluster at
  3161. Confirm with a `grep` against the client whether `/api/portal/reputation`
  (no suffix) still has consumers; the comments suggest it predates the
  full surface and may be a candidate for removal in a follow-up PR.

### Risk

- **Mechanical risk: low.** Each handler is self-contained: it captures
  the `app` reference inside `registerPortalRoutes`. The split keeps the
  same signature — each new file exports `registerXxx(app: Express)` and
  the `index.ts` calls them in order.
- **Review risk: medium.** 70 handlers × 16 files is a lot of files to
  re-route imports for in the diff. Mitigate by doing the split in stages
  (see PR sequence).

### Target file sizes after refactor

- `portal/index.ts`: ~50 LOC
- `portal/_helpers.ts`: ~80 LOC
- Largest cluster (`reputation.ts`): ~750 LOC
- Smallest cluster (`quotequick.ts`): ~120 LOC
- Median: ~310 LOC

### Suggested PR sequence (smallest, safest first)

1. **PR A** — Create `server/routes/portal/_helpers.ts`, move `getClientIp`,
   `resolveClientId`, `withClientId`, `log`. Re-export from
   `portalRoutes.ts`. Zero behaviour change. **+80 / -75 LOC, 1 file moved.**
2. **PR B** — Extract `quotequick.ts` (smallest, 2 handlers, ~115 LOC).
   Validates the seam pattern end-to-end. **+130 / -115 LOC.**
3. **PR C** — Extract `billing.ts` + `tradeline.ts` together (both have
   strong existing test coverage via `portal-settings.e2e.spec.ts`).
4. **PR D** — Extract `onboarding.ts`, `settings.ts`, `tickets.ts`.
5. **PR E** — Extract `reputation.ts` (the 750-LOC giant — second biggest
   blast radius; do it alone).
6. **PR F** — Extract `ai-chat.ts` (the 625-LOC giant — has Copilot tool
   registration that must register on import; verify the side-effect order).
7. **PR G** — Extract `socialsync.ts`, `mapguard.ts`, `rankflow.ts`,
   `contentflow.ts`, `articles+review-replies.ts`, `automation.ts`,
   `catalog-and-logo.ts`, `overview.ts` in 2–3 mechanical PRs.
8. **PR H** — Delete the now-empty `portalRoutes.ts` shim after one full
   release with no incident; rename `portal/index.ts` to be the canonical
   import target.

### Tests that must stay green

- `tests/e2e/portal-settings.e2e.spec.ts`
- `tests/smoke-runner.mjs` (asserts portal endpoints return non-500)
- Any wizard / mobile e2e that POSTs to `/api/portal/logo*`
- TypeScript `tsc --noEmit` (catches any import path mistakes)

---

## 2. `server/storage.ts` — 5,192 LOC

### Top-level structure

- 117-line import block from `@shared/schema` (every table type)
- `WebCareOpsRow` and `ProductStats` interfaces
- `IStorage` interface (line 216)
- `DatabaseStorage implements IStorage` class (line 658, ~4,530 LOC)
- `export const storage = new DatabaseStorage()` (line 5,192)
- Helpers: `sanitizeClientPlaceId<T>()`, `kickoffMapguardService` invocations

### Domain seams in the class

Counted 230+ `async` methods. Grouping by domain comment-blocks already in
the file:

| Domain | LOC range | Approx methods |
| ------ | --------- | -------------- |
| Calculators / leads / events / deployment | 659–990 | ~22 |
| Notifications / followups / bookings | 990–1200 | ~14 |
| Support tickets + SMS | 1200–1430 | ~10 |
| Users / audit / missed-call / demo | 1430–1560 | ~12 |
| **Clients + ServiceCatalog + ProductDrafts** | 1560–1940 | ~18 |
| ClientServices + Orders + Suppliers + Fulfillment | 1940–2400 | ~25 |
| Payments + InternalNotes + AdminActivity | 2400–2700 | ~20 |
| RankFlow | 2700–3160 | ~30 |
| TradeLine | 3160–3420 | ~14 |
| SocialSync | 3420–3580 | ~16 |
| **Reviews + ReviewRequests + Suppression + GoogleLocations** | 3580–4190 | ~30 |
| MonitoredReviews + Widget reviews + Service costs + Sales leads | 4190–4230 | ~10 |
| **ContentFlow drafts + per-platform queue claims** | 4230–4790 | ~25 (12 "claim-next-X-job" pairs — biggest duplication hotspot) |
| Routing events / queues / profit overview | 4830–5050 | ~6 |
| Calendar / alerts / adflow / email queue / vapi / brand-availability | 5050–end | ~20 |

### Proposed file map

```
server/storage/
  index.ts                       // public surface: re-exports DatabaseStorage + storage singleton
  base.ts                        // class skeleton + sanitizeClientPlaceId<T>, log, db handle helpers
  domains/
    calculators.ts               // mixin (or stand-alone repo class) for calculator + lead + events
    notifications.ts             // notifications, followups, email queue
    bookings.ts
    support.ts                   // tickets, ticket messages, ticket events, SMS threads
    users.ts                     // users, audit submissions, missed call, demo quote
    clients.ts                   // clients, service catalog, product drafts
    clientServices.ts            // client services, orders, suppliers, fulfillment
    finance.ts                   // payments, internal notes, admin activity, profit overview, cost suggestions
    rankflow.ts
    tradeline.ts
    socialsync.ts
    reputation.ts                // reviews, reviewRequests, reviewSuppression, googleLocations, monitoredReviews, widget reviews
    contentflow.ts               // contentDrafts, contentApprovals, contentAssets, per-platform claim/recover jobs
    routing.ts                   // routingEvents, queue items
    misc.ts                      // calendar, system alerts, adflow, vapi webhook, brand availability
```

Pattern decision: keep one class `DatabaseStorage` that **extends a chain
of mixin functions** (TS `applyMixins` pattern) or — preferred — replace
`storage.*` calls with `storage.clients.*`, `storage.reputation.*`, …
**that's a logic change, not in this plan.** For this refactor, use a
single class assembled from mixins so the 151 consumer files don't change.

### Duplicated code → extract

- The 12 `claimNextXJob` + `recoverStaleXClaims` pairs (`Wordpress`, `Gbp`,
  `Facebook`, `Instagram`, `GbpPost`, `Email`, `Linkedin`, `Pinterest`,
  `Youtube`, `Wordpress`, `GbpPost`, `Email`) are near-identical SQL: a
  `SELECT … FOR UPDATE SKIP LOCKED`, an `UPDATE` to claim, an `UPDATE` to
  recover. Extract a generic `claimNextJob(platform, opts)` /
  `recoverStaleClaims(platform, opts)` keyed on `platform` enum. **Saves
  est. 600 LOC** and removes the easiest place for a bug to land in one
  channel and not the others. **Do this as its own PR** — touches no
  consumers but consolidates 12 nearly-identical query bodies.
- Multiple `listX(opts: {clientId?, status?, limit?, offset?})` patterns —
  all use the same paginated `select / where / orderBy / limit / offset`
  shape. Extract `buildPagedSelect(opts)` helper. Defer to PR after split.
- 20+ `logAdminActivity` calls scattered across `storage.ts` AND across
  `adminCrmRoutes.ts` AND `portalRoutes.ts`. The audit-log envelope is
  duplicated. Defer; cross-cutting.

### Dead branches / deletions

- The signature-overloaded `updateClientServiceMetadata` (lines 2106–2128)
  has been deprecated by comment elsewhere; verify call sites and pick one
  signature. Defer to a focused follow-up PR.
- Verify `listReviewRequests` two-overload form (lines 3712–3714) — one
  callsite likely uses each form; collapse if only the options form is
  used externally.

### Risk

- **Mechanical risk: HIGH.** 151 consumer files import `storage`. Until the
  mixin-assembled `DatabaseStorage` exposes the **exact same method set**,
  the build will fail in dozens of places.
- **Test risk: HIGH.** The class touches every domain table; one
  mis-rebased mixin and silent failures (e.g. wrong `db` instance) creep
  in.

### Target file sizes after refactor

- `storage/index.ts`: ~30 LOC
- `storage/base.ts`: ~150 LOC
- Largest domain (`reputation.ts` or `contentflow.ts`): ~700 LOC (or
  ~400 after the claim-job dedupe)
- Median domain: ~300 LOC

### Suggested PR sequence

1. **PR A** — **Extract `claimNextJob` / `recoverStaleClaims` helpers** as
   private methods on `DatabaseStorage`. No file split; just dedupe in
   place. Reduces file by ~600 LOC and proves the extraction is safe.
2. **PR B** — Create `storage/base.ts` with the class skeleton + the
   helpers; re-export from `storage.ts`. Class still has all methods. Zero
   consumer impact.
3. **PR C** — Move `calendars`, `systemAlerts`, `adflowReports`, `emailQueue`,
   `vapiWebhookEvents`, `brandAvailability` (the "misc" lowest-coupling
   domains, ~250 LOC) into `storage/domains/misc.ts` as a mixin. Validates
   the mixin pattern.
4. **PR D–L** — One mixin per domain, smallest-first: `calculators` (high
   test coverage), then `bookings`, `notifications`, `support`, `users`,
   `clients`, `clientServices`, `finance`, `rankflow`, `tradeline`,
   `socialsync`, `routing`, `contentflow`, `reputation`. Each PR keeps
   `storage.ts` as a shim re-exporting `DatabaseStorage` + `storage`.
5. **PR M** — Delete the shim after one quiet release. Optionally rename
   `storage/index.ts` exports to namespaced (`storage.reputation.*`) as a
   separate, opt-in migration.

### Tests that must stay green

- All `tests/e2e/admin-crm/*` (storage touches every domain) — at minimum
  `admin-crm.regression.spec.ts` and `admin-crm.e2e.spec.ts`
- `tests/e2e/portal-settings.e2e.spec.ts`
- `tests/smoke-runner.mjs`
- `tsc --noEmit` — the integrity check on 151 import paths

---

## 3. `client/src/components/wizard/elfsight/StyleTab.tsx` — 4,674 LOC

### Top-level structure

- 75-line import block
- `Props` interface
- ~10 module-level helpers (`safeHex`, `getContrastingColor`, `TOKEN_FALLBACKS`,
  `PRESET_COLOURS`, `DEPOSIT_ICON_OPTIONS`, `TRUST_ICON_OPTIONS`, …)
- One default-exported component `StyleTab(...)` (lines 255–2681, ~2,425 LOC)
- 6 internal sub-components defined *after* `StyleTab`:
  - `BrandStudioGroup` (line 2682)
  - `ColourSwatch` (3382)
  - `SegmentedControl` (3646)
  - `BrandKitGroup` (3707)
  - `PricingTiersSubsection` (4058) + `TierRow` (4157) + `GhostBanner` (4250)
  - `TrustBadgesGroup` (4371) + `trustBadgeIconBtn` (4552) + `ButtonCopyGroup`
    (4576)

### Section seams inside the big `StyleTab` body

Each section is bracketed by an existing `{/* ── Section name ── */}` comment
(see grep output for line numbers). Sections in render order:

1. Brand Kit (W-AO-6d) — line 472
2. Theme presets — 491
3. Branding (logo + powered-by badge) — 557
4. Deposit preview — 724
5. Online-booking calendar — 885
6. Colours — 970
7. Typography — 1106
8. Shape — 1197
9. Layout (incl. per-viewport widths) — 1262
10. Step layout subsection — 1353
11. Pricing tiers subsection (uses `PricingTiersSubsection`) — 1397
12. AI chat visibility subsection — 1417
13. Floating launcher embed mode — 1475
14. Success / Error ghost preview — 1700
15. Trust badge editor (uses `TrustBadgesGroup`) — 1651
16. Button copy override (uses `ButtonCopyGroup`) — 1669
17. Brand Studio (uses `BrandStudioGroup`) — 1686
18. Premium Animations Pack — 3252 (inside `BrandStudioGroup`)

### Proposed file map

```
client/src/components/wizard/elfsight/StyleTab/
  index.tsx                          // public default export = composition
  StyleTab.tsx                       // outer shell that owns `patch` + style derivations, renders <Group/> children
  sections/
    BrandKitSection.tsx              // ← BrandKitGroup
    ThemePresetsSection.tsx
    BrandingSection.tsx              // logo + powered-by toggle
    DepositSection.tsx
    BookingSection.tsx
    ColoursSection.tsx
    TypographySection.tsx
    ShapeSection.tsx
    LayoutSection.tsx                // includes per-viewport widths + step layout subsection
    PricingTiersSection.tsx          // ← PricingTiersSubsection + TierRow + GhostBanner
    AiChatVisibilitySection.tsx
    FloatingLauncherSection.tsx
    TrustBadgesSection.tsx           // ← TrustBadgesGroup
    ButtonCopySection.tsx            // ← ButtonCopyGroup
    BrandStudioSection.tsx           // ← BrandStudioGroup (the 700-LOC pro upsell)
  helpers/
    colour.ts                        // safeHex, getContrastingColor, PRESET_COLOURS, CONTRAST_AA_NORMAL, TOKEN_FALLBACKS
    constants.ts                     // LOGO_MAX_BYTES, DEPOSIT_ICON_OPTIONS, TRUST_ICON_OPTIONS, TRUST_BADGE_MAX
    style-derivations.ts             // the 30-line block of `style.x ?? DEFAULT_SHELL_STYLE.x` derivations
  ColourSwatch.tsx
  SegmentedControl.tsx
```

### Duplicated / reusable extractions

- Every section ends with the same `</section>` envelope: a wrapper card
  with a title, a `<HelpCueRow>` top-left, and the controls grid. The
  `{/* Rule 5 — help cue anchored top-left via <HelpCueRow>. */}` comment
  appears 11+ times. Extract a `<GroupShell title hint testId>{children}</GroupShell>`
  wrapper. Reduces ~15 LOC per section. Defer to follow-up.
- `SegmentedControl<T>` and `ColourSwatch` are already encapsulated —
  move them out without touching their internals.
- The `patch()` callback + the 25-line block of `style.x ?? DEFAULT_SHELL_STYLE.x`
  derivations is the natural "shared state" each section needs. Pass `style`
  + `patch` as props to each section component (no Context needed; props
  are simple).

### Dead branches / deletions

- Comment at 1216 mentions "duplicate `<InfoCue testid="style-shape">`
  removed" — verify no other `InfoCue` duplicates remain.

### Risk

- **Mechanical risk: medium.** Single-consumer (`WizardShell.tsx` only),
  but the component is dense with cross-section side effects: the
  `useLayoutGuard()` call + the `useFoldablePanels()` hook expect a stable
  render tree. Need to preserve render order exactly.
- **Visual risk: medium.** Wave H-* / W-AO-* tests take screenshots; any
  re-ordering of DOM nodes (even semantically equivalent) breaks
  snapshots. The 19 wizard-elfsight spec files are the gate.

### Target file sizes after refactor

- `StyleTab/StyleTab.tsx` (outer shell): ~250 LOC
- Largest section (`BrandStudioSection.tsx`): ~700 LOC
- Median section: ~200 LOC

### Suggested PR sequence

1. **PR A** — Move `safeHex`, `getContrastingColor`, `PRESET_COLOURS`,
   `TOKEN_FALLBACKS`, `DEPOSIT_ICON_OPTIONS`, `TRUST_ICON_OPTIONS`,
   `LOGO_MAX_BYTES`, `CONTRAST_AA_NORMAL`, `TRUST_BADGE_MAX` to
   `StyleTab/helpers/`. `StyleTab.tsx` re-imports. No JSX change.
2. **PR B** — Move `ColourSwatch` + `SegmentedControl` to sibling files;
   `StyleTab.tsx` imports.
3. **PR C** — Extract `TrustBadgesSection` (already encapsulated as
   `TrustBadgesGroup`). One-section validation of the section pattern.
4. **PR D** — Extract `BrandStudioSection` + `PricingTiersSection` (also
   already-encapsulated subcomponents).
5. **PR E** — Extract the 11 inline-defined sections one at a time, in
   render order, smallest first (Shape, Typography, Colours, Layout, …).
   Run the wizard-elfsight screenshot suite after each.
6. **PR F** — Final cleanup: convert `StyleTab.tsx` into a composition
   shell that just renders `<Section/>` children.

### Tests that must stay green

- `tests/audit/wizard-elfsight-h1..h7.spec.ts`
- `tests/audit/wave-as1*.spec.ts` (template-identity / polish)
- `tests/audit/wizard-mobile.spec.ts`
- `client/src/lib/__tests__/marketingTemplateMap.test.ts` (transitively)
- Visual regression diffs flagged and re-baselined per PR

---

## 4. `server/routes/adminCrmRoutes.ts` — 4,627 LOC

### Top-level structure

- 30-line import block
- `featuresSchema`, `stripeIdSchema` (Zod helpers)
- `resolveProductRow(svcId)` helper (78–74; the "tier-vs-family fallback"
  hotfix from a recent regression PR)
- `registerAdminCrmRoutes(app: Express)` (line 76 to end, ~4,550 LOC)
- 23 `/* ═══ … ═══ */` section banners already split the function

### Natural seams (already documented by section banners)

| Section banner | Approx LOC | Handler count |
| -------------- | ---------- | ------------- |
| Overview + Copilot history + preview-portal audit | 78–137 | 3 |
| Service Catalog | 138–150 | 1 |
| Product Editor (Q28) — draft/publish flow + suppliers + cost | 151–690 | 12 |
| Clients (list + create + get + patch) | 691–828 | 5 |
| Client services + sitelaunch + adflow | 829–1242 | 8 |
| Fulfillment | 1243–1499 | 4 |
| Payments | 1500–1579 | 3 |
| Onboarding | 1580–1622 | 3 |
| Notes | 1623–1676 | 3 |
| Activity log | 1677–1711 | 1 |
| Payments (list) | 1712–1727 | 1 |
| Service stats | 1728–1740 | 1 |
| **Provision + generate-tasks + create-account** (the giant 750-LOC block) | 1741–2099 | 3 |
| QuoteQuick | 2092–2334 | 6 |
| TradeLine | 2335–2933 | 12 |
| Reviews (review-requests + monitored + drafts + google connect) | 2934–4181 | 26 |
| Cost suggestion | 4183–4265 | 1 |
| Deliverables | 4266–4397 | 3 |
| QA queue | 4398–4411 | 1 |
| Profit overview | 4412–4425 | 1 |
| TradeLine test-call | 4426–4448 | 1 |
| Bulk client ops (tag / pause / archive / export) | 4449–end | 4 |

### Proposed file map

```
server/routes/admin-crm/
  index.ts                        // registerAdminCrmRoutes(app) — composes sub-registrars
  _helpers.ts                     // resolveProductRow, featuresSchema, stripeIdSchema, log
  overview.ts
  catalog.ts                      // service catalog list + per-product editor (the 540-LOC Q28 block)
  clients.ts
  client-services.ts              // includes sitelaunch + adflow per-client-service work
  fulfillment.ts                  // includes deliverables + QA queue
  payments.ts                     // payments + cost ledger
  onboarding.ts
  notes-and-activity.ts
  provisioning.ts                 // provision + generate-tasks + create-account (~750 LOC)
  quotequick.ts
  tradeline.ts                    // includes test-call
  reputation.ts                   // monitored reviews + review-requests + Google connect (~1,250 LOC, biggest)
  bulk-ops.ts
  profit-and-stats.ts             // profit-overview, services/stats
```

### Duplicated code

- The `storage.logAdminActivity({ actor_type: 'human', actor_id: u?.id, actor_name: u?.name || u?.email, action, entity_type, entity_id, summary })`
  envelope appears 30+ times. Extract a `logAdminAction(req, { action, entity_type, entity_id, summary, metadata? })` helper. **Defer** to a
  post-split PR.
- Identical `try/catch/500` envelope as in `portalRoutes.ts`. Extract the
  same `wrap()` HOF.
- Three near-identical bulk-op endpoints (`bulk-tag`, `bulk-pause`,
  `bulk-archive`) share parsing + audit-log + transactional update; extract
  a `bulkClientOp(action, applyUpdate)` helper. **Defer.**

### Dead branches / deletions

- `resolveProductRow` is a regression-recovery hack documented as a "PR
  fix". Verify whether the underlying seeding gap is still present
  (`server/scripts/seed-services.ts`); if seeding now covers product-family
  IDs, the synthesised row branch becomes dead. Out of scope; flag for a
  separate audit.

### Risk

- **Mechanical risk: low–medium.** Same pattern as portalRoutes; one
  consumer (`routes/index.ts`).
- **Test risk: medium.** `admin-crm.e2e.spec.ts` + `admin-crm.regression.spec.ts`
  cover most flows; the contentflow sprint specs exercise indirect paths.

### Target file sizes after refactor

- `admin-crm/index.ts`: ~50 LOC
- `_helpers.ts`: ~90 LOC
- Largest cluster (`reputation.ts`): ~1,250 LOC
- After extracting `logAdminAction` + `wrap`: largest drops to ~900 LOC
- Median: ~300 LOC

### Suggested PR sequence

1. **PR A** — Extract `_helpers.ts` (`resolveProductRow`, the Zod schemas,
   `log`).
2. **PR B** — Extract `bulk-ops.ts` (4 endpoints, ~165 LOC, isolated).
3. **PR C** — Extract `quotequick.ts` + `profit-and-stats.ts` (well-tested
   read-only endpoints).
4. **PR D** — Extract `tradeline.ts` and `provisioning.ts` (two largest
   self-contained domains, run their e2e first).
5. **PR E** — Extract `reputation.ts` (the giant) alone.
6. **PR F** — Extract `catalog.ts`, `clients.ts`, `client-services.ts`,
   `fulfillment.ts` (mechanical, batchable).
7. **PR G** — Extract the small leftovers (`notes-and-activity.ts`,
   `payments.ts`, `onboarding.ts`, `overview.ts`).
8. **PR H** — Delete shim after one release.

### Tests that must stay green

- `tests/e2e/admin-crm/admin-crm.e2e.spec.ts`
- `tests/e2e/admin-crm/admin-crm.regression.spec.ts`
- `tests/e2e/admin-crm/contentflow.sprint*.spec.ts` (transitive)
- `tests/smoke-runner.mjs`

---

## 5. `shared/templatePresets.ts` — 4,468 LOC

### Top-level structure

- ~30 type / interface declarations (`TemplateLayout`, `FieldType`,
  `TemplateOption`, `TemplateField`, `TemplateCalculation`, `TemplateHeader`,
  `TemplateResults`, `TemplateStep`, `TemplateConfig`, `TrustBadge`, …)
- Helpers: `opt`, `optImg`, `calc`, `b` (badge), `BADGES`
- **`TEMPLATE_PRESETS: TemplateConfig[]`** array (lines 694–3416, **~2,725 LOC**
  — 47 individual preset objects with section comments `/* ── N. Name ── */`)
- Lookup helpers: `getTemplatePreset`, `getPresetsByLayout`,
  `getPresetsByCategory`, `getTemplateCategories`
- AdvStyle / AdvBgGradient / AdvResultPanel / AdvAnimations / AdvPremiumAnimations
  type declarations (line 3453 onwards, ~1,000 LOC)
- `DEFAULT_ADV_STYLE`, `DEFAULT_TIERS`, `shouldDefaultTiered`,
  `resolveTieredConfig`, `BusinessProfile`, `AdvancedConfigShape`,
  `DerivedCategoryId`, `DERIVED_CATEGORY_PALETTES`,
  `resolveDerivedCategoryId`, `inferDerivedCategoryFromBgFrom`,
  `shouldDefaultRangeMode`, `deriveStyleFromCategory`, `toAdvancedConfig`,
  `buildBlankPreviewConfig`

### Natural seams

The file is doing 3 unrelated jobs:

1. **The preset data array** — `TEMPLATE_PRESETS` is pure data
   (~2,725 LOC). Per-preset comments already group it by category
   (Automotive, Construction, Cleaning, Renovation, Mechanical, Outdoor,
   Auto, Professional, Specialty, Trades). The 47 entries are independent
   objects with no cross-references.
2. **The template-config schema + helpers** (`TemplateConfig`, lookup
   functions, `opt`/`calc`/`BADGES` helpers).
3. **The advanced-style / branding / animations / pricing-tier / deposit
   schemas + helpers** (`AdvStyle`, `DEFAULT_ADV_STYLE`, `toAdvancedConfig`,
   `buildBlankPreviewConfig`, etc.). These are runtime-config concerns,
   not template-definition concerns.

### Proposed file map

```
shared/templates/
  index.ts                              // public surface — re-exports everything that templatePresets.ts exports today
  templateConfig.ts                     // types: TemplateLayout, FieldType, TemplateOption, TemplateField, …, TemplateConfig
  trustBadges.ts                        // TrustBadge type + BADGES constant
  helpers.ts                            // opt, optImg, calc, b (badge ctor)
  lookups.ts                            // getTemplatePreset, getPresetsByLayout, getPresetsByCategory, getTemplateCategories
  presets/
    index.ts                            // re-exports TEMPLATE_PRESETS by concatenating per-category arrays
    automotive.ts                       // car_towing, mobile_car_detailing
    construction.ts                     // driveway_paving, kitchen renovation, bathroom renovation, basement finishing, etc.
    cleaning.ts                         // gutter cleaning, deep home cleaning, move-in/out, window, office
    renovation.ts
    mechanical.ts                       // HVAC, plumbing, electrical, appliance, garage door
    outdoor.ts                          // landscaping, fence, deck, pool, tree, lawn-care subscription
    specialty.ts                        // pest, junk-removal, locksmith, mold, water damage
    professional.ts                     // web design, photography, moving, home inspection
    /* …grouping informed by existing `/* ── Trade N. … (Category) ── */`
       comments in the file. */

shared/quotequick/
  advStyle.ts                           // AdvStyle, AdvBgGradient, AdvResultPanel, AdvAnimations, AdvPremiumAnimations
  advBranding.ts                        // AdvBranding, AdvFloatingLauncher, AdvFloatingLauncherPosition
  advDeposit.ts
  advBooking.ts
  defaults.ts                           // DEFAULT_ADV_STYLE, DEFAULT_TIERS, TOKEN_FALLBACKS analogue, BRAND_STUDIO_STYLE_KEYS, FLOATING_LAUNCHER_PRO_KEYS
  categoryPalette.ts                    // DERIVED_CATEGORY_PALETTES, resolveDerivedCategoryId, inferDerivedCategoryFromBgFrom, deriveStyleFromCategory
  tiered.ts                             // TemplateTier, TemplateTiered, shouldDefaultTiered, resolveTieredConfig
  runtimeBridge.ts                      // toAdvancedConfig, buildBlankPreviewConfig, AdvancedConfigShape, BusinessProfile
  numberFormat.ts                       // AdvNumberFormat
```

### Duplicated code → consolidate

- Every preset object repeats the same shape (header / fields /
  calculations / result_calc / results). That repetition is signal, not
  noise — the editor needs full visibility per preset. Keep as-is.
- `opt`, `optImg`, `calc`, `b` are already extracted helpers. Good.
- Multiple presets duplicate the same `trustBadges: BADGES.<key>` set —
  fine, that's a lookup.

### Dead branches / deletions

- `BRAND_STUDIO_STYLE_KEYS` and `FLOATING_LAUNCHER_PRO_KEYS` exist as
  whitelists. Verify with `grep` whether both are still consumed by the
  server's plan-gate stripping logic (`server/lib/applyQuoteQuickOverrides.ts`
  is the likely caller). Out of scope for the split.

### Risk

- **Mechanical risk: medium.** 47 consumer files; mostly broad imports
  like `import { TemplateConfig, TEMPLATE_PRESETS, AdvStyle, toAdvancedConfig } from '@shared/templatePresets'`.
  The shim `templatePresets.ts` re-exporting everything from
  `shared/templates/index.ts` + `shared/quotequick/index.ts` is essential
  for the first wave of PRs.
- **Test risk: low.** `tests/audit/wizard-templates-deep.spec.ts` and
  `wave-bb2-variety-screenshot.spec.ts` validate the preset surface.

### Target file sizes after refactor

- `shared/templates/templateConfig.ts`: ~250 LOC
- Largest preset file (`construction.ts` or `mechanical.ts`): ~500 LOC
- Largest schema file (`advStyle.ts`): ~300 LOC
- `shared/templatePresets.ts` (shim, after rename): ~30 LOC re-exports

### Suggested PR sequence

1. **PR A** — Extract `shared/templates/templateConfig.ts` (types only —
   `TemplateLayout`, `FieldType`, `TemplateOption`, `TemplateField`,
   `TemplateCalculation`, `TemplateHeader`, `TemplateResults`,
   `TemplateStep`, `TemplateConfig`, `TrustBadge`). Re-export from
   `templatePresets.ts`. **Zero data movement.**
2. **PR B** — Extract `shared/templates/helpers.ts` and `lookups.ts`. Still
   zero data movement.
3. **PR C** — Extract advanced-config schemas to `shared/quotequick/*.ts`
   (`advStyle`, `advBranding`, `advDeposit`, `advBooking`, `defaults`,
   `categoryPalette`, `tiered`, `runtimeBridge`, `numberFormat`).
4. **PR D** — Move `TEMPLATE_PRESETS` to `shared/templates/presets/index.ts`
   as a single array (no further splitting yet). Largest single move but
   pure-cut.
5. **PR E–G** — Split the presets array by category, one PR per 2–3
   categories, validated by the wizard-templates-deep spec.
6. **PR H** — Delete the now-empty `templatePresets.ts` shim (after at
   least one release with no incident).

### Tests that must stay green

- `tests/audit/wizard-templates-deep.spec.ts`
- `tests/audit/wave-ap3-template-gallery.spec.ts`
- `tests/audit/wave-as1*-template-*.spec.ts`
- `tests/audit/wave-bb2-variety-screenshot.spec.ts`
- `client/src/lib/__tests__/marketingTemplateMap.test.ts`
- `tsc --noEmit`

---

## Priority + risk matrix

| File | Impact (LOC reduction × consumers eased) | Risk | Recommended start order |
| ---- | ---------------------------------------- | ---- | ----------------------- |
| `server/storage.ts` | **Highest** (5,192 LOC, 151 consumers) | **High** (151 imports must keep resolving) | After PR-A in-place dedupe of `claimNextJob` (the safest win); the full split is a 6–9-week effort |
| `server/routes/portalRoutes.ts` | High (5,624 LOC, single consumer) | Medium | Best **first big split**: clear seams, only one consumer |
| `server/routes/adminCrmRoutes.ts` | High (4,627 LOC, single consumer) | Medium | Second; identical pattern to portalRoutes once that's proven |
| `client/.../StyleTab.tsx` | Medium (4,674 LOC, single consumer) | Medium (screenshot-fragile) | After server-side wins land; validate the section-extraction pattern with the already-encapsulated `BrandStudioGroup` first |
| `shared/templatePresets.ts` | Medium (4,468 LOC, 47 consumers) | Low-Medium | Lowest priority — file is well-organised internally; gains are from cognitive load, not bug risk |

## Highest-leverage refactor

**`server/storage.ts` PR-A: extract the 12 `claimNextXJob` /
`recoverStaleXClaims` pairs into a single generic
`claimNextJob(platform)` / `recoverStaleClaims(platform)` helper.**

- One PR.
- ~600 LOC deleted with no API surface change (still inside the same
  class).
- Removes the single biggest "bug here would be silent across N
  channels" hotspot in the file.
- Validates the storage-side dedupe pattern before any file-split work
  starts.

## Lowest-risk first PR

**`server/routes/portalRoutes.ts` PR-B: extract `quotequick.ts` (~115 LOC,
2 handlers, single consumer, low-traffic).**

- Mechanically smallest split.
- Proves the `registerXxx(app)` sub-registrar pattern end-to-end.
- If it breaks anything, the only impacted surface is
  `/api/portal/quotequick/summary` and `/api/portal/quotequick/:calcId/leads`.
- Gate: `tsc --noEmit` + `tests/smoke-runner.mjs` + spot-check that the
  customer portal QuoteQuick tab still loads.

## What this plan deliberately does **not** do

- No actual code splits in this PR (out of scope — too risky for one PR).
- No `npm install` or new dependency.
- No structural changes to `IStorage` consumers — the mixin-assembled
  class preserves the public surface verbatim.
- No re-org of marketing pages / `AdvancedCalculator.tsx` /
  `WizardCard.tsx` — those are the next wave (sized 3,358 / 3,034 LOC
  respectively).

## Open items to verify before the first execution PR lands

1. Confirm `server/scripts/seed-services.ts` whether `resolveProductRow`'s
   synthesised-row branch is still required.
2. Confirm `BRAND_STUDIO_STYLE_KEYS` + `FLOATING_LAUNCHER_PRO_KEYS` still
   gate fields server-side.
3. Confirm `/api/portal/reputation` (legacy summary at line 2264 of
   `portalRoutes.ts`) still has a client consumer; if not, delete in a
   separate PR before splitting.
4. Confirm `updateClientServiceMetadata`'s two overloads are still both
   needed.
5. Confirm `listReviewRequests`'s two overloads.
