# QuickQuote - SaaS Quote Calculator Builder

## Overview
A SaaS application that enables trades businesses (plumbing, concrete, cleaning, etc.) to create instant quote calculators, embed them on websites, and collect leads. Mobile-first design with emerald/green premium theme.

## Architecture
- **Frontend**: React + TypeScript + Wouter routing + Tailwind CSS + Shadcn UI
- **Backend**: Express.js API routes
- **Database**: PostgreSQL (Neon-backed via Replit)
- **AI**: OpenAI via Replit AI Integrations (gpt-5-mini for pricing generation)
- **Auth**: Token-based edit access (7-day expiry tokens, no user auth required)

## Design System
- **Theme**: Emerald/green accent (#059669 primary, gradient headers)
- **Pattern**: Mobile-first, card-based layouts with soft shadows
- **Design Tokens**: `client/src/components/designTokens.tsx` (colors, shadows, radius, typography)
- **Touch**: Min 44px touch targets, full-width inputs on mobile
- **Animations**: CSS keyframe animations (fadeInUp, scaleIn, slideUp, checkmark)
- **No emojis**: Use lucide-react icons instead

## Key Features
1. **Wizard (4-step)**: Business Details -> Service Info -> Brand & Generate -> Launch
   - Step 1: Business name, 8 category cards (2-col grid), searchable trade dropdown, custom request panel
   - Step 2: Service description (multiline), email for notifications
   - Step 3: Color picker (8 presets + custom), summary card, "Generate Calculator" with AI loading animation
   - Step 4: Links (calculator URL, edit link, leads dashboard), embed code toggle, "Create Another" button
   - State persisted in localStorage (qq_wizard, qq_step, qq_result)
2. **Calculator**: Customer-facing widget that walks through pricing questions and shows an estimate
3. **Lead Form**: Captures contact info after showing a quote
4. **Edit Calculator**: Token-gated editor for business details, branding, lead form settings
5. **Leads Dashboard**: View/export collected leads via token access
6. **Duplicate**: When edit tokens expire, users can duplicate calculators for a fresh 7-day window

## Project Structure
```
shared/schema.ts          - Database schema (calculators, leads tables)
server/routes.ts          - Express API routes
server/storage.ts         - Database storage layer
server/db.ts              - Database connection
client/src/App.tsx         - Wouter routing setup
client/src/pages/          - Page components (wizard, calculator, edit-calculator, leads)
client/src/components/     - Reusable components
  wizard/WizardCard.tsx    - 4-step wizard form (mobile-first, emerald theme)
  calculator/CalculatorWidget.tsx - Customer-facing quote calculator
  designTokens.tsx         - Design system tokens (emerald palette)
  themeUtils.tsx           - Theme override utilities for calculator theming
client/src/data/trades.ts  - 8 categories, ~80 trades dataset
```

## API Endpoints
- `POST /api/ai/generate-pricing` - AI-powered pricing config generation
- `POST /api/calculators` - Create a new calculator
- `GET /api/calculators/lookup?slug=X&token=Y` - Get calculator by slug or token
- `PATCH /api/calculators` - Update calculator (token required)
- `POST /api/calculators/duplicate` - Duplicate calculator with fresh token
- `POST /api/calculators/track-view` - Increment view count
- `POST /api/leads` - Submit a lead
- `GET /api/leads?token=X` - Get leads for a calculator

## Routes (Frontend)
- `/` or `/Wizard` - Create a new calculator (4-step wizard)
- `/Calculator?slug=X` - View a calculator
- `/EditCalculator?token=X` - Edit calculator settings
- `/Leads?token=X` - View leads dashboard

## Design Decisions
- Mobile-first: 400px base, scales up to 480px max-width
- Wizard card with gradient header (#059669 -> #10B981)
- Premium inputs with emerald focus states
- Progress bar in header (white on green gradient)
- Category selection: 2-col grid with icon cards, check badge on selection
- Trade dropdown: searchable with type-ahead, outside-click-to-close
- Custom category: inline form for requesting new trade support
- Color picker: 8 presets + native color input
- Generation: animated progress bar with status messages
- Launch: copy-to-clipboard links, expandable embed code section
- All API routes use Zod validation schemas
- All frontend data fetching uses @tanstack/react-query (useQuery, useMutation)
- Token expiry enforced on all token-gated routes
- Foreign key constraint on leads.calculator_id referencing calculators.id

## Recent Changes
- Feb 23 2026: Complete mobile-first wizard rebuild with emerald theme, 4-step flow, AI generation with loading animation, launch page with embed code
- Feb 2026: Initial migration from Base44 to Replit fullstack
