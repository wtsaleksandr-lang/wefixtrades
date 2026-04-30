# RankFlow Full Current-State Audit

**Date:** 2026-04-09
**Scope:** Complete codebase audit of RankFlow within WeFixTrades SaaS

---

## A. Executive Summary

- **RankFlow™ is defined as a product/service** across pricing, navigation, product pages, and service catalog — with 3 pricing tiers (Starter $349, Growth $599, Pro $899/mo)
- **No dedicated RankFlow backend engine exists.** There is zero server-side code under `/api/rankflow/*` — no keyword tracking, no rank monitoring, no content workflows, no backlink analysis, no scheduled SEO reports
- **A powerful one-time audit engine exists** (`server/auditRoutes.ts`, ~3,000 lines) that performs comprehensive local SEO audits using 6+ external APIs + AI — but this is a lead-gen/marketing tool, not an ongoing service engine
- **The audit engine is production-grade:** Google Places, PageSpeed/Lighthouse, Outscraper (competitors + reviews), Serper (rankings), DataForSEO (volumes), AI scoring, PDF generation, email follow-ups
- **Frontend surfaces are marketing-only:** product page, pricing cards, service references, navigation entries — all describe what RankFlow *promises* but none deliver ongoing SEO functionality
- **CRM infrastructure supports RankFlow as a service line:** clients, client_services, fulfillment tasks, onboarding templates, payments — but no RankFlow-specific task templates or workflows are seeded
- **No recurring SEO job exists in the scheduler** — no weekly rank checks, no monthly reports, no backlink monitoring, no content calendar automation
- **The gap between promise and delivery is total:** RankFlow sells "Ongoing SEO that brings consistent traffic and leads" but the codebase delivers zero ongoing functionality
- **Reusable infrastructure is strong:** CRM, Stripe billing, AI service, job scheduler, email system, PDF generator, auth, portal — all production-ready and directly reusable
- **Verdict: marketing shell with strong adjacent infrastructure**

---

## B. File Map

### Frontend

| File | What it does | Relevance |
|------|-------------|-----------|
| `client/src/config/products.ts:362-402` | Full RankFlow product page config (slug, hero, highlights, outcomes, how-it-works, FAQ, pricing) | **Critical** |
| `shared/pricing.ts:411-461` | RankFlow pricing definition — 3 tiers with feature lists | **Critical** |
| `client/src/config/pricing.ts` | Client-side pricing re-exports/references | Supporting |
| `client/src/pages/PricingUnified.tsx` | Unified pricing page — shows RankFlow with service info bullets | **Critical** |
| `client/src/pages/marketing/services.tsx` | Growth services listing — RankFlow card with description and pricing | Supporting |
| `client/src/pages/marketing/solutions-visibility.tsx` | Visibility solutions page — RankFlow service card | Supporting |
| `client/src/pages/solutions/SolutionPage.tsx` | Trade-specific solution recommendations — references RankFlow in stacks | Supporting |
| `client/src/site/navigation.ts` | Main nav — RankFlow in Products dropdown | Supporting |
| `client/src/site/siteMap.ts` | Footer/sitemap — RankFlow product entry | Supporting |
| `client/src/components/marketing/MarketingLayout.tsx` | Marketing layout — references RankFlow | Adjacent |
| `client/src/config/onboardingFields.ts` | Onboarding field enrichment — RankFlow/WebFix goal field (speed/seo/both) | Supporting |
| `client/src/pages/admin/ServicesPage.tsx` | Admin service catalog — lists RankFlow as a core service | Supporting |
| `client/src/pages/portal/PortalServices.tsx` | Client portal service list — displays purchased services incl. RankFlow | Supporting |
| `client/src/pages/portal/PortalServiceDetail.tsx` | Service detail view — shows status, tasks, payments for any service | Supporting |
| `client/src/pages/marketing/FreeAudit.tsx` | Free audit marketing tool — lead-gen that feeds into RankFlow upsell | Adjacent |
| `client/src/pages/marketing/SharedAuditReport.tsx` | Shared audit report viewer | Adjacent |
| `client/src/pages/marketing/ReportView.tsx` | Interactive audit report display with SEO metrics | Adjacent |

### Backend

| File | What it does | Relevance |
|------|-------------|-----------|
| `server/auditRoutes.ts` (~2,982 lines) | Complete one-time local SEO audit engine — Google Places, PageSpeed, Outscraper, Serper, DataForSEO, AI scoring, report generation | **Critical** (adjacent — audit engine, not ongoing SEO) |
| `server/lib/auditFollowup.ts` | 4-email follow-up sequence after audit completion | Supporting |
| `server/jobs/auditFollowupWorker.ts` | Processes queued audit follow-up emails (every minute) | Supporting |
| `server/lib/sendAuditReport.ts` | Email delivery of audit reports with PDF attachment | Supporting |
| `server/lib/reportEmailTemplate.ts` | HTML email template for audit reports | Supporting |
| `server/lib/pdfGenerator.ts` | PDF report generation using PDFKit | Supporting |
| `server/services/promptBuilder.ts:88` | AI prompt — mentions RankFlow for SEO/speed recommendations | Supporting |
| `server/routes/marketingRoutes.ts:23` | Registers `/products/rankflow` for SSR/sitemap | Supporting |
| `server/routes/portalRoutes.ts:747` | Portal AI copilot knows about RankFlow as a service | Supporting |
| `server/routes/adminCrmRoutes.ts` | CRM routes — manages clients, services, tasks, payments | Adjacent (reusable) |
| `server/routes/stripeBillingRoutes.ts` | Stripe checkout/webhook — provisions services on payment | Adjacent (reusable) |
| `server/routes/publicCheckoutRoutes.ts` | Public checkout flow for service purchase | Adjacent (reusable) |
| `server/jobs/scheduler.ts` | Cron job orchestrator — no RankFlow-specific jobs registered | Adjacent (reusable) |
| `server/services/aiService.ts` | Claude Haiku client with streaming/retry | Adjacent (reusable) |
| `server/services/assistant.ts` | Unified AI assistant with memory and surfaces | Adjacent (reusable) |

### Database / Schema

| File | What it defines | Relevance |
|------|----------------|-----------|
| `shared/schemas/db.ts:398-410` | `auditReports` table — id (uuid), business_name, business_place_id, audit_data (jsonb), ai_narrative (jsonb), view_count | **Critical** (audit data store) |
| `shared/schemas/db.ts:296-319` | `auditSubmissions` table — lead capture from audit (email, name, scores, report_json) | **Critical** (audit leads) |
| `shared/schemas/db.ts:322-346` | `auditFollowupEmails` table — follow-up email queue | Supporting |
| `shared/schemas/adminCrm.ts:7-27` | `serviceCatalog` table — service definitions with Stripe IDs | **Critical** (reusable) |
| `shared/schemas/adminCrm.ts:30-52` | `clients` table — client records with status, trade_type, stripe_customer_id | **Critical** (reusable) |
| `shared/schemas/adminCrm.ts:55-78` | `clientServices` table — service assignments with status, pricing, fulfillment_mode | **Critical** (reusable) |
| `shared/schemas/adminCrm.ts:134-167` | `fulfillmentTasks` table — task management with status, priority, assignment, automation | **Critical** (reusable) |
| `shared/schemas/adminCrm.ts:170-186` | `serviceTaskTemplates` table — recurring/setup task templates per service | **Critical** (reusable) |
| `shared/schemas/adminCrm.ts:189-225` | `onboardingTemplates` + `onboardingSubmissions` — client data collection | **Critical** (reusable) |
| `shared/schemas/adminCrm.ts:228-249` | `clientPayments` table — invoicing and payment tracking | Supporting (reusable) |
| `shared/schemas/adminCrm.ts:81-112` | `orders` + `orderItems` — order management | Adjacent (reusable) |

### Shared / Config

| File | What it defines | Relevance |
|------|----------------|-----------|
| `shared/services.ts` | Service catalog definitions — RankFlow entry with pricing, features | **Critical** |
| `shared/pricing.ts` | Centralized pricing source of truth — all RankFlow tiers | **Critical** |
| `shared/pricingConfig.ts` | Service matching logic (audit issue → service recommendation) | Supporting |
| `server/data/services.ts` | Server-side service catalog data | Supporting |
| `server/scripts/seed-services.ts` | Catalog DB seeder (no RankFlow-specific task templates found) | Supporting |

---

## C. Current Functional Capabilities

What clearly works today related to RankFlow:

1. **One-time SEO audit** — Full end-to-end: business search → data collection from 6+ APIs → scoring (0-100 with letter grades) → AI-generated narrative → report storage → shareable link → PDF download → email delivery
2. **Marketing/product pages** — RankFlow product page with SEO metadata, pricing, FAQ, how-it-works, hero
3. **Pricing display** — 3 tiers shown on unified pricing page and product page
4. **Service catalog entry** — RankFlow defined as a service that can be provisioned to clients via CRM
5. **Stripe checkout** — Infrastructure exists to sell RankFlow subscriptions (checkout session → webhook → service provisioning)
6. **Client portal shell** — Clients with RankFlow service assigned can see it in their portal dashboard (status, tasks, payments)
7. **AI copilot reference** — Portal and admin AI assistants can recommend RankFlow when discussing SEO needs
8. **Lead capture** — Audit tool captures leads (email, business info) that can feed into RankFlow sales pipeline
9. **Follow-up email nurture** — 4-step automated email sequence after audit completion to convert leads

**What does NOT work today for RankFlow as an ongoing service:** Everything. No keyword tracking, no rank monitoring, no content creation workflows, no backlink analysis, no competitor tracking, no recurring reports, no SEO dashboard, no client-facing progress view.

---

## D. Existing Reusable Infrastructure

| System | Key Files | Maturity | RankFlow Reuse Potential |
|--------|-----------|----------|------------------------|
| **CRM** | `server/routes/adminCrmRoutes.ts`, `shared/schemas/adminCrm.ts` | Production | Client management, service provisioning, task tracking |
| **Fulfillment Tasks** | `fulfillmentTasks` table + admin UI | Production | Monthly RankFlow deliverable tracking (keyword research, content, link building) |
| **Service Task Templates** | `serviceTaskTemplates` table | Production | Define recurring/setup RankFlow tasks |
| **Onboarding** | `onboardingTemplates` + `onboardingSubmissions` | Production | Collect target keywords, competitor URLs, site access, Google accounts |
| **Stripe Billing** | `server/routes/stripeBillingRoutes.ts` | Production | RankFlow subscription checkout, invoicing, webhook handling |
| **Job Scheduler** | `server/jobs/scheduler.ts` (node-cron) | Production | Schedule weekly rank checks, monthly reports, competitor scans |
| **Email System** | `server/lib/emailTransport.ts`, notification queue | Production | RankFlow report delivery, ranking alerts, follow-ups |
| **PDF Generator** | `server/lib/pdfGenerator.ts` (PDFKit) | Production | Monthly SEO performance PDFs |
| **AI Service** | `server/services/aiService.ts` (Claude) | Production | SEO analysis, content recommendations, issue prioritization |
| **Auth & Portal** | `server/auth.ts`, portal routes | Production | Client login, RBAC, portal access for RankFlow reports |
| **Dashboard Patterns** | Admin + Portal layouts, Recharts, stat cards | Production | RankFlow admin and client dashboards |
| **Audit Engine** | `server/auditRoutes.ts` | Production | Baseline data collection, scoring engine, API integrations (Serper, DataForSEO, Outscraper, PageSpeed) |
| **External API Integrations** | Google Places, PageSpeed, Serper, DataForSEO, Outscraper | Production | Reuse for ongoing keyword/rank monitoring |

---

## E. Missing / Partial / Mock Pieces

### Backend / Core Logic — MISSING ENTIRELY
- No `/api/rankflow/*` routes
- No keyword rank tracking engine (periodic SERP checks)
- No backlink monitoring or analysis
- No content creation workflow or content calendar
- No link building tracking
- No technical SEO monitoring (recurring site crawls)
- No competitor position tracking over time
- No on-page SEO analysis engine for client pages
- No schema markup detection/recommendation engine
- No Google Search Console integration (mentioned in pricing, not implemented)
- No Google Analytics integration

### Data / Reporting — MISSING ENTIRELY
- No RankFlow-specific database tables (keyword_rankings, rank_history, backlinks, content_items, seo_issues, etc.)
- No historical ranking data storage
- No trend calculation or progress tracking
- No RankFlow-specific report templates
- No monthly/bi-weekly/weekly automated report generation
- No reporting dashboard data endpoints

### Automation — MISSING ENTIRELY
- No scheduled rank checking jobs
- No automated competitor monitoring
- No content publishing automation
- No alert system for ranking changes (drops or gains)
- No automated technical SEO scanning
- No recurring audit scheduling for RankFlow clients

### Admin Tools — PARTIAL (generic CRM only)
- Generic CRM can manage RankFlow as a service line (exists)
- Fulfillment tasks can be manually created (exists)
- No RankFlow-specific admin dashboard (ranking overview, client performance)
- No bulk keyword management UI
- No content approval workflow
- No RankFlow task templates seeded in DB
- No RankFlow onboarding template seeded in DB

### Client Portal — SHELL ONLY
- Portal can display RankFlow service status (exists)
- Portal can show tasks assigned to client (exists)
- No keyword ranking dashboard for clients
- No traffic/organic growth charts
- No content calendar view
- No competitor comparison view
- No progress timeline showing ranking improvements
- No actionable insights or recommendations feed

### Productization — MARKETING SHELL ONLY
- Product page with full copy and pricing (exists)
- Pricing tiers defined with features (exists)
- Navigation and sitemap entries (exist)
- No connection between what's sold and what's delivered
- Features listed in pricing tiers (keyword research, content creation, link building, reports) have zero backend implementation
- No way to measure or demonstrate ROI to clients

---

## F. Risks / Constraints

1. **Promise-delivery gap is the #1 risk.** The product page sells sophisticated ongoing SEO services that don't exist. If a client pays $599/mo for "Growth", they get a generic CRM task — no actual SEO delivery infrastructure.

2. **Audit engine ≠ RankFlow engine.** The audit is a one-time lead-gen tool. It shares API integrations (Serper, DataForSEO) that RankFlow can reuse, but the audit engine was not designed for recurring execution or historical tracking.

3. **No historical data model.** RankFlow needs time-series data (rankings over weeks/months, traffic trends, backlink growth). The current schema has no temporal tracking tables — only snapshot-based audit reports.

4. **External API costs will scale.** Serper, DataForSEO, Outscraper, Google APIs all have per-request pricing. A recurring RankFlow service monitoring 20+ keywords weekly for 50+ clients will have meaningful API costs that need pricing model validation.

5. **File-based cache won't scale.** The audit engine uses `.keyword-cache.json` for API result caching. This is a single-file approach that will fail under concurrent access or multi-process deployment.

6. **No Google Search Console or Analytics integration.** Both are mentioned in pricing tiers and are essential for a real SEO service. Neither has any implementation.

7. **Monolithic audit route file.** `auditRoutes.ts` at ~3,000 lines contains all audit logic inline. When building RankFlow, extracting reusable functions (scoring, API calls, analysis) into separate modules will be necessary.

8. **Single-server scheduler.** The node-cron scheduler runs on one process. For a multi-client recurring SEO service, this will need consideration for reliability and scalability.

9. **No content delivery mechanism.** RankFlow Growth/Pro tiers promise content creation (2-4 pages/mo). There's no CMS integration, no content staging, no publishing workflow, and no way to track content deliverables.

10. **Canada-centric hardcoding.** The audit engine has Canada-specific geographic bias, province detection, and currency assumptions. RankFlow will need configurable locality if expanding beyond Canada.

---

## G. Final Verdict

**UI exists but engine missing**

1. RankFlow has a complete **marketing presence** — product page, pricing, navigation, service catalog entry, SEO metadata — all polished and production-ready.

2. **Zero backend engine** exists for the ongoing SEO service that RankFlow promises. No `/api/rankflow/*` routes, no recurring jobs, no data model for tracking rankings/content/backlinks over time.

3. A powerful **one-time audit engine** exists that can serve as the foundation — its API integrations (Serper for rankings, DataForSEO for volumes, Outscraper for competitors) and scoring logic are directly reusable.

4. The **CRM and fulfillment system** can track RankFlow as a service line and manage tasks, but no RankFlow-specific workflows, templates, or automation are configured.

5. The **client portal** can display RankFlow service status and tasks, but has no SEO-specific dashboards, ranking charts, or progress visualization.

6. **Infrastructure is strong:** Stripe billing, job scheduler, email system, PDF generation, AI service, auth/portal — all production-ready and directly reusable for building the RankFlow engine.

7. The core gap is: **there is no "engine" that takes a client subscription and continuously delivers SEO value** — no rank tracking loop, no content pipeline, no automated reporting, no competitive monitoring.

8. Building the RankFlow engine requires: new database tables (ranking history, keyword targets, content items, backlink records, SEO issues), new API routes, new scheduled jobs, new client/admin dashboard surfaces, and connections to the existing CRM/billing infrastructure.

9. The audit-to-RankFlow pipeline is a **natural conversion path** — audit identifies problems, RankFlow fixes them ongoing — but the bridge (converting audit findings into a RankFlow client setup) doesn't exist yet.

10. **Estimated scope to reach MVP:** Significant. New schema, new backend engine, new scheduler jobs, new admin UI, new client dashboard — but the surrounding infrastructure means you're building the engine, not the entire SaaS.

---

Ready for RankFlow competitor research.
