# SocialSync + ReputationShield — Pilot Launch SOP

## For 5–10 pilot clients. Operator-facing.

---

## 1. CLIENT ONBOARDING CHECKLIST

### 1.1 Pre-Onboarding (Admin)

- [ ] Client created in CRM (`/admin/crm/clients`)
- [ ] SocialSync service provisioned (`/admin/crm/clients/:id` → Services → Add Service → socialsync)
- [ ] ReputationShield service provisioned (if applicable)

### 1.2 Collect Business Info

Route: `/admin/crm/clients/:id` → SocialSync tab → Edit Profile
OR client completes: `/portal/socialsync-setup`

Required fields:
- [ ] **Niche** — e.g., "Residential plumber", "HVAC technician"
- [ ] **Location** — e.g., "Denver, CO" or "Greater Austin area"
- [ ] **Services** — comma-separated list of services offered
- [ ] **Tone** — professional / casual / friendly / authoritative
- [ ] **Frequency** — daily / 3x per week / 2x per week / weekly
- [ ] **Platform preferences** — which platforms to post to

Optional:
- [ ] Service focus (priority services to emphasize)
- [ ] Branding notes

### 1.3 Connect Platforms

Route: `/admin/crm/clients/:id` → SocialSync tab → Connection cards

**Facebook:**
- [ ] Click "Connect Facebook" → complete Meta OAuth
- [ ] Select the correct Facebook Page from the picker
- [ ] Verify status shows "Connected" with page name

**Instagram:**
- [ ] After Facebook connection, Instagram accounts auto-discovered
- [ ] Select the Instagram Business/Professional account
- [ ] Verify status shows "Connected" with @username

**Google Business Profile:**
- [ ] Click "Connect Google" → complete Google OAuth
- [ ] Select the correct business location
- [ ] Verify status shows "Connected" with location name

**Minimum requirement:** At least 1 platform connected before activation.

### 1.4 Configure Review Link (ReputationShield)

Route: SocialSync tab → Reviews sub-tab → Review Requests section → Review Link

- [ ] Set Google review link URL (e.g., `https://g.page/r/ABC/review`)
  OR set Google Place ID (e.g., `ChIJ...`)
- [ ] Verify readiness shows "Ready" or "Active" (not "Blocked")

**How to find the review link:**
1. Search for the business on Google Maps
2. Click "Write a review" → copy that URL
3. OR: Google "find my google place id" → use the Place ID tool

### 1.5 Verify Onboarding Complete

Check the **Delivery Status Card** at top of SocialSync tab:
- [ ] Profile: ✓ (green check)
- [ ] Enabled: ✓
- [ ] Connected: ✓
- [ ] State should show "Awaiting Review" (ready for content generation)

---

## 2. ACTIVATION FLOW

### 2.1 Generate First Content

Route: SocialSync tab → "Generate First Week" button (in Delivery Status card)
OR: Click "Generate Week" in Controls card

- [ ] Click generate → wait for completion (30–90 seconds)
- [ ] Toast confirms: "X posts created, Y queued"

### 2.2 Quick QA (2–3 minutes per client)

Route: SocialSync tab → Posts sub-tab

- [ ] Scan first 3–5 generated posts
- [ ] Check: Does it mention the right services?
- [ ] Check: Does it mention the right location?
- [ ] Check: Does the tone match the client?
- [ ] Check: No weird AI artifacts or banned phrases?
- [ ] Check: Quality score ≥ 60 for all posts

**If a post is bad:**
- Click "Regen" to regenerate
- OR click "Cancel" to remove it

**If quality is consistently poor:**
- Review the profile settings (niche, services, tone)
- Adjust and regenerate

### 2.3 Enable Autopilot

Route: SocialSync tab → Controls card → Autopilot toggle

- [ ] Toggle Autopilot ON
- [ ] Delivery Status should change to "Active"
- [ ] Confirm: readiness checklist shows all green checks

### 2.4 Confirm First Publish

- [ ] Check Queue sub-tab: items should show "pending" with future run_at times
- [ ] Wait for first scheduled time to pass (or manually trigger: "Process Queue" button)
- [ ] Verify: at least 1 post shows "published" status
- [ ] Check the actual platform (FB/IG/Google) to confirm post appeared

---

## 3. WEEKLY OPS ROUTINE

**Time budget: 30–60 minutes for 5–10 clients**

### 3.1 Dashboard Check (5 min)

Route: `/admin/crm/socialsync` (Ops Dashboard)

Review metrics:
- [ ] **Clients at risk** — should be 0. If >0, investigate.
- [ ] **Queue failures** — should be 0. If >0, check details.
- [ ] **Expired tokens** — should be 0. If >0, reconnect.
- [ ] **Expiring soon** — plan reconnection before expiry.
- [ ] **Published 7d** — should match expected volume.
- [ ] **In Cooldown / Suppressed** — should be 0.

### 3.2 At-Risk Client Resolution (5–15 min)

For each at-risk client, open their SocialSync tab and check:

| Issue | Resolution |
|-------|-----------|
| Expired token | Click "Reconnect" on the affected platform card |
| Queue failures | Check Queue tab → click "Retry" on failed items |
| No upcoming posts | Click "Generate Week" to create new content |
| Missing connections | Re-connect the platform via OAuth |
| Suppressed (cooldown) | Click "Clear Cooldown" if issue is resolved |

### 3.3 Content Spot-Check (10 min)

Pick 2–3 clients randomly:
- [ ] Open their Posts tab
- [ ] Review last 3–5 published posts
- [ ] Check: still relevant? Tone correct? No repetition?
- [ ] If quality drifting: adjust profile settings and regenerate

### 3.4 Review & Reply Check (10 min)

Route: Each client → SocialSync tab → Reviews sub-tab

- [ ] Check for new negative reviews (should have alert if configured)
- [ ] Check for draft replies awaiting posting → click "Post Reply"
- [ ] Check review request delivery: any failures?
- [ ] Verify auto-replies posted correctly (spot-check 1–2)

### 3.5 Connection Health (5 min)

Route: Ops Dashboard → filter by "Expiring Soon"

- [ ] If any tokens expiring within 7 days: schedule reconnection
- [ ] Meta tokens: ~60 day lifespan, requires fresh OAuth
- [ ] Google tokens: auto-refresh (should self-heal), but verify

---

## 4. NEGATIVE REVIEW HANDLING SOP

### When alert arrives (email/webhook):

**Step 1: Triage (within 1 hour)**
- [ ] Open the client's Reviews tab
- [ ] Read the full review text
- [ ] Check escalation flag (lawsuit/scam/injury keywords)

**Step 2: Assess severity**

| Severity | Stars | Keywords | Action |
|----------|-------|----------|--------|
| Low | 3 stars, mild complaint | None | Post the AI draft reply (may edit slightly) |
| Medium | 1–2 stars, specific complaint | None | Edit the AI draft → make more specific → post |
| High | 1–2 stars | lawsuit, attorney, fraud, injury | Do NOT auto-post. Draft a careful response. Consider client outreach. |

**Step 3: Respond (within 24 hours)**
- [ ] Review the AI-generated draft reply
- [ ] Edit if needed (especially for negative reviews)
- [ ] Click "Post Reply" to publish
- [ ] If High severity: contact the client first, then post

**Step 4: Follow-up**
- [ ] For High severity: note in CRM internal notes
- [ ] Monitor if reviewer updates their review
- [ ] If pattern of negatives: discuss with client about service quality

### Reply Tone Guidelines:
- ✅ "We're sorry to hear about your experience. We'd like to make this right."
- ✅ "Thank you for letting us know. Please call us at [phone] so we can resolve this."
- ❌ "That's not what happened" (never argue)
- ❌ "We'll give you a refund" (never promise compensation publicly)
- ❌ Generic "Thank you for your feedback" (always personalize)

---

## 5. REVIEW REQUEST FLOW

### Automatic (preferred):
- Booking marked "completed" → auto-enqueues review request (24h delay)
- SMS sent if phone available, email as fallback
- 60-day cooldown prevents repeat requests

### Manual supplement:
Route: Client → Reviews tab → Review Requests → "Send Review Request" form

When to manually enqueue:
- [ ] Client mentions a happy customer
- [ ] Job completed but booking wasn't marked "completed" in system
- [ ] Low review volume — supplement with 2–3 manual requests per week

### Monitoring:
- [ ] Check request delivery: Sent / Pending / Failed
- [ ] If failures: check contact info (bad phone number?)
- [ ] If low response rate: consider adjusting message timing or channel

---

## 6. CLIENT COMMUNICATION TOUCHPOINTS

### Weekly/Biweekly (per client)

**Option A: Portal link (low-touch)**
Send client a message:
> "Hi [Name], here's your latest update:
> - Social media: [link to /portal/socialsync]
> - Reputation: [link to /portal/reputation]
> Let us know if you have any questions!"

**Option B: Quick summary (medium-touch)**
> "Hi [Name], quick update this week:
> - X posts published to Facebook/Instagram/Google
> - Y new reviews received (avg X.X stars)
> - Z review requests sent to your customers
> - All reviews responded to ✓
> Your portal: [link]"

**Option C: Call/meeting (high-touch, monthly)**
- Walk through portal reports together
- Discuss any negative reviews
- Adjust posting strategy if needed
- Upsell additional services if appropriate

### When to escalate to client:
- High-severity negative review
- Account disconnection they need to re-authorize
- Significant change in review volume (drop)
- Content feedback needed (wrong services, outdated info)

---

## 7. EDGE-CASE PLAYBOOK

### Platform disconnected mid-week
1. Posts in queue will fail with "No active connection"
2. Worker will mark them failed (permanent)
3. Alert fires after 3+ failures
4. **Fix:** Reconnect platform → retry failed queue items → regenerate if needed

### Rate-limited by Meta
1. Worker detects rate limit → client enters 15-min cooldown (60-min if repeated)
2. Other clients continue normally
3. **Fix:** Wait for cooldown to expire. If persistent: reduce posting frequency for that client.

### AI generates poor content
1. Quality gate should catch most issues (score < 50 = rejected)
2. If bad post slips through:
   - Cancel the post (if not yet published)
   - If published: cannot delete via API (must delete manually on platform)
   - Adjust profile: niche, services, tone
   - Regenerate week

### Client has no bookings (review requests not triggering)
1. Auto-trigger requires bookings marked "completed"
2. **Fix:** Manually enqueue review requests for known completed jobs
3. Long-term: ensure client's workflow marks bookings as completed

### Instagram post fails "media required"
1. Instagram requires an image — text-only posts fail permanently
2. AI image generation should handle this automatically
3. **If image generation fails:** Check AI_INTEGRATIONS_OPENAI_API_KEY env var. Check APP_PUBLIC_URL is accessible.
4. Manual fix: Click "Gen Image" on the post, then retry queue item.

### Token expires (Meta ~60 days)
1. Daily expiry check marks connection as "expiring_soon" at 7 days
2. Alert fires (if configured)
3. **Fix:** Click "Reconnect" → complete OAuth again
4. Google tokens auto-refresh (no action needed usually)

### Review reply posted incorrectly
1. Cannot un-post a review reply via API
2. **Fix:** Go to Google Business Profile manually → edit or delete the reply
3. Prevent: Always spot-check negative review replies before posting

---

## 8. PILOT SUCCESS METRICS

### Publishing Health
| Metric | Target | How to measure |
|--------|--------|---------------|
| Publish success rate | ≥ 90% | Ops dashboard → per-client success_rate |
| Posts published per week | Matches frequency setting | Ops dashboard → published_7d |
| Queue failure rate | < 10% | Ops dashboard → queue_failures vs total |
| Zero API violations/bans | 0 | No platform policy emails or account warnings |

### Reputation Growth
| Metric | Target | How to measure |
|--------|--------|---------------|
| New reviews per month | 1–3 per client (varies by booking volume) | Client → Reviews tab → reviews_30d |
| Review request response rate | 10–25% (estimated) | Client → Reviews tab → attribution insights |
| Negative review response time | < 24 hours | Monitor alerts + reply_posted_at timestamps |
| Reply rate | 100% for negative, ≥ 80% overall | Client → Reviews tab → reply_rate |

### Operational Health
| Metric | Target | How to measure |
|--------|--------|---------------|
| Clients at risk | 0 | Ops dashboard |
| Expired connections | 0 | Ops dashboard |
| Clients in cooldown | 0 | Ops dashboard |
| Weekly ops time | < 60 min for 10 clients | Track manually |

### Client Satisfaction (qualitative)
- [ ] Client acknowledges receiving posts
- [ ] Client sees reviews in portal
- [ ] No complaints about post quality or tone
- [ ] Client renews after first month

---

## 9. ENVIRONMENT VARIABLES REQUIRED

| Variable | Purpose | Required for |
|----------|---------|-------------|
| `ANTHROPIC_API_KEY` | AI content generation (Claude) | SocialSync posting |
| `AI_INTEGRATIONS_OPENAI_API_KEY` | Image generation (gpt-image-1) | Instagram images |
| `APP_PUBLIC_URL` | Public URL for media serving | Instagram publishing |
| `TOKEN_ENCRYPTION_KEY` | AES-256-GCM token encryption | All OAuth connections |
| `FACEBOOK_APP_ID` | Meta OAuth | Facebook + Instagram |
| `FACEBOOK_APP_SECRET` | Meta OAuth | Facebook + Instagram |
| `FACEBOOK_REDIRECT_URI` | Meta OAuth callback | Facebook + Instagram |
| `GOOGLE_BUSINESS_CLIENT_ID` | Google OAuth | Google Business Profile |
| `GOOGLE_BUSINESS_CLIENT_SECRET` | Google OAuth | Google Business Profile |
| `GOOGLE_BUSINESS_REDIRECT_URI` | Google OAuth callback | Google Business Profile |
| `SMTP_HOST` / `SMTP_USER` / `SMTP_PASS` | Email delivery | Review requests + alerts |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_FROM_NUMBER` | SMS delivery | Review requests |
| `SOCIALSYNC_ALERT_EMAIL` | Operator alert recipient | Failure + review alerts |
| `SOCIALSYNC_ALERT_WEBHOOK` | Webhook alerts (optional) | Slack/Discord integration |
| `SOCIALSYNC_MEDIA_DIR` | Media storage path (optional) | Defaults to ./data/socialsync-media |

---

## 10. QUICK REFERENCE URLS

| Purpose | URL |
|---------|-----|
| Admin Ops Dashboard | `/admin/crm/socialsync` |
| Client Detail → SocialSync | `/admin/crm/clients/:id` → SocialSync tab |
| Client Portal — Social Media | `/portal/socialsync` |
| Client Portal — Reputation | `/portal/reputation` |
| Client Setup Wizard | `/portal/socialsync-setup` |
| SocialSync Product Page | `/products/socialsync` |
| ReputationShield Product Page | `/products/reputationshield` |
