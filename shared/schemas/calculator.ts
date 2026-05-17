import { z } from "zod";
import { bookingSettingsSchema } from "./booking";
import {
  pricingDraftSchema,
  pricingIntakeSchema,
  pricingAuditLogSchema,
} from "./pricing";

/* ─── UI Template ─── */

export const uiTemplateSchema = z.object({
  template_id: z.string().default('classic_single'),
  version: z.number().default(1),
  layout: z.object({
    style: z.enum(['single_page', 'multi_step', 'two_column']).default('single_page'),
    sticky_summary: z.boolean().default(false),
    show_breakdown: z.boolean().default(true),
    show_trust_block: z.boolean().default(false),
    show_testimonials: z.boolean().default(false),
    show_images: z.boolean().default(false),
  }).default({}),
  inputs: z.object({
    use_sliders: z.boolean().default(true),
    slider_defaults: z.object({
      step: z.number().default(1),
      show_value_bubble: z.boolean().default(true),
      show_min_max_labels: z.boolean().default(true),
    }).default({}),
  }).default({}),
}).default({});

export type UITemplate = z.infer<typeof uiTemplateSchema>;

/* ─── Conversion Blocks ─── */

export const conversionImageItemSchema = z.object({
  id: z.string(),
  url: z.string(),
  caption: z.string().nullable().default(null),
  sort_order: z.number().default(0),
});

export const conversionTestimonialItemSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  location: z.string().nullable().default(null),
  rating: z.number().int().min(1).max(5).default(5),
  text: z.string().min(20).max(240),
  sort_order: z.number().default(0),
});

export const conversionBlocksSchema = z.object({
  version: z.number().default(1),

  images: z.object({
    enabled: z.boolean().default(false),
    placement: z.enum(['top', 'under_title', 'near_cta', 'under_total']).default('under_title'),
    layout: z.enum(['grid', 'carousel']).default('grid'),
    max_items: z.number().default(6),
    items: z.array(conversionImageItemSchema).default([]),
  }).default({}),

  testimonials: z.object({
    enabled: z.boolean().default(false),
    placement: z.enum(['under_total', 'near_cta', 'bottom']).default('under_total'),
    layout: z.enum(['cards', 'carousel']).default('cards'),
    max_items: z.number().default(6),
    items: z.array(conversionTestimonialItemSchema).default([]),
  }).default({}),

  trust: z.object({
    enabled: z.boolean().default(true),
    placement: z.enum(['under_title', 'near_cta', 'bottom']).default('under_title'),
    badges: z.object({
      insured: z.boolean().default(true),
      licensed: z.boolean().default(true),
      bonded: z.boolean().default(false),
      satisfaction: z.boolean().default(true),
    }).default({}),
    microcopy: z.string().max(80).nullable().default(null),
  }).default({}),
}).default({});

export type ConversionBlocks = z.infer<typeof conversionBlocksSchema>;
export type ConversionImageItem = z.infer<typeof conversionImageItemSchema>;
export type ConversionTestimonialItem = z.infer<typeof conversionTestimonialItemSchema>;

/* ─── Calculator Settings (master schema) ─── */

export const calculatorSettingsSchema = z.object({
  settings_version: z.number().default(1),

  calculator_type: z.enum(['estimate_only', 'estimate_plus_booking', 'booking_only']).default('estimate_only'),
  booking_settings: bookingSettingsSchema,
  ui_template: uiTemplateSchema,
  conversion_blocks: conversionBlocksSchema,

  pricing_draft: pricingDraftSchema,
  pricing_intake: pricingIntakeSchema.optional(),
  pricing_audit: pricingAuditLogSchema.optional(),

  // Manual pricing mode (standard trades — set via PricingStrategySelector)
  pricing_mode: z.enum(['ai_suggested', 'hourly', 'fixed', 'range', 'custom']).default('ai_suggested'),
  manual_hourly_rate: z.number().optional(),
  manual_fixed_price: z.number().optional(),
  manual_range_min: z.number().optional(),
  manual_range_max: z.number().optional(),
  manual_custom_config: z.record(z.any()).optional(),

  appearance: z.object({
    color_theme: z.enum(['graphite', 'navy', 'emerald', 'slate', 'custom']).default('emerald'),
    accent_color: z.string().default('#0d3cfc'),
    button_style: z.enum(['soft-rounded', 'sharp', 'pill']).default('soft-rounded'),
    border_radius: z.enum(['compact', 'medium', 'large']).default('medium'),
    surface_style: z.enum(['solid', 'glassmorphic', 'elevated']).default('solid'),
    font: z.enum(['inter', 'georgia', 'montserrat', 'merriweather', 'roboto-mono']).default('inter'),
    logo_url: z.string().optional(),
    hover_effect: z.enum(['subtle-lift', 'glow', 'color-shift', 'none']).default('subtle-lift'),
    click_animation: z.boolean().default(true),
    gradient_buttons: z.boolean().default(false),
    button_size: z.enum(['compact', 'standard', 'large']).default('standard'),
    cta_text: z.string().default('Get My Estimate'),
    trust_badge: z.boolean().default(false),
    trust_badge_text: z.string().default('No obligation'),
    company_phone: z.string().optional(),
    show_powered_by: z.boolean().default(true),
  }).default({}),

  layout: z.object({
    card_spacing: z.enum(['tight', 'normal', 'airy']).default('normal'),
    input_style: z.enum(['outlined', 'filled', 'minimal']).default('outlined'),
    progress_style: z.enum(['numbers', 'dots', 'bar', 'hidden']).default('bar'),
    columns: z.enum(['single', 'two-column']).default('single'),
    sticky_summary: z.boolean().default(false),
  }).default({}),

  conversion: z.object({
    price_display: z.enum(['range', 'exact']).default('range'),
    disclaimer_text: z.string().default('Prices are estimates and may vary based on specific requirements.'),
    show_breakdown: z.boolean().default(true),
    show_upsell: z.boolean().default(false),
    upsell_text: z.string().optional(),
    booking_button: z.boolean().default(false),
    booking_url: z.string().optional(),
    redirect_url: z.string().optional(),
    require_email: z.boolean().default(false),
    require_phone: z.enum(['optional', 'required', 'hidden']).default('optional'),
    show_starting_price: z.boolean().default(false),
    urgency_message: z.string().optional(),
    delay_result: z.boolean().default(false),
  }).default({}),

  integrations: z.object({
    gtm_id: z.string().optional(),
    facebook_pixel_id: z.string().optional(),
    webhook_url: z.string().optional(),
    crm_enabled: z.boolean().default(false),
    email_template: z.string().optional(),
    custom_css: z.string().optional(),
    custom_js: z.string().optional(),
    language: z.string().default('en'),
    currency: z.string().default('USD'),
    dark_mode: z.boolean().default(false),
    animation_speed: z.enum(['slow', 'normal', 'fast']).default('normal'),
  }).default({}),

  lead_form: z.object({
    version: z.number().default(1),
    mode: z.enum(['optional', 'gated', 'call_only']).default('optional'),
    fields: z.object({
      name: z.boolean().default(true),
      phone: z.boolean().default(true),
      email: z.boolean().default(true),
      address: z.boolean().default(false),
      city: z.boolean().default(false),
      postal_zip: z.boolean().default(false),
      preferred_datetime: z.boolean().default(false),
      job_notes: z.boolean().default(false),
      file_upload: z.boolean().default(false),
    }).default({}),
    consent: z.object({
      enabled: z.boolean().default(true),
      text: z.string().default('I agree to be contacted about my quote.'),
      sms_opt_in: z.boolean().default(false),
    }).default({}),
    cta: z.object({
      button_text: z.string().default('Get My Quote'),
      helper_text: z.string().default(''),
    }).default({}),
    delivery: z.object({
      primary_email: z.string().default(''),
      secondary_email: z.string().default(''),
      webhook_url: z.string().default(''),
    }).default({}),
    spam: z.object({
      honeypot: z.boolean().default(true),
      recaptcha: z.boolean().default(false),
    }).default({}),
  }).default({}),

  publish: z.object({
    version: z.number().default(1),
    status: z.enum(['draft', 'published']).default('draft'),
    slug: z.string().default(''),
    subdomain: z.string().default(''),
    published_at: z.number().nullable().default(null),
    embed_id: z.string().default(''),
    last_modified: z.number().nullable().default(null),
    custom_domain: z.string().default(''),
    custom_domain_status: z.enum(['none', 'pending_dns', 'dns_verified', 'ssl_provisioning', 'active', 'failed']).default('none'),
    ssl_status: z.enum(['none', 'pending', 'provisioning', 'active', 'failed']).default('none'),
    last_dns_check: z.number().nullable().default(null),
    hosting_domain: z.string().default('instant-quote.com'),
  }).default({}),

  followup: z.object({
    version: z.number().default(1),
    enabled: z.boolean().default(false),
    channels: z.object({
      email: z.boolean().default(true),
      sms: z.boolean().default(false),
    }).default({}),
    schedule: z.array(z.object({
      offset_minutes: z.number().optional(),
      offset_hours: z.number().optional(),
      offset_days: z.number().optional(),
      type: z.string(),
    })).default([
      { offset_minutes: 2, type: "thank_you" },
      { offset_hours: 24, type: "reminder" },
      { offset_days: 3, type: "last_call" },
    ]),
    templates: z.object({
      thank_you: z.object({
        subject: z.string().default("Thanks for your quote request!"),
        body: z.string().default("Hi {{name}},\n\nThanks for requesting a quote from {{business_name}}. We received your request and will follow up shortly.\n\nYour estimated quote: {{quote_amount}}\n\nIf you'd like to discuss your project sooner, call us at {{phone}} or book a time: {{booking_link}}\n\nBest,\n{{business_name}}"),
        sms: z.string().default("Thanks for your quote request from {{business_name}}! We'll follow up soon. Questions? Call {{phone}}"),
      }).default({}),
      reminder: z.object({
        subject: z.string().default("Following up on your quote — {{business_name}}"),
        body: z.string().default("Hi {{name}},\n\nJust checking in on the quote you requested from {{business_name}}.\n\nYour estimate: {{quote_amount}}\n\nWe'd love to help get your project started. Call us at {{phone}} or book a time: {{booking_link}}\n\nBest,\n{{business_name}}"),
        sms: z.string().default("Hi {{name}}, just following up on your quote from {{business_name}}. Ready to get started? Call {{phone}}"),
      }).default({}),
      last_call: z.object({
        subject: z.string().default("Want to lock in a slot this week? — {{business_name}}"),
        body: z.string().default("Hi {{name}},\n\nWe wanted to reach out one last time about your quote from {{business_name}}.\n\nYour estimate: {{quote_amount}}\n\nOur schedule fills up fast — if you'd like to lock in a slot this week, give us a call at {{phone}} or book here: {{booking_link}}\n\nAs a special thank you, use code {{discount_code}} to save {{discount_value}} on your project.\n\nThanks,\n{{business_name}}"),
        sms: z.string().default("Hi {{name}}, last chance to lock in your slot with {{business_name}} this week! Use code {{discount_code}} to save {{discount_value}}. Call {{phone}}"),
      }).default({}),
    }).default({}),
    personalization: z.object({
      business_name: z.string().default(""),
      phone: z.string().default(""),
      booking_link: z.string().default(""),
      service_area: z.string().default(""),
    }).default({}),
    notifications: z.object({
      email_enabled: z.boolean().default(true),
      sms_enabled: z.boolean().default(false),
      webhook_enabled: z.boolean().default(false),
      webhook_url: z.string().default(""),
    }).default({}),
    reminders: z.object({
      reminder_1_enabled: z.boolean().default(true),
      reminder_1_delay_hours: z.number().default(24),
      reminder_2_enabled: z.boolean().default(true),
      reminder_2_delay_days: z.number().default(3),
      reminder_2_include_discount: z.boolean().default(false),
      reminder_2_coupon_id: z.string().nullable().default(null),
    }).default({}),
  }).default({}),

  promotions: z.object({
    version: z.number().default(1),
    enabled: z.boolean().default(false),
    coupons: z.array(z.object({
      id: z.string(),
      code: z.string(),
      type: z.enum(['percentage', 'fixed']),
      value: z.number().min(0),
      applies_to: z.enum(['estimate_total', 'deposit_only']).default('estimate_total'),
      expires_at: z.number().nullable().default(null),
      usage_limit: z.number().nullable().default(null),
      usage_count: z.number().default(0),
      active: z.boolean().default(true),
    })).default([]),
  }).default({}),

  quote_rules: z.object({
    expiration_enabled: z.boolean().default(false),
    valid_days: z.number().min(1).max(365).default(7),
    show_countdown: z.boolean().default(false),
  }).default({}),

  ai_employee: z.object({
    enabled: z.boolean().default(false),
    trial_started_at: z.number().nullable().default(null),
    subscription_status: z.enum(['inactive', 'trial', 'active']).default('inactive'),
    chat_enabled: z.boolean().default(true),
    voice_enabled: z.boolean().default(false),
    training_profile: z.object({
      business_summary: z.string().max(200).default(''),
      services: z.array(z.string()).default([]),
      service_area: z.string().max(60).default(''),
      working_hours: z.object({
        days: z.array(z.string()).default(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']),
        start_time: z.string().default('08:00'),
        end_time: z.string().default('17:00'),
      }).default({}),
      emergency_service: z.boolean().default(false),
      escalation_phone: z.string().nullable().default(null),
      escalation_email: z.string().nullable().default(null),
      tone: z.enum(['professional', 'friendly', 'direct', 'premium']).default('professional'),
    }).default({}),
    channels: z.object({
      web_chat: z.boolean().default(true),
      sms: z.boolean().default(false),
      whatsapp: z.boolean().default(false),
    }).default({}),
    twilio: z.object({
      enabled: z.boolean().default(false),
      from_number: z.string().nullable().default(null),
      whatsapp_number: z.string().nullable().default(null),
    }).default({}),
    consent: z.object({
      sms_required: z.boolean().default(true),
      consent_text: z.string().default('I agree to receive text messages about my quote and booking from this business.'),
      store_consent: z.boolean().default(true),
    }).default({}),
  }).default({}),

  test_history: z.object({
    scenarios: z.array(z.object({
      label: z.string(),
      inputs: z.record(z.any()),
      yourCharge: z.string(),
    })),
    accuracy_score: z.number(),
    confirmed: z.boolean(),
    advanced_adjustments: z.record(z.number()).nullable(),
    timestamp: z.number(),
    refinement: z.object({
      version: z.number(),
      last_tier: z.enum(['strong', 'close', 'needs_adjustment']),
      last_answers: z.object({
        q1: z.array(z.string()),
        q2: z.string(),
        q3: z.string(),
      }),
      tune_count: z.number(),
      last_tuned_at: z.number().nullable(),
    }).optional(),
  }).optional(),
}).default({});

export type CalculatorSettings = z.infer<typeof calculatorSettingsSchema>;
