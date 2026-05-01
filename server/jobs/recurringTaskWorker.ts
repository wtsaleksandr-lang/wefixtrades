/**
 * Recurring Task Worker
 *
 * Runs daily at 01:00 UTC. For each active recurring service (delivery_pattern
 * = 'recurring' OR service_id starts with 'webcare'), generates monthly
 * fulfillment tasks from templates marked `is_recurring = true`.
 *
 * Idempotency: checks whether tasks for the current month already exist
 * (by looking for tasks whose title starts with the "Month YYYY:" prefix)
 * before creating new ones. Safe to run multiple times.
 *
 * Wrapped by `runJob()` in the scheduler — that wrapper provides the
 * retry-with-backoff (3 attempts) and the job-log database row.
 *
 * Returns aggregate counts that flow into job_logs.metadata for audit.
 */

import { db } from "../db";
import { storage } from "../storage";
import {
  clientServices,
  serviceCatalog,
  serviceTaskTemplates,
  fulfillmentTasks,
} from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";
import { createLogger } from "../lib/logger";
import { autoAssignSupplier } from "../services/supplierAssignment";

const log = createLogger("RecurringTasks");

interface RecurringTaskResult {
  servicesChecked: number;
  servicesSkipped: number;
  tasksCreated: number;
  errors: number;
}

/**
 * Build a "Month YYYY" prefix for the current month.
 * e.g. "May 2026"
 */
function getMonthPrefix(date: Date = new Date()): string {
  return date.toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

/**
 * Get the last day of the current month at 23:59:59 UTC.
 */
function getEndOfMonth(date: Date = new Date()): Date {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  // Day 0 of next month = last day of current month
  return new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999));
}

export async function processRecurringTasks(): Promise<RecurringTaskResult> {
  const now = new Date();
  const monthPrefix = getMonthPrefix(now);
  const endOfMonth = getEndOfMonth(now);

  log.info(`Starting recurring task generation for ${monthPrefix}`);

  const result: RecurringTaskResult = {
    servicesChecked: 0,
    servicesSkipped: 0,
    tasksCreated: 0,
    errors: 0,
  };

  // Query all active, enabled client_services that are recurring or webcare
  const rows = await db
    .select({
      cs_id: clientServices.id,
      cs_client_id: clientServices.client_id,
      cs_service_id: clientServices.service_id,
      delivery_pattern: serviceCatalog.delivery_pattern,
    })
    .from(clientServices)
    .innerJoin(serviceCatalog, eq(clientServices.service_id, serviceCatalog.id))
    .where(
      and(
        eq(clientServices.status, "active"),
        eq(clientServices.enabled, true),
        sql`(${serviceCatalog.delivery_pattern} = 'recurring' OR ${clientServices.service_id} LIKE 'webcare%')`,
      ),
    );

  for (const row of rows) {
    result.servicesChecked++;

    try {
      // Check if tasks for this month already exist for this client_service.
      // We look for tasks whose title starts with the month prefix (e.g. "May 2026:").
      const existingTasks = await db
        .select({ id: fulfillmentTasks.id })
        .from(fulfillmentTasks)
        .where(
          and(
            eq(fulfillmentTasks.client_service_id, row.cs_id),
            sql`${fulfillmentTasks.title} LIKE ${monthPrefix + ':%'}`,
          ),
        )
        .limit(1);

      if (existingTasks.length > 0) {
        log.debug(`Skipping cs#${row.cs_id} (${row.cs_service_id}) — tasks for ${monthPrefix} already exist`);
        result.servicesSkipped++;
        continue;
      }

      // Look up recurring task templates for this service
      const templates = await db
        .select()
        .from(serviceTaskTemplates)
        .where(
          and(
            eq(serviceTaskTemplates.service_id, row.cs_service_id),
            eq(serviceTaskTemplates.is_recurring, true),
          ),
        )
        .orderBy(serviceTaskTemplates.sort_order);

      if (templates.length === 0) {
        log.debug(`No recurring templates for ${row.cs_service_id} — skipping cs#${row.cs_id}`);
        result.servicesSkipped++;
        continue;
      }

      // Create fulfillment tasks from recurring templates
      for (const tmpl of templates) {
        const task = await storage.createFulfillmentTask({
          client_service_id: row.cs_id,
          client_id: row.cs_client_id,
          title: `${monthPrefix}: ${tmpl.title}`,
          description: tmpl.description || undefined,
          status: "not_started",
          priority: tmpl.default_priority || "normal",
          sort_order: tmpl.sort_order,
          handled_by: tmpl.default_handled_by || undefined,
          waiting_on: tmpl.default_waiting_on || undefined,
          human_review_required: tmpl.human_review_required || false,
          due_at: endOfMonth,
          actor_type: "system",
          metadata: {
            source: "recurring_task_worker",
            template_id: tmpl.id,
            period: monthPrefix,
          },
        });

        // Auto-assign supplier if template specifies handled_by = "supplier"
        if (tmpl.default_handled_by === "supplier") {
          try { await autoAssignSupplier(task); } catch (_) { /* fail-safe */ }
        }

        result.tasksCreated++;
      }

      log.info(
        `Created ${templates.length} recurring tasks for cs#${row.cs_id} (${row.cs_service_id}) — ${monthPrefix}`,
      );
    } catch (err: any) {
      log.error(`Error processing cs#${row.cs_id} (${row.cs_service_id})`, { error: err.message });
      result.errors++;
    }
  }

  log.info(
    `Complete: ${result.servicesChecked} checked, ${result.servicesSkipped} skipped, ` +
    `${result.tasksCreated} tasks created, ${result.errors} errors`,
  );

  return result;
}
