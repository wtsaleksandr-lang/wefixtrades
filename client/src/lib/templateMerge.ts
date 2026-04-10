/**
 * Template merge utility — V1
 *
 * Replaces {{placeholder}} tokens in a template string with prospect data.
 *
 * Behaviour for missing fields:
 *   - AI-generated fields (ai_first_line, ai_offer_angle, ai_cta_variant):
 *     replaced with a bracketed hint so the operator knows to fill it manually
 *   - All other fields: replaced with a bracketed hint
 *   - No raw {{tokens}} are ever shown to the operator
 */

export interface MergeFields {
  business_name?:         string;
  first_name?:            string;   // derived before calling — first word of owner_name
  city?:                  string;
  state?:                 string;
  trade?:                 string;
  review_count?:          string;
  rating?:                string;
  ai_first_line?:         string;
  ai_first_line_callout?: string;   // ai_first_line + "\n\n(so this stood out when I looked you up)"
  ai_offer_angle?:        string;
  ai_cta_variant?:        string;
  sender_name?:           string;
}

/** Human-readable placeholder shown when a field has no value */
const FIELD_HINTS: Record<string, string> = {
  business_name:  "[business name]",
  first_name:     "there",          // "Hey there," reads naturally when name is missing
  city:           "[city]",
  state:          "[state]",
  trade:          "trade",
  review_count:   "[# reviews]",
  rating:         "[rating]",
  ai_first_line:         "[personalized opening — run AI enrichment to generate]",
  ai_first_line_callout: "[personalized observation — run AI enrichment to generate]\n\n(so this stood out when I looked you up)",
  ai_offer_angle:        "[offer angle]",
  ai_cta_variant: "[CTA — run AI enrichment to generate]",
  sender_name:    "[your name]",
};

/**
 * Render a template string, replacing all {{field}} tokens with values.
 * Never leaves raw {{tokens}} in the output.
 */
export function renderTemplate(template: string, fields: MergeFields): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
    const value = (fields as Record<string, string | undefined>)[key];
    if (value !== undefined && value !== null && value !== "") return value;
    return FIELD_HINTS[key] ?? `[${key}]`;
  });
}

/**
 * Build MergeFields from a raw prospect + enrichment object.
 * Keeps all the awkward field-mapping in one place.
 */
export function buildMergeFields(
  prospect: {
    business_name:    string;
    owner_name?:      string | null;
    contact_name?:    string | null;
    city?:            string | null;
    state?:           string | null;
    trade_category?:  string | null;
    google_review_count?: number | null;
    google_rating?:   string | null;
  },
  enrichment: {
    ai_first_line?:  string | null;
    ai_offer_angle?: string | null;
    ai_cta_variant?: string | null;
  } | null | undefined,
  senderName?: string
): MergeFields {
  // Derive first name from owner_name or contact_name — take the first word only
  const rawName = prospect.owner_name || prospect.contact_name || "";
  const firstName = rawName.trim().split(/\s+/)[0] || undefined;

  return {
    business_name:  prospect.business_name,
    first_name:     firstName,
    city:           prospect.city ?? undefined,
    state:          prospect.state ?? undefined,
    trade:          prospect.trade_category ?? undefined,
    review_count:   prospect.google_review_count != null ? String(prospect.google_review_count) : undefined,
    rating:         prospect.google_rating ?? undefined,
    ai_first_line:  enrichment?.ai_first_line ?? undefined,
    ai_first_line_callout: enrichment?.ai_first_line
      ? `${enrichment.ai_first_line}\n\n(so this stood out when I looked you up)`
      : undefined,
    ai_offer_angle: enrichment?.ai_offer_angle ?? undefined,
    ai_cta_variant: enrichment?.ai_cta_variant ?? undefined,
    sender_name:    senderName,
  };
}
