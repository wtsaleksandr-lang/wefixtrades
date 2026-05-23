/**
 * Invoice overdue worker — daily.
 *
 * Flips bookflow_invoices.status from sent|viewed → overdue when due_date
 * has elapsed. Idempotent: rows already in overdue are skipped by the
 * status filter.
 */

import { db } from "../db";
import { bookflowInvoices } from "@shared/schema";
import { and, lt, inArray, sql } from "drizzle-orm";
import { createLogger } from "../lib/logger";

const log = createLogger("InvoiceOverdueWorker");

export async function processInvoiceOverdue(): Promise<{ flipped: number }> {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const result = await db
    .update(bookflowInvoices)
    .set({ status: "overdue", updated_at: new Date() })
    .where(
      and(
        inArray(bookflowInvoices.status, ["sent", "viewed"]),
        sql`${bookflowInvoices.due_date} IS NOT NULL`,
        lt(bookflowInvoices.due_date, today),
      ),
    )
    .returning({ id: bookflowInvoices.id });

  const flipped = result.length;
  if (flipped > 0) log.info("Invoices flipped to overdue", { flipped });
  return { flipped };
}
