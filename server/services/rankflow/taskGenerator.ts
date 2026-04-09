import type { RankflowProfile, InsertRankflowTask } from "@shared/schema";
import type { MonthlyPlanData } from "./planGenerator";

/**
 * Instruction templates per task type.
 * Placeholders: {service}, {location}, {website}
 */
const TASK_TEMPLATES: Record<string, {
  titleFn: (profile: RankflowProfile, idx: number) => string;
  instructionsFn: (profile: RankflowProfile, idx: number) => string;
  assignedTo: string;
  priority: string;
}> = {
  page_create: {
    titleFn: (p, i) => {
      const services = Array.isArray(p.target_services) ? p.target_services as string[] : [];
      const locations = Array.isArray(p.target_locations) ? p.target_locations as string[] : [];
      const svc = services[i % services.length] || "service";
      const loc = locations[i % locations.length] || p.location || "local area";
      return `Create SEO page: ${svc} in ${loc}`;
    },
    instructionsFn: (p, i) => {
      const services = Array.isArray(p.target_services) ? p.target_services as string[] : [];
      const locations = Array.isArray(p.target_locations) ? p.target_locations as string[] : [];
      const svc = services[i % services.length] || "service";
      const loc = locations[i % locations.length] || p.location || "local area";
      return `Create a 1000-1500 word SEO-optimized service page targeting "${svc} in ${loc}". Include H1/H2 structure, keyword placement, CTA sections, and internal links to related service pages. Website: ${p.website_url || "TBD"}`;
    },
    assignedTo: "ai",
    priority: "high",
  },
  meta_fix: {
    titleFn: (_p, i) => `Optimize title tag & meta description — page ${i + 1}`,
    instructionsFn: (p) =>
      `Audit and rewrite title tag and meta description for target page. Format: "[Service] in [City] | [Business Name]". Website: ${p.website_url || "TBD"}`,
    assignedTo: "ai",
    priority: "normal",
  },
  citation_build: {
    titleFn: (_p, i) => `Build citation — directory ${i + 1}`,
    instructionsFn: (p) =>
      `Submit business to local directory with consistent NAP. Business: ${p.niche || "trades"} in ${p.location || "TBD"}. Website: ${p.website_url || "TBD"}`,
    assignedTo: "vendor",
    priority: "normal",
  },
  internal_linking: {
    titleFn: (_p, i) => `Add internal links — batch ${i + 1}`,
    instructionsFn: (p) =>
      `Add contextual internal links between service pages and blog posts. Target 2-3 links per page. Website: ${p.website_url || "TBD"}`,
    assignedTo: "ai",
    priority: "normal",
  },
  content_support: {
    titleFn: (_p, i) => `Content recommendation brief ${i + 1}`,
    instructionsFn: (p) => {
      const services = Array.isArray(p.target_services) ? p.target_services as string[] : [];
      return `Generate a content brief with keyword targets, topic suggestions, and outline for next month's content. Niche: ${p.niche || "trades"}. Services: ${services.join(", ") || "TBD"}. Location: ${p.location || "TBD"}`;
    },
    assignedTo: "ai",
    priority: "low",
  },
  schema_basic: {
    titleFn: (_p, i) => `Add schema markup — page ${i + 1}`,
    instructionsFn: (p) =>
      `Generate and inject LocalBusiness + Service JSON-LD schema for target page. Validate with Google Rich Results Test. Website: ${p.website_url || "TBD"}`,
    assignedTo: "ai",
    priority: "normal",
  },
};

/**
 * Expand a monthly plan into concrete tasks ready for insertion.
 */
export function generateTasksFromPlan(
  planId: number,
  plan: MonthlyPlanData,
  profile: RankflowProfile,
): Omit<InsertRankflowTask, "created_at">[] {
  const tasks: Omit<InsertRankflowTask, "created_at">[] = [];

  for (const planTask of plan.tasks) {
    const template = TASK_TEMPLATES[planTask.type];
    if (!template) continue;

    for (let i = 0; i < planTask.count; i++) {
      tasks.push({
        client_id: profile.client_id,
        plan_id: planId,
        type: planTask.type,
        title: template.titleFn(profile, i),
        instructions: template.instructionsFn(profile, i),
        status: "pending",
        assigned_to: template.assignedTo,
        priority: template.priority,
        due_date: null,
        completed_at: null,
        metadata: null,
      });
    }
  }

  return tasks;
}
