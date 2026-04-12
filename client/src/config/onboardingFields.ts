/**
 * Client-side enrichment for onboarding template fields.
 * The DB stores { key, label, type, required }.
 * This config adds: placeholder, helperText, example, and options (for selects).
 * Keyed by field key — works across all services.
 */

export interface FieldEnrichment {
  placeholder?: string;
  helperText?: string;
  example?: string;
  options?: { value: string; label: string }[];
}

const FIELD_CONFIG: Record<string, FieldEnrichment> = {
  // Shared
  business_name: {
    placeholder: "e.g. Smith's Plumbing",
    helperText: "Your official business name as customers see it.",
  },
  business_address: {
    placeholder: "e.g. 12 Main St, Sydney NSW 2000",
    helperText: "The address shown on Google Maps.",
    example: "12 Main St, Sydney NSW 2000",
  },
  service_areas: {
    placeholder: "e.g. Sydney CBD, Inner West, North Shore",
    helperText: "List the suburbs or regions you serve.",
    example: "Sydney CBD, Inner West, North Shore, Eastern Suburbs",
  },
  services: {
    placeholder: "e.g. Plumbing repairs, Hot water systems, Blocked drains",
    helperText: "Your top 3–5 services. These will be highlighted.",
    example: "Plumbing repairs, Hot water systems, Blocked drains, Gas fitting",
  },
  service_area: {
    placeholder: "e.g. Melbourne metro, within 30km of CBD",
    helperText: "Where you operate.",
    example: "Melbourne metro, within 30km of CBD",
  },
  contact_info: {
    placeholder: "e.g. 0412 345 678, info@business.com, 12 Main St",
    helperText: "Phone, email, and address for your website.",
  },
  website_url: {
    placeholder: "e.g. https://www.yourbusiness.com.au",
    helperText: "Your current website address.",
  },
  competitors: {
    placeholder: "e.g. Jim's Plumbing, Local Plumbing Co",
    helperText: "Names or websites of your top local competitors.",
  },
  keywords: {
    placeholder: "e.g. emergency plumber sydney, hot water repair",
    helperText: "Search terms your customers might use to find you.",
  },

  // MapGuard
  google_account_email: {
    placeholder: "e.g. john@gmail.com",
    helperText: "The Google email linked to your Business Profile. We'll request access.",
    example: "john@gmail.com",
  },

  // TradeLine
  phone_number: {
    placeholder: "e.g. 0412 345 678",
    helperText: "The number customers call. We'll set up call handling on this.",
  },
  business_hours: {
    placeholder: "e.g. Mon–Fri 7am–5pm, Sat 8am–12pm",
    helperText: "When are you available to take jobs?",
    example: "Mon–Fri 7am–5pm, Sat 8am–12pm",
  },
  tone: {
    helperText: "How should we communicate with your customers?",
    options: [
      { value: "professional", label: "Professional" },
      { value: "friendly", label: "Friendly" },
      { value: "sales", label: "Sales-focused" },
    ],
  },
  pricing_examples: {
    placeholder: "e.g. Callout fee $80, Blocked drain from $150",
    helperText: "Rough pricing so we can give callers ballpark figures.",
  },
  faqs: {
    placeholder: "e.g. Do you do weekends? Are you licensed?",
    helperText: "Common questions your customers ask.",
  },
  after_hours_rules: {
    placeholder: "e.g. Take message, offer callback next morning",
    helperText: "What should happen when someone calls outside business hours?",
  },

  // QuoteQuick
  service_type: {
    placeholder: "e.g. Plumbing, Electrical, Landscaping",
    helperText: "The type of work you provide quotes for.",
  },
  quote_type: {
    placeholder: "e.g. Fixed price, Hourly rate, Per-item",
    helperText: "How you typically price your work.",
  },
  base_pricing: {
    placeholder: "e.g. Callout fee $80 + hourly rate $95/hr",
    helperText: "Your starting prices or rate card.",
  },
  upsells: {
    placeholder: "e.g. Same-day surcharge, Premium materials",
    helperText: "Any add-ons or upgrades you offer.",
  },
  discounts: {
    placeholder: "e.g. 10% off for seniors, bulk job discount",
    helperText: "Any promotions or discounts to include.",
  },
  booking_settings: {
    placeholder: "e.g. Require deposit, 2-hour booking window",
    helperText: "How you want bookings to work.",
  },

  // WebFix / RankFlow
  access_available: {
    helperText: "We need login access to your hosting or CMS to make changes.",
    options: [
      { value: "yes", label: "Yes, I can provide access" },
      { value: "no", label: "No, I'll need help with this" },
    ],
  },
  goal: {
    helperText: "What's the main thing you want improved?",
    options: [
      { value: "speed", label: "Speed (faster loading)" },
      { value: "seo", label: "SEO (better Google ranking)" },
      { value: "both", label: "Both speed and SEO" },
    ],
  },

  // ReputationShield
  google_profile_link: {
    placeholder: "e.g. https://g.page/your-business",
    helperText: "The link to your Google Business Profile.",
    example: "Search your business on Google, click your listing, copy the URL",
  },
  review_strategy: {
    helperText: "How should we request reviews from your customers?",
    options: [
      { value: "auto", label: "Automatic (we send requests after each job)" },
      { value: "manual", label: "Manual (you tell us when to send)" },
    ],
  },
  platforms: {
    placeholder: "e.g. Google, Facebook, ProductReview",
    helperText: "Other platforms where you want reviews.",
  },

  // SocialSync
  posting_frequency: {
    placeholder: "e.g. 3 times per week, daily",
    helperText: "How often should we post on your accounts?",
  },
  business_type: {
    placeholder: "e.g. Residential plumber, Commercial electrician",
    helperText: "This helps us create the right content style.",
  },
  content_style: {
    placeholder: "e.g. Before/after photos, tips, promotions",
    helperText: "What type of content works best for your audience?",
  },
  branding_notes: {
    placeholder: "e.g. Use blue and white, include logo on all posts",
    helperText: "Any brand guidelines or preferences.",
  },

  // SiteLaunch
  style_preference: {
    placeholder: "e.g. Clean and modern, Bold and colourful, Simple and professional",
    helperText: "What look and feel do you want for your site?",
  },
  extra_pages: {
    placeholder: "e.g. Gallery, Testimonials, FAQ",
    helperText: "Beyond the standard pages (Home, About, Services, Contact).",
  },

  // WebFix
  main_issue: {
    helperText: "What's the biggest problem with your current site?",
    options: [
      { value: "speed", label: "Speed (slow loading)" },
      { value: "seo", label: "SEO (not ranking well)" },
      { value: "both", label: "Both speed and SEO" },
    ],
  },
  access: {
    placeholder: "e.g. Yes, I'll send login details separately",
    helperText: "Can you provide hosting or CMS access?",
  },
};

export function getFieldConfig(key: string): FieldEnrichment {
  return FIELD_CONFIG[key] || {};
}
