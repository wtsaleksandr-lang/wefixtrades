# QuickQuote - SaaS Quote Calculator Builder

## Overview
QuickQuote is a SaaS application designed to empower trades businesses (e.g., plumbing, concrete, cleaning) by providing tools to create instant quote calculators. These calculators can be embedded on their websites to generate real-time estimates for customers and efficiently collect leads. The project aims to offer a responsive, mobile-first experience with a premium, neutral SaaS aesthetic.

## User Preferences
I want iterative development. I prefer detailed explanations, especially for complex architectural decisions. I want to be asked before any major changes or new features are implemented. I prefer clear, concise communication.

## System Architecture
The application features a decoupled architecture with a React + TypeScript frontend utilizing Wouter for routing, Tailwind CSS for styling, and Shadcn UI components. The backend is built with Express.js, providing API routes for various functionalities. Data persistence is managed by a PostgreSQL database, hosted via Neon on Replit. AI capabilities, specifically for pricing generation, are integrated using OpenAI (gpt-5-mini) through Replit AI Integrations. User authentication for editing and accessing leads is token-based, with tokens expiring after 7 days, avoiding the need for traditional user accounts.

**UI/UX and Design Decisions:**
- **Mobile-first Design:** All layouts are primarily designed for mobile screens (e.g., 480px max-width wizard card) and are fully responsive for desktop.
- **Card-based Layouts:** Utilizes soft shadows and elevated cards for a clean, modern aesthetic.
- **Theme Architecture:**
    - **PlatformTheme (Builder UI):** A generic premium SaaS aesthetic for the wizard builder, edit pages, and leads dashboard, defined in `client/src/theme/platformTheme.ts`. It uses a sage accent (`#2D6A4F`) sparingly, neutral whites/grays for surfaces, and soft shadows. This theme is strictly isolated and never affected by client widget theme changes.
    - **WidgetTheme (Customer Calculator):** This theme is per-client, allowing each calculator to have a custom appearance. It's defined in `client/src/theme/widgetTheme.ts` with a default sky blue accent (`#0284C7`) and is applied only within the `.widget-scope` class for CSS isolation.
- **Typography:** Uses the Inter font stack with specific color values for headings, body text, and muted text.
- **Interactivity:** Minimum 44px touch targets on mobile, full-width inputs, CSS keyframe animations for transitions, and utility classes (`hover-elevate`, `active-elevate-2`) for interactive elements. Lucide-react icons are used instead of emojis.
- **Premium Inputs:** Custom `.premium-input` class with sage focus states (border + ring).
- **Wizard Flow:** A 6-step wizard guides users through calculator creation: Business & Trade Setup, Design Your Calculator, Pricing Logic, Lead Form Builder, Validate Your Pricing, and Publish & Share. State is persisted in `localStorage`.
- **Test Gate (Step 4 — `TestGateStep.tsx`):** Premium validation system with 3 expandable scenario cards (Small/Typical/Large Job), real-time estimate calculation using `calculateEstimate.ts`, "What would YOU charge?" comparison with auto-deviation % and color-coded indicators (green ≤10%, yellow 10-20%, red >20%), accuracy score meter (0-100), smart suggestions for large deviations, Advanced Adjustment Mode for baseFee/rate/minCharge/multiplier, confirmation checkbox, and a strict publish gate (3 filled scenarios + accuracy ≥60 + 2+ within ±20% + checkbox). Call-for-quote/price-range types bypass scenario requirements. Test state persists via `test_history` in `calculator_settings`.
- **Pricing Architecture:**
    - Employs 10 strict "formula families" for all pricing calculations, defined and validated in `shared/pricingConfig.ts` with Zod schemas. No custom math is allowed.
    - A runtime calculator engine, `shared/calculateEstimate.ts`, handles all estimate calculations.
    - AI pricing generation (`/api/ai/generate-pricing`, `/api/ai/generate-pricing-draft`) is constrained to these formula families and validated.
    - A "Universal Pricing Questions" system (two-stage intake) in `CustomTradeQuestionnaire.tsx` and `PricingIntakeStage2.tsx` allows for structured input, which is mapped to `PricingConfigV1` by `shared/pricingIntakeMapper.ts`. AI is used as a fallback when the charge method is uncertain or mapping fails.
    - An AI Agent (`server/aiPricingAgent.ts`) is designed as a constrained composer with strict prompts, few-shot examples, derivation-first logic, and multi-layer validation to ensure valid pricing configurations.
- **Data Handling:** All API routes use Zod validation schemas. Frontend data fetching uses `@tanstack/react-query`. Token expiry is enforced on all token-gated routes.

## External Dependencies
- **PostgreSQL:** Used as the primary database, backed by Neon via Replit.
- **OpenAI:** Integrated via Replit AI Integrations, specifically using `gpt-5-mini` for AI-powered pricing generation and drafting.
- **Wouter:** A small routing library used in the React frontend.
- **Tailwind CSS:** A utility-first CSS framework for styling the application.
- **Shadcn UI:** A collection of reusable components built with Tailwind CSS.
- **Lucide-react:** An icon library used for UI elements.
- **@tanstack/react-query:** Used for data fetching, caching, and state management in the frontend.