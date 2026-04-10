/**
 * RankFlow Delivery Framework
 *
 * Defines vendor categories, task→vendor mapping, SOP references,
 * cost guardrails, and service boundaries.
 *
 * This is the operational source of truth for how RankFlow work gets done.
 */

/* ─── Vendor Categories ─── */

export interface VendorCategory {
  id: string;
  label: string;
  description: string;
  allowed_tasks: string[];
  forbidden_tasks: string[];
  expected_cost_per_task: [number, number]; // [min, max] USD
  expected_turnaround_days: [number, number];
  risk_level: "low" | "medium" | "high";
  qa_sensitivity: "standard" | "strict";
  sourcing_notes: string;
}

export const VENDOR_CATEGORIES: VendorCategory[] = [
  {
    id: "citation_vendor",
    label: "Citation / Directory Submissions",
    description: "Submits business to approved local directories with consistent NAP.",
    allowed_tasks: ["citation_build"],
    forbidden_tasks: ["page_create", "meta_fix", "internal_linking", "schema_basic"],
    expected_cost_per_task: [1, 5],
    expected_turnaround_days: [3, 14],
    risk_level: "low",
    qa_sensitivity: "strict",
    sourcing_notes: "Use Fiverr sellers with 4.8+ rating, 100+ reviews, and portfolio showing real directory listings. Avoid sellers promising 500+ citations for $5.",
  },
  {
    id: "content_vendor",
    label: "Content Polish / Upload",
    description: "Reviews AI-drafted content, polishes for quality, and publishes to client CMS.",
    allowed_tasks: ["page_create"],
    forbidden_tasks: ["citation_build"],
    expected_cost_per_task: [10, 30],
    expected_turnaround_days: [2, 5],
    risk_level: "low",
    qa_sensitivity: "strict",
    sourcing_notes: "Use Fiverr writers with SEO experience and native English. Provide the AI draft + brief. They polish and upload. Never let vendor write from scratch without a brief.",
  },
  {
    id: "onpage_vendor",
    label: "On-Page SEO Implementation",
    description: "Implements title/meta changes, heading fixes, and schema markup on client websites.",
    allowed_tasks: ["meta_fix", "schema_basic"],
    forbidden_tasks: ["citation_build", "page_create"],
    expected_cost_per_task: [5, 20],
    expected_turnaround_days: [1, 3],
    risk_level: "medium",
    qa_sensitivity: "standard",
    sourcing_notes: "Requires WordPress/CMS access. Use vendors with proven WordPress SEO experience. Always verify changes before and after. Prefer sellers who show before/after screenshots.",
  },
  {
    id: "internal_ai",
    label: "Internal AI Engine",
    description: "AI-generated content drafts, meta suggestions, schema generation, and content briefs.",
    allowed_tasks: ["page_create", "meta_fix", "content_support", "schema_basic"],
    forbidden_tasks: ["citation_build"],
    expected_cost_per_task: [0, 2],
    expected_turnaround_days: [0, 1],
    risk_level: "low",
    qa_sensitivity: "standard",
    sourcing_notes: "Fully automated. Output must pass quality checks before delivery. Admin review recommended for page_create tasks.",
  },
];

/* ─── Task → Vendor Mapping ─── */

export interface TaskVendorMapping {
  task_type: string;
  primary_vendor: string;
  fallback_vendor: string | null;
  execution_flow: string;
  requires_cms_access: boolean;
}

export const TASK_VENDOR_MAP: TaskVendorMapping[] = [
  {
    task_type: "citation_build",
    primary_vendor: "citation_vendor",
    fallback_vendor: null,
    execution_flow: "Admin batches tasks → assigns to citation vendor → vendor submits proof URLs → QA verifies listings",
    requires_cms_access: false,
  },
  {
    task_type: "page_create",
    primary_vendor: "internal_ai",
    fallback_vendor: "content_vendor",
    execution_flow: "AI generates draft → admin reviews → content vendor polishes and uploads to CMS → QA checks live page",
    requires_cms_access: true,
  },
  {
    task_type: "meta_fix",
    primary_vendor: "internal_ai",
    fallback_vendor: "onpage_vendor",
    execution_flow: "AI generates title/meta recommendations → admin or on-page vendor implements in CMS → QA checks",
    requires_cms_access: true,
  },
  {
    task_type: "internal_linking",
    primary_vendor: "internal_ai",
    fallback_vendor: "onpage_vendor",
    execution_flow: "AI suggests link map → admin or AI implements in CMS → QA verifies links work",
    requires_cms_access: true,
  },
  {
    task_type: "content_support",
    primary_vendor: "internal_ai",
    fallback_vendor: null,
    execution_flow: "AI generates content brief with keyword targets and outlines → admin reviews → delivered to client file",
    requires_cms_access: false,
  },
  {
    task_type: "schema_basic",
    primary_vendor: "internal_ai",
    fallback_vendor: "onpage_vendor",
    execution_flow: "AI generates JSON-LD → admin or on-page vendor injects into CMS → QA validates with Rich Results Test",
    requires_cms_access: true,
  },
];

/* ─── SOP Definitions ─── */

export interface SOPStep {
  step: number;
  action: string;
  owner: "ai" | "admin" | "vendor";
  notes: string;
}

export interface TaskSOP {
  task_type: string;
  title: string;
  required_inputs: string[];
  steps: SOPStep[];
  proof_requirements: string[];
  rejection_reasons: string[];
  quality_rules: string[];
}

export const TASK_SOPS: TaskSOP[] = [
  {
    task_type: "citation_build",
    title: "Citation Build SOP",
    required_inputs: [
      "Business name (exact)",
      "Full address",
      "Phone number",
      "Website URL",
      "Business category",
    ],
    steps: [
      { step: 1, action: "Prepare NAP details from client profile", owner: "admin", notes: "Verify all details match exactly across all sources" },
      { step: 2, action: "Batch citation tasks by vendor type", owner: "admin", notes: "Group 5-15 citations per batch for efficiency" },
      { step: 3, action: "Assign batch to citation vendor", owner: "admin", notes: "Use approved vendor only. Include NAP sheet in dispatch packet." },
      { step: 4, action: "Vendor submits to approved directories", owner: "vendor", notes: "Must use directories from approved list only. No spam directories." },
      { step: 5, action: "Vendor provides proof URLs for each listing", owner: "vendor", notes: "One live URL per directory. URL must show business listing." },
      { step: 6, action: "QA: verify listing live + NAP matches + directory quality", owner: "admin", notes: "Reject if NAP wrong, directory fake, or page noindex." },
    ],
    proof_requirements: ["Live listing URL for each directory"],
    rejection_reasons: [
      "Fake or low-quality directory",
      "Noindex page",
      "NAP mismatch (name, address, or phone wrong)",
      "Duplicate listing on same directory",
      "URL does not load or shows error",
    ],
    quality_rules: [
      "Only use approved directories (see APPROVED_CITATION_DIRECTORIES in executionConfig)",
      "NAP must match exactly — no abbreviations, no variations",
      "Each listing must be on a unique directory",
      "Page must be indexable (no noindex/nofollow)",
    ],
  },
  {
    task_type: "page_create",
    title: "Page Creation SOP",
    required_inputs: [
      "Target keyword cluster",
      "Primary keyword",
      "Service type",
      "Location",
      "Client website URL",
      "CMS access credentials",
    ],
    steps: [
      { step: 1, action: "Generate AI content draft from keyword cluster", owner: "ai", notes: "Include primary + supporting keywords, H1/H2 structure, location context, CTA" },
      { step: 2, action: "Review AI draft for quality and accuracy", owner: "admin", notes: "Check for generic filler, missing location, thin content. Edit or regenerate if needed." },
      { step: 3, action: "Send to content vendor for polish and upload", owner: "admin", notes: "Provide draft + brief + CMS credentials. Vendor polishes and publishes." },
      { step: 4, action: "Vendor publishes page to CMS", owner: "vendor", notes: "Add to proper URL structure, set meta tags, add internal links, include CTA." },
      { step: 5, action: "Vendor provides live page URL", owner: "vendor", notes: "URL must load and show the published page." },
      { step: 6, action: "QA: check content length, structure, location, CTA, links", owner: "admin", notes: "Reject if thin, generic, missing location, or no CTA." },
    ],
    proof_requirements: ["Live page URL", "Word count confirmation"],
    rejection_reasons: [
      "Content under 800 words",
      "No heading structure (missing H1 or H2s)",
      "No location mention in content body",
      "No CTA (call/form/quote button)",
      "Generic AI text with no local specifics",
      "Duplicate content from another page on site",
    ],
    quality_rules: [
      "800-1500 words minimum",
      "H1 must contain primary keyword",
      "H2 sections for supporting keywords",
      "Location mentioned naturally (not just in title)",
      "At least one CTA section",
      "2-3 internal links to related pages",
      "Unique content — not copied from other pages",
    ],
  },
  {
    task_type: "meta_fix",
    title: "Title/Meta Optimization SOP",
    required_inputs: [
      "Target page URL",
      "Target keyword",
      "Business name",
      "Location",
    ],
    steps: [
      { step: 1, action: "AI generates title and meta description recommendations", owner: "ai", notes: "Title format: [Service] in [City] | [Business]. Meta: readable with CTA." },
      { step: 2, action: "Admin reviews and approves recommendations", owner: "admin", notes: "Check length, keyword placement, uniqueness. No stuffing." },
      { step: 3, action: "Implement in CMS (admin or vendor)", owner: "admin", notes: "Update via Yoast/RankMath or direct HTML edit." },
      { step: 4, action: "Verify changes are live", owner: "admin", notes: "View page source to confirm title and meta are correct." },
    ],
    proof_requirements: ["Before/after title and meta description"],
    rejection_reasons: [
      "Title over 60 characters",
      "Meta over 155 characters",
      "Keyword stuffing",
      "Duplicate of another page's title",
      "Generic title without location or service",
    ],
    quality_rules: [
      "Title: under 60 characters, includes keyword + location + business name",
      "Meta: under 155 characters, readable sentence with CTA",
      "Each page must have unique title and meta",
      "No keyword stuffing — keyword appears once in title, naturally in meta",
    ],
  },
  {
    task_type: "internal_linking",
    title: "Internal Linking SOP",
    required_inputs: [
      "Client website URL",
      "CMS access",
      "List of service and location pages",
    ],
    steps: [
      { step: 1, action: "Identify linking opportunities between service pages", owner: "admin", notes: "Map which pages should link to each other based on topic relevance." },
      { step: 2, action: "Add 2-3 contextual internal links per page", owner: "vendor", notes: "Use descriptive anchor text. Link within content body, not footer." },
      { step: 3, action: "Verify all links work", owner: "admin", notes: "Click each link to confirm it loads the correct page." },
    ],
    proof_requirements: ["List of pages updated with links added"],
    rejection_reasons: [
      "Generic anchor text (click here, read more)",
      "Broken links",
      "Links to irrelevant pages",
      "Over-linking (more than 5 internal links added to one page)",
    ],
    quality_rules: [
      "Use descriptive, keyword-relevant anchor text",
      "Link topically related pages (plumber page → drain cleaning, not plumber → roofing)",
      "2-3 new links per page maximum",
      "Links must be in content body, not footer or sidebar",
    ],
  },
  {
    task_type: "schema_basic",
    title: "Schema Markup SOP",
    required_inputs: [
      "Business name, address, phone",
      "Service types",
      "Operating hours",
      "Target page URL",
      "CMS access",
    ],
    steps: [
      { step: 1, action: "AI generates LocalBusiness + Service JSON-LD", owner: "ai", notes: "Include name, address, phone, service type, area served." },
      { step: 2, action: "Admin validates with Google Rich Results Test", owner: "admin", notes: "Paste schema into validator. Fix any errors." },
      { step: 3, action: "Inject into page head (admin or vendor)", owner: "admin", notes: "Add via theme header, plugin, or direct edit." },
      { step: 4, action: "Verify schema is live on page", owner: "admin", notes: "Use Rich Results Test with live URL to confirm." },
    ],
    proof_requirements: ["Page URL with schema live", "Rich Results Test validation screenshot or note"],
    rejection_reasons: [
      "Invalid JSON-LD (syntax errors)",
      "Wrong business name, address, or phone",
      "Missing required fields (name, address, phone)",
      "Schema not present on live page",
    ],
    quality_rules: [
      "Must use LocalBusiness schema type (or appropriate subtype)",
      "All business info must match official NAP exactly",
      "Include service type and area served",
      "Must pass Google Rich Results Test without errors",
    ],
  },
  {
    task_type: "content_support",
    title: "Content Brief SOP",
    required_inputs: [
      "Client niche",
      "Target services",
      "Target locations",
      "Existing keyword list",
    ],
    steps: [
      { step: 1, action: "AI generates content brief with keyword targets", owner: "ai", notes: "Include untargeted keywords, suggested topics, and page outlines." },
      { step: 2, action: "Admin reviews brief for quality and relevance", owner: "admin", notes: "Ensure topics are specific, not generic. Must be actionable." },
    ],
    proof_requirements: ["Content brief document or notes"],
    rejection_reasons: [
      "Brief is too vague to create pages from",
      "No keyword targets included",
      "Topics are generic and not location-specific",
    ],
    quality_rules: [
      "Must include 3-5 specific keyword targets",
      "Topics must be specific enough to write a page from",
      "Must consider the client's service area",
    ],
  },
];

/* ─── Service Boundaries ─── */

export const SERVICE_BOUNDARIES = {
  included: [
    "Keyword research and local targeting",
    "Title and meta description optimization",
    "SEO page creation (AI-drafted, human-reviewed)",
    "Local citation and directory building (approved directories only)",
    "Internal linking between service pages",
    "LocalBusiness schema markup",
    "Google Search Console monitoring",
    "Monthly progress reporting via client dashboard",
    "Content briefs and strategy recommendations",
  ],
  excluded: [
    "Full website redesign or rebuild (use SiteLaunch)",
    "Website speed optimization or Core Web Vitals fixes (use WebFix/WebCare)",
    "Google Ads or paid advertising (use AdFlow)",
    "Social media posting or management (use SocialSync)",
    "Review management or reputation monitoring (use ReputationShield)",
    "Google Business Profile management (use MapGuard)",
    "Aggressive backlink schemes or link buying",
    "Guaranteed ranking positions",
    "Custom development or code changes",
    "Deep technical SEO requiring server access",
    "Penalty recovery or disavow file management",
    "Multi-language or international SEO",
    "eCommerce product SEO",
  ],
};

/* ─── Monthly Delivery Playbook ─── */

export interface PlaybookStep {
  phase: string;
  step: number;
  action: string;
  automated: boolean;
  owner: "system" | "admin" | "vendor" | "client";
  notes: string;
}

export const MONTHLY_PLAYBOOK: PlaybookStep[] = [
  { phase: "setup", step: 1, action: "Client completes onboarding (business name, website, trade, location)", automated: true, owner: "client", notes: "3-step wizard in portal. Auto-creates profile." },
  { phase: "setup", step: 2, action: "System generates keyword targets from niche + location", automated: true, owner: "system", notes: "Keywords saved to tracking table. Max 40 per client." },
  { phase: "planning", step: 3, action: "System generates monthly plan from tier quotas", automated: true, owner: "system", notes: "Weekly cron (Monday 4AM UTC) or manual trigger." },
  { phase: "planning", step: 4, action: "System expands plan into concrete tasks with keyword clusters", automated: true, owner: "system", notes: "Tasks created with execution config, QA requirements, and instructions." },
  { phase: "execution", step: 5, action: "AI tasks auto-execute (drafts, meta suggestions, schema, briefs)", automated: true, owner: "system", notes: "Auto: assign → start → submit → QA → approve if passed." },
  { phase: "execution", step: 6, action: "System auto-batches outsourced tasks by vendor type", automated: true, owner: "system", notes: "Draft batches created for admin review." },
  { phase: "execution", step: 7, action: "Admin reviews AI output and draft batches", automated: false, owner: "admin", notes: "Approve/reject AI tasks. Build dispatch packets for vendor batches." },
  { phase: "execution", step: 8, action: "Admin assigns vendor batches to appropriate vendors", automated: false, owner: "admin", notes: "Use dispatch packet. Assign via admin ops dashboard." },
  { phase: "execution", step: 9, action: "Vendors complete work and submit proof", automated: false, owner: "vendor", notes: "Vendor submits URLs, screenshots, or notes as proof." },
  { phase: "qa", step: 10, action: "Admin runs QA on submitted work", automated: false, owner: "admin", notes: "Automated checks + manual review. Reject bad work." },
  { phase: "qa", step: 11, action: "Approved tasks marked done. Rejected tasks returned for rework.", automated: false, owner: "admin", notes: "Page creation tasks auto-create tracking entries." },
  { phase: "tracking", step: 12, action: "System checks keyword rankings weekly", automated: true, owner: "system", notes: "Wednesday 5AM UTC. Stores position history." },
  { phase: "tracking", step: 13, action: "System checks page index status weekly", automated: true, owner: "system", notes: "Google site: query + fallback HEAD check." },
  { phase: "reporting", step: 14, action: "Client dashboard updates automatically with progress and ranking data", automated: true, owner: "system", notes: "Client sees: narrative, metrics, completed work, ranking highlights." },
];

/* ─── Helper Functions ─── */

export function getVendorCategory(vendorId: string): VendorCategory | undefined {
  return VENDOR_CATEGORIES.find(v => v.id === vendorId);
}

export function getTaskVendorMapping(taskType: string): TaskVendorMapping | undefined {
  return TASK_VENDOR_MAP.find(m => m.task_type === taskType);
}

export function getTaskSOP(taskType: string): TaskSOP | undefined {
  return TASK_SOPS.find(s => s.task_type === taskType);
}
