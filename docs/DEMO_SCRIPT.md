# SocialSync + ReputationShield Demo Script

## Setup (before the call)

1. Create a demo client in CRM: `/admin/crm/clients` → Quick Add
   - Business name: "Denver Pro Plumbing" (or prospect's trade)
   - Trade type: "Plumbing" (match their trade)

2. Seed demo data:
   ```
   POST /api/admin/demo/seed/{clientId}
   ```
   This creates 8 posts, 4 reviews, 3 review requests instantly.

3. Open these tabs:
   - Admin SocialSync tab: `/admin/crm/clients/{id}` → SocialSync
   - Client portal — Social Media: `/portal/socialsync`
   - Client portal — Reputation: `/portal/reputation`

---

## The Script (90 seconds)

### 1. THE PROBLEM (15 sec)

> "Most trades businesses post on social media maybe once or twice... then nothing for months. And reviews? You finish a great job, the customer's happy, but nobody asks them to leave a review. Meanwhile, your competitors look more active and trusted online."

### 2. SHOW SOCIAL MEDIA (30 sec)

Switch to **client portal → Social Media** tab.

> "Here's what it looks like when SocialSync is running. We're posting 3 times a week to Facebook, Instagram, and Google — automatically. Every post is written for YOUR business, your services, your area."

Point to:
- Posts this month count
- Platform badges (FB, IG, Google — all connected)
- Recent posts with real captions
- Upcoming scheduled posts

> "You don't write anything. You don't log in. You don't even think about it."

### 3. SHOW REPUTATION (30 sec)

Switch to **client portal → Reputation** tab.

> "And here's the reputation side. After every completed job, we automatically send your customer a review request — by text or email. When reviews come in, we respond professionally on your behalf."

Point to:
- Average rating
- Reviews this month
- Reply rate (should show high %)
- "What we've done for you" card
- Latest positive reviews with "Replied ✓" badges

> "Negative reviews? You get an instant alert. We draft a careful response. You never have to worry about it."

### 4. THE CLOSE (15 sec)

> "This is running 24/7 for [price]/month. No contracts, cancel anytime. We handle everything — you just keep doing great work. Want to get started?"

---

## Before / After Examples

### BEFORE SocialSync + ReputationShield

| Metric | State |
|--------|-------|
| Social media posts | 0–1 per month, random |
| Platforms active | Maybe Facebook, nothing else |
| Online visibility | Looks inactive / abandoned |
| Google reviews | 3–8 total, no recent ones |
| Review replies | None |
| Review requests | None (relies on customers remembering) |
| Negative reviews | Unanswered for weeks/months |

**Client perception:** "I should probably do something about social media... but I don't have time."

### AFTER SocialSync + ReputationShield (30 days)

| Metric | State |
|--------|-------|
| Social media posts | 12+ per month, consistent |
| Platforms active | Facebook + Instagram + Google Business |
| Online visibility | Looks active, professional, trusted |
| Google reviews | 1–3 new per month |
| Review replies | 100% — all reviews responded to |
| Review requests | Auto-sent after every completed job |
| Negative reviews | Responded within 24 hours |

**Client perception:** "People keep telling me they see us on social media. We got 3 new reviews this month without asking."

---

## Objection Handling

**"I already post sometimes"**
> "That's great — but consistency is what matters. Posting once in a while actually looks worse than not posting at all. We make sure you're visible every week."

**"Can I see the posts first?"**
> "Absolutely. When we start, you can review every post before it goes live. Most clients switch to full autopilot within a week because the quality speaks for itself."

**"What if I get a bad review?"**
> "You'll get an instant alert. We draft a professional response — calm, empathetic, non-defensive. You can review it before we post, or we handle it automatically for positive reviews."

**"I don't have time for this"**
> "That's exactly the point — you don't have to do anything. Setup takes 5 minutes, and then we handle everything."

**"What's the catch?"**
> "No contracts. Cancel anytime. If it's not working after a month, just let us know."

---

## Demo Data Details

The seed function creates:

**8 Posts:**
- 3 published Facebook posts (tips, testimonial, educational)
- 2 published Instagram posts (before/after, pro tip)
- 1 published Google Business post
- 2 upcoming/queued posts (shows active scheduling)

**4 Reviews:**
- 2× five-star with replies (happy customers)
- 1× four-star with reply (minor complaint, handled well)
- 1× two-star without reply (shows "draft ready" for demo of reply flow)

**3 Review Requests:**
- 2× SMS sent
- 1× email sent
- All marked as delivered

**Profile:**
- Niche: Plumbing
- Location: Denver, CO
- Services: Drain cleaning, Water heater, Pipe replacement, etc.
- Autopilot: enabled
- All 3 platforms in preferences
