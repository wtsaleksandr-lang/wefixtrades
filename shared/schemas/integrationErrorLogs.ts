import { pgTable, text, varchar, serial, integer, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

/**
 * integration_error_logs — central record of integration-layer failures.
 *
 * Used to make external-API and webhook failures visible to operators
 * without a full APM dependency. Writers sanitize inputs (no tokens, no
 * full request/response bodies) before insertion. Read by the admin
 * system-health endpoint to surface recent errors and counts.
 *
 * Severity levels:
 *   info     — informational only (e.g. dev-mode webhook bypass)
 *   warning  — degraded behavior, retried or fell back
 *   error    — operation failed, may need human attention
 *   critical — security-relevant (e.g. invalid signature, missing prod secret)
 *
 * `resolved_at` is reserved for future ack/triage workflows; writers
 * leave it null. Indexes target the two most common admin queries:
 * "errors by integration in last N hours" and "recent critical errors".
 */
export const integrationErrorLogs = pgTable(
  "integration_error_logs",
  {
    id: serial("id").primaryKey(),
    integration_name: varchar("integration_name", { length: 64 }).notNull(),
    area: varchar("area", { length: 64 }),
    severity: varchar("severity", { length: 16 }).notNull(),
    message: text("message").notNull(),
    error_code: varchar("error_code", { length: 64 }),
    status_code: integer("status_code"),
    request_id: varchar("request_id", { length: 128 }),
    client_id: integer("client_id"),
    service_id: integer("service_id"),
    metadata: jsonb("metadata"),
    created_at: timestamp("created_at").defaultNow().notNull(),
    resolved_at: timestamp("resolved_at"),
  },
  (table) => [
    index("integration_error_logs_integration_idx").on(table.integration_name, table.created_at),
    index("integration_error_logs_severity_idx").on(table.severity, table.created_at),
    index("integration_error_logs_created_at_idx").on(table.created_at),
  ],
);

export const insertIntegrationErrorLogSchema = createInsertSchema(integrationErrorLogs).omit({
  id: true,
  created_at: true,
});
export type InsertIntegrationErrorLog = z.infer<typeof insertIntegrationErrorLogSchema>;
export type IntegrationErrorLog = typeof integrationErrorLogs.$inferSelect;

export type IntegrationErrorSeverity = "info" | "warning" | "error" | "critical";
