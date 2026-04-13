# RankFlow™ — Delivery Playbook

Internal operations guide for consistent, high-quality RankFlow service delivery.

---

## Monthly Delivery Flow

```
CLIENT ONBOARDING (automated)
  ↓
PLAN GENERATION (automated, Monday 4AM UTC)
  ↓
TASK CREATION (automated, keyword-cluster-driven)
  ↓
AI EXECUTION (automated: drafts, meta, schema, briefs)
  ↓
ADMIN REVIEW (manual: approve/reject AI output)
  ↓
VENDOR BATCHING (auto-draft, admin assigns)
  ↓
VENDOR EXECUTION (manual: vendors complete + submit proof)
  ↓
QA (automated checks + admin review)
  ↓
TRACKING (automated: weekly rankings + index checks)
  ↓
CLIENT DASHBOARD (automated: narrative, metrics, highlights)
```

---

## What Is Automated vs Manual

| Step | Automated | Manual |
|------|-----------|--------|
| Onboarding | YES (portal wizard) | - |
| Keyword generation | YES (niche × location) | - |
| Plan generation | YES (tier quotas) | - |
| Task creation | YES (keyword clusters) | - |
| AI content drafts | YES | Admin review recommended |
| AI meta suggestions | YES | Admin review |
| AI schema generation | YES | Admin validates |
| Outsourced task batching | YES (draft batches) | Admin assigns vendors |
| Vendor work | - | Vendor executes + submits proof |
| QA checks | YES (automated) | Admin final approval |
| Ranking tracking | YES (weekly) | - |
| Index checking | YES (weekly) | - |
| Client dashboard | YES (auto-updates) | - |

---

## Vendor Categories

### 1. Citation Vendor
- **Tasks:** citation_build only
- **Cost:** $1–$5 per citation
- **Turnaround:** 3–14 days
- **Risk:** Low
- **QA:** Strict — listing must be live, NAP exact, approved directory
- **Sourcing:** Fiverr sellers with 4.8+ rating, 100+ reviews, real directory portfolio

### 2. Content Vendor
- **Tasks:** page_create (polish + upload)
- **Cost:** $10–$30 per page
- **Turnaround:** 2–5 days
- **Risk:** Low
- **QA:** Strict — 800+ words, structured, location-specific, CTA present
- **Sourcing:** Fiverr writers with SEO experience, native English

### 3. On-Page Vendor
- **Tasks:** meta_fix, internal_linking, schema_basic
- **Cost:** $5–$20 per task
- **Turnaround:** 1–3 days
- **Risk:** Medium (requires CMS access)
- **QA:** Standard — verify changes live, no stuffing, links work
- **Sourcing:** Fiverr sellers with WordPress SEO experience

### 4. Internal AI
- **Tasks:** page_create (draft), meta_fix, content_support, schema_basic
- **Cost:** $0–$2 per task
- **Turnaround:** Instant
- **Risk:** Low
- **QA:** Standard — auto-QA catches obvious issues, admin review for pages

---

## Task → Vendor Mapping

| Task Type | Primary | Fallback | CMS Needed |
|-----------|---------|----------|------------|
| citation_build | Citation vendor | — | No |
| page_create | AI draft → Content vendor upload | — | Yes |
| meta_fix | AI suggestion → Admin/On-page vendor | On-page vendor | Yes |
| internal_linking | On-page vendor | — | Yes |
| schema_basic | AI generation → Admin/On-page vendor | On-page vendor | Yes |
| content_support | AI brief → Admin review | — | No |

---

## SOPs by Task Type

### Citation Build
1. Admin prepares NAP from client profile
2. Admin batches citations (5–15 per batch)
3. Admin assigns to citation vendor with dispatch packet
4. Vendor submits to approved directories only
5. Vendor provides live URL per listing
6. QA: verify listing live + NAP exact + directory approved + indexable

**Reject if:** fake directory, NAP mismatch, noindex page, duplicate listing

### Page Creation
1. AI generates draft from keyword cluster
2. Admin reviews for quality (no generic filler, location present)
3. Content vendor polishes and uploads to CMS
4. Vendor provides live page URL
5. QA: 800+ words, H1/H2 structure, location, CTA, internal links, unique

**Reject if:** under 800 words, no structure, no location, no CTA, duplicate content

### Title/Meta Optimization
1. AI generates title + meta recommendation
2. Admin reviews (length, keyword, uniqueness)
3. Admin or on-page vendor implements in CMS
4. Verify changes live

**Reject if:** title >60ch, meta >155ch, keyword stuffing, duplicate, generic

### Internal Linking
1. Admin maps linking opportunities
2. On-page vendor adds 2–3 contextual links per page
3. QA: links work, anchor text descriptive, pages related

**Reject if:** generic anchors ("click here"), broken links, irrelevant pages

### Schema Markup
1. AI generates LocalBusiness + Service JSON-LD
2. Admin validates with Rich Results Test
3. Admin or vendor injects into page head
4. Verify schema live on page

**Reject if:** invalid JSON-LD, wrong NAP, missing fields, not on live page

### Content Brief
1. AI generates brief with keyword targets + topic outlines
2. Admin reviews for specificity and relevance

**Reject if:** too vague, no keywords, generic topics

---

## Service Boundaries

### RankFlow INCLUDES:
- Keyword research and local targeting
- Title and meta description optimization
- SEO page creation (AI-drafted, human-reviewed)
- Local citation building (approved directories only)
- Internal linking between service pages
- LocalBusiness schema markup
- Google Search Console monitoring
- Monthly progress reporting via client dashboard
- Content briefs and strategy recommendations

### RankFlow DOES NOT INCLUDE:
- Website redesign/rebuild → SiteLaunch
- Speed optimization / Core Web Vitals → WebFix / WebCare
- Google Ads / paid advertising → AdFlow
- Social media management → SocialSync
- Review management → ReputationShield
- Google Business Profile management → MapGuard
- Aggressive backlink schemes or link buying
- Guaranteed ranking positions
- Custom development or server-level changes
- Penalty recovery or disavow management
- International or multi-language SEO
- eCommerce product SEO

---

## Cost Guardrails

| Task Type | Max Cost Per Task | Flag If Exceeds |
|-----------|-------------------|-----------------|
| citation_build | $10 | Yes |
| page_create | $30 | Yes |
| meta_fix | $5 | Yes |
| internal_linking | $15 | Yes |
| schema_basic | $10 | Yes |
| content_support | $5 | Yes |

Vendor cost per task should stay within expected range.
System flags over-budget tasks in QA results.

---

## Operator Checklist (Weekly)

- [ ] Check if new plans were auto-generated (Monday)
- [ ] Review AI-completed tasks — approve or reject
- [ ] Review draft vendor batches — assign to vendors
- [ ] Check submitted vendor work — run QA
- [ ] Approve passing tasks, reject failing ones
- [ ] Check tracking results (Wednesday) — flag any drops
- [ ] Verify client dashboards showing accurate data
