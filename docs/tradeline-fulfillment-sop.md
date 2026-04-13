# TradeLine v1 — Fulfillment SOP & Deployment Playbook

Internal operations guide for delivering TradeLine after purchase.
Grounded in the current codebase as of April 2026.

---

## How This Document Is Organized

1. [Variant Delivery Flows](#1-variant-delivery-flows)
2. [Website Install Decision Tree](#2-website-install-decision-tree)
3. [Direct Embed SOP](#3-direct-embed-sop)
4. [Hosted Fallback SOP](#4-hosted-fallback-sop)
5. [Go-Live Checklist](#5-go-live-checklist)
6. [Automation Opportunities](#6-automation-opportunities)

---

## 1. Variant Delivery Flows

TradeLine has three service variants. Each is a separate service catalog entry with its own onboarding template, task templates, and default config.

### 1A. TradeLine Call Backup (`tradeline-call-backup`)

**What it is**: AI phone answering when the tradesperson misses a call. Optional SMS notifications. No website widget.

**Provisioning trigger**: Admin provisions via CRM (`POST /api/admin/crm/clients/:id/provision`) or client self-serves via pricing page checkout.

**What happens automatically on provision**:
- `client_services` row created (status: pending)
- `metadata.tradeline` config set with defaults: `variant: "call_backup"`, `voice: true`, `sms: true`, `websiteChat: false`, `embedMode: "none"`
- Onboarding submission created (status: not_sent)
- 6 fulfillment tasks created (all not_started)
- Payment record created (pending)

**Onboarding fields collected from client**:
| Field | Required | Purpose |
|-------|----------|---------|
| Business name | Yes | AI greeting / context |
| Trade type | Yes | AI domain knowledge |
| Service area | Yes | AI location awareness |
| Business hours | Yes | Mode switching / routing |
| Primary phone number | Yes | Forwarding target |
| Forwarding preference | Yes | no_answer / immediate / after_hours_only |
| Ring timeout | No | Seconds before AI picks up (default 20) |
| Top services | Yes | AI conversation training |
| Pricing ranges | No | AI quoting guidance |
| Callback number | No | Different number for callbacks |
| Escalation number | No | Urgent transfer target |
| Tone preference | Yes | professional / friendly / casual |

**Setup tasks (in order)**:
1. Collect onboarding details *(waiting on client)*
2. Configure TradeLine assistant
3. Configure phone routing / fallback settings
4. Configure notifications
5. Test missed-call handling
6. QA review + go live *(human review required)*

**Key config fields**: `phoneRouting.primaryBusinessNumber`, `phoneRouting.forwardingMode`, `phoneRouting.ringTimeoutSeconds`, `notifications.sms[]`, `notifications.email[]`

**Go-live requirements**: Primary phone number set, setupStage at `ready_for_testing`, all tasks delivered.

---

### 1B. TradeLine Chat (`tradeline-chat`)

**What it is**: AI chat and/or voice widget on the client's website. Can be direct embed or hosted fallback page. No phone call handling.

**Provisioning**: Same as Call Backup — admin or self-serve.

**Defaults on provision**: `variant: "chat"`, `voice: false`, `websiteChat: true`, `websiteVoice: true`, `sms: false`, `embedMode: "direct_embed"`

**Onboarding fields collected from client**:
| Field | Required | Purpose |
|-------|----------|---------|
| Business name | Yes | AI greeting / branding |
| Trade type | Yes | AI domain knowledge |
| Website URL | Yes | Where to install widget |
| Website access available? | Yes | Determines embed vs hosted |
| Preferred install mode | Yes | direct_embed / hosted_fallback |
| Brand colors / logo URL | No | Widget styling |
| Top services | Yes | AI conversation training |
| Pricing ranges | No | AI quoting guidance |
| Lead destination | Yes | email / phone / both |
| Booking enabled? | No | Enable booking requests |
| Tone preference | Yes | professional / friendly / casual |

**Setup tasks (in order)**:
1. Collect onboarding details *(waiting on client)*
2. Configure TradeLine assistant
3. Prepare widget or hosted fallback
4. Install widget / provision hosted link
5. Configure lead notifications
6. QA review + go live *(human review required)*

**Key config fields**: `website.embedMode`, `website.accessAvailable`, `website.hostedUrl`, `website.domainStatus`, `channels.hostedFallback`

**Go-live requirements**: Embed mode chosen, if hosted fallback then hostedUrl set and domainStatus is `connected` or `live`, setupStage at `ready_for_testing`, all tasks delivered.

---

### 1C. TradeLine Complete (`tradeline-complete`)

**What it is**: Full TradeLine — phone backup + website chat/voice + SMS. The complete AI employee experience.

**Provisioning**: Same as above.

**Defaults on provision**: `variant: "complete"`, `voice: true`, `websiteChat: true`, `websiteVoice: true`, `sms: true`, `embedMode: "direct_embed"`

**Onboarding fields**: Combines Call Backup + Chat fields without duplication (17 fields total).

**Setup tasks (in order)**:
1. Collect onboarding details *(waiting on client)*
2. Configure TradeLine assistant
3. Configure phone routing
4. Prepare website widget or hosted fallback
5. Configure notifications + callback flow
6. End-to-end testing
7. QA review + go live *(human review required)*

**Key config fields**: All of Call Backup + Chat combined.

**Go-live requirements**: Phone number set AND website embed path ready (same rules as both variants combined).

---

## 2. Website Install Decision Tree

Applies to **tradeline-chat** and **tradeline-complete** only. Call Backup skips this entirely.

### Decision Flow

```
Client submits onboarding form
         │
         ▼
Does client have a website?
    │              │
   YES             NO
    │              │
    ▼              ▼
Can they provide    Use hosted fallback
website access?     (set embedMode = "hosted_fallback")
    │       │
   YES      NO / refuses
    │       │
    ▼       ▼
direct      hosted
embed       fallback
```

### How admin records the decision

**Endpoint**: `POST /api/admin/crm/tradeline/:id/install-path`

**Body**:
```json
{ "accessAvailable": true, "embedMode": "direct_embed" }
```
or
```json
{ "accessAvailable": false, "embedMode": "hosted_fallback" }
```

**What it does**:
- Sets `website.accessAvailable` (true/false)
- Sets `website.embedMode` (direct_embed / hosted_fallback)
- If hosted fallback: auto-sets `channels.hostedFallback = true`
- Advances `setupStage` to `configuring`

### Metadata fields involved

| Field | Values | Meaning |
|-------|--------|---------|
| `website.accessAvailable` | `null` / `true` / `false` | Not asked yet / Yes / No |
| `website.embedMode` | `none` / `direct_embed` / `hosted_fallback` | Not chosen / Embed on client site / Use hosted page |
| `website.domainStatus` | `not_needed` / `pending` / `connected` / `live` | Hosted fallback lifecycle |
| `website.hostedUrl` | URL string | The hosted fallback URL |
| `channels.hostedFallback` | boolean | Whether hosted fallback channel is active |

### What happens next

- **If direct_embed chosen**: Move to task "Install widget / provision hosted link". Admin or freelancer embeds the widget script on the client's site. See [Direct Embed SOP](#3-direct-embed-sop).
- **If hosted_fallback chosen**: Move to task "Prepare widget or hosted fallback". Admin creates a hosted page and sets the URL. See [Hosted Fallback SOP](#4-hosted-fallback-sop).

---

## 3. Direct Embed SOP

Step-by-step for installing TradeLine as a widget directly on the client's website.

### Prerequisites
- Client has submitted onboarding form
- Admin has set install path to `direct_embed`
- Admin has website access credentials (CMS login, FTP, or hosting panel)

### Steps

**Step 1 — Get access**
- Obtain CMS/hosting login from client (usually via onboarding form or follow-up)
- Verify you can edit the website's HTML/templates
- Note the CMS platform (WordPress, Squarespace, Wix, custom)

**Step 2 — Prepare the widget**
- Configure TradeLine assistant with client's business info (services, pricing, tone)
- Generate the embed snippet (future: from widget-config endpoint; current: manual)
- Test the widget locally or in a staging environment if possible

**Step 3 — Install**
- Log into client's website admin
- Add the widget script to the site footer or before `</body>`
- For WordPress: use a plugin like "Insert Headers and Footers" or edit theme footer
- For Squarespace/Wix: use their code injection settings
- For custom sites: edit the HTML template directly

**Step 4 — Verify installation**
- Visit the client's website in an incognito browser
- Confirm the chat widget appears
- Send a test message — verify the AI responds correctly
- Test on mobile — verify the widget doesn't break the layout

**Step 5 — Update status**
- Mark task "Install widget / provision hosted link" as delivered
- Update `setupStage` to `ready_for_testing` via config endpoint
- Notify the client that the widget is installed and ask them to test

### When to move setupStage forward
- After install is verified and working: set `setupStage: "ready_for_testing"`
- After client confirms and QA passes: admin calls `POST /go-live` to set `setupStage: "live"`

---

## 4. Hosted Fallback SOP

Step-by-step for creating a standalone hosted page when the client can't provide website access.

### When to use
- Client doesn't have a website
- Client has a website but can't/won't provide access
- Client prefers a standalone page they can link to

### Steps

**Step 1 — Create the hosted page**
- Currently manual: create a page on the WeFixTrades domain or a subdomain
- Future option: reuse QuoteQuick's hosted page infrastructure (each client already gets a `/calculator/:slug` page — a similar pattern could host TradeLine)
- The page should include the TradeLine chat/voice widget and basic business branding

**Step 2 — Set the URL**
- Update config via admin panel or API:
  ```
  POST /api/admin/crm/tradeline/:id/config
  { "website": { "hostedUrl": "https://app.wefixtrades.com/tl/client-slug", "domainStatus": "pending" } }
  ```

**Step 3 — Verify the hosted page**
- Visit the URL
- Test chat and/or voice functionality
- Verify business name, branding, and AI responses
- Test on mobile

**Step 4 — Connect domain (if applicable)**
- If client wants a custom domain or subdomain: configure DNS
- Update `domainStatus` to `connected` once DNS propagates
- Update to `live` once fully verified

**Step 5 — Update status**
- Set `website.domainStatus` to `connected` or `live`
- Set `website.hostedUrl` to the final URL
- Mark task "Prepare widget or hosted fallback" as delivered
- Update `setupStage` to `ready_for_testing`

### Domain status lifecycle

```
not_needed → pending → connected → live
```

- `not_needed`: Direct embed path — no hosted page
- `pending`: Hosted page being prepared
- `connected`: Page is accessible and DNS is working
- `live`: Verified and serving traffic

### QuoteQuick surface reuse (future)
QuoteQuick already provisions hosted calculator pages at `/calculator/:slug`. A similar pattern could host TradeLine widgets without building new infrastructure. This is a future optimization — for now, hosted pages are manually created.

### Go-live requirements for hosted fallback
- `website.hostedUrl` must be non-empty
- `website.domainStatus` must be `connected` or `live`
- Both are validated by `getTradeLineReadiness()` before go-live

---

## 5. Go-Live Checklist

Before marking a TradeLine service as live, verify every item below.

### Onboarding
- [ ] Onboarding form submitted by client
- [ ] Business name, trade type, and top services captured
- [ ] Tone preference set

### Mode & Routing (Call Backup + Complete only)
- [ ] `currentMode` set (available / on_the_job / after_hours)
- [ ] `phoneRouting.primaryBusinessNumber` configured
- [ ] `phoneRouting.forwardingMode` set (no_answer / immediate / after_hours_only)
- [ ] Ring timeout reviewed (default 20s)

### Website (Chat + Complete only)
- [ ] Install path decided (`direct_embed` or `hosted_fallback`)
- [ ] If direct embed: widget installed and verified on client site
- [ ] If hosted fallback: `hostedUrl` set, `domainStatus` is `connected` or `live`

### Notifications
- [ ] At least one notification channel configured (SMS and/or email)
- [ ] Test notification received

### Testing
- [ ] Test call placed (Call Backup / Complete) — AI answers correctly
- [ ] Test chat message sent (Chat / Complete) — AI responds correctly
- [ ] Mobile experience verified
- [ ] Client has tested and confirmed

### System
- [ ] All fulfillment tasks marked as delivered
- [ ] `setupStage` set to `ready_for_testing`
- [ ] `GET /readiness` returns `{ ready: true, issues: [] }`
- [ ] Admin calls `POST /go-live` — sets `setupStage: "live"`
- [ ] Service status is `active` (via task completion cascade)

### Admin API sequence
```
1. GET  /api/admin/crm/tradeline/:id/readiness  → check issues
2. Fix any issues via config updates
3. POST /api/admin/crm/tradeline/:id/go-live     → marks live
```

---

## 6. Automation Opportunities

Steps that are currently manual but could be automated in future phases.

| Step | Current | Automation opportunity |
|------|---------|----------------------|
| Onboarding form → config population | Manual: admin reads form, updates config | Auto-populate config fields from onboarding responses (e.g., phone number → phoneRouting.primaryBusinessNumber) |
| Install path decision | Manual: admin reads form answer, calls install-path endpoint | Auto-detect from onboarding `website_access` and `install_mode` fields, set embed path automatically |
| setupStage progression | Manual: admin updates stage via config | Auto-advance stage when relevant tasks are marked delivered (e.g., "Collect onboarding details" delivered → stage to "configuring") |
| Widget embed code | Manual: admin generates and installs | Generate embed snippet via API, provide copy-paste code to client |
| Hosted page creation | Manual: admin creates page | Auto-provision hosted page from template (reuse QuoteQuick pattern) |
| Domain status tracking | Manual: admin updates domainStatus | Automated DNS verification polling |
| Readiness validation before QA task | Manual: admin checks readiness endpoint | Block QA task from being marked delivered unless readiness passes |
| Go-live notification | Manual: admin tells client | Auto-send "Your TradeLine is live" email when go-live completes |
| Post-go-live monitoring | None | Alert if TradeLine goes 24h without any calls/chats (possible misconfiguration) |

### Priority automation candidates (low effort, high value)
1. **Auto-populate config from onboarding** — parse onboarding responses and set phoneRouting, notifications, and tone automatically
2. **Auto-advance setupStage** — tie stage transitions to task delivery events
3. **Go-live email** — trigger email to client when `POST /go-live` succeeds

---

## Reference: Key Files

| Purpose | File |
|---------|------|
| Config schema + readiness checker | `shared/schemas/adminCrm.ts` |
| Storage (config read/write, deep merge) | `server/storage.ts` |
| Admin delivery endpoints | `server/routes/adminCrmRoutes.ts` |
| Portal data endpoints | `server/routes/portalRoutes.ts` |
| Service + task + onboarding seeds | `server/scripts/seed-services.ts` |
| Provisioning (self-serve) | `server/routes/publicCheckoutRoutes.ts` |
| Provisioning (admin) | `server/routes/adminCrmRoutes.ts` (provision endpoint) |
| Provisioning (Stripe webhook) | `server/routes/stripeBillingRoutes.ts` |
| Task completion cascade | `server/storage.ts` → `checkAndCompleteService()` |

---

## Reference: setupStage Lifecycle

```
not_started → onboarding → configuring → awaiting_website_access → awaiting_client_action → ready_for_testing → live
```

| Stage | Meaning |
|-------|---------|
| `not_started` | Service just provisioned, no work begun |
| `onboarding` | Waiting for client to submit onboarding form |
| `configuring` | Admin is configuring assistant, routing, and channels |
| `awaiting_website_access` | Need website credentials from client |
| `awaiting_client_action` | Blocked on client for any reason |
| `ready_for_testing` | Setup complete, needs testing and QA |
| `live` | Go-live validated, TradeLine is operational |
