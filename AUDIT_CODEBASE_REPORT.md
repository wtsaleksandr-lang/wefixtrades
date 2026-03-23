# AUDIT_CODEBASE_REPORT.md
# WeFix Trades — Quote Wizard Architecture Audit

**Date:** 2026-03-23
**Scope:** Full-stack audit of quote wizard codebase — structure, data flow, API surface, integration points, and architectural verdict
**Codebase:** 242 TypeScript/TSX files, ~52,800 lines of code

---

## 1. EXECUTIVE SUMMARY

WeFix Trades is a SaaS platform that lets trade businesses (plumbers, electricians, cleaners, etc.) create embeddable quote calculators with AI-powered pricing, lead capture, booking, and automated follow-ups.

The codebase has undergone two major architectural phases:
- **Phase 1** (complete): Schema splitting, route extraction, wizard schema foundation, freeze of legacy monoliths
- **Phase 2** (complete): New schema-driven QuoteWidget with modular step renderer, replacing the monolithic CalculatorWidget

**Verdict:** The architecture is now **on a strong trajectory**. The pricing engine is excellent, the new QuoteWidget is properly schema-driven, and the shared layer is well-structured. The main risks are: 5 known HIGH-severity bugs in the new widget, an incomplete booking integration, and the frozen builder components (~8,600 LOC) still awaiting Phase 3 rebuild.

---

## 2. PROJECT STRUCTURE

```
wefixtrades/
├── client/src/                    # React 18 + Vite frontend
│   ├── components/
│   │   ├── quote-widget/          # NEW — Schema-driven customer widget (Phase 2)
│   │   │   ├── QuoteWidget.tsx        # Orchestrator (328 lines)
│   │   │   ├── WidgetContext.tsx       # State management via useReducer (311 lines)
│   │   │   ├── StepRenderer.tsx       # Central step dispatcher (67 lines)
│   │   │   ├── steps/                 # 9 step components (35–230 lines each)
│   │   │   ├── questions/             # 9 question components (22–96 lines each)
│   │   │   ├── visibility.ts          # Conditional display logic
│   │   │   ├── designTokens.ts        # Embed-safe design tokens
│   │   │   └── StepHelp.tsx           # Contextual FAQ panel
│   │   ├── wizard/                # FROZEN — Legacy builder (Phase 3 rebuild target)
│   │   │   ├── WizardCard.tsx         # 1,892 lines — god component
│   │   │   ├── DesignStudio.tsx       # 2,145 lines — god component
│   │   │   ├── PublishStep.tsx        # 1,632 lines
│   │   │   ├── TestGateStep.tsx       # 1,074 lines
│   │   │   └── ...                    # ~8,600 total frozen LOC
│   │   └── ui/                    # Radix/shadcn primitives
│   ├── config/                    # SaaS plans, product catalog, template config
│   └── pages/                     # Route pages (calculator.tsx is widget entry)
├── server/                        # Express 5 backend
│   ├── routes/                    # 10 domain route modules (~2,370 lines)
│   ├── aiPricingAgent.ts          # 3-stage pricing inference (478 lines)
│   ├── aiChatEngine.ts            # Universal AI chat with tool calling (507 lines)
│   ├── storage.ts                 # Database access layer
│   └── jobs/                      # Cron workers (notifications, followups)
├── shared/                        # Shared types, schemas, and logic
│   ├── schemas/                   # Drizzle DB + Zod validation (803 lines)
│   ├── pricingConfig.ts           # 10 pricing families, discriminated union (203 lines)
│   ├── calculateEstimate.ts       # Pure pricing engine (235 lines)
│   ├── wizardSchema.ts            # Step/question type definitions (218 lines)
│   ├── widgetFlowBuilder.ts       # Config → WizardFlow converter (323 lines)
│   ├── templateLibrary.ts         # 6 layout templates (227 lines)
│   └── sliderMappings.ts          # 30+ unit type configs (45 lines)
└── docs/
    ├── ARCHITECTURE_AUDIT.md      # Initial audit (Phase 0)
    ├── PHASE1_PLAN.md             # Schema/route split plan
    ├── PHASE2_PLAN.md             # QuoteWidget implementation plan
    └── PHASE2_VALIDATION.md       # QA checklist + known bugs
```

---

## 3. TECH STACK

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, Radix UI / shadcn, Framer Motion, Recharts |
| Backend | Express 5, Node.js, TypeScript |
| Database | PostgreSQL via Drizzle ORM (JSONB for pricing configs & settings) |
| Auth | Passport.js with sessions |
| AI | OpenAI (gpt-4o-mini, gpt-5-mini) — pricing generation, chat, audit narratives |
| Payments | Stripe (Express Connect for business payments, booking deposits) |
| Messaging | Twilio (SMS + WhatsApp with AI-powered auto-replies) |
| Email | Nodemailer + SMTP |
| APIs | Google Maps Places, Google PageSpeed Insights |
| Real-time | WebSocket support |

---

## 4. DATA FLOW — QUOTE WIDGET

### 4.1 Widget Initialization
```
calculator.tsx (?widget=v2)
  → Load calculator by slug from DB
  → QuoteWidget.tsx
    → validatePricingConfig(calculator.pricing_config)
    → resolveTemplate(calculator.calculator_settings)
    → buildWidgetFlow(pricingConfig, template, settings)
    → <WidgetProvider flow={wizardFlow}>
      → <WidgetCard> renders current step via StepRenderer
```

### 4.2 User Interaction → Estimate
```
User interacts with question component (slider, select, toggle, etc.)
  → setAnswer(questionId, value)
  → Reducer: SET_ANSWER
    → updateEstimateInputs() checks question.maps_to field
    → Maps to: quantity | selectedTierIndex | selectedAddOnIds | selectedDifficultyId | isAfterHours
  → PriceRevealStep calls recalculate()
    → calculateEstimate(pricingConfig, estimateInputs)
    → Returns: { type: 'exact'|'range'|'call_us', total, breakdown[], min, max }
```

### 4.3 Lead Capture → Notification
```
LeadCaptureStep form submission
  → POST /api/leads { name, email, phone, company, smsConsent, quoteAmount, answers }
  → Server creates lead in DB
  → Enqueues email notification to business owner
  → Enqueues SMS notification (if Twilio configured)
  → Enqueues follow-up sequence (if configured)
```

### 4.4 State Shape
```typescript
WidgetState {
  currentStepIndex: number
  answers: Record<string, any>           // All user responses
  estimateInputs: {                      // Derived from answers via maps_to
    quantity, selectedTierIndex, selectedAddOnIds,
    selectedDifficultyId, isAfterHours
  }
  estimate: EstimateResult               // calculateEstimate() output
  lead: { data, smsConsent, submitted }
  coupon: { input, applied }
  expiration: { generatedAt, expired }
  booking: { date, time, customer, confirmed }
}
```

---

## 5. REPORT FLOW — BUSINESS AUDIT TOOL

The platform includes a free business audit tool at `/api/audit/*`:

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/audit/search-places` | POST | Google Maps place text search (top 8 results) |
| `/api/audit/place-details` | POST | Fetch business details (rating, reviews, photos, hours, website) |
| `/api/audit/pagespeed` | POST | Run PageSpeed Insights (mobile + desktop, Core Web Vitals) |
| `/api/audit/generate` | POST | Generate complete audit report |

### Audit Report Sections
1. **Local Visibility Score** (0–100) — weighted from: review count, avg rating, photo count, website presence
2. **Issues Identified** — high/medium severity: low reviews, missing photos, slow mobile, no website, low rating
3. **Quick Wins** — actionable items the business can fix immediately
4. **7-Day Action Plan** — short-term improvements
5. **30-Day Action Plan** — medium-term improvements
6. **Recommended Services** — upsell to WeFix Trades products
7. **AI Narrative** (optional) — OpenAI-generated executive summary, analysis, and recommendations

### Report Data Sources
| Data Point | Source API | Used For |
|-----------|-----------|----------|
| Business name, address, phone | Google Maps Places | Report header, contact info |
| Star rating, review count | Google Maps Places | Local visibility scoring |
| Business photos count | Google Maps Places | Visual presence scoring |
| Website URL | Google Maps Places | PageSpeed analysis trigger |
| Performance score (0–100) | Google PageSpeed Insights | Mobile/desktop speed grade |
| FCP, LCP, TBT, CLS | Google PageSpeed Insights | Core Web Vitals breakdown |
| Executive summary | OpenAI (gpt-4o-mini) | AI narrative section |

---

## 6. ALL EXTERNAL API CALLS

### 6.1 Google Maps Places API
- **Key:** `GOOGLE_MAPS_API_KEY`
- **File:** `server/routes/auditRoutes.ts`
- **Endpoints called:**
  - `https://maps.googleapis.com/maps/api/place/textsearch/json` — business search
  - `https://maps.googleapis.com/maps/api/place/details/json` — business details (rating, reviews, photos, website, hours)

### 6.2 Google PageSpeed Insights API
- **Key:** `PAGESPEED_API_KEY`
- **File:** `server/routes/auditRoutes.ts`
- **Endpoints called:**
  - `https://www.googleapis.com/pagespeedonline/v5/runPagespeed` — mobile & desktop analysis

### 6.3 OpenAI API
- **Key:** `AI_INTEGRATIONS_OPENAI_API_KEY`
- **Files:** `auditRoutes.ts`, `aiRoutes.ts`, `aiPricingAgent.ts`, `aiChatEngine.ts`, `twilioRoutes.ts`, `replit_integrations/*`
- **Models:** `gpt-4o-mini` (chat, audit narrative), `gpt-5-mini` (pricing generation)
- **Use cases:**
  - Audit report AI narrative generation
  - Pricing config generation from trade data
  - Pricing draft from sample quotes (3-stage: derive → AI → fallback)
  - AI chat engine with tool calling (demo, support, client agents)
  - SMS/WhatsApp auto-replies via Twilio webhook

### 6.4 Stripe API
- **Key:** `STRIPE_SECRET_KEY`
- **Files:** `stripeRoutes.ts`, `bookingRoutes.ts`
- **Use cases:** Express Connect onboarding, booking deposit payments

### 6.5 Twilio API
- **Keys:** `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`
- **Files:** `twilioClient.ts`, `twilioRoutes.ts`
- **Use cases:** SMS/WhatsApp sending, inbound webhook with AI reply, rate limiting (3/lead/day, 50/calc/day)

### 6.6 SMTP (Email)
- **Keys:** `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`
- **Files:** `bookingEmails.ts`, `aiChatEngine.ts`, `jobs/*`
- **Use cases:** Booking confirmations, lead notifications, follow-up sequences, support tickets

---

## 7. INTEGRATION POINTS FOR NEW DATA SOURCES

### 7.1 Audit Report — Easy to Extend
The audit report in `server/routes/auditRoutes.ts` line ~192 (`/api/audit/generate`) assembles a structured `auditData` object before passing it to OpenAI for narrative generation. New data sources can be added by:

1. **Adding a new API call** before the `auditData` assembly (lines 192–390)
2. **Extending the `auditData` object** with new fields
3. **Updating the scoring formula** in the local visibility calculation
4. **Updating the AI prompt** to include new data in the narrative

**Candidate integrations:**
| Data Source | What It Adds | Integration Difficulty |
|------------|-------------|----------------------|
| Google Business Profile API | Hours, posts, Q&A, services | Medium — requires OAuth |
| Yelp Fusion API | Cross-platform reviews, categories | Easy — REST API with key |
| Facebook Graph API | Page likes, reviews, response time | Medium — requires page token |
| Moz/Ahrefs API | Domain authority, backlinks, SEO score | Easy — REST API with key |
| BuiltWith / Wappalyzer | Tech stack detection (CMS, analytics) | Easy — REST API |
| Schema.org validator | Structured data presence on website | Easy — parse HTML |
| SSL Labs API | SSL certificate grade | Easy — free REST API |
| Google Search Console API | Search impressions, click-through rate | Hard — requires site verification |

### 7.2 Widget Flow — Extensible by Design
The schema-driven architecture (`wizardSchema.ts`) makes adding new question types trivial:
1. Add type to `QUESTION_TYPES` in `shared/wizardSchema.ts`
2. Create component in `client/src/components/quote-widget/questions/`
3. Add case to `QuestionRenderer.tsx`
4. No other files need changes

### 7.3 Pricing Engine — Plugin-Ready
New pricing families can be added to the discriminated union in `shared/pricingConfig.ts` and handled in `shared/calculateEstimate.ts` without touching any UI code.

---

## 8. KNOWN ISSUES

### 8.1 HIGH Severity (from PHASE2_VALIDATION.md)

| # | Bug | File | Impact |
|---|-----|------|--------|
| 1 | `visibility.ts` treats `0` and `false` as undefined — falsy answers break conditional visibility | `visibility.ts:17` | Questions may show/hide incorrectly |
| 2 | BookingStep has no server POST — booking data is local-only | `BookingStep.tsx:138` | Bookings are not persisted |
| 3 | PriceRevealStep has stale `recalculate` dependency in useEffect | `PriceRevealStep.tsx:20-22` | Estimate may not update when inputs change |
| 4 | Default values not pre-populated in answers on mount | `WidgetContext.tsx:12` | Components relying on defaults see `undefined` |
| 5 | Continue button shown on self-advancing steps (lead_capture, booking, confirmation) | `QuoteWidget.tsx:120` | Confusing UX — double navigation options |

### 8.2 MEDIUM Severity

| # | Bug | File | Impact |
|---|-----|------|--------|
| 6 | `per_unit` fallback `number_input` has no max constraint | `widgetFlowBuilder.ts:118-131` | Users can input unreasonably large values |
| 7 | Addon default selections not reflected in state on mount | `widgetFlowBuilder.ts:199-200` | Pre-selected addons not in estimate |

### 8.3 Incomplete Features
- **Coupon flow** — state exists in WidgetContext but no UI to apply coupons
- **Quote expiration** — state exists but no timer or expiration UI
- **Booking server integration** — BookingStep is front-end only
- **Trust blocks / testimonials** — schema supports them but not rendered in QuoteWidget

---

## 9. ARCHITECTURAL ASSESSMENT

### 9.1 Strengths
| Area | Assessment |
|------|-----------|
| **Pricing engine** | Excellent — pure function, 10 families, modular modifier pipeline, zero side effects (235 LOC) |
| **Schema layer** | Strong — Zod discriminated unions, comprehensive validation, clean separation |
| **New QuoteWidget** | Well-architected — schema-driven rendering, reducer state, composable steps/questions (~1,435 LOC across 30 files vs 2,284 LOC monolith) |
| **Route organization** | Good — 10 domain modules cleanly separated from legacy monolith |
| **Template system** | Solid — 6 templates with wizard_steps support, trade mapping |
| **Extensibility** | High — new question types, pricing families, and step types require minimal file changes |

### 9.2 Risks
| Area | Assessment |
|------|-----------|
| **Frozen builder** | ~8,600 LOC of frozen god-components awaiting Phase 3 rebuild. No timeline. |
| **v1/v2 toggle** | `?widget=v2` URL param means new widget is opt-in. Migration path unclear. |
| **5 HIGH bugs** | All documented but unfixed. Could cause bad UX in production. |
| **AI model dependency** | Hard-coded to specific OpenAI models (gpt-4o-mini, gpt-5-mini). No fallback. |
| **No test coverage** | Playwright config exists but no test files found for the new widget. |
| **Booking gap** | Front-end exists, server route exists, but they're not connected. |

### 9.3 Old vs New Widget Comparison

| Aspect | Old (CalculatorWidget) | New (QuoteWidget) |
|--------|----------------------|-------------------|
| Total LOC | 2,284 (single file) | ~1,435 (30 files) |
| State management | 42+ useState hooks | 1 useReducer + context |
| Step rendering | Hardcoded switch | Schema-driven StepRenderer |
| Question types | Inline JSX per question | 9 composable components |
| Flow definition | Fixed per template | WizardFlow JSON (DB-storable) |
| Conditional visibility | None | evaluateVisibility() with 6 operators |
| Extensibility | Requires editing monolith | Add component + schema entry |

---

## 10. RECOMMENDATIONS

### Immediate (Pre-Launch)
1. **Fix the 5 HIGH bugs** — especially visibility.ts falsy handling and stale estimate recalculation
2. **Connect BookingStep to server** — wire POST /api/bookings from BookingStep component
3. **Add smoke tests** — at minimum: widget renders, navigation works, estimate calculates correctly

### Short-Term (Phase 3)
4. **Rebuild the builder** using the same schema-driven approach as QuoteWidget
5. **Migrate v1 → v2** — make QuoteWidget the default, deprecate CalculatorWidget
6. **Add coupon UI** — state and reducer actions already exist

### Medium-Term (Phase 4)
7. **Expand audit data sources** — Yelp, Facebook, domain authority (see Section 7.1)
8. **Add AI model fallback** — graceful degradation when OpenAI is unavailable
9. **Trust blocks in QuoteWidget** — schema supports them, just needs rendering

---

## 11. ENVIRONMENT VARIABLES REFERENCE

| Variable | Required | Used By |
|----------|----------|---------|
| `DATABASE_URL` | Yes | PostgreSQL connection |
| `GOOGLE_MAPS_API_KEY` | For audit tool | Business search & details |
| `PAGESPEED_API_KEY` | For audit tool | Website speed analysis |
| `AI_INTEGRATIONS_OPENAI_API_KEY` | For AI features | Pricing gen, chat, audit narrative |
| `AI_INTEGRATIONS_OPENAI_BASE_URL` | Optional | Custom OpenAI endpoint |
| `STRIPE_SECRET_KEY` | For payments | Express Connect, booking deposits |
| `TWILIO_ACCOUNT_SID` | For SMS | Twilio authentication |
| `TWILIO_AUTH_TOKEN` | For SMS | Twilio authentication |
| `TWILIO_FROM_NUMBER` | For SMS | SMS sender number |
| `TWILIO_WHATSAPP_NUMBER` | Optional | WhatsApp sender number |
| `SMTP_HOST/PORT/USER/PASS/FROM` | For email | Notifications, follow-ups |
| `ADMIN_EMAIL` | For support | Support ticket recipient |
| `PORT` | Optional | Server port (default 5000) |

---

*End of audit report.*
