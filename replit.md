# QuickQuote - SaaS Quote Calculator Builder

## Overview
QuickQuote is a SaaS application designed to empower trades businesses (e.g., plumbing, concrete, cleaning) to create and embed instant quote calculators on their websites. This platform aims to streamline lead generation and customer engagement by providing real-time estimate generation and efficient lead collection. The project focuses on delivering a responsive, mobile-first user experience with a premium, neutral SaaS aesthetic. Key ambitions include offering customizable calculator templates, advanced pricing logic, integrated booking capabilities, AI-powered assistance, and robust marketing automation features to enhance conversion rates for businesses.

## User Preferences
I want iterative development. I prefer detailed explanations, especially for complex architectural decisions. I want to be asked before any major changes or new features are implemented. I prefer clear, concise communication.

## System Architecture
The application features a decoupled architecture with a React + TypeScript frontend utilizing Wouter for routing, Tailwind CSS for styling, and Shadcn UI components. The backend is built with Express.js, providing API routes, and data is persisted in a PostgreSQL database. AI capabilities, particularly for pricing generation and an AI employee system, are integrated using OpenAI via Replit AI Integrations. User authentication for dashboard access is token-based.

**UI/UX and Design Decisions:**
- **Design Philosophy:** Mobile-first, fully responsive design with card-based layouts, soft shadows, and elevated elements.
- **Theming:** `PlatformTheme` for the builder UI (sage accent, neutral grays) and a customizable `WidgetTheme` for customer-facing calculators (default sky blue, isolated to `.widget-scope`).
- **Typography & Interactivity:** Uses Inter font stack, minimum 44px touch targets, full-width inputs, CSS keyframe animations, and `Lucide-react` icons. Custom `.premium-input` class with sage focus states.
- **Calculator Creation Wizard:** A 6-step wizard guides users through calculator setup, with state persisted in `localStorage`.
- **Lead Management:** Features a premium lead capture builder with configurable fields, consent sections, CTA customization, delivery settings, and anti-spam measures. Leads are managed through a dedicated dashboard.
- **Deployment Options:** Offers Instant Hosted Page, Embed on Website (Script/Iframe/Button), Custom Domain (Pro feature with DNS/SSL), and Done-For-You Install (Pro feature).
- **Pricing Architecture:** Employs 10 strict "formula families" validated with Zod schemas. A runtime calculator engine processes estimates, with AI pricing generation constrained to these formulas. A "Universal Pricing Questions" system and an AI Agent ensure valid pricing configurations.
- **SaaS Dashboard:** A multi-section dashboard (Overview, Pricing, Leads, Analytics, Settings, Bookings, Messages) provides calculator status, analytics, lead management, and configuration options.
- **Automation & Notifications:** Includes auto-tracking of analytics events, background analytics aggregation, weekly email reports, and a central job scheduler. Notification and follow-up workers manage instant alerts and scheduled drip sequences (email/SMS).
- **AI Employee System:** Integrates 3 isolated AI agent types (demo, platform support, client-facing) with server-enforced permissions and tool guards, leveraging OpenAI function calling for tasks like `generate_estimate` and `create_booking`.
- **Data Handling:** All API routes utilize Zod validation. Frontend data fetching is managed by `@tanstack/react-query`.
- **Estimate + Booking Hybrid Engine:** Supports `estimate_only`, `estimate_plus_booking`, or `booking_only` calculator types with configurable booking settings (deposit, slot duration, availability, Stripe Connect).
- **Templates + Sliders System:** Offers 6 high-converting UI templates for the customer-facing calculator widget and premium slider inputs for numerical fields, enhancing user experience.
- **Conversion Blocks:** Allows embedding optional images, testimonials, and trust badge blocks at various placements within the calculator widget to improve conversion.
- **Conversion Automation Engine:** Implements a coupon system with discount codes, quote expiration rules, and extended dashboard analytics for conversion funnel tracking.
- **Marketing Website:** A comprehensive marketing site (`/`, `/product`, `/pricing`, etc.) with shared layout, feature pages showcasing key functionalities, and pricing tiers.
- **Multi-Channel AI Messaging:** Integrates SMS and WhatsApp via Twilio for the client-facing AI employee, with conversation threads and a "Take Over" feature in the dashboard.

## External Dependencies
- **PostgreSQL:** Primary database (hosted via Neon).
- **OpenAI:** AI-powered pricing generation and AI employee system (via Replit AI Integrations).
- **Stripe:** Payment processing for deposits via Stripe Connect Express.
- **Wouter:** Frontend routing.
- **Tailwind CSS:** Utility-first CSS framework.
- **Shadcn UI:** Reusable UI components.
- **Lucide-react:** Icon library.
- **@tanstack/react-query:** Frontend data fetching and state management.
- **Twilio:** For SMS and WhatsApp messaging integration.