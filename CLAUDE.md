# CLAUDE.md — WeFix Trades project handoff

## Active branch
`claude/outbound-lead-management-mZbUU`

All outbound work lives here. Do not push to main/master without explicit approval.

---

## Stack
- **Monorepo** — `/client` (React 18 + Vite) · `/server` (Express.js) · `/shared` (Drizzle ORM schemas)
- **DB** — PostgreSQL via Drizzle ORM. Schemas in `shared/schemas/`
- **Routing (client)** — Wouter
- **Data fetching** — TanStack React Query; API helper at `client/src/lib/queryClient.ts`
- **UI kit** — Radix UI primitives + Tailwind CSS. Component library at `client/src/components/ui/`
- **Auth** — session-based; admin routes require `requireAdmin` middleware

---

## What has been built (this branch)

### V1 — Outbound lead management foundation (commits `04cf418`, `1ca1914`)
- DB schema for `prospects`, `prospect_enrichment`, `campaign_prospects`, `campaigns`, `outbound_opportunities`
- CSV import from Outscraper format
- Heuristic enrichment (website/phone/review signals)
- Prospect review queue (approve/reject/blacklist)
- Campaign CRUD + Instantly/Smartlead sync stub
- Kanban pipeline (`positive_reply → booked_call → trial_started → paid → lost`)
- Reply webhook classification

### V2 — Offer targeting + AI enrichment + template layer (commits `0f1397a`, `0ae9db1`)

**Schema extensions** (`shared/schemas/outbound.ts`):
- `prospects` table: `target_offer varchar(30)`, `priority_score integer`
- `prospect_enrichment`: `ai_reason_to_target text`, `ai_first_line text`, `ai_offer_angle text`, `ai_cta_variant text`
- `campaign_prospects`: `reply_type varchar(20)`, `reply_intent varchar(30)`, `ai_next_action text`

**New services**:
- `server/services/prospectTargeting.ts` — `assignTargetOffer()` rule tree + `computePriorityScore()` (0–100 deterministic)
- `server/services/replyIntelligence.ts` — `classifyReplyFull()` with heuristic intent + optional Claude Haiku next-action
- `server/services/prospectEnrichment.ts` — extended to 7 AI output fields; Claude prompt upgraded (max_tokens 700)

**Template layer (client)**:
- `client/src/lib/outboundTemplates.ts` — 4 offers × 3 angles × 6 message types = 72 independent templates (code-based, no DB)
- `client/src/lib/templateMerge.ts` — `renderTemplate()` + `buildMergeFields()` with 13 merge fields
- `client/src/components/outbound/TemplatePreview.tsx` — full-featured dialog with offer/angle/message-type selectors + Copy button

**Offers**: `quotequick` | `reputationshield` | `socialsync` | `tradeline`
**Message types**: `first_touch` | `follow_up_1` | `follow_up_2` | `breakup` | `contact_form` | `dm`

**Merge fields**: `{{business_name}}` `{{first_name}}` `{{city}}` `{{state}}` `{{trade}}` `{{review_count}}` `{{rating}}` `{{ai_first_line}}` `{{ai_first_line_callout}}` `{{ai_offer_angle}}` `{{ai_cta_variant}}` `{{sender_name}}`

`{{ai_first_line_callout}}` renders as: `{ai_first_line}\n\n(so this stood out when I looked you up)` — makes AI observations feel human.

### V2.1 — Template fixes + tracking (commit `4525622`)
- Each angle now owns its own full `messages: Record<MessageType, MessageConfig>` — real content variation, not just label changes
- `trackEvent("template_copied", { offer, angle, message_type, prospect_id })` fires on Copy
- `TemplatePreview.tsx` message lookup fixed: `angle.messages[selectedType]` (was broken `offer.messages[selectedType]`)

### V2.2 — UI polish (commit `59156ca`)
- **ProspectsPage**: `?` tooltips on Score + Priority column headers; "Heuristic only" → "No AI yet · run AI Enrich ↑"
- **CampaignsPage**: `?` tooltip on External Campaign ID field; tooltip on Push button; `?` on Sync column header
- **PipelinePage**: `?` tooltip on Positive Reply stage; contact info collapsed from 3 stacked rows to single inline row

---

## Key file locations

| Purpose | Path |
|---|---|
| Outbound DB schema | `shared/schemas/outbound.ts` |
| All outbound API routes | `server/routes/adminOutboundRoutes.ts` |
| Offer targeting rules | `server/services/prospectTargeting.ts` |
| Reply classification | `server/services/replyIntelligence.ts` |
| AI enrichment service | `server/services/prospectEnrichment.ts` |
| Template config (72 templates) | `client/src/lib/outboundTemplates.ts` |
| Template merge utility | `client/src/lib/templateMerge.ts` |
| Template preview dialog | `client/src/components/outbound/TemplatePreview.tsx` |
| Prospects page | `client/src/pages/admin/outbound/ProspectsPage.tsx` |
| Campaigns page | `client/src/pages/admin/outbound/CampaignsPage.tsx` |
| Pipeline page | `client/src/pages/admin/outbound/PipelinePage.tsx` |
| Event tracking stub | `client/src/lib/trackEvent.ts` |
| Tooltip component | `client/src/components/ui/tooltip.tsx` |

---

## DB migration note
The V2 schema columns (`target_offer`, `priority_score`, AI fields, reply intelligence fields) were added to Drizzle schema definitions but **no migration has been run yet**. Before testing end-to-end, run:
```bash
npm run db:push   # or whatever the project's drizzle migration command is
```
Check `package.json` scripts for the exact command.

---

## Coding conventions
- **No raw `{{tokens}}`** ever shown to operator — `FIELD_HINTS` in `templateMerge.ts` provides fallback text
- **Tooltip pattern**: `import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"` + `HelpCircle` from lucide-react. `TooltipProvider` is already in `App.tsx`.
- **Large file writes**: scaffold first (~50 lines), then fill content in sequential `Edit` calls (~100 lines each) to avoid timeout
- **API calls**: use `apiRequest()` from `@/lib/queryClient` for mutating requests; plain `fetch` for queries
- **Admin brand color**: `#2D6A4F` (green) / `#1B4332` (hover)
- **TypeScript**: pre-existing ambient errors `TS2688` (@types/node) and `TS5101` (baseUrl) are known and harmless — ignore them

---

## Potential next tasks (not started)
- **DB migration**: run `db:push` to apply V2 schema changes to the actual database
- **Instantly/Smartlead sync**: `server/services/outreachPlatform.ts` exists as a stub — wire up real API calls
- **Sequence scheduling**: add send-time logic to campaign_prospects (no UI yet)
- **Template editing**: TemplatePreview is read-only; editable inline copy is deferred
- **Template versioning**: no version history yet
- **`contact_confidence` display**: field exists in heuristic logic but not shown in ProspectsPage Contact cell
- **`trackEvent` backend**: currently logs to console only — swap for a real analytics endpoint
- **Sort by priority**: `?sort=priority` is supported by the API but no UI toggle exists on ProspectsPage yet
- **Reply intelligence UI**: `reply_type`, `reply_intent`, `ai_next_action` are stored on `campaign_prospects` but not surfaced anywhere in the UI
