# TODO / FIXME triage — 2026-05-29

45 markers across `server/`, `client/src/`, `shared/`, `scripts/` (2 grep-positives were format-string false positives — `$X,XXX` and `XXX-XXX-XXXX`).

Source command:
```
grep -rn --include="*.ts" --include="*.tsx" --include="*.mjs" \
  -E '\b(TODO|FIXME|XXX|HACK)\b' \
  server/ client/src/ shared/ scripts/ \
  | grep -v node_modules | grep -v .test.
```

## Category A — Blocked on Alex (cannot ship autonomously)

| Marker | What Alex needs to do |
|--------|---|
| `shared/pricing.ts:311` | Mint MapGuard live Stripe Price IDs, paste into `STRIPE_PRICE_MAPGUARD_*` |
| `shared/pricing.ts:376` | Mint ReputationShield live Stripe Price IDs |
| `shared/pricing.ts:757` | Mint QuoteQuick live Stripe Price IDs (looked up by `lookup_key`) |
| `shared/pricing.ts:837` | Mint Full Audit one-time price (lookup_key `full_audit_master_one_time`) |
| `server/routes/publicCheckoutRoutes.ts:75,90` | Same Stripe-mint blockers |
| `shared/tradelineVoices.ts:29` | Confirm ElevenLabs voice IDs against the live ElevenLabs account |
| `client/src/pages/products/quotequick/demo.tsx:44-53` | 8 badge-copy strings still empty (Wave 52 — already on Alex's manual queue) |
| `server/routes/portalRoutes.ts:518` | Production uploads — decide S3 / R2 / Replit object storage |

**Recommendation:** these stay TODOs until Alex acts. Don't surface them on the engineering tracker — surface them as a single "Alex pre-launch checklist" line item.

## Category B — Deferred design / phase-2 work (no near-term blocker)

| Marker | Plan |
|--------|---|
| `server/routes/portal/contentflow.ts:637,1048,1299` | `phase5-migration` — own table for custom prompts. Wave-track when Phase 5 starts. |
| `server/routes/socialSyncRoutes.ts:1397` | Wait for Google GBP v5 / Account Management API GA. Outside our control. |
| `server/routes/twilioCommsRoutes.ts:21,497` | Cache-table migration **only if** messages API becomes noisy. Track via Twilio billing/perf dashboards. |
| `server/jobs/sharedFilesRetentionSweepWorker.ts:17,38` | BA-7b per-tenant retention override — needs UI + admin policy editor first. |
| `server/jobs/contentflowGenerationWorker.ts:17` | Generation-scheduling fast-follow — depends on the worker shipping. |
| `server/services/outscraperClient.ts:20,157` | Move to bg worker + `import_batches` progress table when import volume grows. |
| `server/services/emailQueueService.ts:48` | Add integration test. **Could be done autonomously** — flag for next test-coverage wave. |
| `shared/schemas/apiPlatform.ts:121` | Partition + retention policy. Wait for `apiPlatform` table to grow first. |
| `shared/schemas/outbound.ts:303,324` + `server/routes/adminOutreachSequencesRoutes.ts:249` | `ai_personalize=true` worker. Single coherent feature — track as one workstream. |
| `server/routes/mobileVoiceRoutes.ts:11,160` | Push Credential + Binding flow — softphone work, partly done in W-AW waves. |

## Category C — Client-side i18n stub (single coherent workstream)

4 markers all point to the same future i18n feature:
- `client/src/components/wizard/elfsight/InstallTab.tsx:26,543`
- `client/src/components/wizard/elfsight/types.ts:555`
- `client/src/components/wizard/elfsight/WizardShell.tsx:493`

Track as one item: "Wizard widget i18n — string extraction + translation pipeline." Out of scope pre-launch.

## Category D — Marketing copy / canvas refresh

- `client/src/components/marketing/AutomationDiagram.tsx:662` — post-launch canvas refresh (deliberate, doc-only).
- `client/src/pages/products/quotequick/BuildWithAi.tsx:33,130,733` — Wave 67.5 follow-ups (fixtures + drag-drop). Already tracked.

## Net actionable score

| Bucket | Count | Action |
|--------|------:|---|
| A (Alex-blocked) | 12 | None — Alex queue |
| B (deferred, near-term) | 14 | Documented, not surfaced |
| B (could-do, low priority) | 1 | `emailQueueService` test — fast-follow candidate |
| C (i18n) | 4 | Single workstream tracker |
| D (marketing/wave-follow-up) | 4 | Already tracked |

**Autonomous fix count: 0** before the merge gate. The 45 markers all map to either Alex-blocked decisions, deliberate phase deferrals, or single-coherent workstreams already on the radar.

The `emailQueueService.ts:48` test gap is the only standalone item that could be picked up in a future test-coverage wave — not worth a one-off PR.

## What I did NOT do

- Did not auto-delete any TODO comments. Every one names a real future task or external blocker.
- Did not consolidate the Stripe-mint TODOs into one giant comment — they live next to the specific price-lookup sites where they are actionable.
- Did not file new tickets — Alex's tracking surface is the CAMPAIGN doc + scratch lists, not a ticket system.
