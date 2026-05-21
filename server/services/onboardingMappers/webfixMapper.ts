/**
 * WebFix onboarding → AI config mapper.
 *
 * Onboarding collects: site URL, CMS, access method, list of issues.
 * The WebFix delivery AI gets a structured issue list + access context.
 */

import type { OnboardingSubmission } from "@shared/schema";
import { type AIConfigPatch, pullString, pullList } from "./index";

export async function mapOnboardingToWebFixConfig(
  submission: OnboardingSubmission,
): Promise<AIConfigPatch | null> {
  const responses = (submission.responses as Record<string, unknown>) || {};
  if (!responses || Object.keys(responses).length === 0) return null;

  const siteUrl = pullString(responses, "site_url") || pullString(responses, "website_url");
  const cms = pullString(responses, "cms_platform") || pullString(responses, "cms");
  const accessMethod = pullString(responses, "access_method") || pullString(responses, "cms_access_method");
  const mainIssue = pullString(responses, "main_issue") || pullString(responses, "primary_issue");
  const issues = pullList(responses, "issues");

  const promptParts: string[] = [];
  if (siteUrl) promptParts.push(`Site: ${siteUrl}.`);
  if (cms) promptParts.push(`CMS: ${cms}.`);
  if (accessMethod) promptParts.push(`Access method: ${accessMethod}.`);
  if (mainIssue) promptParts.push(`Primary issue reported: ${mainIssue}.`);

  const context: Record<string, unknown> = {};
  if (siteUrl) context.site_url = siteUrl;
  if (cms) context.cms = cms;
  if (issues.length) context.issues = issues;
  else if (mainIssue) context.issues = [mainIssue];

  const kb: AIConfigPatch["knowledge_base_entries"] = [];
  const issueList = issues.length ? issues : mainIssue ? [mainIssue] : [];
  if (issueList.length) {
    kb.push({
      kind: "todo_list",
      title: "WebFix issue backlog (from onboarding)",
      content: issueList.map((i, idx) => `${idx + 1}. ${i}`).join("\n"),
    });
  }

  if (promptParts.length === 0 && Object.keys(context).length === 0 && kb.length === 0) {
    return null;
  }

  return {
    system_prompt_additions: promptParts.join(" "),
    context_variables: context,
    knowledge_base_entries: kb.length ? kb : undefined,
  };
}
