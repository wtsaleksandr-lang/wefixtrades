/**
 * Per-product AI workflow / cron config (Q28f)
 *
 * Stored in serviceCatalog.automation_config as jsonb. Defaults applied
 * when a client first subscribes to the product. Service-specific jobs
 * (mapguardTaskEngine, tradelineCron, etc.) read these defaults at boot.
 */

import { z } from "zod";

export const automationConfigSchema = z.object({
  automation_enabled_default: z.boolean().optional(),
  human_review_required_default: z.boolean().optional(),
  // Cron expression in UTC, 5-field. Empty / null = no scheduled job.
  cron_schedule: z.string().max(80).optional().nullable(),
  // Short label for the AI agent role.
  ai_agent_role: z.string().max(120).optional().nullable(),
  // Full system prompt for the AI agent. Markdown ok.
  ai_agent_system_prompt: z.string().max(4000).optional().nullable(),
  // Max retries for failed automation runs.
  max_retries: z.number().int().min(0).max(10).optional(),
  // Notify admins on automation failure?
  alert_on_failure: z.boolean().optional(),
});

export type AutomationConfig = z.infer<typeof automationConfigSchema>;

export function emptyAutomationConfig(): AutomationConfig {
  return {
    automation_enabled_default: true,
    human_review_required_default: false,
    cron_schedule: null,
    ai_agent_role: null,
    ai_agent_system_prompt: null,
    max_retries: 3,
    alert_on_failure: true,
  };
}
