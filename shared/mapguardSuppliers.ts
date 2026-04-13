/**
 * MapGuard Supplier Directory & Assignment Templates
 *
 * Standardized supplier registry and task-type-specific handoff
 * templates for repeatable, margin-controlled execution.
 */

import type { MapguardTaskType } from "./mapguardTypes";

/* ═══════════════════════════════════════════
   SUPPLIER DIRECTORY
   ═══════════════════════════════════════════ */

export interface MapguardSupplier {
  id: string;
  name: string;
  type: "fiverr" | "agency" | "internal";
  specialties: MapguardTaskType[];
  typical_cost_cents: number;
  expected_turnaround_hours: number;
  quality_rating: number;      // 1-5, manual
  ref_url?: string;            // Fiverr gig URL or agency portal
  notes?: string;
  active: boolean;
}

/**
 * Supplier directory — edit this to add/change suppliers.
 * In-memory for now; can migrate to DB later if needed.
 */
export const MAPGUARD_SUPPLIERS: MapguardSupplier[] = [
  {
    id: "fiverr-gbp-pro",
    name: "GBP Pro (Fiverr)",
    type: "fiverr",
    specialties: ["gbp_optimization", "profile_content_update", "photo_upload"],
    typical_cost_cents: 2500,   // $25
    expected_turnaround_hours: 48,
    quality_rating: 4,
    ref_url: "",
    notes: "Reliable for full profile optimization. 2-day turnaround.",
    active: true,
  },
  {
    id: "fiverr-citation",
    name: "Citation Builder (Fiverr)",
    type: "fiverr",
    specialties: ["citation_cleanup"],
    typical_cost_cents: 3500,   // $35
    expected_turnaround_hours: 72,
    quality_rating: 3,
    ref_url: "",
    notes: "Handles citation cleanup across directories.",
    active: true,
  },
  {
    id: "fiverr-review",
    name: "Review Strategist (Fiverr)",
    type: "fiverr",
    specialties: ["review_issue_response"],
    typical_cost_cents: 1500,   // $15
    expected_turnaround_hours: 24,
    quality_rating: 4,
    ref_url: "",
    notes: "Drafts professional review responses.",
    active: true,
  },
  {
    id: "fiverr-posts",
    name: "GBP Post Creator (Fiverr)",
    type: "fiverr",
    specialties: ["post_scheduling"],
    typical_cost_cents: 1000,   // $10
    expected_turnaround_hours: 24,
    quality_rating: 4,
    ref_url: "",
    notes: "Creates and formats GBP posts with images.",
    active: true,
  },
  {
    id: "internal-team",
    name: "Internal Team",
    type: "internal",
    specialties: [
      "baseline_audit_review", "gbp_optimization", "competitor_reaction",
      "suspension_support", "monthly_report_review", "manual_followup",
      "profile_content_update", "photo_upload", "post_scheduling",
      "citation_cleanup", "review_issue_response",
    ],
    typical_cost_cents: 0,
    expected_turnaround_hours: 24,
    quality_rating: 5,
    notes: "Internal team handles complex or sensitive tasks.",
    active: true,
  },
];

/* ═══════════════════════════════════════════
   SUPPLIER MATCHING
   ═══════════════════════════════════════════ */

export interface SupplierRecommendation {
  supplier: MapguardSupplier;
  suggested_cost_cents: number;
  suggested_handoff_notes: string;
}

export function getRecommendedSupplier(taskType: MapguardTaskType): SupplierRecommendation | null {
  // Find active suppliers matching this specialty, prefer highest quality
  const candidates = MAPGUARD_SUPPLIERS
    .filter(s => s.active && s.specialties.includes(taskType) && s.type !== "internal")
    .sort((a, b) => b.quality_rating - a.quality_rating);

  const supplier = candidates[0];
  if (!supplier) {
    // Fall back to internal
    const internal = MAPGUARD_SUPPLIERS.find(s => s.id === "internal-team");
    if (!internal) return null;
    return {
      supplier: internal,
      suggested_cost_cents: 0,
      suggested_handoff_notes: ASSIGNMENT_TEMPLATES[taskType]?.instructions || "",
    };
  }

  return {
    supplier,
    suggested_cost_cents: supplier.typical_cost_cents,
    suggested_handoff_notes: ASSIGNMENT_TEMPLATES[taskType]?.instructions || "",
  };
}

/* ═══════════════════════════════════════════
   ASSIGNMENT TEMPLATES (per task type)
   ═══════════════════════════════════════════ */

export interface AssignmentTemplate {
  title: string;
  instructions: string;
  expected_deliverable: string;
}

export const ASSIGNMENT_TEMPLATES: Record<string, AssignmentTemplate> = {
  gbp_optimization: {
    title: "Optimize Google Business Profile",
    instructions: `Checklist:
1. Optimize business description (keyword-rich, 750 chars max)
2. Set correct primary and secondary categories
3. Add all relevant services with descriptions
4. Set accurate service areas
5. Verify business hours and contact info
6. Add geo-targeted keywords naturally

Deliver: Updated description text, category recommendations, and services list.`,
    expected_deliverable: "Optimized description, category list, services list, area recommendations",
  },

  citation_cleanup: {
    title: "Clean up business citations",
    instructions: `Checklist:
1. Audit existing citations for NAP consistency
2. Identify incorrect or duplicate listings
3. Submit corrections to major directories
4. Document all changes made

Deliver: Citation audit report with list of directories updated.`,
    expected_deliverable: "Citation audit report, list of corrections submitted",
  },

  review_issue_response: {
    title: "Draft review responses",
    instructions: `Checklist:
1. Review all unresponded reviews (negative first)
2. Draft professional, empathetic responses
3. Address specific concerns mentioned
4. Keep responses under 150 words each
5. Include a positive closing

Deliver: Response drafts for each review.`,
    expected_deliverable: "Review response drafts ready for posting",
  },

  competitor_reaction: {
    title: "Analyze competitor changes and recommend actions",
    instructions: `Checklist:
1. Review competitor ranking movements
2. Identify what competitors improved
3. Recommend specific counter-actions
4. Prioritize by impact

Deliver: Competitor analysis summary with 3-5 action items.`,
    expected_deliverable: "Competitor analysis with prioritized action items",
  },

  profile_content_update: {
    title: "Update profile content",
    instructions: `Checklist:
1. Review current profile for outdated content
2. Update business description if needed
3. Refresh services list
4. Check and update business hours
5. Add any missing information

Deliver: Updated content ready for upload.`,
    expected_deliverable: "Updated content text and field recommendations",
  },

  photo_upload: {
    title: "Prepare and upload business photos",
    instructions: `Checklist:
1. Source high-quality business photos (storefront, team, work)
2. Optimize photo file names with keywords
3. Add geo-tags if possible
4. Upload to GBP profile

Deliver: Photos uploaded with confirmation.`,
    expected_deliverable: "Photos uploaded to GBP, file list with descriptions",
  },

  post_scheduling: {
    title: "Create Google Business posts",
    instructions: `Checklist:
1. Create posts relevant to business services
2. Include local keywords naturally
3. Add a clear call-to-action
4. Include an image for each post
5. Schedule across the month

Deliver: Post content (text + images) ready for scheduling.`,
    expected_deliverable: "Post content with images, ready to schedule",
  },

  suspension_support: {
    title: "Handle GBP suspension or verification issue",
    instructions: `Checklist:
1. Identify suspension reason
2. Prepare reinstatement request
3. Gather required documentation
4. Submit appeal through proper channels
5. Follow up until resolved

Deliver: Status update and resolution confirmation.`,
    expected_deliverable: "Reinstatement status, documentation submitted",
  },
};
