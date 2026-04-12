# PHASE 1A — SocialSync System Audit Report

## A. Executive Summary

- **SocialSync is a product definition + marketing shell only.** No backend implementation exists for content creation, scheduling, publishing, or platform connections.
- Full product marketing page, pricing (3 tiers: $99/$149/$199/mo), navigation, and onboarding fields are live on the frontend.
- SocialSync is registered in the service catalog with 6 fulfillment task templates and a 5-field onboarding template (seed script).
- **Zero API routes** exist for social media operations — no controllers, no services, no workers.
- **Zero database tables** exist for social posts, platform credentials, content calendars, or engagement metrics.
- **Zero OAuth implementations** exist for Facebook, Instagram, LinkedIn, or Google Business Profile.
- **Zero social platform SDK dependencies** are installed (no Meta SDK, no LinkedIn client, no Google API).
- The existing CRM infrastructure (clients, client_services, fulfillment_tasks, onboarding) is fully reusable for SocialSync delivery tracking.
- Existing AI service (Anthropic Claude SDK) is operational and reusable for content generation — currently used for chat/pricing but not wired for post creation.
- Existing job scheduler (node-cron) with retry logic, job logging, and notification queue patterns are directly reusable.
- SocialSync is categorized as a "done-for-you" service — the current architecture assumes human/supplier execution with automation assist, not fully automated self-serve.
- Competitor research document exists with 14 analyzed competitors across 4 categories.

---

## B. File Map

### Frontend

| File | What It Does | Relevance |
|------|-------------|-----------|
| `client/src/pages/products/ProductPage.tsx` | Full SocialSync product page with custom hero, problem/solution sections, comparison table, results, pricing intro, risk reversal. Conditional rendering via `product.slug === "socialsync"` (line ~3358). | **Critical** |
| `client/src/config/products.ts` (lines 276-317) | SocialSync product definition: slug, name, tagline, SEO, hero visual type "social", CTAs, highlights, how-it-works, FAQ, related products. | **Critical** |
| `shared/pricing.ts` (lines 329-376) | 3-tier pricing: Starter $99/mo (8 posts, 1 platform), Growth $149/mo (12 posts, FB+IG+Google), Pro $199/mo (20 posts, all platforms). | **Critical** |
| `shared/services.ts` (lines 192-209) | Service catalog entry: id "socialsync", category "visibility", fixes "low-visibility" + "low-search-ranking". | **Critical** |
| `client/src/config/onboardingFields.ts` (lines 157-173) | 4 SocialSync-specific onboarding fields: posting_frequency, business_type, content_style, branding_notes. | **Critical** |
| `client/src/pages/marketing/services.tsx` (lines 299-306) | SocialSync service card on marketing services page with icon, description, price. | Supporting |
| `client/src/pages/solutions/SolutionPage.tsx` (lines 127, 154) | SocialSync in roofer and cleaner solution stacks. | Supporting |
| `client/src/pages/PricingUnified.tsx` (lines 87-91) | SocialSync pricing config entry. | Supporting |
| `client/src/pages/marketing/pricing.tsx` (line 18) | SocialSync routing in pricing page. | Supporting |
| `client/src/site/navigation.ts` (line 62) | Nav entry: "SocialSync", href "/products/socialsync", icon "share2". | Supporting |
| `client/src/site/siteMap.ts` (line 18) | Footer link to SocialSync product page. | Supporting |
| `client/src/pages/portal/PortalServices.tsx` | Generic client portal services list — would show SocialSync as a service row. | Adjacent |
| `client/src/pages/portal/PortalServiceDetail.tsx` | Generic service detail page — would show SocialSync tasks, onboarding, payments. | Adjacent |
| `attached_assets/socialsync-icon_*.webp/png` | SocialSync brand icons (3 files). | Supporting |

### Backend

| File | What It Does | Relevance |
|------|-------------|-----------|
| `server/scripts/seed-services.ts` (lines 126-133) | 6 SocialSync task templates: collect onboarding, create calendar, design content (supplier), get approval (client), schedule posts (automation), send report (internal). | **Critical** |
| `server/scripts/seed-services.ts` (lines 255-264) | SocialSync onboarding template: 5 fields (platforms, posting_frequency, business_type, content_style, branding_notes). | **Critical** |
| `server/services/aiService.ts` | Anthropic Claude SDK wrapper: streaming + non-streaming chat, retry logic, model config. Reusable for content generation. | Adjacent |
| `server/jobs/scheduler.ts` | node-cron scheduler with retry logic (`withRetry`), job logging (`runJob`), 6 existing scheduled jobs. | Adjacent |
| `server/jobs/notificationWorker.ts` | Notification queue processor: email (nodemailer SMTP), SMS (Twilio), webhook POST. Rate limiting per calculator. | Adjacent |
| `server/jobs/followupWorker.ts` | Follow-up job processor with scheduled execution. | Adjacent |
| `server/jobs/weeklyReport.ts` | Weekly email report generation. | Adjacent |
| `server/routes/portalRoutes.ts` | Client portal API: services list, service detail, billing, settings, onboarding — all generic, works for any service including SocialSync. | Adjacent |
| `server/routes/adminCrmRoutes.ts` | Admin CRM routes: client management, service management, fulfillment tasks, onboarding — supports SocialSync delivery tracking. | Adjacent |
| `server/routes/stripeRoutes.ts` / `stripeBillingRoutes.ts` | Stripe billing: checkout, webhooks, subscription management. | Adjacent |
| `server/routes/marketingRoutes.ts` | Static marketing routes, includes "/products/socialsync" in sitemap. | Supporting |

### Database / Schema

| File | What It Does | Relevance |
|------|-------------|-----------|
| `shared/schemas/adminCrm.ts` | Full CRM schema: service_catalog, clients, client_services, fulfillment_tasks, service_task_templates, onboarding_templates, onboarding_submissions, client_payments, suppliers, orders, order_items, internal_notes, admin_activity_log. | **Critical** |
| `shared/schemas/db.ts` | Core app schema: users, calculators, leads, notification_queue, followup_jobs, job_logs, ai_conversations, ai_usage_logs, bookings, support_tickets, analytics_events. | Adjacent |

### Shared / Utils / Config

| File | What It Does | Relevance |
|------|-------------|-----------|
| `docs/socialsync-competitor-research.md` | 14-competitor analysis across 4 categories (done-for-you, self-serve, full-service, AI auto-posting). | **Critical** |

---

## C. Existing Functional Capabilities

| Capability | Status | Details |
|-----------|--------|---------|
| Product marketing UI | **EXISTS** | Full product page with custom sections, pricing, FAQ, CTAs |
| Pricing tiers | **EXISTS** | 3 tiers defined in shared/pricing.ts |
| Service catalog entry | **EXISTS** | Seeded with task templates and onboarding template |
| Navigation/routing | **EXISTS** | Product page accessible at /products/socialsync |
| Onboarding fields | **EXISTS** | 4 SocialSync-specific fields (posting_frequency, business_type, content_style, branding_notes) |
| Client portal (generic) | **EXISTS** | Services list, detail, billing, settings — works for SocialSync |
| Admin CRM (generic) | **EXISTS** | Client/service/task management — works for SocialSync |
| Fulfillment task workflow | **EXISTS** | 6 predefined task templates for monthly SocialSync delivery |
| Competitor research | **EXISTS** | Comprehensive 14-company analysis |
| Content generation | **DOES NOT EXIST** | No AI prompts, no generation service, no content pipeline |
| Post scheduling | **DOES NOT EXIST** | No scheduler, no queue, no calendar system |
| Publishing to platforms | **DOES NOT EXIST** | No API integrations with any social platform |
| Platform OAuth/connections | **DOES NOT EXIST** | No OAuth flow, no token storage, no credential management |
| Post history/logs | **DOES NOT EXIST** | No tables for published posts, no engagement tracking |
| Client social settings UI | **DOES NOT EXIST** | No dashboard for managing social preferences beyond onboarding |
| Media upload/handling | **DOES NOT EXIST** | No photo upload, no image processing, no storage integration |
| Engagement analytics | **DOES NOT EXIST** | No metrics collection, no reporting dashboard |

---

## D. Existing Reusable Infrastructure

### AI Generation Patterns
- **`server/services/aiService.ts`**: Anthropic Claude SDK wrapper with streaming/non-streaming, retry, model selection. Can be extended with SocialSync-specific prompts for caption/content generation.
- **`@anthropic-ai/sdk` v0.80.0** and **`openai` v6.22.0**: Both SDKs installed. Claude currently used; OpenAI available as fallback.

### Queue/Job Patterns
- **`server/jobs/scheduler.ts`**: node-cron scheduler with `withRetry()` (exponential backoff) and `runJob()` (job logging to `job_logs` table). New SocialSync jobs can follow this exact pattern.
- **`server/jobs/notificationWorker.ts`**: Queue processing pattern — polls `notification_queue` table, processes pending items with rate limiting and error tracking. Can be replicated for social post queue.
- **`server/jobs/followupWorker.ts`**: Scheduled job execution pattern with `run_at` timestamp and status tracking.

### CRM/Client Settings Patterns
- **`shared/schemas/adminCrm.ts`**: Full CRM schema with `clients`, `client_services`, `fulfillment_tasks`, `onboarding_submissions`. SocialSync delivery already fits this model (task templates seeded).
- **`server/routes/portalRoutes.ts`**: Client portal API already serves service lists, details, billing, onboarding for any service including SocialSync.
- **`server/routes/adminCrmRoutes.ts`**: Admin-side management of clients, services, tasks, suppliers — all SocialSync-compatible.

### Portal Controls
- **`client/src/pages/portal/PortalServices.tsx`** and **`PortalServiceDetail.tsx`**: Client-facing service views already render any service's tasks, status, and onboarding. SocialSync would appear automatically once a client has the service.

### Notification/Logging Systems
- **Email**: nodemailer SMTP transport configured (notificationWorker, weeklyReport).
- **SMS**: Twilio SDK installed and used for TradeLine.
- **Webhooks**: Generic webhook POST capability in notificationWorker.
- **Job Logs**: `job_logs` table with job_name, status, started_at, finished_at, error_message, metadata.
- **Admin Activity Log**: `admin_activity_log` table for audit trail (actor_type, action, entity_type, entity_id, summary).
- **AI Usage Logs**: `ai_usage_logs` table tracks model, provider, tokens, cost.

### Billing/Feature Gating Patterns
- **Stripe**: Full integration (stripe v20.3.1) with checkout, webhooks, subscription management. `service_catalog` has `stripe_product_id` and `stripe_price_id` fields.
- **Client Services**: `client_services.status` (pending/onboarding/active/paused/cancelled/completed) and `client_services.enabled` for feature gating.
- **Orders/Payments**: Full order and payment tracking with `orders`, `order_items`, `client_payments` tables.

---

## E. Missing or Incomplete Pieces

### Content Generation
- No AI prompt templates for social post captions, hashtags, or content calendars
- No content generation service/endpoint
- No batch content creation pipeline (monthly calendar generation)
- No content style/tone configuration beyond onboarding text field
- No content approval workflow API (task template exists as concept but no implementation)

### Scheduling
- No post scheduling table or queue
- No content calendar data model
- No time-slot optimization logic
- No per-platform scheduling rules (optimal posting times)
- No recurring schedule generation (monthly post batches)

### Publishing
- No Facebook Graph API integration
- No Instagram Graph API integration
- No LinkedIn API integration
- No Google Business Profile API integration
- No publish execution service
- No retry/error handling for failed publishes
- No platform-specific content formatting (character limits, image sizes)

### Account Connection
- No OAuth 2.0 flow for any social platform
- No token storage table (access_token, refresh_token, expiry)
- No token refresh mechanism
- No platform account discovery/selection UI
- No connection health monitoring
- No permission scope management

### Client Controls
- No client-facing dashboard for SocialSync (only generic portal)
- No content preview/approval UI
- No posting schedule view
- No photo upload interface for job photos
- No tone/frequency adjustment UI (beyond initial onboarding)
- No platform connection management UI

### Quality Control
- No content review queue for admin/human review
- No AI content quality scoring
- No brand guideline enforcement
- No duplicate content detection
- No content moderation

### Observability/Logs
- No social-specific analytics tables
- No engagement metric collection from platforms
- No post performance tracking
- No monthly engagement report generation (task template exists but no implementation)
- No error/failure alerting for publishing issues

### Scaling Readiness
- No Redis or persistent queue system (node-cron is in-memory only)
- No rate limiting for social platform API calls
- No batch processing for multiple clients
- No media CDN or cloud storage for post images
- No horizontal scaling strategy for workers

---

## F. Risk Notes

1. **In-memory scheduler fragility**: The current `node-cron` scheduler loses all scheduled jobs on server restart. For reliable post scheduling, a persistent queue (Bull/BullMQ + Redis, or PostgreSQL-based queue) is required.

2. **No OAuth infrastructure**: Building Facebook/Instagram/LinkedIn/Google OAuth from scratch is a significant effort. Each platform has distinct OAuth flows, scopes, and token refresh requirements. Facebook/Instagram require Meta App Review for production access.

3. **Meta App Review requirement**: Publishing to Facebook and Instagram requires Meta App Review approval with specific permissions (`pages_manage_posts`, `instagram_content_publish`). This is a non-trivial process with documentation, screencasts, and review cycles (weeks to months).

4. **Token expiry management**: Social platform tokens expire (Facebook: 60-day long-lived tokens, Instagram: same, LinkedIn: 365 days, Google: hourly with refresh). Without a token refresh worker, connections will silently break.

5. **No media storage**: Social posts require images/videos. There is no cloud storage (S3, Cloudinary, etc.) configured. Images need to be uploaded, resized per platform (Instagram 1080x1080, Facebook 1200x628, etc.), and served via CDN.

6. **Rate limits**: All social platforms enforce API rate limits. Without rate limiting and queuing, bulk publishing for multiple clients could trigger blocks.

7. **"Done-for-you" vs automation gap**: The seed data implies task step 3 ("Design & write post content") is handled by a "supplier" (human freelancer) and step 5 ("Schedule posts") by "automation". The actual automation layer connecting these concepts does not exist.

8. **No environment variables for social platforms**: Zero social API credentials, OAuth secrets, or platform configuration exist in the environment. These would need to be provisioned with each platform's developer portal.

9. **Single-process architecture**: The app appears to run as a single Node.js process. Social posting workers would benefit from dedicated worker processes, especially for handling platform API calls with retries.

10. **Content approval workflow gap**: While a "Get client approval" task template exists (step 4), there is no API or UI mechanism for clients to actually review and approve/reject generated content.

---

---
---

# PHASE 1B — SocialSync Automation Gap Audit (Deep Logic Review)

## A. End-to-End Automation Scorecard

| Stage | Status | Evidence | Notes |
|-------|--------|----------|-------|
| **Client profile input** | **Partial** | `shared/schemas/adminCrm.ts:30-52` (clients table), `server/scripts/seed-services.ts:255-264` (onboarding template with 5 fields: platforms, posting_frequency, business_type, content_style, branding_notes) | Clients table has `metadata` JSONB + `automation_enabled` flag. Onboarding captures social preferences. But no structured `socialSyncConfig` table — preferences stored as freetext in `onboarding_submissions.responses` JSONB. |
| **Topic generation** | **Missing** | No files | Zero topic generation logic. No prompt templates for generating social media topics. No topic calendar. No trade-specific topic libraries. |
| **Content generation** | **Missing** | No social-specific code. Reusable: `server/services/aiService.ts` (Claude SDK), `server/services/promptBuilder.ts` (prompt composition), `server/replit_integrations/batch/utils.ts` (batch processor) | AI infrastructure is production-grade but not wired for social content. No social-specific prompts, no caption templates, no hashtag generation. Batch processor (`batchProcess()`) with concurrency control + rate-limit detection exists and is directly reusable. |
| **Content storage** | **Missing** | No social posts table exists. Nearest: `shared/schemas/adminCrm.ts:134-167` (fulfillmentTasks has `metadata` JSONB) | No `social_posts` table. Could abuse `fulfillmentTasks.metadata` temporarily but not scalable. Need dedicated table with content, platforms, scheduled_at, published_at, engagement fields. |
| **Scheduling** | **Missing** | `server/jobs/scheduler.ts` (node-cron exists). No social scheduling. | Cron infrastructure exists with `withRetry()` and `runJob()` logging pattern. But zero scheduling logic for social posts — no scheduled_at timestamps, no time-slot optimization, no content calendar generation. |
| **Queue execution** | **Missing** | Pattern exists at `server/jobs/notificationWorker.ts:58-206` (poll → process → update). Schema: `shared/schemas/db.ts:73-85` (notification_queue table). | Proven queue pattern: fetch pending items (LIMIT 20), process sequentially, update status. **Can be replicated exactly** for social post queue. But current implementation has no concurrency, no locking, no distributed processing. |
| **Platform publishing** | **Missing** | Zero social platform SDK dependencies in `package.json`. No OAuth. No API integration code. | Nothing exists. No Facebook Graph API, no Instagram API, no LinkedIn API, no Google Business Profile API. No OAuth flows, no token storage, no publish execution. |
| **Publish result logging** | **Missing** | Pattern exists at `shared/schemas/adminCrm.ts:271-288` (admin_activity_log), `shared/schemas/db.ts:147-163` (job_logs) | Job logging infrastructure exists (`job_logs` table with job_name, status, error_message, metadata). Admin activity log tracks entity-level actions. But no social-specific logging (platform_post_ids, engagement metrics, publish errors). |
| **Duplicate prevention** | **Missing** | No deduplication logic anywhere | No caption dedup, no content fingerprinting, no anti-repetition tracking. |
| **QA / quality filtering** | **Missing** | No content quality checks | No AI self-review, no banned phrase filtering, no quality scoring, no brand guideline enforcement. |
| **Client controls** | **Partial** | `shared/schemas/adminCrm.ts:55-78` (clientServices has `automation_enabled`, `human_review_required`, `metadata` JSONB) | Automation toggle and review flag exist on `client_services`. `metadata` JSONB can store per-client settings. But no UI for client-side control beyond initial onboarding fields. |

---

## B. Confirmed Gaps

### Architecture Gaps
1. **No dedicated social posting worker process** — scheduler runs in main Express server thread (`server/index.ts` line 141 calls `initScheduler()`). Social posting should be a separate worker to avoid blocking HTTP.
2. **No persistent queue system** — `node-cron` is in-memory only. Server restart loses all scheduled cron ticks. Posts scheduled for specific times have no persistence.
3. **No distributed locking** — if multiple instances run, all will execute the same cron jobs simultaneously, causing duplicate posts. No pessimistic locking on queue reads.
4. **No concurrency in workers** — all workers use sequential `for` loops. `notificationWorker.ts:67`: `for (const notif of pending) { await ... }`. At ~1s per API call, this caps at ~20 items/minute.
5. **No exponential backoff on queue retries** — failed items retry on next 1-minute cron tick. No jitter, no increasing delay.

### Automation Gaps
6. **No content generation pipeline** — zero prompt templates for social media. No caption, hashtag, CTA, or topic generation.
7. **No content calendar generation** — no logic to plan a month of content across different content categories (tips, before/after, promotions, testimonials).
8. **No content approval workflow API** — task template "Get client approval" exists conceptually (`seed-services.ts:130`) but no endpoint for clients to review/approve/reject generated content.
9. **No auto-scheduling logic** — no optimal time selection, no per-platform scheduling rules, no timezone-aware scheduling.
10. **No post status lifecycle management** — no state machine for: draft → scheduled → publishing → published → failed.

### Platform Gaps
11. **No Facebook Graph API integration** — no SDK, no OAuth, no publishing endpoint.
12. **No Instagram Graph API integration** — no SDK, no OAuth, no publishing endpoint.
13. **No LinkedIn API integration** — no SDK, no OAuth, no publishing endpoint.
14. **No Google Business Profile API integration** — no SDK, no OAuth, no posting endpoint.
15. **No OAuth token storage** — no table for access_token, refresh_token, token_expires_at per client per platform.
16. **No token refresh mechanism** — tokens expire (Facebook: 60 days, Google: 1 hour with refresh). No background refresh worker.
17. **No platform-specific content formatting** — no character limit enforcement (LinkedIn: 3000, Twitter/X: 280, Instagram caption: 2200), no image dimension validation.

### Data/Model Gaps
18. **No `social_posts` table** — no persistent storage for generated content, scheduling, publish state, or engagement.
19. **No `social_connections` table** — no storage for OAuth credentials per client per platform.
20. **No `social_sync_config` table** — no structured per-client configuration (tone, frequency, platforms, posting times, timezone).
21. **No content template library** — no seeded trade-specific post templates or category taxonomy.
22. **No engagement metrics storage** — no table for likes, comments, shares, reach per post per platform.

### Scaling Gaps
23. **Sequential processing bottleneck** — current worker throughput: ~20 items/minute (1-2s per external API call × LIMIT 20). For 100 clients × 3 posts/week = ~43 posts/day — manageable initially but fragile.
24. **No per-platform rate limiting** — Facebook/Instagram API rate limits (200 calls/user/hour) not tracked. No rate limiter per platform.
25. **No batch database operations** — each item processed individually with separate queries. No bulk insert/update.
26. **No dead letter queue** — permanently failed items stay in queue with `max_attempts` exhausted. No separate handling for poison messages.
27. **Single SMTP provider bottleneck** — notification emails share SMTP transport with social-related emails. No provider isolation.

### Trust/Quality Gaps
28. **No duplicate caption detection** — could post identical content twice.
29. **No spam/abuse detection** — no filtering for inappropriate content.
30. **No banned phrase list** — no word blocklist for auto-generated content.
31. **No AI output quality scoring** — no confidence score, no minimum quality threshold.
32. **No brand guideline enforcement** — tone/style preferences captured in onboarding but never validated against output.
33. **No geographic/service relevance validation** — generated content not verified against client's actual service area or offered services.

---

## C. Must-Build Components

### Tier 1: Core Engine (Must have before any posting)
1. **`social_posts` table** — Store post content, platforms, scheduled_at, published_at, status, platform_post_ids, engagement_metrics.
2. **`social_connections` table** — Store per-client platform OAuth credentials (access_token, refresh_token, expires_at, platform, account_id, scopes).
3. **`social_sync_config` table** — Store per-client settings (tone, frequency, platforms, posting_times, timezone, content_categories, hashtags).
4. **Content generation service** — AI prompt templates for caption + hashtag generation, using existing `aiService.ts` + `promptBuilder.ts` patterns. Must support trade-specific, tone-controlled, platform-formatted output.
5. **Post scheduling service** — Create posts with `scheduled_at`, manage status lifecycle (draft → approved → scheduled → publishing → published / failed).
6. **Social posting worker** — Cron job (following `notificationWorker.ts` pattern) that polls due posts, publishes to platforms, logs results.
7. **Platform publish adapters** — Facebook Graph API, Instagram Graph API, Google Business Profile API, LinkedIn API integration modules with publish + error handling.
8. **OAuth connection flow** — Server routes for initiating OAuth, handling callbacks, storing tokens. Per-platform implementation.
9. **Token refresh worker** — Background job to proactively refresh expiring tokens before they expire.

### Tier 2: Quality & Control (Must have before scale)
10. **Content quality gate** — AI self-review step: check generated content for quality, relevance, tone match, duplicate detection before scheduling.
11. **Duplicate detection** — Content fingerprinting or similarity check against recent posts for same client.
12. **Content approval API** — Endpoints for clients/admins to review, approve, reject, or edit generated content before publishing.
13. **Per-platform rate limiter** — Track API calls per platform per client, enforce limits, queue overflow.
14. **Post status lifecycle manager** — State machine with proper transitions, error recovery, and admin override.

### Tier 3: Scale & Observability (Must have before 100+ clients)
15. **Persistent job queue** — Replace node-cron polling with PostgreSQL-backed queue (using `SKIP LOCKED` for concurrency) or Redis/BullMQ for higher throughput.
16. **Worker process separation** — Extract social posting worker from main Express process into dedicated worker(s).
17. **Batch content generation** — Monthly calendar generator that produces all posts for a client in one batch using `batchProcess()` utility.
18. **Engagement metrics collector** — Worker that pulls likes/comments/shares from platform APIs and stores in social_posts.
19. **Failure alerting** — Notify admin when publishing fails, tokens expire, or quality gate rejects content.
20. **Admin dashboard for SocialSync** — View all clients' posting status, upcoming schedule, recent engagement, connection health.

---

## D. Recommended Build Order

| Priority | Component | Depends On | Rationale |
|----------|-----------|------------|-----------|
| **1** | `social_posts` + `social_connections` + `social_sync_config` DB tables | Nothing | Foundation — everything else needs these tables |
| **2** | Content generation service (AI prompts + generation endpoint) | Tables | Core value — produces the content |
| **3** | OAuth connection flow (Facebook + Instagram first) | `social_connections` table | Cannot publish without platform access |
| **4** | Platform publish adapters (Facebook + Instagram first) | OAuth flow | Core delivery — actually posts content |
| **5** | Social posting worker (cron job) | Tables + publish adapters | Automation — posts without human trigger |
| **6** | Post scheduling service + status lifecycle | Tables + worker | Control layer — schedule posts for optimal times |
| **7** | Token refresh worker | `social_connections` table | Reliability — prevent silent auth failures |
| **8** | Content quality gate + duplicate detection | Generation service | Trust — prevent bad/repeated content |
| **9** | Content approval API + client UI | Quality gate | Control — let clients approve before publish |
| **10** | Batch content calendar generation | Generation service + scheduling | Scale — generate a month of content at once |
| **11** | Google Business Profile + LinkedIn adapters | OAuth pattern from #3 | Platform expansion |
| **12** | Engagement metrics collector | Publish adapters + tables | Analytics — track post performance |
| **13** | Per-platform rate limiter | Publish adapters | Scale protection |
| **14** | Persistent queue + worker separation | Existing worker pattern | Scale — handle 100+ clients reliably |
| **15** | Admin dashboard + failure alerting | All above | Observability — monitor the system |

---

## E. Final Audit Verdict

**"Has reusable infrastructure but SocialSync core missing"**

- SocialSync exists as a fully marketed product with pricing, product pages, navigation, onboarding fields, and CRM task templates — the commercial shell is complete.
- The **AI generation infrastructure is production-grade and 90% reusable**: Anthropic SDK with retry (`aiService.ts`), prompt composition with knowledge injection (`promptBuilder.ts`), batch processing with rate-limit awareness (`batch/utils.ts`), and usage tracking (`usageTracker.ts`). Only social-specific prompts need to be added.
- The **CRM/data model is well-designed for multi-tenancy**: proper `client_id` scoping on all queries, `automation_enabled` and `human_review_required` flags on `client_services`, JSONB `metadata` fields for extensible per-client config, and a proven provisioning orchestration pattern.
- The **job/queue pattern is proven but limited**: `notificationWorker.ts` demonstrates a working poll-process-update pattern, but it's sequential, single-threaded, in-memory cron, with no locking or concurrency — adequate for initial launch but not for 100+ clients.
- The **entire social posting engine is missing**: zero platform API integration, zero OAuth, zero content generation, zero scheduling, zero publishing, zero engagement tracking. Every component from content creation through publishing must be built.
- The **cost of AI content generation is negligible**: ~$0.30 per 1,000 text-only posts using Claude Haiku. At scale (100 clients × 12 posts/month), the AI cost would be ~$0.36/month total.
- The gap between "product shell" and "working product" is **significant but well-scoped**: ~15 distinct components need to be built, with a clear dependency chain and proven patterns to follow from the existing codebase.
- **Meta App Review is the longest-lead-time risk**: Publishing to Facebook/Instagram requires formal review with documentation and screencasts, typically taking weeks. This should start immediately in parallel with development.
- The existing batch utility (`batchProcess()` in `replit_integrations/batch/utils.ts`) with concurrency control, exponential backoff, and rate-limit detection is an **unexpectedly powerful asset** that eliminates the need to build batch infrastructure from scratch.
- **Dual AI stack (Claude + OpenAI)** is already installed and configured, giving flexibility for content generation model selection and fallback.

**Ready for PHASE 2.**
