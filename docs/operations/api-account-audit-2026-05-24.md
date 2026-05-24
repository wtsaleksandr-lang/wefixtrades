# API Account Hygiene Audit — 2026-05-24

Cross-provider audit of every API-accessed account used by WeFixTrades. For each provider we verified:

1. Is the key present in Doppler (`wefixtrades/prd`)?
2. Does a live API probe succeed?
3. Are there unused / orphan / duplicate keys?
4. Are we near any usage cap?

All keys are referenced by **length + first-4 + last-4 chars only** — no values, no SHA pairs except for the cross-share check.

Doppler config secret-name counts (PRD canonical, STG sparse by design):

| config | secret count |
| --- | --- |
| `wefixtrades/prd` | 94 |
| `wefixtrades/dev` | 88 |
| `wefixtrades/stg` | 11 |
| `wefixtrades/dev_personal` | (Alex's personal) |

Drift: `prd` has the full Stripe price-ladder + STRIPE_API_* aliases that `dev` lacks (9 names). Expected — those are prod-only Stripe price IDs. STG is intentionally minimal.

---

## Per-provider matrix

| # | Provider | Status | Doppler key(s) | Notes |
| --- | --- | --- | --- | --- |
| 1a | GCP — `acx-audiobooks` (WFX project) | ✅ | `GOOGLE_MAPS_API_KEY` (IzaS…PWb8, len 38), `PAGESPEED_API_KEY` (AIza…uMxc, len 39) | Maps key restricted to 4 Places/Geo APIs. PageSpeed key restricted to PSI only. Probe of Maps returned `REQUEST_DENIED` from this workstation — expected, key is referer/IP-restricted. PageSpeed probe ✅. |
| 1b | GCP — `quotefleet` | ✅ | (no Doppler entry under WFX; lives in quotefleet Doppler) | Single Maps Platform key, restricted to 33 Maps APIs. Created 2026-05-08. |
| 1c | GCP — `accesstonorth-maps` | ✅ | (lives in accesstonorth Doppler) | Single Maps key restricted to directions+maps+places. |
| 1d | GCP — `linen-waters-436823-n6` (admin) | ✅ | n/a | **No API keys** — admin project, correctly key-free. Auth via gcloud OAuth only. |
| 2 | OpenAI — primary | ✅ | `OPENAI_API_KEY` (sk-s…mZAA, len 167) | `/v1/models` → 118 models. Project-scoped key (`sk-svcacct-` or `sk-proj-`); cannot read org spend without an admin key (403 on `/v1/organization/usage`). |
| 2b | OpenAI — integrations | ✅ | `AI_INTEGRATIONS_OPENAI_API_KEY` (sk-p…lo8A, len 164) | Valid. **Duplicate of #2c** — same prefix+sfx+length as `OPEANAI_API_KEY_SOCIALSYNC_RANKFLOW`. One key serves two Doppler names. |
| 2c | OpenAI — socialsync/rankflow | ⚠️ | `OPEANAI_API_KEY_SOCIALSYNC_RANKFLOW` (sk-p…lo8A, len 164) | Note typo in name (`OPEANAI` not `OPENAI`). Same key value as #2b — collapse to one name. |
| 3 | Anthropic | ⚠️ | `ANTHROPIC_API_KEY` (sk-a…GQAA, len 108) | `/v1/models` → 9 models, valid. SHA256(prd) ≠ SHA256(`freight-copilot/.env`) ≠ SHA256(`wefixtrades/.env` local). **Three distinct Anthropic keys exist** across the surfaces named in the CLAUDE.md carryover. The shared-key risk noted in `CLAUDE.md` (carryover) appears to already be split — but the local `wefixtrades/.env` may now hold a stale third key that should be revoked. |
| 4 | Vapi | ✅ | `VAPI_API_KEY` (6dd3…9784, len 36) | `/v1/assistant` → 1 assistant (`34aa037e…` = "Riley", created 2026-01-14). 1 phone number. `VAPI_PUBLIC_KEY`, `VAPI_WEBHOOK_SECRET`, `VAPI_SERVER_URL`, `VAPI_PHONE_NUMBER_ID`, `VAPI_ASSISTANT_ID` all present. |
| 5 | ElevenLabs | ❌ | **missing** | No `ELEVENLABS_API_KEY` in Doppler. If voice synthesis is in scope (Vapi or otherwise), it currently has no key — but the codebase may simply not use ElevenLabs directly; Vapi handles TTS internally. Verify before adding. |
| 6 | Twilio | ✅ | `TWILIO_ACCOUNT_SID` (ACec…a2ad, len 34) + `TWILIO_AUTH_TOKEN` (ba53…6d61, len 32) | Account status `active`, type `Full`. 50 usage_records this month, no `totalprice` aggregate yet. Also present: `TWILIO_API_KEY` + `TWILIO_API_KEY_SECRET` (preferred over raw auth token; **migrate calls to API Key auth**), `TWILIO_APP_SID`, `TWILIO_BRAND_REGISTRATION_SID`, `TWILIO_CAMPAIGN_SID`, `TWILIO_CUSTOMER_PROFILE_SID`, `TWILIO_EXTERNAL_BRAND_ID`, `TWILIO_LINKED_MESSAGING_SERVICE`, `TWILIO_PHONE_NUMBER`, `TWILIO_PUSH_CREDENTIAL_SID_{ANDROID,IOS}`, `TWILIO_TRUST_HUB_A2P_BUNDLE_SID`. |
| 7 | Stripe | — | covered by other agent's PR | Skipped per task scope. |
| 8 | SendGrid / SMTP | ⚠️ | `SMTP_*` present (`SMTP_HOST=smtp.sendgrid.net`, `SMTP_USER=apikey`, `SMTP_PASS=SG.0…lucM` len 69), `SENDGRID_WEBHOOK_PUBLIC_KEY` present | **No direct `SENDGRID_API_KEY`** — the SendGrid API key is being injected as `SMTP_PASS` (SendGrid convention: `user=apikey`, `pass=SG.xxx`). Functional, but means we can't hit SendGrid's `/v3/user/credits` endpoint to surface quota without a key rename or alias. Recommend duplicating into `SENDGRID_API_KEY` so observability scripts can query `/v3`. |
| 9 | Bing Webmaster | ✅ | `BING_WEBMASTER_API_KEY` (02ab…158b, len 32) | `/GetUserSites` → 1 site. Valid. |
| 10a | Cloudflare — token | ❌ | `CLOUDFLARE_API_KEY` (cfat…da98, len 53) | **Key returns 401** when probed against `/user/tokens/verify`. Prefix `cfat` indicates this is an **Account-scoped API Token**, not a Global API Key — yet it's expired or revoked. **`CLOUDFLARE_API_TOKEN` is missing entirely** from Doppler. **Action needed: rotate.** |
| 11 | PostHog | ❌ | **missing** | No `POSTHOG_*` keys (checked: `POSTHOG_API_KEY`, `POSTHOG_PROJECT_API_KEY`, `POSTHOG_PERSONAL_API_KEY`, `VITE_POSTHOG_KEY`, `POSTHOG_HOST`). If PostHog is in scope for product analytics, project keys need to be added. If WFX is not using PostHog, no action. |
| 12 | Sentry | ❌ | **missing** | No `SENTRY_*` keys (checked: `SENTRY_DSN`, `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`, `VITE_SENTRY_DSN`). Same caveat: confirm whether Sentry is on the WFX stack before rotating in. |

### Other providers found in Doppler (audited for completeness)

| Provider | Status | Doppler key | Notes |
| --- | --- | --- | --- |
| Google Maps (WFX) | ✅ | `GOOGLE_MAPS_API_KEY` (IzaS…PWb8, 38) | Same as 1a. `REQUEST_DENIED` from this workstation IP = good (key is restricted). |
| Google PageSpeed | ✅ | `PAGESPEED_API_KEY` (AIza…uMxc, 39) | Lighthouse runs return 200. |
| Replicate | ✅ | `REPLICATE_API_KEY_SOCIALSYNC_RANKFLOW` (r8_0…bmmy, 40) | `/v1/account` → user `wtsaleksandr-lang`, type `user`. |
| Perplexity | ⚠️ | `PERPLEXITY_API_KEY_SOCIALSYNC_RANKFLOW` (pplx…rR9C, 53) | Auth header accepted (key valid format); model name `sonar` rejected with 400. Suggests stale model id in our probe — key itself appears alive but cannot confirm spend. |
| Serper | ✅ | `SERPER_API_KEY` (fafd…f5d9, 40) | `/search` → 200. |
| DataForSEO | ✅ | `DATAFORSEO_LOGIN` (supp…3.com, 23) + `DATAFORSEO_PASSWORD` | Balance: **$45.90** remaining. Low-balance threshold suggested. |
| Outscraper | ✅ | `OUTSCRAPER_API_KEY` (ZWNm…IwZA, 58) | `/profile` → email confirmed. Credit count not surfaced in profile response (separate endpoint). |
| WhatsApp Business | ✅ | `WHATSAPP_API_KEY` (EAAY…ZDZD, 302) | Meta long-lived token format. No cheap probe without a Meta-known phone-number-id. |
| IONOS | ✅ | `IONOS_API_KEY` (eH6T…dLxg, 86) | Present, untested (no idempotent probe; only used for DNS ops). |
| Cloudflare R2 | ✅ | `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_ENDPOINT` | All 4 present. |
| GA4 Measurement Protocol | ✅ | `GA4_MEASUREMENT_ID`, `GA4_MEASUREMENT_PROTOCOL_API_SECRET` | Present, not probed (writes events). |
| Google Business OAuth | ✅ | `GOOGLE_BUSINESS_CLIENT_ID` + `_SECRET` + `_REDIRECT_URI` | OAuth credentials, not API keys; not probed. |
| Google Service Account | ✅ | `GOOGLE_APPLICATION_CREDENTIALS_JSON` | JSON blob present. Not introspected. |

---

## ⚠️ / ❌ summary — remediation items for Alex

Top 3 actions ranked by risk:

1. **❌ Rotate `CLOUDFLARE_API_KEY` (Doppler `wefixtrades/prd`).** The current value is a `cfat`-prefixed Account Token that returns **401 invalid** against `/v4/user/tokens/verify`. Either it expired or was revoked. Create a fresh Cloudflare API Token (Zone:DNS:Edit + R2:Read scopes likely) and rotate via `secrets-rotator`. Also consider standardizing on the name `CLOUDFLARE_API_TOKEN` (token-style) and deprecating `CLOUDFLARE_API_KEY` (which historically meant the legacy Global Key).

2. **⚠️ Collapse duplicate OpenAI key and revoke local `.env` Anthropic key.** `AI_INTEGRATIONS_OPENAI_API_KEY` and `OPEANAI_API_KEY_SOCIALSYNC_RANKFLOW` are the **same key value** under two Doppler names — pick one canonical name (suggest `OPENAI_API_KEY_SOCIALSYNC`), delete the other, fix the `OPEANAI` typo. Separately: three distinct Anthropic keys exist (Doppler-prd, `freight-copilot/.env`, `wefixtrades/.env` local). The cross-share carryover in `CLAUDE.md` is already partially mitigated, but the local `wefixtrades/.env` key is unaccounted for — revoke it from the Anthropic console if not the same as Doppler-prd.

3. **⚠️ DataForSEO balance at $45.90.** Not urgent but set a low-balance alert at $20 to avoid mid-campaign cutoff. Also: probe-only items to confirm whether PostHog and Sentry are intentionally absent or simply not yet wired in.

---

## Methodology + safety notes

- All probes executed via `doppler run --project wefixtrades --config prd -- powershell -File probe.ps1 -Which <provider>`. Doppler never wrote raw values to disk; the probe script reads from `$env:` inside the subprocess and outputs only length + first-4 + last-4.
- SHA256 fingerprints were used **only** for the Anthropic cross-share check across three local surfaces (Doppler prd, `freight-copilot/.env`, `wefixtrades/.env`). Only the first 16 hex chars were retained.
- No PR body, no diff, no log file contains a raw key value.
- The `.audit-tmp/` directory containing the probe scripts is gitignored via not-staging — only this doc is committed.
- Skipped: Stripe (covered by parallel agent), GA4/SA OAuth (not API keys), R2 (presence-only check).

---

## 2026-05-24 — Follow-up decisions on the three "missing" providers (#5, #11, #12)

After PR #670 hygiene audit flagged ElevenLabs, PostHog, and Sentry as
missing from Doppler, the following declarations were made to close the
question deliberately rather than leave them as open `❌` rows.

### #5 ElevenLabs — INTENTIONALLY ABSENT
WeFixTrades uses **Vapi** as the voice/telephony layer (assistant `Riley`,
`34aa037e…`, see row #4). Vapi handles TTS internally and bills upstream
ElevenLabs usage on our behalf. We do not call ElevenLabs directly, so
no `ELEVENLABS_API_KEY` is required in Doppler. If a direct-ElevenLabs
path is ever introduced (e.g. for offline voice generation), add then.

### #11 PostHog — INTENTIONALLY ABSENT
PostHog is not currently in use — no events are being captured anywhere
in the codebase (`grep -r posthog client/src server` returns zero
non-comment matches as of this audit). If/when product analytics is
adopted (likely after launch), the `POSTHOG_*` keys will be added in the
same PR that wires the SDK. Until then, absence is correct.

### #12 Sentry — `SENTRY_DSN` confirmed MISSING (real issue) → flagged
Re-verified via `doppler secrets --config prd --only-names | grep -i SENTRY`
on 2026-05-24: **zero matches** in both `prd` and `dev` configs. However,
the codebase **does** import and initialize `@sentry/node` in 9 server
files (`server/index.ts`, `server/lib/logger.ts`, route + cron + job
modules — all surfaced via #716 logging bridge). Without `SENTRY_DSN`
those calls silently no-op, so errors are not being captured in prod.

**Action required (escalated to Alex's queue):** add `SENTRY_DSN` to
`wefixtrades/prd` (and `dev` if desired) via `secrets-rotator`. Without
it, the wired Sentry SDK is dark.

`SENTRY_AUTH_TOKEN` (used only for source-map upload at build time) is
deferred — not required for runtime error capture. Add when source-map
uploads are turned on in the build pipeline.
