# QuickQuote - SaaS Quote Calculator Builder

## Overview
A SaaS application that enables trades businesses (plumbing, concrete, cleaning, etc.) to create instant quote calculators, embed them on websites, and collect leads. Responsive mobile-first design with premium sage/neutral SaaS aesthetic.

## Architecture
- **Frontend**: React + TypeScript + Wouter routing + Tailwind CSS + Shadcn UI
- **Backend**: Express.js API routes
- **Database**: PostgreSQL (Neon-backed via Replit)
- **AI**: OpenAI via Replit AI Integrations (gpt-5-mini for pricing generation)
- **Auth**: Token-based edit access (7-day expiry tokens, no user auth required)

## Theme Architecture (IMPORTANT)
Two separate theme systems to maintain strict isolation:

### PlatformTheme (Builder UI)
- **File**: `client/src/theme/platformTheme.ts`
- **Purpose**: Generic premium SaaS aesthetic for the wizard builder, edit pages, leads dashboard
- **Accent**: Sage #2D6A4F (used sparingly for buttons, active states, highlights)
- **Surfaces**: Neutral whites/grays (#F7F8FA page bg, #FFFFFF cards)
- **Shadows**: Soft, minimal elevation (card: 0 1px 3px)
- **Typography**: Inter font stack, #111827 headings, #374151 body, #6B7280 muted
- **Rule**: Platform UI must NEVER be affected by client widget theme changes

### WidgetTheme (Customer Calculator)
- **File**: `client/src/theme/widgetTheme.ts`
- **Purpose**: Per-client calculator appearance, isolated within .widget-scope container
- **Default accent**: Sky blue #0284C7
- **Dynamic**: Each calculator has its own primary_color that drives the entire widget palette
- **CSS isolation**: Applied only within `.widget-scope` class

### Theme Utilities
- `client/src/components/themeUtils.tsx` - Bridge helper, wraps widgetTheme
- `client/src/components/designTokens.tsx` - DEPRECATED (old navy/indigo tokens, kept for reference)

## Design System
- **Pattern**: Mobile-first, card-based layouts with soft shadows, fully responsive desktop
- **Touch**: Min 44px touch targets, full-width inputs on mobile
- **Animations**: CSS keyframe animations (fadeInUp, scaleIn, slideUp, checkmark, modalFadeIn, modalScaleIn, modalSlideUp)
- **Hover**: Use `hover-elevate` and `active-elevate-2` utility classes for interactive elements
- **No emojis**: Use lucide-react icons instead
- **Premium inputs**: `.premium-input` class with sage focus states (border + ring)

## Key Features
1. **Wizard (6-step)**: Business & Trade Setup -> Design Your Calculator -> Pricing Logic -> Lead Form Builder -> Final Test & Preview -> Publish & Share
   - Step 0 (Business & Trade Setup): Business name (required), 8 category cards (2-col grid), searchable trade dropdown, email (required). Custom trade → shows CustomTradeQuestionnaire with structured inputs. Triggers async AI draft on continue.
   - Step 1 (Design Your Calculator): Brand color picker (8 presets + custom), logo upload, tagline with counter, then 4-tab DesignStudio (Appearance, Layout, Conversion, Integrations)
   - Step 2 (Pricing Logic): Predefined trade templates info for standard trades. Custom trades: AI draft status (pending/generating/ready/failed), regenerate button, assumptions view.
   - Step 3 (Lead Form Builder): Toggle-based field configuration (Full Name, Email, Phone, Company), required/optional per field, thank you message editor.
   - Step 4 (Final Test & Preview): Quality gate with 3 test scenarios (Low/Typical/High-End), each with label + min/max expected price + confirmation. All 3 must be confirmed to unlock "Generate & Publish". Shows validation errors.
   - Step 5 (Publish & Share): Links (calculator URL, edit link, leads dashboard), embed code toggle, "Create Another" button
   - State persisted in localStorage (qq_wizard, qq_step, qq_result) — includes calculatorSettings, customTradeData, leadFormFields, testScenarios
   - CustomTradeQuestionnaire: 6 structured sections (charge method, minimum charge, trip fee, price factors, price range, description)
   - Custom trades trigger async AI pricing draft generation via POST /api/ai/generate-pricing-draft
   - **calculator_settings** stored as jsonb column with settings_version: 1, pricing_draft, and nested structure for all 4 tab groups
2. **Calculator**: Customer-facing widget that walks through pricing questions and shows an estimate
3. **Lead Form**: Captures contact info after showing a quote
4. **Edit Calculator**: Token-gated editor for business details, branding, lead form settings, pricing questions
5. **Leads Dashboard**: View/export collected leads via token access
6. **Duplicate**: When edit tokens expire, users can duplicate calculators for a fresh 7-day window

## Pricing Architecture (Formula Families)
**CRITICAL**: All pricing MUST use one of 10 strict formula families. No custom math allowed.
- **File**: `shared/pricingConfig.ts` - Enum, Zod schemas, validation for all 10 families
- **File**: `shared/calculateEstimate.ts` - Runtime calculator engine (single `calculateEstimate()` function)
- **Families**: hourly, per_unit, per_sqft, per_linear_ft, base_plus_rate, tiered_packages, tiered_ranges, min_charge_plus_addons, price_range_only, call_for_quote_only
- **Validation**: `validatePricingConfig(config)` validates against schemas, falls back to call_for_quote_only on invalid
- **AI enforcement**: Both `/api/ai/generate-pricing` and `/api/ai/generate-pricing-draft` constrain AI output to these families and validate results
- **CalculatorWidget**: Uses `calculateEstimate()` exclusively — no legacy question-based pricing

## Project Structure
```
shared/schema.ts          - Database schema (calculators, leads tables)
shared/pricingConfig.ts   - Formula families enum, Zod schemas, validation
shared/calculateEstimate.ts - Runtime pricing calculator engine
server/routes.ts          - Express API routes
server/storage.ts         - Database storage layer
server/db.ts              - Database connection
client/src/App.tsx         - Wouter routing setup
client/src/pages/          - Page components (wizard, calculator, edit-calculator, leads)
client/src/components/     - Reusable components
  wizard/WizardCard.tsx    - 6-step wizard form (sage/neutral theme, portal dropdown, help modal, live preview)
  wizard/DesignStudio.tsx  - Step 1 design studio (4-tab customization: Appearance, Layout, Conversion, Integrations)
  wizard/CustomTradeQuestionnaire.tsx - Step 0 custom trade structured input form (6 sections)
  calculator/CalculatorWidget.tsx - Customer-facing quote calculator (uses calculateEstimate engine)
  designTokens.tsx         - DEPRECATED design system tokens
  themeUtils.tsx           - Widget theme bridge utility
client/src/theme/          - Theme architecture
  platformTheme.ts         - Builder UI theme (sage accent, neutral surfaces)
  widgetTheme.ts           - Widget theme generator (per-client colors)
client/src/data/trades.ts  - 8 categories, ~80 trades dataset
```

## API Endpoints
- `POST /api/ai/generate-pricing` - AI-powered pricing config generation
- `POST /api/ai/generate-pricing-draft` - AI-powered pricing draft for custom trades
- `POST /api/calculators` - Create a new calculator (accepts tagline, logo_url)
- `GET /api/calculators/lookup?slug=X&token=Y` - Get calculator by slug or token
- `PATCH /api/calculators` - Update calculator (token required)
- `POST /api/calculators/duplicate` - Duplicate calculator with fresh token
- `POST /api/calculators/track-view` - Increment view count
- `POST /api/leads` - Submit a lead
- `GET /api/leads?token=X` - Get leads for a calculator

## Routes (Frontend)
- `/` or `/Wizard` - Create a new calculator (6-step wizard)
- `/Calculator?slug=X` - View a calculator
- `/EditCalculator?token=X` - Edit calculator settings
- `/Leads?token=X` - View leads dashboard

## Design Decisions
- Mobile-first: 480px max-width wizard card, centered on desktop
- Page title "Set Up Your Instant Quote Engine" above wizard
- Wizard card with white/neutral header, sage accent progress bar
- Premium inputs with sage focus states (#2D6A4F border + ring)
- Progress bar in header (sage on light gray)
- Category selection: 2-col grid with icon cards, check badge on selection, hover-elevate
- Trade dropdown: portal-rendered to prevent clipping, searchable with type-ahead, overlay behind
- Help modal: createPortal, backdrop-blur, responsive (centered dialog on desktop, bottom sheet on mobile)
- Live Preview: accordion below wizard content, shows business name, logo, tagline, category, trade, color
- Custom category: inline form for requesting new trade support
- Color picker: 8 presets (sky blue default) + native color input
- Generation: animated progress bar with sage accent
- Launch: copy-to-clipboard links, expandable embed code section
- All API routes use Zod validation schemas
- All frontend data fetching uses @tanstack/react-query (useQuery, useMutation)
- Token expiry enforced on all token-gated routes
- Foreign key constraint on leads.calculator_id referencing calculators.id
- Wizard-bg: neutral #F7F8FA

## Pricing Intake System (Universal Pricing Questions)
Two-stage intake flow for custom trades, stored in `calculator_settings.pricing_intake`:
- **Stage 1** (`CustomTradeQuestionnaire.tsx`): charge_method, min charge, trip fee, offers_packages, price_factors, price range, output_preference
- **Stage 2** (`PricingIntakeStage2.tsx`): Adaptive follow-up based on Stage 1 — hourly (rate/crew/hours), per_sqft (rate/materials/setup), per_linear_ft, per_item (unit name/rate), base_plus_variable (base + unit), packages (2-5 tiers), materials markup (preset % or custom), distance (multiplier/flat), difficulty tiers, after-hours multiplier
- **Deterministic Mapper** (`shared/pricingIntakeMapper.ts`): Pure function `mapPricingIntakeToConfig(stage1, stage2)` → PricingConfigV1. No AI needed when charge_method is known.
- **AI Fallback**: Only triggers when charge_method === 'not_sure' OR mapper fails validation. Existing AI draft endpoint preserved.
- **Data Schema**: `pricingIntakeSchema` (version: 1, stage1: CustomTradeData, stage2: Stage2Data) in shared/schema.ts

## Recent Changes
- Feb 24 2026: Universal Pricing Questions — Stage 1 gets offers_packages + output_preference fields with validation. Stage 2 adaptive questionnaire branches by charge method + price factors. Deterministic mapper converts intake to PricingConfigV1 without AI. AI only used for not_sure or mapper failure. All data stored under calculator_settings.pricing_intake with version: 1.
- Feb 24 2026: Formula Families pricing engine — 10 strict pricing families (hourly, per_unit, per_sqft, per_linear_ft, base_plus_rate, tiered_packages, tiered_ranges, min_charge_plus_addons, price_range_only, call_for_quote_only). Added shared/pricingConfig.ts (Zod schemas, validation, CALL_FOR_QUOTE_FALLBACK) and shared/calculateEstimate.ts (runtime engine). Updated AI endpoints to constrain output. Rebuilt CalculatorWidget with formula-family-aware inputs (quantity, tier selection, add-ons, difficulty, after-hours). Updated pricingDraftSchema to align with PricingConfigV1.
- Feb 23 2026: Major wizard refactor — 6-step flow: Business & Trade Setup (simplified Step 0), Design Your Calculator (Step 1 with logo/tagline/DesignStudio), Pricing Logic (Step 2 with AI draft for custom trades), Lead Form Builder (Step 3), Final Test & Preview quality gate (Step 4), Publish & Share (Step 5). Added CustomTradeQuestionnaire with 6 structured input sections. New API endpoint for AI pricing draft generation. Removed old CustomPanel, customRequest, businessDescription. Added customTradeDataSchema/pricingDraftSchema to schema.
- Feb 23 2026: Expanded wizard from 4 to 6 steps with Design Studio (Step 2). Added calculator_settings jsonb column with 40+ customization options. Built 4-tab design interface (Appearance/Layout/Conversion/Integrations). Service description and email merged into Step 1. Steps 3-5 added for pricing logic, final preview, and publish flow.
- Feb 23 2026: Theme architecture separation - PlatformTheme (sage #2D6A4F builder) vs WidgetTheme (per-client colors). Replaced navy/indigo with neutral/sage. White wizard header. Widget CSS isolation via .widget-scope.
- Feb 23 2026: Navy + blue theme overhaul (replaced all indigo/purple with navy #0B1F3A + blue #2563EB), premium text copy, button hover/press effects, wizard card shadow depth
- Feb 23 2026: Premium theme overhaul (emerald → indigo), Help Modal rebuild (Base44 match), Live Preview accordion, trade dropdown portal fix, logo upload, tagline with counter, inline validation
- Feb 23 2026: Complete mobile-first wizard rebuild with 4-step flow, AI generation with loading animation, launch page with embed code
- Feb 2026: Initial migration from Base44 to Replit fullstack
