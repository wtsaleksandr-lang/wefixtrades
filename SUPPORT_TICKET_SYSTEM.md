# Support / Ticket System — Implementation Status

> Branch: `claude/design-support-tickets-ZbmKr`
> Last updated: 2026-04-12

---

## Phase Summary

| Phase | Description | Status |
|-------|-------------|--------|
| Phase 0 | Implementation plan | Done |
| Phase 1 | Schema & backend (DB, endpoints) | Done |
| Phase 2 | Portal Ticket UI + Admin Ticket Inbox | Done |
| Phase 3 | AI Escalation in Portal Chat | Done |
| Phase 4 | Admin AI Copilot for support tickets | **NOT STARTED** |

---

## Architecture Overview

### Portal (Client-Facing)

**Single global AI assistant**: `PortalChatWidget` rendered by `PortalLayout` on every portal page.
- One floating FAB → one chat panel → one API endpoint (`/api/portal/ai-chat`)
- Context-aware via `chatContext` prop passed through `PortalLayout`
- Help surface (`{ surface: "help" }`): general support + escalation to tickets
- Onboarding surface (`{ service_name, fields, current_responses }`): form-field assistance
- Escalation flow: 3-call pipeline (main reply → binary classification → draft extraction)
- Cooldown guard: after user dismisses a draft, suppress re-offering for 2 messages

**Key files:**
- `client/src/components/portal/PortalChatWidget.tsx` — the single global widget
- `client/src/components/portal/PortalLayout.tsx` — renders widget, accepts `chatContext` prop
- `client/src/pages/portal/PortalHelp.tsx` — FAQ accordion + manual ticket form + ticket list (NO embedded AI chat)
- `client/src/pages/portal/PortalOnboarding.tsx` — setup form (passes onboarding context to global widget, NO page-specific chat)
- `client/src/pages/portal/PortalTicketDetail.tsx` — ticket thread + reply (Ctrl+Enter to send)

### Admin (Staff-Facing)

**Support inbox + ticket detail pages:**
- `client/src/pages/admin/SupportInboxPage.tsx` — ticket list with status tabs, filters, search, priority badges
- `client/src/pages/admin/SupportTicketDetailPage.tsx` — 2/3 thread + 1/3 sidebar, reply vs internal note toggle, status/priority/category management
- `client/src/components/admin/AdminLayout.tsx` — "Support" nav item with red unresolved-count badge

**Admin AI Copilot for support: NOT YET BUILT.**
- The existing `AdminCopilot.tsx` is a general-purpose admin assistant (uses `/api/chat` with `surface="admin"`)
- It has NO support-ticket-specific capabilities (no draft reply, no summarize, no suggest status)
- It receives generic page context only, not ticket thread data
- The `/api/portal/ai-chat` endpoint is client-only (`requireClient` middleware)

### Backend

**Database schema** (in `shared/schema.ts` or `shared/schemas/`):
- `support_tickets` — id, client_id, subject, description, status, priority, category, source, ai_summary, transcript_json, assignee_id, created_at, updated_at, resolved_at, closed_at
- `ticket_messages` — id, ticket_id, author_type (customer|support|system), author_id, content, visibility (customer|internal), created_at
- `ticket_events` — id, ticket_id, actor_type, actor_id, event_type, old_value, new_value, created_at

**API endpoints** (in `server/routes/portalRoutes.ts`):
- `POST /api/portal/tickets` — create ticket (manual or ai_escalation)
- `GET /api/portal/tickets` — list client's tickets
- `GET /api/portal/tickets/:id` — get ticket detail + messages (visibility=customer only)
- `POST /api/portal/tickets/:id/messages` — client reply
- `POST /api/portal/ai-chat` — AI chat (3-call escalation pipeline)

**Admin endpoints** (in `server/routes/adminRoutes.ts`):
- `GET /api/admin/support/tickets` — list all tickets (with filters)
- `GET /api/admin/support/tickets/:id` — get ticket + all messages (including internal)
- `POST /api/admin/support/tickets/:id/messages` — admin reply or internal note
- `PATCH /api/admin/support/tickets/:id` — update status/priority/category/assignee
- `GET /api/admin/support/stats` — ticket count by status

**Routes** (in `client/src/App.tsx`):
- `/portal/help` → PortalHelp
- `/portal/help/tickets/:id` → PortalTicketDetail
- `/portal/onboarding/:id` → PortalOnboarding
- `/admin/crm/support` → SupportInboxPage
- `/admin/crm/support/:id` → SupportTicketDetailPage

---

## What Is NOT Built Yet

### Admin AI Copilot for Support (Phase 4 — not started)
None of the following exist:
- AI-assisted reply drafting for admin
- AI ticket summarization on demand
- AI-suggested status/priority changes
- AI-generated internal notes
- Multi-ticket or cross-client AI awareness
- Any admin-specific AI endpoint for support operations

### Other Not-Built Items
- Email/push notifications for ticket updates
- SLA tracking or auto-escalation
- Ticket assignment workflows
- Customer satisfaction surveys
- Ticket merging or linking
- Canned/template responses

---

## Design Decisions (for continuity)

1. **One assistant, not many**: Portal has exactly one AI chat entry point (PortalChatWidget). No page-specific chat UIs.
2. **Structured escalation detection**: Uses a second lightweight AI classification call (YES/NO, 5 tokens max) instead of string matching.
3. **Explicit confirmation**: AI never auto-creates tickets. It proposes an editable draft; user must click "Create Ticket".
4. **Visibility enforcement**: Server never returns `visibility=internal` messages to portal clients.
5. **Internal note safety**: Admin compose area shows amber background + warning banner when writing internal notes.
6. **Enter vs Ctrl+Enter**: Portal ticket reply uses Ctrl+Enter to prevent accidental sends.

---

## Key Constraints (carried forward)

- Do NOT add a second visible AI chat UI on any portal page
- Do NOT auto-create tickets — always require explicit user confirmation
- Do NOT blur the boundary between customer-visible and internal messages
- Keep the portal assistant context-aware through the `chatContext` prop only
- Admin copilot (when built) should be a separate feature from the portal assistant
