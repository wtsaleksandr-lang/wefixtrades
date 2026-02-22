# QuickQuote - SaaS Quote Calculator Builder

## Overview
A SaaS application that enables trades businesses (plumbing, concrete, cleaning, etc.) to create instant quote calculators, embed them on websites, and collect leads. Migrated from Base44 to Replit fullstack.

## Architecture
- **Frontend**: React + TypeScript + Wouter routing + Tailwind CSS + Shadcn UI
- **Backend**: Express.js API routes
- **Database**: PostgreSQL (Neon-backed via Replit)
- **AI**: OpenAI via Replit AI Integrations (gpt-5-mini for pricing generation)
- **Auth**: Token-based edit access (7-day expiry tokens, no user auth required)

## Key Features
1. **Wizard**: Multi-step form to create a quote calculator (trade selection → business details → color → AI-generated pricing)
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
  wizard/WizardCard.tsx    - Multi-step wizard form
  calculator/CalculatorWidget.tsx - Customer-facing quote calculator
  designTokens.tsx         - Design system tokens
  themeUtils.tsx           - Theme override utilities
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
- `/` or `/Wizard` - Create a new calculator
- `/Calculator?slug=X` - View a calculator
- `/EditCalculator?token=X` - Edit calculator settings
- `/Leads?token=X` - View leads dashboard

## Design Decisions
- No emojis in UI -- use lucide-react icons instead
- All API routes use Zod validation schemas
- All frontend data fetching uses @tanstack/react-query (useQuery, useMutation)
- Token expiry enforced on all token-gated routes (PATCH, leads GET, lookup returns limited data when expired)
- Expired tokens can still duplicate (renewal mechanism)
- Foreign key constraint on leads.calculator_id referencing calculators.id

## Recent Changes
- Feb 2026: Initial migration from Base44 to Replit fullstack
- Feb 2026: Fixed all architect-flagged issues: Zod validation on all routes, token expiry enforcement, emoji removal, react-query integration, error handling with user feedback
