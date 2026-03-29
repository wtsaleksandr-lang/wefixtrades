# Audit Report Architecture Analysis

> **Status:** Planning & system design (no implementation)
> **Date:** 2026-03-29
> **Goal:** Define data structure, system architecture, and gaps for social sharing, email delivery, and PDF generation

---

## 1. Summary of Current System

### 1.1 Report Data Shape

Reports are stored in the `auditReports` PostgreSQL table (Drizzle ORM) with this structure:

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID (PK) | Auto-generated, used in share URLs |
| `business_name` | text | Business display name |
| `business_place_id` | text | Google Places ID |
| `audit_data` | jsonb | Full audit payload (scores, keywords, competitors, speed, issues) |
| `ai_narrative` | jsonb | Claude-generated insights, action plan, content gaps |
| `view_count` | integer | Incremented on each public page view |
| `created_at` | timestamp | Report generation time |

The `audit_data` JSONB contains:

- **business** — name, address, rating, reviewsCount, website, phone, photos, hours, description, placeId
- **trade / city** — business category and location
- **keywords[]** — keyword, organicRank, isInLocalPack, localPackPosition, monthlySearches, cpc, competition, relevance
- **keywordSummary** — totalMonthlySearchVolume, topKeywordCPC, averageCPC, highestVolumeKeyword
- **competitors[]** — name, rating, reviewsCount, hasWebsite, isRunningAds, photoUrl, score
- **marketLeader** — name, reviewsCount, score (nullable)
- **areaAverageReviews / areaAverageRating**
- **speedData** — mobile/desktop: score (0-100), fcp, lcp, tbt, cls
- **websiteScreenshot** — base64-encoded PNG (nullable)
- **websiteAIAnalysis** — findings[]: status (pass/fail), category, description
- **websiteQualityChecks** — hasResponsiveDesign, hasCTA, hasContactForm, hasLocalSignals, hasSSL, hasInputs, speedOptimized
- **websiteQualityCheckScore** — 0-18
- **demandGaps[]** — gap, missedLeads, timeWindow
- **estimatedRevenueLoss** — low, high
- **businessNiche** — primary, secondary[], confidence
- **nicheAlignment** — misaligned, misalignmentPercent, insight
- **adMarket** — competitorsRunningAds, userRunningAds, adCompetitors[]
- **reviewIntelligence** — themes (Record<string, number>)
- **detectedIssues[]** — string tags (e.g. "no-website", "low-reviews", "slow-website")
- **recommendedServices[]** — Service objects mapped from detected issues
- **presenceLevel** — 'strong' | 'moderate' | 'weak'
- **keywordCoverage** — ratio, percent, level, ranked, tested
- **issues[]** — title, severity, impact, fix

The `ai_narrative` JSONB contains:

- **grade** — A/B/C/D
- **executiveSummary** — 2-3 sentences
- **gradeExplanation**
- **keyStrength / competitorWeakness**
- **reviewGap** — behindLeaderBy, insight
- **actionPlan[3]** — priority (HIGH/MEDIUM/LOW), title, detail, estimatedImpact, estimatedCost, timeToResult, wefixtrades_can_help
- **contentGaps[3]** — pageTitle, targetKeyword, monthlySearches, cpc, reason
- **demandGapInsight**
- **estimatedMonthlyRevenueLoss** — low, high, calculation
- **quickWin** — action, timeRequired, expectedResult
- **websiteInsight** — mobile speed insight (nullable)
- **reportDataQuality** — keywordDataAvailable, competitorDataAvailable, etc.

### 1.2 Scoring System

Calculated in `calculateScores()` in `server/auditRoutes.ts`:

| Category | Max Points | Based On |
|----------|-----------|----------|
| Google Maps Profile | 25 | Rating, reviews, photos, description, website link |
| Website Quality | 20 | PageSpeed score, QA checks, AI visual analysis |
| Search Visibility | 20 | Organic rank + local pack presence per keyword |
| Competitor Positioning | 15 | Score gap vs market leader |
| Ad Opportunity | 10 | Top CPC + search volume |
| Demand Coverage | 10 | Open evenings + weekends |
| **Total** | **100** | |

Grades: A (70-100), B (55-69), C (40-54), D (0-39)

### 1.3 Data Flow

```
User searches → /api/audit/search-places → Google Places autocomplete
            → /api/audit/place-details  → Google Maps details
            → /api/audit/generate       → Full audit pipeline:
                ├─ Serper API (keyword rankings)
                ├─ DataForSEO (search volumes)
                ├─ Outscraper (competitor data)
                ├─ Website QA checks (cheerio)
                ├─ calculateScores()
                ├─ Issue detection
                ├─ Service mapping
                ├─ Claude AI narrative generation
                └─ Save to auditReports table → returns reportId

Background:  → /api/audit/speed          → PageSpeed Insights (mobile + desktop)
             → /api/audit/speed/:id      → Poll for results (updates report with speed data)

Share:       → /audit/report/:id         → Client route (SharedAuditReport.tsx)
             → /api/audit/report/:id     → Fetches report, increments view_count
```

### 1.4 Rendering

- **FreeAudit.tsx** (670 lines) — Entry point: search → generate → display
- **ReportView.tsx** (2483 lines) — Full interactive report with CTA, services, chat
- **SharedAuditReport.tsx** (416 lines) — Read-only public view with branded header
- **FreeAuditReport.module.css** (964 lines) — CSS Modules, no print styles

All rendering is **client-side only** (React SPA with wouter routing). The server serves `index.html` for all non-API routes (classic SPA fallback). No SSR.

### 1.5 Existing Share Functionality

ReportView.tsx has 5 share buttons:
- **Email** — `mailto:` link with report URL in body
- **WhatsApp** — `wa.me` share link
- **Facebook** — `facebook.com/sharer/sharer.php`
- **X (Twitter)** — `twitter.com/intent/tweet` with score
- **Copy Link** — `navigator.clipboard.writeText()`

Share URL format: `${origin}/audit/report/${reportId}`

### 1.6 Email Infrastructure

- **nodemailer** is installed and actively used for bookings, notifications, follow-ups, weekly reports
- SMTP config via env vars: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`
- Transporter creation is duplicated across 6+ files (no shared utility)
- **No audit report email endpoint exists**

---

## 2. Identified Gaps and Risks

### A. Social Sharing

| Item | Status | Gap |
|------|--------|-----|
| Canonical report URL | **Exists** | `/audit/report/:id` works |
| OG meta tags | **Missing** | No og:title, og:description, og:image, twitter:card |
| SSR for meta tags | **Missing** | SPA serves same index.html for all routes — crawlers see nothing |
| Share preview image | **Missing** | No report screenshot/thumbnail generation |

**Risk:** Social shares (Facebook, Twitter, WhatsApp, LinkedIn) will show a blank preview card. This is the #1 blocker for effective social sharing.

**Root cause:** The app is a pure SPA. Social media crawlers don't execute JavaScript. Without server-side injection of `<meta>` tags for `/audit/report/:id` routes, all shared links will display the same generic (or empty) preview.

### B. Email Sending

| Item | Status | Gap |
|------|--------|-----|
| SMTP transport | **Exists** | nodemailer configured in multiple files |
| Shared transport utility | **Missing** | Each file creates its own transporter |
| Audit email endpoint | **Missing** | No `POST /api/reports/:id/send-email` |
| Email HTML template | **Missing** | No audit-specific email template |
| Rate limiting | **Missing** | No protection against email abuse |
| Email validation | **Missing** | No server-side email format validation |

### C. PDF Generation

| Item | Status | Gap |
|------|--------|-----|
| PDF library | **Missing** | No jspdf, puppeteer, react-pdf, or similar installed |
| Print stylesheet | **Missing** | No `@media print` rules in CSS |
| PDF-friendly layout | **Missing** | Current UI is interactive (tabs, animations, chat) — not printable |
| PDF endpoint | **Missing** | No `GET /api/reports/:id/pdf` |
| PDF storage | **Missing** | No strategy for caching generated PDFs |

### D. Backend Readiness

| Item | Status | Notes |
|------|--------|-------|
| Full report in one request | **Yes** | `GET /api/audit/report/:id` returns complete audit_data + ai_narrative |
| Auth constraints | **None** | Report endpoint is public (no auth required) |
| Rate limits | **None** | No rate limiting on report endpoint |
| Report expiry | **None** | Reports persist indefinitely |

---

## 3. Proposed Data Schema

### 3.1 Report Object (TypeScript)

```typescript
// Canonical report type for API responses, PDF, and email

type AuditReport = {
  id: string;                          // UUID
  businessName: string;
  businessPlaceId: string | null;
  createdAt: string;                   // ISO 8601
  viewCount: number;

  business: {
    name: string;
    address: string;
    rating: number | null;
    reviewsCount: number;
    website: string | null;
    phone: string | null;
    photoUrl: string | null;
  };

  trade: string;
  city: string;

  scores: {
    total: number;                     // 0-100
    grade: 'A' | 'B' | 'C' | 'D';
    googleMaps: CategoryScore;
    websiteQuality: CategoryScore | null;
    searchVisibility: CategoryScore;
    competitorPositioning: CategoryScore;
    adOpportunity: CategoryScore;
    demandCoverage: CategoryScore;
  };

  narrative: {
    executiveSummary: string;
    gradeExplanation: string;
    keyStrength: string;
    competitorWeakness: string;
    reviewGap: { behindLeaderBy: number; insight: string };
    actionPlan: ActionPlanItem[];
    contentGaps: ContentGap[];
    quickWin: { action: string; timeRequired: string; expectedResult: string };
    estimatedMonthlyRevenueLoss: { low: number; high: number; calculation: string };
    websiteInsight: string | null;
  };

  keywords: KeywordEntry[];
  competitors: CompetitorEntry[];
  speedData: SpeedData | null;
  detectedIssues: string[];
  recommendedServices: Service[];
};

type CategoryScore = {
  score: number;
  max: number;
};

type ActionPlanItem = {
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  title: string;
  detail: string;
  estimatedImpact: string;
  estimatedCost: string;
  timeToResult: string;
};

type ContentGap = {
  pageTitle: string;
  targetKeyword: string;
  monthlySearches: number | null;
  cpc: number | null;
  reason: string;
};

type KeywordEntry = {
  keyword: string;
  organicRank: number | null;
  isInLocalPack: boolean;
  localPackPosition: number | null;
  monthlySearches: number;
  cpc: number;
  relevance: 'high' | 'medium' | 'low';
};

type CompetitorEntry = {
  name: string;
  rating: number;
  reviewsCount: number;
  hasWebsite: boolean;
  isRunningAds: boolean;
  score: number;
};

type SpeedData = {
  mobile: SpeedMetrics | null;
  desktop: SpeedMetrics | null;
};

type SpeedMetrics = {
  score: number;
  fcp: number | null;
  lcp: number | null;
  tbt: number | null;
  cls: number | null;
};
```

### 3.2 Social Sharing Metadata

```typescript
type ReportOGMetadata = {
  title: string;         // "{businessName} — Local Business Audit | WeFixTrades"
  description: string;   // "Scored {total}/100 ({grade}). {executiveSummary truncated to 155 chars}"
  url: string;           // "https://wefixtrades.co.uk/audit/report/{id}"
  image: string;         // "https://wefixtrades.co.uk/api/audit/report/{id}/og-image"
  type: 'website';
};
```

---

## 4. Proposed API Structure

### 4.1 Existing (No Changes)

```
GET  /api/audit/report/:id          → Full report data (already exists)
POST /api/audit/generate            → Generate new audit (already exists)
```

### 4.2 New Endpoints Required

#### OG Image Generation

```
GET /api/audit/report/:id/og-image

Returns: PNG image (1200x630) for social sharing previews
Headers: Content-Type: image/png, Cache-Control: public, max-age=86400

Implementation: Server-side rendered card with score circle, business name, grade badge
```

#### PDF Generation

```
GET /api/audit/report/:id/pdf

Returns: application/pdf
Headers: Content-Disposition: attachment; filename="{businessName}-audit-report.pdf"

Query params:
  ?inline=true    → Content-Disposition: inline (for preview)

Implementation: Render report HTML → PDF via headless browser or html-to-pdf library
```

#### Email Delivery

```
POST /api/audit/report/:id/send-email

Body: {
  recipientEmail: string;
  senderName?: string;    // Optional: "John sent you this report"
}

Response: {
  success: boolean;
  message: string;
}

Rate limit: 3 emails per report per hour, 10 per report per day
```

### 4.3 Server-Side Meta Tag Injection

```
GET /audit/report/:id   (HTML request from browser/crawler)

Server intercepts this route before SPA fallback:
  1. Fetch report from DB
  2. Inject <meta> OG tags into index.html template
  3. Serve modified HTML

This requires a middleware that pattern-matches /audit/report/:id
and rewrites the HTML response.
```

---

## 5. Recommended Architecture

### 5.1 Component Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│ FRONTEND                                                         │
│                                                                  │
│  ReportView.tsx (existing)                                       │
│    ├─ ShareBlock (existing buttons + new "Download PDF" + "Email")│
│    ├─ EmailModal (new) → POST /api/audit/report/:id/send-email  │
│    └─ PDF download link → GET /api/audit/report/:id/pdf         │
│                                                                  │
│  SharedAuditReport.tsx (existing)                                │
│    ├─ Same share block with PDF + email                          │
│    └─ OG tags injected server-side (invisible to React)          │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ BACKEND                                                          │
│                                                                  │
│  server/auditRoutes.ts (extend)                                  │
│    ├─ GET  /api/audit/report/:id/pdf        → pdfGenerator       │
│    ├─ GET  /api/audit/report/:id/og-image   → ogImageGenerator   │
│    └─ POST /api/audit/report/:id/send-email → emailSender        │
│                                                                  │
│  server/lib/emailTransport.ts (new — shared utility)             │
│    └─ Creates & caches nodemailer transporter                    │
│                                                                  │
│  server/lib/reportPdf.ts (new)                                   │
│    └─ Generates PDF from report data                             │
│                                                                  │
│  server/lib/reportOgImage.ts (new)                               │
│    └─ Generates 1200x630 OG image from report summary           │
│                                                                  │
│  server/middleware/ogTags.ts (new)                                │
│    └─ Intercepts /audit/report/:id, injects <meta> into HTML    │
│                                                                  │
│  server/lib/reportEmailTemplate.ts (new)                         │
│    └─ HTML email template with report summary + CTA link         │
└─────────────────────────────────────────────────────────────────┘
```

### 5.2 PDF Generation Strategy

**Recommended approach:** Server-side HTML-to-PDF

Two viable options:

| Option | Library | Pros | Cons |
|--------|---------|------|------|
| A | **Puppeteer / Playwright** | Pixel-perfect rendering, supports CSS, charts | Heavy dependency (~300MB), requires headless Chrome |
| B | **@react-pdf/renderer** | Lightweight, React-native, no browser needed | Custom layout required (can't reuse existing CSS) |

**Recommendation:** Option A (Puppeteer) if the hosting environment supports it (Replit does). It allows rendering the existing report HTML with minimal changes. Create a dedicated `/api/audit/report/:id/pdf-view` server route that renders a print-optimized HTML page (no nav, no chat, no animations), then capture it as PDF.

If Puppeteer is too heavy, Option B with a dedicated React PDF layout is cleaner but requires reimplementing the report layout in react-pdf primitives.

**Alternative:** `jspdf` + `html2canvas` on the client side. Simpler but produces lower-quality PDFs and shifts compute to the user's browser.

### 5.3 OG Image Strategy

**Recommended:** Server-side generation with `@vercel/og` (Satori) or a simple HTML→PNG via Puppeteer.

The OG image should be a branded card showing:
- WeFixTrades logo
- Business name
- Score circle with grade
- 1-line summary

Cache generated images (in-memory or filesystem) keyed by reportId + score hash.

### 5.4 Email Strategy

- Extract a shared `createEmailTransport()` utility from the 6+ existing duplications
- Build an HTML email template with:
  - WeFixTrades branding header
  - Business name + score/grade
  - Top 3 findings summary
  - CTA button linking to full report
- Attach PDF as optional (increases email size but adds value)
- Rate limit: use in-memory counter or Redis (if available)

### 5.5 Meta Tag Injection Strategy

Add Express middleware **before** the SPA fallback handler:

```
1. Match /audit/report/:uuid pattern
2. Query auditReports table for business_name, score, grade
3. Read index.html template
4. String-replace </head> with OG meta tags + </head>
5. Serve modified HTML
```

This is lightweight (one DB query) and doesn't require full SSR. Social crawlers get proper meta tags; browsers still hydrate the React SPA normally.

---

## 6. Assumptions

1. **Hosting environment** supports headless Chrome (Puppeteer) — Replit does, but verify for production
2. **SMTP credentials** are already configured and working (used by existing email features)
3. **Report URLs are stable** — UUIDs don't change, reports are not deleted
4. **No authentication** is required to view shared reports (current behavior)
5. **Base64 screenshots** in `audit_data.websiteScreenshot` can be used in PDF/email but may be large (~500KB+)
6. **Report data is immutable** after generation — PDF can be cached indefinitely per reportId
7. **The domain** is `wefixtrades.co.uk` (verify for OG tag URLs)
8. **No CDN or blob storage** is currently configured — PDFs and OG images would need to be generated on-demand or stored locally
9. **The existing share buttons** in ReportView.tsx are the only share UI — SharedAuditReport.tsx does not have share buttons (gap to address)
10. **Rate limiting** is not implemented anywhere in the current app — email sending will be the first feature to need it

---

## 7. Priority Order for Implementation

| Phase | Feature | Effort | Impact |
|-------|---------|--------|--------|
| 1 | OG meta tag injection middleware | Low | High — makes all existing shares show previews |
| 2 | OG image generation endpoint | Medium | High — visual preview cards on social media |
| 3 | Shared email transport utility | Low | Medium — deduplicates existing code, enables email feature |
| 4 | Email sending endpoint + template | Medium | High — direct report delivery |
| 5 | Print stylesheet (`@media print`) | Low | Medium — instant "PDF" via browser print |
| 6 | Server-side PDF generation | High | High — professional downloadable reports |
| 7 | Share buttons on SharedAuditReport | Low | Medium — shared view currently lacks sharing options |

---

## 8. Open Questions

1. Should PDFs include the service recommendations / pricing section, or is that too sales-heavy for a shared document?
2. Should email sending require the sender to have previously entered their email (existing email capture), or allow anonymous sends?
3. Is there a preferred email template style/branding guide to follow?
4. Should OG images be cached to disk/DB, or generated on every request?
5. What is the production domain for absolute URLs in OG tags and emails?
6. Should the PDF include the website screenshot (adds file size) or link to the online report instead?
