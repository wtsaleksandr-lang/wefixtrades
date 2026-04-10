/**
 * RankFlow Execution Configuration
 *
 * Defines quality standards, QA requirements, rejection conditions,
 * cost limits, and vendor rules for every task type.
 */

/* ─── Types ─── */

export interface QualityChecklist {
  check: string;
  description: string;
}

export interface ExecutionConfig {
  execution_mode: "ai" | "manual_admin" | "outsourced";
  vendor_type: string | null;
  qa_requirements: string[];
  reject_conditions: string[];
  quality_checklist: QualityChecklist[];
  proof_requirements: string[];
  estimated_cost: number;
  max_cost: number;
  instructions_template: string;
}

export interface VendorTypeConfig {
  id: string;
  label: string;
  allowed_task_types: string[];
  expected_cost_range: [number, number]; // [min, max] in dollars
  expected_turnaround_days: [number, number];
  quality_notes: string;
}

/* ─── Approved Directories ─── */

export const APPROVED_CITATION_DIRECTORIES = [
  "yelp.com", "yellowpages.com", "bbb.org", "manta.com", "superpages.com",
  "angieslist.com", "angi.com", "thumbtack.com", "homeadvisor.com",
  "houzz.com", "mapquest.com", "foursquare.com", "hotfrog.com",
  "citysearch.com", "merchantcircle.com", "brownbook.net",
  "facebook.com", "bing.com", "apple.com", "google.com",
  "canpages.ca", "yellowpages.ca", "411.ca", "canada411.ca",
  "cylex.ca", "businessdirectory.cc",
];

/* ─── Task Execution Configs ─── */

const EXECUTION_MAP: Record<string, ExecutionConfig> = {
  page_create: {
    execution_mode: "ai",
    vendor_type: null,
    qa_requirements: ["content_length", "has_structure", "has_location", "has_cta", "not_duplicate"],
    reject_conditions: ["thin_content", "generic_ai_text", "no_location_context", "no_structure", "keyword_stuffing"],
    quality_checklist: [
      { check: "800-1500 words", description: "Content must be 800-1500 words" },
      { check: "H1 + H2 structure", description: "Clear heading hierarchy with H1 (primary keyword) and H2s" },
      { check: "Location mentioned", description: "City/area mentioned naturally in content, not just title" },
      { check: "Service clarity", description: "Specific service clearly described, not generic filler" },
      { check: "CTA present", description: "At least one clear call-to-action (call, form, quote)" },
      { check: "Internal links", description: "2-3 links to related service/location pages" },
      { check: "Not duplicated", description: "Content is unique, not copied from another page on the site" },
    ],
    proof_requirements: ["page_url", "word_count_note"],
    estimated_cost: 2,
    max_cost: 30,
    instructions_template: "Create a unique, locally-relevant service page. Must include specific service details, location context, and clear CTAs. No generic AI filler.",
  },

  meta_fix: {
    execution_mode: "ai",
    vendor_type: null,
    qa_requirements: ["title_has_keyword", "title_length", "meta_length", "no_keyword_stuffing"],
    reject_conditions: ["keyword_stuffing", "duplicate_title", "too_long", "generic_title"],
    quality_checklist: [
      { check: "Title includes keyword + location", description: "Format: [Service] in [City] | [Business Name]" },
      { check: "Title under 60 chars", description: "Google truncates titles over 60 characters" },
      { check: "Meta under 155 chars", description: "Meta descriptions over 155 chars get truncated" },
      { check: "Meta has CTA", description: "Meta description includes a call-to-action or value prop" },
      { check: "Unique per page", description: "No two pages should have identical title/meta" },
      { check: "No keyword stuffing", description: "Keyword appears once in title, naturally in meta" },
    ],
    proof_requirements: ["before_after_note"],
    estimated_cost: 0,
    max_cost: 5,
    instructions_template: "Rewrite title tag and meta description. Title: [Service] in [City] | [Business]. Meta: readable sentence with CTA. No stuffing.",
  },

  citation_build: {
    execution_mode: "outsourced",
    vendor_type: "fiverr_citations",
    qa_requirements: ["listing_live", "nap_match", "directory_quality", "indexable"],
    reject_conditions: ["fake_directory", "noindex_page", "wrong_nap", "duplicate_listing", "link_farm"],
    quality_checklist: [
      { check: "Real directory", description: "Must be a recognized directory (Yelp, BBB, YellowPages, etc.)" },
      { check: "NAP exact match", description: "Business name, address, and phone must match exactly" },
      { check: "Live listing URL", description: "URL must load and show the business listing" },
      { check: "Indexable", description: "Page must not have noindex/nofollow meta tags" },
      { check: "No duplicates", description: "Must not create duplicate listings on same directory" },
    ],
    proof_requirements: ["listing_urls"],
    estimated_cost: 3,
    max_cost: 10,
    instructions_template: "Submit business to approved local directories with exact NAP. Provide live listing URL for each. No spam directories.",
  },

  internal_linking: {
    execution_mode: "ai",
    vendor_type: null,
    qa_requirements: ["links_relevant", "anchor_text_natural"],
    reject_conditions: ["irrelevant_links", "over_optimization", "broken_links"],
    quality_checklist: [
      { check: "Relevant anchor text", description: "Link text describes the target page naturally" },
      { check: "Related pages linked", description: "Links connect topically related service/location pages" },
      { check: "2-3 links per page", description: "Not over-linking — 2-3 contextual links per page" },
      { check: "No broken links", description: "All linked URLs load correctly" },
    ],
    proof_requirements: ["pages_updated_note"],
    estimated_cost: 0,
    max_cost: 15,
    instructions_template: "Add 2-3 contextual internal links per page. Use natural anchor text. Link between related service and location pages.",
  },

  content_support: {
    execution_mode: "ai",
    vendor_type: null,
    qa_requirements: ["content_length", "actionable_brief"],
    reject_conditions: ["too_vague", "no_keywords"],
    quality_checklist: [
      { check: "Specific keyword targets", description: "Brief includes specific keywords to target" },
      { check: "Actionable topics", description: "Topics are specific enough to write pages from" },
      { check: "Location-aware", description: "Topics consider the service area" },
    ],
    proof_requirements: ["brief_content"],
    estimated_cost: 1,
    max_cost: 5,
    instructions_template: "Generate a content brief with specific keyword targets, topic suggestions, and page outlines. Must be actionable.",
  },

  schema_basic: {
    execution_mode: "ai",
    vendor_type: null,
    qa_requirements: ["valid_jsonld", "correct_business_info", "page_updated"],
    reject_conditions: ["invalid_schema", "wrong_business_info", "missing_fields"],
    quality_checklist: [
      { check: "Valid JSON-LD", description: "Schema validates in Google Rich Results Test" },
      { check: "LocalBusiness type", description: "Uses LocalBusiness or appropriate subtype" },
      { check: "Correct NAP", description: "Business name, address, phone match actual business" },
      { check: "Service type included", description: "Schema includes service type and area served" },
    ],
    proof_requirements: ["page_url", "validation_note"],
    estimated_cost: 0,
    max_cost: 10,
    instructions_template: "Generate LocalBusiness + Service JSON-LD schema. Validate with Rich Results Test. All business info must be accurate.",
  },
};

const DEFAULT_CONFIG: ExecutionConfig = {
  execution_mode: "manual_admin",
  vendor_type: null,
  qa_requirements: [],
  reject_conditions: [],
  quality_checklist: [],
  proof_requirements: [],
  estimated_cost: 0,
  max_cost: 50,
  instructions_template: "",
};

export function getExecutionConfig(taskType: string): ExecutionConfig {
  return EXECUTION_MAP[taskType] || DEFAULT_CONFIG;
}

/* ─── Vendor Type Registry ─── */

const VENDOR_TYPES: Record<string, VendorTypeConfig> = {
  fiverr_citations: {
    id: "fiverr_citations",
    label: "Fiverr — Citation Building",
    allowed_task_types: ["citation_build"],
    expected_cost_range: [1, 5],
    expected_turnaround_days: [3, 14],
    quality_notes: "Must use approved directories only. Verify NAP accuracy. Reject bulk spam submissions.",
  },
  fiverr_content: {
    id: "fiverr_content",
    label: "Fiverr — Content Writing",
    allowed_task_types: ["page_create", "content_support"],
    expected_cost_range: [10, 50],
    expected_turnaround_days: [3, 7],
    quality_notes: "Content must be unique, location-specific, and not generic AI fill. Reject thin content under 800 words.",
  },
  fiverr_onpage: {
    id: "fiverr_onpage",
    label: "Fiverr — On-Page SEO",
    allowed_task_types: ["meta_fix", "schema_basic"],
    expected_cost_range: [5, 25],
    expected_turnaround_days: [2, 5],
    quality_notes: "Must provide before/after proof. No keyword stuffing. Validate schema with Google tool.",
  },
  internal_ai: {
    id: "internal_ai",
    label: "Internal — AI Engine",
    allowed_task_types: ["page_create", "meta_fix", "content_support", "schema_basic"],
    expected_cost_range: [0, 2],
    expected_turnaround_days: [0, 1],
    quality_notes: "AI output must be reviewed for quality. Auto-QA catches obvious issues but admin review recommended for page_create.",
  },
};

export function getVendorTypeConfig(vendorType: string): VendorTypeConfig | undefined {
  return VENDOR_TYPES[vendorType];
}

export function getAllVendorTypes(): VendorTypeConfig[] {
  return Object.values(VENDOR_TYPES);
}

/**
 * Check if actual cost exceeds the expected range for a task type.
 */
export function isCostOverBudget(taskType: string, actualCost: number): boolean {
  const config = EXECUTION_MAP[taskType];
  if (!config) return false;
  return actualCost > config.max_cost;
}

/**
 * Check if actual cost exceeds vendor type expected range.
 */
export function isVendorCostOverRange(vendorType: string, costPerTask: number): boolean {
  const vendor = VENDOR_TYPES[vendorType];
  if (!vendor) return false;
  return costPerTask > vendor.expected_cost_range[1];
}
