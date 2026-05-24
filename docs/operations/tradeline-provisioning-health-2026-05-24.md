# TradeLine Provisioning Health — Root Cause + Diagnostic Endpoint

**Date:** 2026-05-24
**Trigger:** PR #698 audit found zero TradeLine per-client assistants in the
live Vapi account.
**Status:** Root cause identified and fixed inline. Diagnostic endpoint +
admin widget shipped.

## Summary

The TradeLine provisioning path (`provisionTradeLineAssistant` →
`upsertVapiAssistant` in `server/services/vapiService.ts`) was POSTing an
assistant payload that Vapi rejected with HTTP 400. The error was caught,
logged at error level, and stored in `client_services.metadata.tradeline.
assistant.lastBuildError`, but never surfaced to ops — so the failure was
silent from any external observability standpoint.

## Production state at investigation time

Direct read against `wefixtrades/prd` Postgres:

| Metric                                        | Value |
| --------------------------------------------- | ----- |
| `tradeline_assistant_settings` rows           | 0     |
| `clients` total                               | 13    |
| `client_services` with `service_id LIKE 'tradeline%'` | 4 |
| ...of which `status = 'active'`               | 0     |
| ...of which `status = 'pending'`              | 4     |
| ...with non-empty `metadata.tradeline.assistant.vapiAssistantId` | 0 |

Direct read against Vapi (`GET /assistant`):

| Metric                                | Value          |
| ------------------------------------- | -------------- |
| Total assistants in the account       | 1 (`Riley`)    |
| Assistants tagged `source: tradeline_template_engine` | 0 |

The drift count is structurally zero (DB-side has no real ids to compare
against), but the failure mode is captured directly in the per-service
`lastBuildError` strings.

## Root cause

The single TradeLine service that attempted a build (client_service id 22,
`tradeline-complete`) carries this `lastBuildError`:

> `Vapi push failed: Vapi assistant creation failed (400):
> {"message":["model.model must be a string"], "error":"Bad Request",
> "statusCode":400}`

The payload built by `upsertVapiAssistant` (vapiService.ts:824) used:

```ts
model: { provider: "custom-llm", url: ..., messages: [...] }
```

Vapi's API contract for `custom-llm` requires the `model` field to be a
**string identifier** at `model.model`. Without it Vapi rejects the entire
create/update with HTTP 400 and the assistant is never persisted live.

A secondary issue: when `VAPI_SERVER_URL` is unset the code fell back to a
relative path (`/api/vapi/conversation`), which Vapi also rejects because
the custom-llm URL must be fully-qualified `https://`. Prod has the env
var set so this didn't bite us, but it would silently break any non-prod
config the same way.

## Inline fixes shipped

In `server/services/vapiService.ts`:

1. `upsertVapiAssistant` payload now includes
   `model: "wefixtrades-tradeline-v1"` (string) alongside `provider` and
   `url`.
2. The function now throws early when `VAPI_SERVER_URL` is missing rather
   than building an invalid relative-URL payload.
3. The two sibling `custom-llm` model objects in `buildAssistantConfig()`
   and `buildTradeLineAssistantConfig()` (dynamic assistant-request webhook
   responses) were also updated to include `model.model` so they match the
   same contract.

These are additive (the existing fields are preserved) so existing call
sites continue to work.

## Diagnostic endpoint

`GET /api/admin/tradeline/provisioning-health` (admin-only, read-only)
returns a side-by-side of DB-state vs live Vapi inventory:

```json
{
  "dbServicesTotal": 4,
  "dbServicesActive": 0,
  "dbServicesPending": 4,
  "dbServicesWithAssistantId": 0,
  "dbServicesFailed": 1,
  "dbAssistantSettingsRows": 0,
  "vapiAssistantsTotal": 1,
  "vapiTradelineAssistants": 0,
  "driftCount": 0,
  "driftIds": [],
  "failures": [
    {
      "id": 22,
      "status": "failed",
      "lastBuildError": "Vapi push failed: ..."
    }
  ],
  "vapiReachable": true,
  "vapiError": null,
  "generatedAt": "2026-05-24T..."
}
```

Wired into the **TradeLine Voices** admin page (`/admin/tradeline/voices`)
as a small health Card immediately above the usage chart. It auto-refreshes
every 60s and surfaces an amber treatment when there is drift, failures, or
Vapi is unreachable.

## What this catches going forward

- Vapi-side disappearance (assistant deleted out of band) → drift count
- Provisioning silently failing on a new Vapi contract change → failures
  list with the exact `lastBuildError`
- VAPI_API_KEY removed/rotated incorrectly → `vapiReachable: false`
- A client activating TradeLine but the row never advancing past
  `pending` → DB pending vs DB-with-vapi_id gap

## Open work (out of scope for this PR)

- Backfill: the four pending TradeLine services need to be re-pushed once
  this fix lands in prod. They will be picked up on the next manual
  rebuild from the admin CRM (or on the next onboarding completion).
- The retry worker only picks up `status: 'active'` services with
  `assistant.status: 'failed'`. Services stuck in `pending` are never
  retried — that is a separate workflow gap, tracked elsewhere.
- The dynamic `assistant-request` webhook (`buildAssistantConfig`) is
  shaped for `custom-llm` but live Riley uses static OpenAI per PR #698.
  Wiring Riley over to `custom-llm` is its own ops decision and out of
  scope here.
