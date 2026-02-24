# QuickQuote - SaaS Quote Calculator Builder

## Overview
QuickQuote is a SaaS application that enables trades businesses (e.g., plumbing, concrete, cleaning) to build and embed instant quote calculators on their websites. It facilitates real-time estimate generation for customers and efficient lead collection. The project aims to deliver a responsive, mobile-first experience with a premium, neutral SaaS aesthetic, enhancing lead generation and customer engagement for these businesses.

## User Preferences
I want iterative development. I prefer detailed explanations, especially for complex architectural decisions. I want to be asked before any major changes or new features are implemented. I prefer clear, concise communication.

## System Architecture
The application features a decoupled architecture comprising a React + TypeScript frontend with Wouter for routing, Tailwind CSS for styling, and Shadcn UI components. The backend is built with Express.js, providing API routes. Data is persisted in a PostgreSQL database. AI capabilities for pricing generation are integrated using OpenAI (gpt-5-mini) via Replit AI Integrations. User authentication for editing and accessing leads is token-based.

**UI/UX and Design Decisions:**
- **Mobile-first Design:** Layouts are primarily designed for mobile and are fully responsive.
- **Card-based Layouts:** Utilizes soft shadows and elevated cards for a modern aesthetic.
- **Theme Architecture:**
    - **PlatformTheme (Builder UI):** A generic premium SaaS aesthetic for the builder, edit pages, and leads dashboard, using a sage accent and neutral whites/grays.
    - **WidgetTheme (Customer Calculator):** Per-client customizable theme with a default sky blue accent, isolated to `.widget-scope`.
- **Typography:** Uses the Inter font stack with specific color values.
- **Interactivity:** Minimum 44px touch targets on mobile, full-width inputs, CSS keyframe animations, and `Lucide-react` icons. Custom `.premium-input` class with sage focus states.
- **Wizard Flow:** A 6-step wizard (Business & Trade Setup, Design Your Calculator, Pricing Logic, Capture Leads, Validate Your Pricing, Publish & Share) guides calculator creation, with state persisted in `localStorage`.
- **Lead Form:** A premium lead capture builder with mode selection (optional/gated/call-only), 9 toggleable fields, consent/compliance section, CTA button customization, delivery settings, and anti-spam (honeypot). Pro features are displayed but disabled.
- **Publish & Share:** Offers 4 deployment options: Instant Hosted Page (`{slug}.estimate.ai`), Embed on Website (Script/Iframe/Button snippets), Custom Domain (Pro, with DNS verification and SSL provisioning), and Done-For-You Install (Pro). Includes status badges, readiness checklist, and health indicators.
- **Test Gate:** A premium validation system with 3 scenario cards (Small/Typical/Large Job), real-time estimate calculation, "What would YOU charge?" comparison, accuracy score meter, smart suggestions, and Advanced Adjustment Mode. Requires scenarios to be filled and accuracy thresholds met for publishing.
- **Pricing Architecture:** Employs 10 strict "formula families" defined and validated with Zod schemas. A runtime calculator engine handles all estimate calculations. AI pricing generation is constrained to these formula families. A "Universal Pricing Questions" system (two-stage intake) maps inputs to pricing configurations, with AI as a fallback. An AI Agent ensures valid pricing configurations through constrained composition, strict prompts, and multi-layer validation.
- **SaaS Dashboard:** A 5-section dashboard (Overview, Pricing, Leads, Analytics, Settings) accessible via `edit_token`, displaying calculator status, analytics, lead management, and configuration options.
- **Automation:** Auto-tracking of analytics events (views, leads), background analytics aggregation via a daily job, weekly email reports, and a central job scheduler with retry logic.
- **Notification & Follow-Up Workers:** Instant business alerts (email, webhook) and scheduled follow-up drip sequences (thank_you, reminder, last_call) are processed by dedicated workers. Lead status changes can cancel pending follow-ups.
- **Database Tables:** Core tables include `calculators` (main config), `leads`, `analytics_events`, `deployment_status`, `calculator_analytics_summary`, `job_logs`, `notification_queue`, and `followup_jobs`.
- **Data Handling:** All API routes use Zod validation. Frontend data fetching uses `@tanstack/react-query`. Token expiry is enforced.
- **Estimate + Booking Hybrid Engine:** Supports `estimate_only`, `estimate_plus_booking`, or `booking_only` calculator types. Booking settings (deposit, slot duration, availability, Stripe Connect) are configured within the wizard. A "Book Now" button appears after estimates, leading to an inline booking panel with calendar/time slot selection. Requires Stripe Connect Express for deposit processing. Double-booking prevention is implemented. A "Bookings" tab in the Dashboard manages appointments with status updates. Confirmation emails are sent to customers and businesses.

## External Dependencies
- **PostgreSQL:** Primary database, hosted via Neon.
- **OpenAI:** Used for AI-powered pricing generation (`gpt-5-mini`) via Replit AI Integrations.
- **Stripe:** For payment processing via Stripe Connect Express, enabling businesses to collect deposits.
- **Wouter:** Frontend routing library.
- **Tailwind CSS:** Utility-first CSS framework.
- **Shadcn UI:** Reusable UI components.
- **Lucide-react:** Icon library.
- **@tanstack/react-query:** For frontend data fetching and state management.