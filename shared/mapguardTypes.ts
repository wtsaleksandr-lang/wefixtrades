/**
 * MapGuard Task Engine — Shared Types & Constants
 *
 * Single source of truth for task types, statuses, lifecycle transitions,
 * and audit-to-task mapping rules.
 */

/* ═══════════════════════════════════════════
   TASK TYPES
   ═══════════════════════════════════════════ */

export const MAPGUARD_TASK_TYPES = {
  baseline_audit_review: {
    label: "Baseline Audit Review",
    description: "Review initial audit findings and create action plan",
    default_priority: "high" as const,
    category: "setup",
  },
  gbp_optimization: {
    label: "GBP Profile Optimization",
    description: "Optimize Google Business Profile fields, categories, and areas",
    default_priority: "high" as const,
    category: "setup",
  },
  citation_cleanup: {
    label: "Citation Cleanup",
    description: "Fix or create business citations across directories",
    default_priority: "normal" as const,
    category: "visibility",
  },
  review_issue_response: {
    label: "Review Issue Response",
    description: "Respond to negative reviews or manage review strategy",
    default_priority: "high" as const,
    category: "reputation",
  },
  competitor_reaction: {
    label: "Competitor Reaction",
    description: "Respond to competitor ranking or profile changes",
    default_priority: "normal" as const,
    category: "competitive",
  },
  profile_content_update: {
    label: "Profile Content Update",
    description: "Update business description, services, photos, or posts",
    default_priority: "normal" as const,
    category: "content",
  },
  photo_upload: {
    label: "Photo Upload",
    description: "Upload or refresh business photos on GBP",
    default_priority: "normal" as const,
    category: "content",
  },
  post_scheduling: {
    label: "Post Scheduling",
    description: "Create and schedule GBP posts",
    default_priority: "normal" as const,
    category: "content",
  },
  suspension_support: {
    label: "Suspension Support",
    description: "Handle GBP suspension or verification issues",
    default_priority: "urgent" as const,
    category: "critical",
  },
  monthly_report_review: {
    label: "Monthly Report Review",
    description: "Review monthly performance data and update strategy",
    default_priority: "normal" as const,
    category: "reporting",
  },
  manual_followup: {
    label: "Manual Follow-up",
    description: "Custom follow-up task created by admin",
    default_priority: "normal" as const,
    category: "admin",
  },
} as const;

export type MapguardTaskType = keyof typeof MAPGUARD_TASK_TYPES;

/* ═══════════════════════════════════════════
   TASK STATUSES & LIFECYCLE
   ═══════════════════════════════════════════ */

export const MAPGUARD_TASK_STATUSES = {
  pending:          { label: "Pending",           color: "gray",   terminal: false },
  upcoming:         { label: "Upcoming",          color: "blue",   terminal: false },
  ready:            { label: "Ready",             color: "indigo", terminal: false },
  in_progress:      { label: "In Progress",       color: "indigo", terminal: false },
  waiting_supplier: { label: "Waiting on Supplier", color: "amber", terminal: false },
  waiting_client:   { label: "Waiting on Client",  color: "amber", terminal: false },
  needs_review:     { label: "Needs Review",      color: "purple", terminal: false },
  blocked:          { label: "Blocked",           color: "red",    terminal: false },
  completed:        { label: "Completed",         color: "emerald", terminal: true },
  cancelled:        { label: "Cancelled",         color: "gray",   terminal: true },
} as const;

export type MapguardTaskStatus = keyof typeof MAPGUARD_TASK_STATUSES;

/** Valid status transitions — maps current status → allowed next statuses */
export const MAPGUARD_STATUS_TRANSITIONS: Record<MapguardTaskStatus, MapguardTaskStatus[]> = {
  pending:          ["ready", "upcoming", "cancelled"],
  upcoming:         ["ready", "pending", "cancelled"],
  ready:            ["in_progress", "blocked", "cancelled"],
  in_progress:      ["waiting_supplier", "waiting_client", "needs_review", "completed", "blocked", "cancelled"],
  waiting_supplier: ["in_progress", "needs_review", "blocked", "cancelled"],
  waiting_client:   ["in_progress", "blocked", "cancelled"],
  needs_review:     ["completed", "in_progress", "waiting_supplier", "blocked"],
  blocked:          ["ready", "in_progress", "cancelled"],
  completed:        [],   // terminal
  cancelled:        [],   // terminal
};

/* ═══════════════════════════════════════════
   SOURCE TYPES
   ═══════════════════════════════════════════ */

export const MAPGUARD_SOURCE_TYPES = {
  audit:      { label: "Audit Finding" },
  monitoring: { label: "Monitoring Alert" },
  manual:     { label: "Manual" },
  competitor: { label: "Competitor Change" },
  review:     { label: "Review Event" },
  system:     { label: "System Generated" },
} as const;

export type MapguardSourceType = keyof typeof MAPGUARD_SOURCE_TYPES;

/* ═══════════════════════════════════════════
   AUDIT ISSUE → TASK MAPPING
   ═══════════════════════════════════════════
   Maps detected audit issues to MapGuard task
   creation candidates with default metadata.
   ═══════════════════════════════════════════ */

export interface AuditTaskMapping {
  task_type: MapguardTaskType;
  title: string;
  priority: "low" | "normal" | "high" | "urgent";
  next_step_hint: string;
  input_keys: string[];
  // Which audit_data keys to extract into input_data
}

export const AUDIT_ISSUE_TO_TASK: Record<string, AuditTaskMapping> = {
  "no-gbp-description": {
    task_type: "gbp_optimization",
    title: "Add optimized GBP business description",
    priority: "high",
    next_step_hint: "Write a keyword-rich business description (750 chars max). Include primary services, service area, and unique selling points.",
    input_keys: ["business", "trade", "city", "businessNiche"],
  },
  "low-reviews": {
    task_type: "review_issue_response",
    title: "Implement review generation strategy",
    priority: "high",
    next_step_hint: "Set up review request flow. Target 5+ new reviews in first 30 days. Use SMS/email review links.",
    input_keys: ["business", "reviewIntelligence"],
  },
  "bad-rating": {
    task_type: "review_issue_response",
    title: "Address negative reviews and improve rating",
    priority: "urgent",
    next_step_hint: "Respond professionally to all negative reviews. Identify recurring complaints. Create improvement plan.",
    input_keys: ["business", "reviewIntelligence"],
  },
  "low-visibility": {
    task_type: "baseline_audit_review",
    title: "Analyze visibility gaps and create optimization plan",
    priority: "high",
    next_step_hint: "Review full audit data. Identify top 3 quick wins. Map out 30-day improvement roadmap.",
    input_keys: ["scores", "keywords", "competitors", "detectedIssues"],
  },
  "not-in-maps-pack": {
    task_type: "gbp_optimization",
    title: "Optimize profile for local pack inclusion",
    priority: "urgent",
    next_step_hint: "Fix primary category, add all relevant secondary categories. Ensure NAP consistency. Add service area targeting.",
    input_keys: ["business", "keywords", "competitors", "scores"],
  },
  "no-website": {
    task_type: "profile_content_update",
    title: "Add website link and landing page strategy",
    priority: "high",
    next_step_hint: "Client needs a website before full optimization. Recommend SiteLaunch or external site. Add temporary link if available.",
    input_keys: ["business"],
  },
  "slow-website": {
    task_type: "profile_content_update",
    title: "Flag website speed issues affecting rankings",
    priority: "normal",
    next_step_hint: "Document speed issues from PageSpeed data. Recommend WebFix service or pass to client's developer.",
    input_keys: ["speedData", "websiteQualityChecks"],
  },
  "no-after-hours": {
    task_type: "profile_content_update",
    title: "Update business hours for demand coverage",
    priority: "normal",
    next_step_hint: "Review demand gap analysis. Recommend extending hours or adding emergency/after-hours availability.",
    input_keys: ["business", "demandGaps"],
  },
  "no-ads": {
    task_type: "competitor_reaction",
    title: "Evaluate ad opportunity vs. competitors",
    priority: "low",
    next_step_hint: "Review competitor ad presence and CPC data. Calculate potential ROI. Recommend AdFlow if viable.",
    input_keys: ["keywords", "keywordSummary", "competitors"],
  },
  "low-search-ranking": {
    task_type: "gbp_optimization",
    title: "Improve keyword rankings in local search",
    priority: "high",
    next_step_hint: "Target top 3 keywords by volume. Optimize GBP categories, services list, and description for these terms.",
    input_keys: ["keywords", "keywordSummary", "businessNiche"],
  },
};

/* ═══════════════════════════════════════════
   PRIMARY ACTION MAPPING (for future UI)
   ═══════════════════════════════════════════
   Compatible with TradeLine's TaskCard pattern.
   ═══════════════════════════════════════════ */

export function getMapguardPrimaryAction(status: MapguardTaskStatus): { label: string; nextStatus: MapguardTaskStatus } | null {
  switch (status) {
    case "pending":          return { label: "Make Ready",  nextStatus: "ready" };
    case "upcoming":         return { label: "Make Ready",  nextStatus: "ready" };
    case "ready":            return { label: "Start",       nextStatus: "in_progress" };
    case "in_progress":      return { label: "Done",        nextStatus: "completed" };
    case "waiting_supplier": return { label: "Follow Up",   nextStatus: "in_progress" };
    case "waiting_client":   return { label: "Follow Up",   nextStatus: "in_progress" };
    case "needs_review":     return { label: "Approve",     nextStatus: "completed" };
    case "blocked":          return { label: "Unblock",     nextStatus: "ready" };
    default:                 return null;
  }
}
