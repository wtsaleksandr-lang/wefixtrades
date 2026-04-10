# Support / Ticket System — Implementation Plan

> **Branch:** `claude/design-support-tickets-ZbmKr`
> **Base:** `claude/plan-admin-assistant-v1-Rirq0`
> **Status:** PLAN ONLY — no code changes yet
> **Date:** 2026-04-10

---

## 1. CURRENT STATE RELEVANT TO SUPPORT

### What already exists in the portal help/support area

**Portal Help page** (`client/src/pages/portal/PortalHelp.tsx`, 356 lines):
- Three-section layout: FAQ accordion → AI chat → Ticket form
- **FAQ section**: 5 hardcoded Q&A items with accordion UI (getting started, billing, QuoteQuick, post-purchase, requesting changes)
- **AI chat section**: Inline chat widget hitting `POST /api/portal/ai-chat` with `surface: "help"`. Non-streaming, 300-token limit, 10-message history. Quick-suggestion chips. System prompt knows WeFixTrades services and directs account-specific questions to ticket submission.
- **Ticket section**: Simple form (subject optional, message required). Creates ticket via `POST /api/portal/tickets`. Displays flat ticket history list with status badges (open/in_progress/resolved/closed). No ticket detail view, no reply capability, no conversation threading.

**Portal navigation** (`client/src/components/portal/PortalLayout.tsx`):
- Help is a top-level nav item at `/portal/help` with HelpCircle icon.

### What already exists in admin that can support ticketing

**Admin Inbox** (`client/src/pages/admin/InboxPage.tsx`):
- Fulfillment task queue with status filters, priority sorting, grouped sections (blocked → overdue → waiting → active → delivered).
- Uses `TaskCard` component with inline status/waiting_on mutations.
- Pattern is directly reusable for a ticket queue view.

**Admin CRM** has:
- `internalNotes` table and API (`GET/POST /api/admin/crm/clients/:id/notes`) — reusable for ticket internal notes.
- `adminActivityLog` table — audit trail pattern reusable for ticket events.
- `ClientDetailPage` (46KB) — comprehensive detail view pattern with tabs/panels.
- `AdminCopilot` — page-context-aware AI sidebar with suggested prompts per page.

**No admin ticket management UI exists.** Admin cannot see, respond to, or manage support tickets from the dashboard.

### What AI/support infrastructure exists to reuse

| Asset | Location | Reuse potential |
|-------|----------|-----------------|
| `support_tickets` table | `shared/schemas/db.ts:223-235` | Extend with new fields |
| `POST /api/portal/tickets` | `server/routes/portalRoutes.ts:690-721` | Extend for replies |
| `GET /api/portal/tickets` | `server/routes/portalRoutes.ts:659-684` | Extend for detail view |
| `POST /api/ai/create-ticket` | `server/routes/aiRoutes.ts:408+` | AI-initiated ticket creation with transcript |
| `insertSupportTicketSchema` | `shared/schemas/db.ts:243-247` | Update after schema change |
| Portal AI chat endpoint | `server/routes/portalRoutes.ts:724-814` | Add escalation behavior |
| AdminCopilot component | `client/src/components/admin/AdminCopilot.tsx` | Add ticket page context |
| Admin page context system | `AdminPageContext` interface | Extend for ticket data |
| `chatMemory` table | `shared/schemas/db.ts:413-438` | Link AI session to ticket |
| `aiConversationArchive` | `shared/schemas/db.ts:455-494` | Reference for AI summaries |
| Email notification infra | `aiRoutes.ts:434-460` (nodemailer) | Reuse for ticket notifications |
| `adminActivityLog` pattern | `shared/schemas/adminCrm.ts:271-288` | Log ticket events |

---

## 2. TARGET SUPPORT/TICKET ARCHITECTURE

### Conceptual separation (three distinct layers)

```
┌─────────────────────────────────────────────────────────┐
│  LAYER 1: AI-FIRST SUPPORT (customer portal)            │
│  PortalHelp AI chat → answers questions instantly        │
│  No ticket created unless needed                         │
│  Surface: "help" via /api/portal/ai-chat                 │
└──────────────────────┬──────────────────────────────────┘
                       │ escalation trigger
                       ▼
┌─────────────────────────────────────────────────────────┐
│  LAYER 2: TICKET SYSTEM (structured escalation)         │
│  support_tickets + ticket_messages tables                │
│  Portal user: create, view, reply                        │
│  Admin: manage, reply, resolve                           │
│  AI summary attached on creation                         │
│  Bridge between customer chat and admin operations       │
└──────────────────────┬──────────────────────────────────┘
                       │ admin views ticket
                       ▼
┌─────────────────────────────────────────────────────────┐
│  LAYER 3: ADMIN SUPPORT OPS (admin dashboard)           │
│  Ticket inbox/queue with filters                         │
│  Ticket detail with reply + internal notes               │
│  AdminCopilot: summarize, draft reply, flag priority     │
│  Separate admin AI surface — never exposed to customer   │
└─────────────────────────────────────────────────────────┘
```

### User-facing support flow
1. User opens Help page → reads FAQ → asks AI
2. AI answers from knowledge base
3. If AI cannot resolve → shows escalation prompt: "Would you like to create a support ticket?"
4. User confirms → ticket created with AI conversation summary auto-attached
5. User can also create ticket manually (existing form)
6. User views ticket list, opens ticket detail, adds follow-up messages
7. User sees admin replies (customer-visible only), resolution notes

### Admin-facing support operations
1. Admin sees ticket count badge in sidebar nav
2. Admin opens ticket inbox → filtered/sorted queue
3. Admin opens ticket detail → sees customer messages, AI summary, linked context
4. Admin writes reply (visible to customer) or internal note (admin-only)
5. Admin uses AI copilot to draft replies, summarize, assess priority
6. Admin changes status, assigns, resolves, closes
7. Activity logged to audit trail

### AI-first support layer (portal)
- Existing `/api/portal/ai-chat` with `surface: "help"`
- Enhanced: after 3+ unanswered exchanges OR when AI detects account-specific/billing/service issue it cannot resolve, AI suggests escalation
- Escalation = pre-fill ticket with AI-generated summary of the conversation
- AI NEVER creates tickets autonomously — user must confirm

### Escalation/ticket layer
- Tickets are the structured handoff from AI chat to human support
- Each ticket has: customer messages, admin replies, internal notes, status workflow, AI summary
- Tickets can optionally link to: client record, service, onboarding submission, billing issue
- Ticket lifecycle: `open` → `in_progress` → `waiting_on_customer` → `resolved` → `closed`

---

## 3. USER FLOW DESIGN

### Flow A: User asks AI and gets answer
```
User opens Help → scrolls to AI chat → types question
→ AI responds with helpful answer
→ User satisfied → done (no ticket created)
```
No changes needed — this flow already works.

### Flow B: User asks AI and needs escalation
```
User asks AI → AI cannot fully resolve (account-specific, billing dispute, service issue)
→ AI responds: "I can help with general questions, but for account-specific issues
   I'd recommend creating a support ticket so our team can look into it directly."
→ AI shows "Create Support Ticket" button below its response
→ User clicks → ticket creation form pre-fills with:
   - Subject: AI-generated from conversation
   - Description: user's original question
   - AI summary: condensed conversation context (hidden from form, attached to ticket)
→ User reviews, optionally edits, submits
→ Ticket created → user sees confirmation + ticket in their list
```

### Flow C: User manually creates a ticket
```
User opens Help → scrolls to "Contact Us" section
→ Fills subject + message → submits
→ Ticket created with status "open"
→ No AI summary attached (manual creation)
→ User sees ticket in their list
```
This flow already exists. Only change: add category selector (optional).

### Flow D: User checks existing ticket
```
User opens Help → scrolls to "Your Tickets" → clicks a ticket
→ Opens ticket detail view (NEW page: /portal/help/tickets/:id)
→ Sees: subject, status badge, original message, conversation thread
→ Thread shows: their messages, admin replies (customer-visible only)
→ Internal admin notes are NOT visible
→ Resolution notes shown when ticket is resolved/closed
```

### Flow E: User adds follow-up to open ticket
```
User opens ticket detail → sees message thread
→ Types follow-up in reply box at bottom
→ Submits → message added to thread
→ Ticket status auto-reverts to "open" if it was "waiting_on_customer"
→ Admin notified of new customer reply
```

---

## 4. ADMIN FLOW DESIGN

### Flow A: Viewing ticket queue
```
Admin clicks "Support" in sidebar nav (NEW nav item)
→ Opens /admin/crm/support (NEW page)
→ Sees ticket queue with counts by status
→ Default filter: open + in_progress (unresolved)
→ Each ticket row shows: subject/preview, client name, status, priority, age, last reply
→ Sorted by: priority desc, then oldest first
→ Can filter by: status, priority, category, client
```

### Flow B: Prioritizing tickets
```
Admin scans queue → sees priority badges (low/normal/high/urgent)
→ Priority auto-set by AI on creation (based on keywords, sentiment, category)
→ Admin can manually override priority from queue or detail view
→ Urgent tickets highlighted with red border (same pattern as TaskCard)
```

### Flow C: Viewing ticket detail
```
Admin clicks ticket row → opens /admin/crm/support/:id (NEW page)
→ Left panel: full message thread (customer messages + admin replies interleaved)
→ Right panel (or tabs):
   - AI Summary card (auto-generated on ticket creation)
   - Client context card (name, services, status, link to client detail)
   - Internal notes (admin-only, timestamped, with author)
   - Ticket metadata (created, updated, priority, category, assignee)
```

### Flow D: Replying to customer
```
Admin types reply in thread reply box → selects "Reply to customer"
→ Message saved as ticket_message with visibility: "customer"
→ Customer sees it in their ticket detail view
→ Ticket status optionally set to "waiting_on_customer"
→ Activity logged
```

### Flow E: Adding internal notes
```
Admin clicks "Internal Note" tab/toggle → types note
→ Saved as ticket_message with visibility: "internal"
→ Only visible to admin users
→ NEVER shown to customer
→ Can be pinned for emphasis
```

### Flow F: Closing / reopening / escalating
```
Admin changes status via dropdown:
  open → in_progress (admin acknowledged)
  in_progress → waiting_on_customer (admin replied, waiting for customer)
  waiting_on_customer → open (customer replied back)
  any → resolved (admin marks as resolved, optional resolution note)
  resolved → closed (final close after review period)
  closed → open (reopen if customer re-contacts)
Each transition logged to activity trail.
```

### Flow G: Using AI to summarize and draft replies
```
Admin opens ticket detail → AdminCopilot sidebar shows ticket context
→ Suggested prompts: "Summarize this ticket", "Draft a reply", "What priority should this be?"
→ Admin clicks prompt → Copilot generates response using ticket data as context
→ For draft replies: shown in draft block with "Copy to reply box" button
→ Admin reviews, edits, then sends — AI never sends directly
```

---

## 5. AI ROLE DEFINITION

### A. Customer Portal AI Support Role

**Surface:** `POST /api/portal/ai-chat` with `surface: "help"`
**Identity:** Friendly, knowledgeable assistant for WeFixTrades portal clients

**SHOULD:**
- Answer general questions about services, billing, onboarding, portal features
- Explain how things work (e.g. "How does MapGuard work?", "When is my next invoice?")
- Guide users through portal features ("Where do I find my onboarding form?")
- Suggest checking specific portal pages for their answer
- Offer to create a support ticket when it cannot fully resolve an issue
- Pre-generate a ticket subject and summary when escalating

**SHOULD NOT:**
- Access or display specific account data (balances, passwords, internal statuses)
- Make changes to accounts, services, or billing
- Create tickets without explicit user confirmation
- Promise specific timelines for ticket resolution
- Access internal admin notes or internal ticket data
- Pretend to be a human support agent

**Escalation triggers (suggest ticket creation):**
- User explicitly asks to talk to a person / support team
- Question is account-specific and AI lacks data access (e.g. "Why was I charged $X?")
- User expresses frustration or dissatisfaction
- AI has answered 3+ times without resolving the issue
- Billing disputes, service complaints, access issues

### B. Admin AI Support/Copilot Role

**Surface:** AdminCopilot component with ticket page context via `POST /api/chat` with `surface: "admin"`
**Identity:** Internal operations assistant for WeFixTrades admin team

**SHOULD:**
- Summarize ticket content and conversation thread
- Draft professional reply suggestions based on ticket context
- Suggest priority level based on content analysis (keywords, sentiment, urgency cues)
- Highlight risks (e.g. "This client has 2 overdue invoices — handle with care")
- Suggest linking ticket to relevant service/onboarding/billing record
- Help batch-process tickets ("Summarize the 5 oldest open tickets")

**SHOULD NOT:**
- Send replies to customers directly (draft only, admin must review and send)
- Change ticket status or priority autonomously
- Access customer portal AI chat history directly (only sees ticket-attached summary)
- Make business decisions (e.g. "Give them a refund") — only suggest options
- Operate without human review on any customer-facing action

**Key principle:** Admin AI is a copilot, not an autopilot. Every customer-facing action requires human confirmation.

---

---

## 6. TICKET DATA MODEL / SCHEMA

### Table: `support_tickets` (EXTEND existing)

The existing table at `shared/schemas/db.ts:223-235` needs to be extended. Current fields retained, new fields added.

```
support_tickets
──────────────────────────────────────────────────────────
id              serial PK
client_id       integer FK → clients.id (CHANGE: make required, link to CRM client)
calculator_id   integer FK → calculators.id (keep for legacy/QuoteQuick tickets)
subject         text (nullable)
description     text NOT NULL (original message body)
status          varchar(30) NOT NULL default 'open'
                  → open | in_progress | waiting_on_customer | resolved | closed
priority        varchar(20) NOT NULL default 'normal'        ← NEW
                  → low | normal | high | urgent
category        varchar(50)                                   ← NEW
                  → general | billing | service | onboarding | access | bug | other
source          varchar(30) NOT NULL default 'manual'         ← NEW
                  → manual | ai_escalation | admin_created
assigned_to     integer FK → users.id                         ← NEW (admin assignee)
linked_service_id    integer FK → client_services.id          ← NEW (optional)
linked_onboarding_id integer FK → onboarding_submissions.id  ← NEW (optional)
ai_summary      text                                          ← NEW (AI-generated on creation)
ai_priority_hint varchar(20)                                  ← NEW (AI-suggested priority)
transcript_json jsonb default '[]' (existing — keeps AI chat context)
admin_notified  boolean default false (existing)
created_at      timestamp default now()
updated_at      timestamp
resolved_at     timestamp
closed_at       timestamp                                     ← NEW
```

### Table: `ticket_messages` (NEW)

Threaded conversation on a ticket. Replaces the flat `transcript_json` approach for real replies.

```
ticket_messages
──────────────────────────────────────────────────────────
id              serial PK
ticket_id       integer FK → support_tickets.id NOT NULL
author_id       integer FK → users.id (nullable for system messages)
author_type     varchar(20) NOT NULL
                  → customer | admin | system | ai_draft
visibility      varchar(20) NOT NULL default 'customer'
                  → customer | internal
                  (customer = visible to both sides; internal = admin-only)
content         text NOT NULL
metadata        jsonb (optional — for AI draft source, edit history, etc.)
created_at      timestamp default now()
```

**Key design decisions:**
- `visibility: "customer"` means both customer AND admin can see it
- `visibility: "internal"` means admin-only (internal notes on the ticket)
- `author_type: "ai_draft"` is for AI-suggested replies stored for admin review (never shown to customer)
- System messages (e.g. "Status changed to resolved") use `author_type: "system"`

### Table: `ticket_events` (NEW)

Audit trail for ticket state changes. Follows `adminActivityLog` pattern.

```
ticket_events
──────────────────────────────────────────────────────────
id              serial PK
ticket_id       integer FK → support_tickets.id NOT NULL
actor_id        integer FK → users.id (nullable)
actor_type      varchar(20) NOT NULL → human | system | ai_agent
action          varchar(50) NOT NULL
                  → created | status_changed | priority_changed | assigned
                  → reply_added | note_added | resolved | closed | reopened
old_value       text (nullable — e.g. previous status)
new_value       text (nullable — e.g. new status)
summary         text (nullable — human-readable description)
created_at      timestamp default now()
```

### Why not reuse `internalNotes` table?

The existing `internalNotes` table is scoped to `client_id` and designed for general client notes. Ticket internal notes are scoped to a specific ticket and are part of the ticket conversation thread. Keeping them in `ticket_messages` with `visibility: "internal"` is cleaner and avoids cross-concern pollution.

### Why not reuse `fulfillmentTasks` for tickets?

Fulfillment tasks track service delivery work (supplier assignments, automation status, cost tracking). Support tickets track customer communication and issue resolution. Different lifecycle, different actors, different visibility rules. Merging them would create confusion and leak internal fulfillment data to customers.

---

## 7. HOW AI CHAT SHOULD CONNECT TO TICKETS

### When AI should offer escalation

The portal AI (`/api/portal/ai-chat`, surface: "help") should suggest ticket creation when:

1. **Explicit request:** User says "I want to talk to someone" / "Can I speak to support?" / "I need help from a real person"
2. **Account-specific question AI cannot answer:** "Why was I charged twice?" / "My service isn't working" / "I can't access my onboarding form"
3. **Frustration signals:** Repeated questions, negative sentiment, expressions of confusion after multiple exchanges
4. **3+ unresolved exchanges:** If the user has sent 3+ messages and the conversation hasn't reached a satisfactory conclusion

**Implementation:** Add escalation detection to the help-surface system prompt. When triggered, AI responds with helpful text AND a structured signal (e.g. `[ESCALATE]` marker at end of response) that the frontend detects to show the "Create Ticket" button.

### What chat context should be summarized into a ticket

When creating a ticket from AI escalation:

1. **AI generates a summary** (1-3 sentences) of what the user was asking about and what was tried
2. **User's original question** becomes the ticket description
3. **Full AI conversation** (last 10 messages) stored in `transcript_json` for admin reference
4. **AI suggests a subject line** based on conversation content
5. **AI suggests a category** (general/billing/service/onboarding/access/bug)
6. **AI suggests priority** stored in `ai_priority_hint`

### Manual vs. assisted vs. automatic ticket creation

| Method | When | AI involvement |
|--------|------|----------------|
| **Manual** | User fills form directly (existing flow) | None — user writes everything |
| **AI-assisted** (recommended) | AI suggests escalation, pre-fills form | AI generates subject, summary, category suggestion |
| **Automatic** | Never | Tickets should never be created without user confirmation |

**AI-assisted is the primary path.** Manual remains as fallback. Automatic is explicitly prohibited to avoid junk tickets.

### What should be copied from AI conversation into the ticket

```
ticket.description     = User's core question (first substantive message or user-edited)
ticket.ai_summary      = AI-generated 1-3 sentence summary of conversation
ticket.transcript_json = Full conversation array [{role, content}] (last 10 messages)
ticket.category        = AI-suggested category (user can override)
ticket.source          = "ai_escalation"
ticket.ai_priority_hint = AI-suggested priority based on content
```

### How to avoid noisy junk tickets

1. **User must confirm** — AI suggests, user clicks, user reviews pre-filled form, user submits
2. **Minimum message length** — description must be ≥ 10 characters
3. **Rate limit** — max 3 tickets per client per 24 hours
4. **Duplicate detection** — warn if client has an open ticket with similar subject (fuzzy match)
5. **No auto-escalation** — AI never creates tickets on its own

---

## 8. USER DASHBOARD / PORTAL UI PLAN

### Pages and components needed

#### Existing page to modify: `/portal/help` (`PortalHelp.tsx`)

**Changes:**
- **AI chat section:** Add escalation UI — when AI signals `[ESCALATE]`, show a "Create Support Ticket" button below the AI response. Clicking opens pre-filled ticket form.
- **Ticket form section:** Add optional category dropdown (general/billing/service/onboarding/access/bug). Support pre-fill from AI escalation.
- **Ticket list section:** Make each ticket row clickable → navigates to `/portal/help/tickets/:id`
- Add unresolved ticket count badge on the Help nav item

#### New page: `/portal/help/tickets/:id` (TicketDetailPage)

**Layout:**
```
┌─────────────────────────────────────────────┐
│  ← Back to Help    Ticket #123    [Open]    │
├─────────────────────────────────────────────┤
│  Subject: Question about MapGuard billing    │
│  Created: 10 Apr 2026 · Category: Billing   │
├─────────────────────────────────────────────┤
│  ┌─────────────────────────────────────┐    │
│  │ [You] 10 Apr 2:30pm                 │    │
│  │ I was charged twice for MapGuard... │    │
│  └─────────────────────────────────────┘    │
│  ┌─────────────────────────────────────┐    │
│  │ [Support] 10 Apr 3:15pm             │    │
│  │ Thanks for reaching out. I've...    │    │
│  └─────────────────────────────────────┘    │
│  ┌─────────────────────────────────────┐    │
│  │ [You] 10 Apr 3:45pm                 │    │
│  │ Thanks, that makes sense.           │    │
│  └─────────────────────────────────────┘    │
├─────────────────────────────────────────────┤
│  [Type your reply...              ] [Send]  │
│  (reply box hidden if ticket is closed)     │
└─────────────────────────────────────────────┘
```

**Components:**
- Message thread (customer + admin replies, `visibility: "customer"` only)
- Reply input box (disabled when ticket is closed/resolved)
- Status badge
- Back navigation to Help page
- Resolution note (shown when resolved/closed)

**What customers do NOT see:**
- Internal admin notes
- AI summary
- AI priority hint
- Admin assignee
- Linked service/onboarding/billing references
- Ticket events/audit trail

### Component summary

| Component | Location | New/Modify |
|-----------|----------|------------|
| PortalHelp | `pages/portal/PortalHelp.tsx` | Modify |
| PortalTicketDetail | `pages/portal/PortalTicketDetail.tsx` | **New** |
| EscalationPrompt | inline in PortalHelp | **New** (small) |
| TicketCategorySelect | inline in PortalHelp | **New** (small) |

---

## 9. ADMIN DASHBOARD UI PLAN

### New nav item: "Support"

Add to `AdminLayout.tsx` sidebar navigation:
```
Overview → /admin/crm
Clients → /admin/crm/clients
Inbox → /admin/crm/inbox
Support → /admin/crm/support          ← NEW (with unresolved count badge)
Billing → /admin/crm/billing
Suppliers → /admin/crm/suppliers
Services → /admin/crm/services
```

### New page: `/admin/crm/support` (SupportInboxPage)

**Layout follows InboxPage pattern:**

```
┌───────────────────────────────────────────────────────────┐
│  Support Tickets                    [Filter ▾] [Search]   │
│  Open (12) · In Progress (3) · Waiting (5) · Resolved (8)│
├───────────────────────────────────────────────────────────┤
│  ┌─ URGENT ──────────────────────────────────────────┐   │
│  │ #45 · Billing dispute — double charge  · J. Smith │   │
│  │      Billing · 2h ago · Last reply: customer      │   │
│  └───────────────────────────────────────────────────┘   │
│  ┌─ HIGH ────────────────────────────────────────────┐   │
│  │ #43 · Can't access onboarding form    · M. Jones  │   │
│  │      Access · 5h ago · Last reply: admin          │   │
│  └───────────────────────────────────────────────────┘   │
│  ┌─ NORMAL ──────────────────────────────────────────┐   │
│  │ #41 · Question about MapGuard setup   · T. Brown  │   │
│  │      Service · 1d ago · No reply yet              │   │
│  └───────────────────────────────────────────────────┘   │
└───────────────────────────────────────────────────────────┘
```

**Features:**
- Status filter tabs (open / in_progress / waiting_on_customer / resolved / closed / all)
- Priority grouping (urgent → high → normal → low) within each status
- Search by subject, client name, ticket ID
- Category filter dropdown
- Click row → opens ticket detail
- Unresolved count badge in sidebar nav

### New page: `/admin/crm/support/:id` (SupportTicketDetailPage)

**Two-column layout:**

```
┌─────────────────────────────────┬──────────────────────┐
│  CONVERSATION THREAD            │  TICKET INFO          │
│                                 │  Status: [In Progress]│
│  [Customer] 10 Apr 2:30pm      │  Priority: [High ▾]   │
│  I was charged twice for...    │  Category: Billing     │
│                                 │  Assigned: [Admin ▾]   │
│  [Admin — You] 10 Apr 3:15pm  │  Created: 10 Apr       │
│  Thanks for reaching out...    │  Source: AI escalation │
│                                 │                        │
│  [Internal Note] 10 Apr 3:10pm │──────────────────────│
│  🔒 Checked Stripe — confirmed │  AI SUMMARY            │
│  duplicate charge. Refund       │  Customer asked about  │
│  needed.                        │  double billing for    │
│                                 │  MapGuard. AI could    │
│                                 │  not verify account    │
│                                 │  data. Escalated.      │
│                                 │                        │
│                                 │──────────────────────│
│                                 │  CLIENT CONTEXT        │
│                                 │  J. Smith              │
│                                 │  Status: Active        │
│                                 │  Services: MapGuard,   │
│                                 │   TradeLine            │
│                                 │  [View Client →]       │
│                                 │                        │
│                                 │──────────────────────│
│                                 │  LINKED RECORDS        │
│                                 │  Service: MapGuard     │
│                                 │  Payment: INV-0045     │
│                                 │                        │
├─────────────────────────────────┤──────────────────────│
│  [Reply to customer ▾]         │  INTERNAL NOTES        │
│  [Type reply...        ] [Send]│  + Add note            │
│                                 │  [note list...]        │
│  ☐ Set to "Waiting on customer"│                        │
└─────────────────────────────────┴──────────────────────┘
```

**Features:**
- Full message thread with interleaved customer/admin messages AND internal notes (visually distinct — internal notes have lock icon, different background)
- Reply mode toggle: "Reply to customer" (visibility: customer) vs "Add internal note" (visibility: internal)
- Quick status change dropdown
- Priority override dropdown
- Assignee selector
- AI Summary card (read-only, generated on ticket creation)
- Client context card (links to ClientDetailPage)
- Linked records (service, onboarding, payment — clickable)
- AdminCopilot integration: suggested prompts for "Summarize this ticket", "Draft a reply", "What priority should this be?"

### AdminCopilot ticket context

Extend `AdminPageContext` with ticket data when on support pages:

```typescript
// Added to AdminPageContext
ticketId?: number;
ticketSubject?: string;
ticketStatus?: string;
ticketPriority?: string;
ticketCategory?: string;
ticketClientName?: string;
ticketMessageCount?: number;
ticketAiSummary?: string;
ticketAge?: string;
unresolvedTicketCount?: number;
```

New suggested prompts for support pages:
```typescript
PROMPT_CHIPS.support_inbox = [
  "Summarize the queue",
  "What needs attention first?",
  "Any urgent tickets?",
];
PROMPT_CHIPS.support_detail = [
  "Summarize this ticket",
  "Draft a reply",
  "What priority should this be?",
  "Is this related to billing?",
];
```

### Component summary

| Component | Location | New/Modify |
|-----------|----------|------------|
| AdminLayout | `components/admin/AdminLayout.tsx` | Modify (add nav item + badge) |
| SupportInboxPage | `pages/admin/SupportInboxPage.tsx` | **New** |
| SupportTicketDetailPage | `pages/admin/SupportTicketDetailPage.tsx` | **New** |
| TicketRow | `components/admin/TicketRow.tsx` | **New** |
| AdminCopilot | `components/admin/AdminCopilot.tsx` | Modify (add context + prompts) |
| App.tsx | `src/App.tsx` | Modify (add routes) |

---

## 10. ROUTES / API PLAN

### Portal/user endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `GET` | `/api/portal/tickets` | List tickets for authenticated client (existing — extend response) |
| `POST` | `/api/portal/tickets` | Create ticket (existing — extend with category, source, ai_summary, transcript) |
| `GET` | `/api/portal/tickets/:id` | **NEW** — Get ticket detail with messages (customer-visible only) |
| `POST` | `/api/portal/tickets/:id/messages` | **NEW** — Add customer reply to ticket |

### Admin endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `GET` | `/api/admin/crm/support/tickets` | **NEW** — List all tickets (filters: status, priority, category, client_id, search, pagination) |
| `GET` | `/api/admin/crm/support/tickets/counts` | **NEW** — Status counts for badge/tabs |
| `GET` | `/api/admin/crm/support/tickets/:id` | **NEW** — Full ticket detail (all messages, all visibility, client context) |
| `PATCH` | `/api/admin/crm/support/tickets/:id` | **NEW** — Update ticket (status, priority, category, assigned_to) |
| `POST` | `/api/admin/crm/support/tickets/:id/messages` | **NEW** — Add admin reply or internal note |
| `POST` | `/api/admin/crm/support/tickets` | **NEW** — Admin creates ticket on behalf of client |

### AI helper endpoints

No new dedicated AI endpoints needed. The existing infrastructure handles this:

- **Portal AI chat** (`POST /api/portal/ai-chat`): Modify system prompt to include escalation behavior. No new endpoint.
- **Admin Copilot** (`POST /api/chat` with `surface: "admin"`): Extend page context to include ticket data. No new endpoint.
- **AI summary generation**: Called inline during ticket creation (server-side, uses existing `aiService.chat()`). No separate endpoint.

### Endpoint conventions

All admin support endpoints use the `/api/admin/crm/support/` prefix to:
- Stay consistent with existing admin CRM route patterns
- Share the `requireAdmin` middleware
- Be logically grouped in `adminCrmRoutes.ts` or a new `adminSupportRoutes.ts`

All portal endpoints stay under `/api/portal/tickets/` prefix with `requireClient` middleware.

---

---

## 11. PERMISSIONS / VISIBILITY RULES

### Portal users (role: "client") can see:
- Their own tickets only (scoped by `client_id`)
- Ticket messages with `visibility: "customer"` only
- Ticket status, subject, description, category, created/updated/resolved dates
- Admin replies marked as customer-visible
- Resolution notes when ticket is resolved/closed

### Portal users CANNOT see:
- Other clients' tickets
- Internal notes (`visibility: "internal"`)
- AI summary field
- AI priority hint
- Admin assignee
- Linked service/onboarding/billing IDs (backend references)
- Ticket events/audit trail
- AI draft replies
- Any admin-internal metadata

### Admin users (role: "admin") can see:
- All tickets across all clients
- All messages (both `visibility: "customer"` and `visibility: "internal"`)
- AI summary, AI priority hint
- Full ticket metadata (source, assignee, linked records)
- Ticket events/audit trail
- Client context (services, billing, onboarding status)
- AI draft replies in copilot

### Admin users can do:
- View, reply, add internal notes
- Change status, priority, category, assignee
- Create tickets on behalf of clients
- Close/reopen tickets
- Use AI copilot for summaries and drafts

### Customer Portal AI can see:
- Current conversation context (messages in chat session)
- General knowledge base (services, pricing, FAQs)
- Current page context (which portal page user is on)

### Customer Portal AI CANNOT see:
- Ticket internal notes
- Other tickets' content
- Client billing specifics
- Admin-internal data
- Other clients' data

### Admin Copilot AI can see (via page context):
- Ticket subject, status, priority, category
- Ticket message thread (all visibility levels)
- AI summary
- Client name and basic info
- Linked service/billing context
- Queue statistics

### Admin Copilot AI CANNOT do:
- Send replies directly to customers
- Change ticket status or priority
- Access raw database records beyond provided context
- Make autonomous decisions about refunds, escalations, or account changes

---

## 12. BUILD PHASES

### Phase 1: Schema & Backend Foundation
**Risk:** Low — no UI changes, no user-facing impact
**Dependencies:** None

- Extend `support_tickets` table schema (add priority, category, source, assigned_to, linked fields, ai_summary, ai_priority_hint, closed_at)
- Create `ticket_messages` table
- Create `ticket_events` table
- Create insert schemas and TypeScript types
- Run migration (Drizzle push or generate)
- Add storage methods: `getTicketById`, `getTicketMessages`, `createTicketMessage`, `createTicketEvent`, `updateTicket`, `getTicketCounts`
- Update existing `POST /api/portal/tickets` to populate new fields
- Update existing `GET /api/portal/tickets` to return new fields

### Phase 2: Portal Ticket Detail & Reply
**Risk:** Low — new page, no changes to existing pages yet
**Dependencies:** Phase 1

- Create `GET /api/portal/tickets/:id` endpoint (ticket + customer-visible messages)
- Create `POST /api/portal/tickets/:id/messages` endpoint (customer reply)
- Auto-revert ticket status to "open" when customer replies to a "waiting_on_customer" ticket
- Create `PortalTicketDetail.tsx` page
- Add route `/portal/help/tickets/:id` in App.tsx
- Make ticket rows clickable in PortalHelp.tsx ticket list

### Phase 3: Admin Ticket Inbox
**Risk:** Low — new page, no changes to existing admin pages
**Dependencies:** Phase 1

- Create `GET /api/admin/crm/support/tickets` endpoint (all tickets, filters, pagination)
- Create `GET /api/admin/crm/support/tickets/counts` endpoint
- Create `SupportInboxPage.tsx` with status tabs, priority grouping, search
- Create `TicketRow.tsx` component
- Add "Support" nav item to `AdminLayout.tsx` sidebar with count badge
- Add route `/admin/crm/support` in App.tsx

### Phase 4: Admin Ticket Detail & Reply
**Risk:** Medium — admin reply becomes visible to customer
**Dependencies:** Phase 2, Phase 3

- Create `GET /api/admin/crm/support/tickets/:id` endpoint (full detail, all visibility)
- Create `PATCH /api/admin/crm/support/tickets/:id` endpoint (status, priority, assignee)
- Create `POST /api/admin/crm/support/tickets/:id/messages` endpoint (admin reply or internal note)
- Create `SupportTicketDetailPage.tsx` with two-column layout
- Message thread with customer/admin/internal note display
- Reply mode toggle (customer reply vs internal note)
- Status/priority/assignee controls
- Client context card
- Activity logging for all admin actions
- Add route `/admin/crm/support/:id` in App.tsx

### Phase 5: AI Escalation in Portal Chat
**Risk:** Medium — changes portal AI behavior
**Dependencies:** Phase 1, Phase 2

- Update portal AI help-surface system prompt with escalation triggers
- Add `[ESCALATE]` marker detection in AI response
- Add escalation UI in PortalHelp AI chat section (button below AI message)
- Pre-fill ticket form with AI-generated subject, summary, category
- Store AI conversation transcript in ticket `transcript_json`
- Generate `ai_summary` via server-side AI call during ticket creation
- Generate `ai_priority_hint` based on content analysis

### Phase 6: Admin AI Copilot Integration
**Risk:** Low — extends existing copilot, admin-only
**Dependencies:** Phase 4

- Extend `AdminPageContext` with ticket fields
- Add ticket-specific suggested prompts to `PROMPT_CHIPS`
- Pass ticket data as context when on support pages
- Admin copilot can now summarize tickets, draft replies, suggest priority
- Draft reply shown in copilot draft block with "Copy" button

### Phase 7: Polish & Notifications
**Risk:** Low — enhancement layer
**Dependencies:** All previous phases

- Email notification to admin on new ticket creation
- Email notification to customer on admin reply
- Unresolved ticket count badge on portal Help nav item
- Ticket age indicators (e.g. "2 days old" in queue)
- Duplicate ticket warning (client has open ticket with similar subject)
- Rate limiting on ticket creation (max 3 per client per 24h)
- Empty states, loading states, error handling polish

### Phase 8: Linked Records & Advanced Features (optional/future)
**Risk:** Low — additive features
**Dependencies:** Phase 4

- Link ticket to specific service, onboarding submission, or payment
- Admin can create ticket on behalf of client
- Ticket category auto-suggestion from content
- Batch operations in admin inbox (close multiple, assign multiple)
- Ticket search across message content
- SLA tracking (response time targets)

---

## 13. FILES LIKELY TO CHANGE

### Schema / Shared
| File | Change |
|------|--------|
| `shared/schemas/db.ts` | Extend `supportTickets`, add `ticketMessages`, add `ticketEvents` |

### Server / Backend
| File | Change |
|------|--------|
| `server/routes/portalRoutes.ts` | Extend `GET/POST /tickets`, add `GET /tickets/:id`, add `POST /tickets/:id/messages` |
| `server/routes/adminCrmRoutes.ts` | Add support ticket admin endpoints (or new file) |
| `server/storage.ts` | Add ticket storage methods |
| `server/routes/index.ts` | Register new route file if separate |

### New server file (optional)
| File | Purpose |
|------|---------|
| `server/routes/adminSupportRoutes.ts` | Admin support endpoints (alternative: add to adminCrmRoutes.ts) |

### Client / Frontend — Modified
| File | Change |
|------|--------|
| `client/src/pages/portal/PortalHelp.tsx` | Clickable ticket rows, escalation UI, category selector, pre-fill from AI |
| `client/src/components/admin/AdminLayout.tsx` | Add "Support" nav item with count badge |
| `client/src/components/admin/AdminCopilot.tsx` | Add ticket page context + suggested prompts |
| `client/src/App.tsx` | Add new routes for portal ticket detail + admin support pages |

### Client / Frontend — New files
| File | Purpose |
|------|---------|
| `client/src/pages/portal/PortalTicketDetail.tsx` | Portal ticket detail + reply page |
| `client/src/pages/admin/SupportInboxPage.tsx` | Admin ticket queue page |
| `client/src/pages/admin/SupportTicketDetailPage.tsx` | Admin ticket detail + reply page |
| `client/src/components/admin/TicketRow.tsx` | Ticket list row component |

---

## 14. RISKS / EDGE CASES

### Critical risks

| Risk | Mitigation |
|------|------------|
| **Internal notes leaking to customer view** | Strict `visibility` field filtering in portal endpoints. Portal `GET /tickets/:id` query explicitly filters `WHERE visibility = 'customer'`. Server-side enforcement, never rely on frontend filtering alone. |
| **AI creating junk tickets** | AI never creates tickets autonomously. User must confirm. Rate limit: 3 tickets/client/24h. Minimum description length: 10 chars. |
| **Duplicate tickets** | Warn (don't block) when client has open ticket with similar subject. Frontend warning, not hard block — user may intentionally create separate tickets. |
| **Spam/escalation abuse** | Rate limit on ticket creation. Rate limit on replies (e.g. 10 replies/ticket/hour). No anonymous ticket creation — requires authenticated client. |
| **Missing ticket ownership** | Default `assigned_to: null` is acceptable initially (small team). Phase 8 can add assignment rules. Admin inbox shows all tickets regardless of assignment. |

### Moderate risks

| Risk | Mitigation |
|------|------------|
| **Stale AI summaries** | AI summary generated once on ticket creation. Not auto-updated. Admin copilot can re-summarize on demand. Summary is supplementary, not authoritative. |
| **Billing-sensitive issues in tickets** | Category: "billing" flag helps admin prioritize. No financial data auto-attached. Admin must manually check Stripe/billing records. AI copilot can reference linked payment record but cannot process refunds. |
| **Customer expects real-time response** | Set expectations in UI: "We'll respond within 1 business day." No real-time chat — tickets are async by design. |
| **Portal AI gives wrong escalation advice** | Keep escalation triggers conservative (explicit request, 3+ unanswered, account-specific). AI suggests but user decides. Test system prompt thoroughly before deploying. |
| **Ticket status confusion** | Clear status labels in portal (customer sees: "Open", "We're looking into it", "Waiting for your reply", "Resolved", "Closed"). Map internal statuses to customer-friendly labels. |

### Low risks

| Risk | Mitigation |
|------|------------|
| **Large transcript_json payloads** | Cap at 10 messages stored. Older conversations trimmed. AI summary captures the essence. |
| **Client without CRM client record** | Existing tickets use `client_id` from auth. Portal `requireClient` middleware resolves client. Edge case: legacy calculator-only tickets still use `calculator_id`. Migration path: backfill `client_id` where possible. |
| **Admin accidentally sends internal note as customer reply** | Clear visual distinction: reply mode toggle with different colors. Internal notes show lock icon. Confirmation prompt on first customer-visible reply per session. |

---

## 15. RECOMMENDED FIRST IMPLEMENTATION STEP

### Phase 1: Schema & Backend Foundation

**Exact first step:**

1. Extend the `supportTickets` table definition in `shared/schemas/db.ts` with the new fields (priority, category, source, assigned_to, linked_service_id, linked_onboarding_id, ai_summary, ai_priority_hint, closed_at)

2. Create the `ticketMessages` table definition in `shared/schemas/db.ts`

3. Create the `ticketEvents` table definition in `shared/schemas/db.ts`

4. Create corresponding insert schemas and TypeScript types

5. Add storage methods in `server/storage.ts`:
   - `getTicketWithMessages(ticketId, clientId?)`
   - `createTicketMessage(data)`
   - `createTicketEvent(data)`
   - `updateTicket(ticketId, updates)`
   - `getTicketCounts(filters?)`

6. Update existing `POST /api/portal/tickets` to accept and store the new fields

7. Update existing `GET /api/portal/tickets` to return the new fields

8. Test with existing portal ticket creation to confirm backward compatibility

**Why this first:** It's entirely backend, requires no UI changes, has no user-facing impact, and every subsequent phase depends on this foundation being in place. If anything goes wrong, it's invisible to users.

**Estimated scope:** 3 files modified (`shared/schemas/db.ts`, `server/storage.ts`, `server/routes/portalRoutes.ts`). No new frontend files. No AI changes. Fully testable via API calls.

---

## Summary

This plan designs a three-layer support system:

1. **AI-first support** (portal chat) — handles most questions without creating tickets
2. **Ticket system** (structured escalation) — tracks issues that need human attention
3. **Admin support ops** (admin dashboard) — lets operators manage, reply, and resolve with AI copilot assistance

The system is built on top of existing infrastructure:
- Existing `support_tickets` table (extended)
- Existing portal AI chat endpoint (enhanced with escalation)
- Existing AdminCopilot (extended with ticket context)
- Existing admin dashboard patterns (InboxPage, TaskCard, ClientDetailPage)

8 phases, ordered by dependency, each small and low-risk. No big-bang deployment. The first phase is pure backend schema work with zero user impact.
