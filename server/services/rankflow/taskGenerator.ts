import type { RankflowProfile, InsertRankflowTask } from "@shared/schema";
import type { MonthlyPlanData } from "./planGenerator";
import { getExecutionConfig } from "./executionConfig";
import { generateKeywordTargets, clusterKeywords, selectClustersForMonth, type KeywordCluster } from "./keywordHelper";

/* ─── Task Templates ─── */

const TASK_TEMPLATES: Record<string, {
  titleFn: (profile: RankflowProfile, idx: number, cluster?: KeywordCluster) => string;
  instructionsFn: (profile: RankflowProfile, idx: number, cluster?: KeywordCluster) => string;
  priority: string;
}> = {
  page_create: {
    titleFn: (_p, _i, cluster) => {
      if (cluster) return `Create ${cluster.page_type.replace(/_/g, " ")} page: ${cluster.primary_keyword}`;
      return `Create SEO page ${_i + 1}`;
    },
    instructionsFn: (p, _i, cluster) => {
      if (!cluster) {
        return `Create a 1000-1500 word SEO-optimized service page. Website: ${p.website_url || "TBD"}`;
      }
      const kwList = cluster.keywords.map(k => `- "${k.keyword}" (${k.intent})`).join("\n");
      return [
        `Create a 1000-1500 word SEO page targeting the "${cluster.primary_keyword}" keyword cluster.`,
        ``,
        `Page type: ${cluster.page_type.replace(/_/g, " ")}`,
        `Primary keyword: ${cluster.primary_keyword}`,
        `Supporting keywords:`,
        kwList,
        ``,
        `Requirements:`,
        `- H1 with primary keyword`,
        `- H2 sections covering supporting keywords naturally`,
        `- 2-3 internal links to related service pages`,
        `- Clear CTA sections (call, form, or quote)`,
        `- Location-specific content (not generic)`,
        `- Website: ${p.website_url || "TBD"}`,
      ].join("\n");
    },
    priority: "high",
  },
  meta_fix: {
    titleFn: (_p, i) => `Optimize title tag & meta description — page ${i + 1}`,
    instructionsFn: (p) =>
      `Audit and rewrite title tag and meta description for target page. Format: "[Service] in [City] | [Business Name]". Keep title under 60 chars, meta under 155 chars. Website: ${p.website_url || "TBD"}`,
    priority: "normal",
  },
  citation_build: {
    titleFn: (_p, i) => `Build citation — directory ${i + 1}`,
    instructionsFn: (p) =>
      `Submit business to local directory with consistent NAP (Name, Address, Phone). Business: ${p.niche || "trades"} in ${p.location || "TBD"}. Website: ${p.website_url || "TBD"}. Verify listing is live and NAP matches exactly.`,
    priority: "normal",
  },
  internal_linking: {
    titleFn: (_p, i) => `Add internal links — batch ${i + 1}`,
    instructionsFn: (p) =>
      `Add 2-3 contextual internal links per page between service pages, location pages, and blog posts. Use keyword-rich anchor text. Website: ${p.website_url || "TBD"}`,
    priority: "normal",
  },
  content_support: {
    titleFn: (_p, _i) => `Monthly content strategy brief`,
    instructionsFn: (p) => {
      const services = Array.isArray(p.target_services) ? (p.target_services as string[]).join(", ") : "TBD";
      const locations = Array.isArray(p.target_locations) ? (p.target_locations as string[]).join(", ") : p.location || "TBD";
      return `Generate a content brief for next month. Include: top keyword opportunities not yet targeted, suggested page topics, and content outline. Niche: ${p.niche || "trades"}. Services: ${services}. Locations: ${locations}.`;
    },
    priority: "low",
  },
  schema_basic: {
    titleFn: (_p, i) => `Add schema markup — page ${i + 1}`,
    instructionsFn: (p) =>
      `Generate and inject LocalBusiness + Service JSON-LD schema for target page. Include: business name, address, phone, service type, area served, opening hours. Validate with Google Rich Results Test. Website: ${p.website_url || "TBD"}`,
    priority: "normal",
  },
};

/* ─── Main Generator ─── */

/**
 * Expand a monthly plan into concrete tasks.
 * For page_create tasks, uses keyword clusters for targeted instructions.
 */
export function generateTasksFromPlan(
  planId: number,
  plan: MonthlyPlanData,
  profile: RankflowProfile,
): Omit<InsertRankflowTask, "created_at">[] {
  const tasks: Omit<InsertRankflowTask, "created_at">[] = [];

  // Generate keyword clusters for page_create tasks
  const keywords = generateKeywordTargets(
    profile.niche || "general",
    profile.location || "",
    Array.isArray(profile.target_locations) ? profile.target_locations as string[] : undefined,
    Array.isArray(profile.target_services) ? profile.target_services as string[] : undefined,
  );
  const clusters = clusterKeywords(keywords);

  for (const planTask of plan.tasks) {
    const template = TASK_TEMPLATES[planTask.type];
    if (!template) continue;

    const execConfig = getExecutionConfig(planTask.type);

    // For page_create, select top clusters
    let selectedClusters: KeywordCluster[] = [];
    if (planTask.type === "page_create") {
      selectedClusters = selectClustersForMonth(clusters, planTask.count);
    }

    for (let i = 0; i < planTask.count; i++) {
      const cluster = planTask.type === "page_create" ? selectedClusters[i] : undefined;

      const metadata: Record<string, any> = {
        qa_requirements: execConfig.qa_requirements,
      };
      if (cluster) {
        metadata.keyword_cluster = cluster.cluster;
        metadata.primary_keyword = cluster.primary_keyword;
        metadata.target_keywords = cluster.keywords.map(k => k.keyword);
        metadata.page_type = cluster.page_type;
      }

      tasks.push({
        client_id: profile.client_id,
        plan_id: planId,
        type: planTask.type,
        title: template.titleFn(profile, i, cluster),
        instructions: template.instructionsFn(profile, i, cluster),
        status: "pending",
        assigned_to: null,
        priority: cluster ? (cluster.priority >= 8 ? "high" : "normal") : template.priority,
        due_date: null,
        completed_at: null,
        metadata,
        execution_mode: execConfig.execution_mode,
        vendor_type: execConfig.vendor_type,
        estimated_cost: String(execConfig.estimated_cost),
        assigned_at: null,
        submitted_at: null,
        qa_status: null,
        qa_notes: null,
        proof_data: null,
        actual_cost: null,
        rejection_reason: null,
      });
    }
  }

  return tasks;
}
