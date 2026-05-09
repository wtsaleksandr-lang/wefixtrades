# Outreach Engine — Implementation Plan

## Goal

A self-operating cold-email outreach engine inside the wefixtrades admin
dashboard that generates campaigns, sources prospects, writes copy with
AI, pushes to Smartlead for sending, classifies replies, and attributes
conversions. The same engine — minus tenant-isolation glue — gets ported
to QuoteFleet later.

Volume target: **1,000 sends/day combined across wefixtrades + QuoteFleet**
(~500/each at month-6 steady state). Budget: **~$70-90/mo** infrastructure
across both projects.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│  Admin dashboard (wefixtrades)                                      │
│  - Sequences page    - Prospects page    - Campaigns page          │
│  - Pipeline (existing)  - Sources (Outscraper / FMCSA / CSV)        │
└─────────────────────────────────────────────────────────────────────┘
            │
            ▼
┌──────────────────────────────┐    ┌──────────────────────────────┐
│  Module 1: AI copy engine    │    │  Module 3: Sourcing          │
│  - sequenceGenerator         │    │  - Outscraper bridge         │
│    (research → drafter →     │    │  - FMCSA importer            │
│     editor → QA)             │    │  - Hunter.io verifier        │
│  - prospectPersonalizer      │    │  - Dedup + confidence score  │
│  - Token-merge templates     │    └──────────────────────────────┘
└──────────────────────────────┘                  │
            │                                     ▼
            ▼                          ┌──────────────────────────────┐
┌──────────────────────────────┐       │  Module 2: Sending pipeline  │
│  Module 4: Reply intel       │  ◄────┤  - Smartlead client          │
│  - replyIntelligence (exists)│       │  - Sending-domain pool       │
│  - intent → next action      │       │  - Daily caps + rotation     │
│  - conversion attribution    │       │  - outboundSafety (exists)   │
└──────────────────────────────┘       └──────────────────────────────┘
                                                  │
                                                  ▼
                                          [ Smartlead — actual SMTP ]
```

**Smartlead is the sending rail** — we don't operate IPs or warmup
ourselves. Everything else (sourcing, copy, CRM, attribution, reply
classification) is owned by us.

## Schema additions

Building on top of the existing `outbound.ts` (prospects, campaigns,
campaignProspects, prospectEvents, prospectEnrichment).

| Table | Purpose | New / extend |
|---|---|---|
| `outbound_sequence_templates` | Per-campaign sequence (4-5 steps): subject + body for each step with `{{token}}` placeholders | New |
| `outbound_sequence_steps` | Each step: subject variants, body, send delay days, ordering | New |
| `outbound_sending_domains` | Sending-domain pool: domain, warmup_started_at, daily_cap, status (warming/active/paused/burned), bounce_rate, complaint_rate | New |
| `outbound_sources` | Track each Outscraper / FMCSA / CSV import: source_type, query_params, total_imported, dedupe_skipped | New |
| `prospect_enrichment` (extend) | Existing fields are good — `ai_first_line`, `ai_reason_to_target`, `ai_offer_angle`, `ai_cta_variant`. Just populate them via the new copy engine. | Extend |

Migrations live under `migrations/0003_outreach_sequences.sql`,
`migrations/0004_outreach_sending_domains.sql`, `migrations/0005_outreach_sources.sql`.

## Module list

### Module 1: AI copy engine ⬅️ **starting here**

```
server/services/copyEngine/
  prompts.ts              - System prompts for each agent role
  sequenceGenerator.ts    - Multi-agent: research → drafter → editor → QA
  prospectPersonalizer.ts - Per-prospect token generation (replaces parts of prospectEnrichment)
  index.ts                - Public API
```

**Multi-agent pipeline for sequence generation:**

1. **Research agent** — given campaign metadata (ICP, pain point, offer, sender persona), produces a structured *brief*: top 3 pain points, value props, 2 objection-handling angles, 5 subject-line themes.
2. **Drafter agent** — given the brief, drafts a 4-step sequence (intro, follow-up 1, follow-up 2, break-up) with subject + body for each. Body in plain text, uses `{{first_name}}`, `{{trade_category}}`, `{{ai_first_line}}` tokens.
3. **Editor agent** — strips AI tells (em-dashes, "delve", "in conclusion", "furthermore"), tightens length to <120 words/email, makes voice match the sender persona, ensures CTA is single + concrete.
4. **QA agent** — fact-checks claims, validates token usage, flags unsubscribe-link inclusion (CAN-SPAM), confirms no spam-trigger phrases ("limited time", "act now", excess capitalization).

Output is committed to `outbound_sequence_templates` + `outbound_sequence_steps`. Subject variants stored for A/B at send-time.

**Per-prospect personalizer** (cheap, runs at push-time per prospect):
- Input: prospect row + sequence template
- Output: writes `prospect_enrichment.ai_first_line`, `ai_reason_to_target`, `ai_offer_angle`, `ai_cta_variant`
- Uses Haiku (cheap model) for ~$0.001 per prospect
- The drafted sequence's tokens get merged at Smartlead push time

### Module 2: Sending pipeline

```
server/services/sending/
  smartleadClient.ts      - Refactor + complete the existing outreachPlatform.ts
  sendingDomainPool.ts    - Domain rotation, daily-cap enforcement
  pushOrchestrator.ts     - Take queued campaignProspects → push to Smartlead
  bounceHandler.ts        - Webhook receiver, auto-pause on bounce/complaint thresholds
```

**Domain rotation logic:** when pushing to Smartlead, round-robin across
domains in `status='active'`. Pause domain when `bounce_rate > 3%` or
`complaint_rate > 0.1%` over a 7-day window.

### Module 3: Sourcing

```
server/services/sources/
  outscraper.ts           - Maps queries → prospects (using your OUTSCRAPER_API_KEY)
  fmcsa.ts                - SAFER snapshot importer (not used for wefixtrades, only QuoteFleet)
  hunter.ts               - Email verifier, free 25/mo + paid tier wrapper
  dedupe.ts               - Fingerprint matching (already partially in outbound schema)
```

For wefixtrades: Outscraper is the primary source ("plumbers in
{metro}"). For QuoteFleet later: FMCSA is the primary.

### Module 4: Reply classification + attribution

Existing `replyIntelligence.ts` already classifies. What's missing:

- **Conversion webhook**: when a prospect signs up as a wefixtrades
  client (Stripe checkout completes), POST to
  `/api/internal/outreach/attribution` with `prospect_id` + `client_id`.
  Updates `prospects.status = 'converted'`, links to client.
- **Funnel report**: per-campaign view of `sent → opened → replied →
  positive → demo → converted → revenue`.

### Module 5: Dashboard

The existing `CampaignsPage.tsx`, `ProspectsPage.tsx`, `PipelinePage.tsx`
need three new surfaces:

- **Sequences page** — generate / edit / preview sequence templates
- **Sources page** — kick off Outscraper jobs, see import history
- **Sending page** — domain pool health, daily caps, warmup progress

## Build order

| Phase | Module | Estimated | Lands |
|---|---|---|---|
| 1 | Module 1 (AI copy engine) | ~8h | Generate sequences end-to-end with no UI yet |
| 2 | Module 3 (Outscraper bridge — wefixtrades only) | ~4h | Source plumbers/electricians/HVAC by metro |
| 3 | Module 2 (Sending pipeline + Smartlead) | ~10h | Push prospects to Smartlead, send first real emails |
| 4 | Sequences + Sources dashboard pages (UI half of #1 + #3) | ~6h | Operator can run a campaign end-to-end without CLI |
| 5 | Module 4 polish (conversion attribution + funnel) | ~3h | Closed-loop ROI reporting |
| 6 | Module 2 hardening (warmup, rotation, auto-pause) | ~5h | Production-safe at 500/day |
| 7 | Sending dashboard page | ~3h | Visibility into domain health |
| **Total to wefixtrades v1** | | **~39h** | First real campaign live |
| 8 | Port to QuoteFleet | ~6h | Same engine, drayage ICP |
| 9 | FMCSA importer for QuoteFleet | ~3h | Trucking-specific source |
| **Total to both projects v1** | | **~48h** | 1k/day combined |

## Multi-project port plan

The engine lives in wefixtrades. The QuoteFleet port (~6h) is a clean
copy + adapt:

- Schema: same tables, different default values
- Services: copy `server/services/copyEngine/` + `server/services/sending/` + `server/services/sources/` verbatim
- Prompts: edit `prompts.ts` to use trucking ICPs, drayage pain points, carrier-specific tone
- Sources: swap Outscraper Maps queries for FMCSA SAFER snapshots
- Smartlead: separate workspace OR same workspace + separate sending domains (3-4 per project, attached to the same Smartlead account)

After both projects ship, **the engine can become a tenant feature** —
wefixtrades tenants (plumbers/electricians) can run their own outreach
to property managers / B2B prospects using the same infrastructure as
a paid add-on. Same logic for QuoteFleet tenants.

## Cost & ops model

| Line item | Monthly |
|---|---|
| Smartlead (1 workspace, 4-6 domains for both projects) | $39 |
| Sending domains (4-6 × ~$1/mo amortized) | $5 |
| Sending mailboxes (12-15 × Zoho $1/mo) | $12-15 |
| Outscraper credits (~1k contacts/mo across both projects) | $10-30 |
| Hunter.io free tier | $0 |
| AI tokens (sequence generation + per-prospect personalization) | $5-15 |
| **Total** | **~$70-100/mo** |

Operator time: ~30 min/week monitoring + ~1 hr/month per new sequence variant.

## What is NOT in scope

- **Self-built SMTP / IMAP / warmup network.** Smartlead handles this.
  Revisit only if we hit 5k+/day sustained or sell to 50+ tenants.
- **YouTube / Instagram / Facebook automation.** Different
  workstreams; skipped per the strategy conversation.
- **Google Ads management.** Manual setup, not automated.
- **Stripe billing overhaul.** Parked at `docs/wip/stripe-billing-overhaul/`.
  Pick up when ready to charge.
- **AI video / avatar generation.** Out of scope.
- **AccessToNorth.** Side hustle on autopilot, not part of this engine.

## Open questions to revisit

1. **Sender persona** — first-name-only ("Hi, I'm Aleksandr from WeFixTrades")
   vs. brand-only ("WeFixTrades support") vs. fictional persona. My
   default: first-name-only tied to "MR Commerce & Trade" entity.
2. **Apollo / decision-maker enrichment** — start without (Outscraper + Hunter
   only) and add Apollo $49/mo at month 2 if reply rates lag.
3. **Sequence length** — start at 4 steps (intro + 2 followups + breakup).
   Standard cold-email dropoff curve says step 1 gets ~40% of opens, step 2
   ~25%, step 3 ~15%, step 4 ~10%. Going past 4 has diminishing return.

---

**Last updated:** 2026-05-08. Branch: `claude/outreach-engine`.
