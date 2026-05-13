/**
 * 90-day retention sweep for encrypted phone-bill and LOA objects.
 *
 * Runs daily at 03:30. Finds tradeline_phone_setups rows where port_status
 * is approved or rejected AND port_resolved_at is older than 90 days AND
 * either object key is still present. Deletes the encrypted objects from
 * Replit Object Storage, then clears the object-key columns. The row
 * itself is preserved as the audit record — only the PII payloads are
 * purged.
 *
 * Partial failures (e.g., bill delete OK but LOA delete fails) leave the
 * row in mixed state and are logged at warn level. The next sweep will
 * retry whichever objects remain.
 */

import { db } from "../db";
import { tradelinePhoneSetups } from "@shared/schema";
import { and, eq, inArray, isNotNull, lt, or } from "drizzle-orm";
import { deleteObject } from "../lib/objectStorage";
import { createLogger } from "../lib/logger";

const log = createLogger("BillRetention");

const RETENTION_DAYS = 90;

export interface RetentionStats {
  scanned: number;
  cleared: number;
  partial: number;
}

export async function processBillRetention(): Promise<RetentionStats> {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);

  const candidates = await db
    .select({
      id: tradelinePhoneSetups.id,
      bill: tradelinePhoneSetups.port_bill_object_key,
      loa: tradelinePhoneSetups.port_loa_object_key,
    })
    .from(tradelinePhoneSetups)
    .where(
      and(
        inArray(tradelinePhoneSetups.port_status, ["approved", "rejected"]),
        lt(tradelinePhoneSetups.port_resolved_at, cutoff),
        or(
          isNotNull(tradelinePhoneSetups.port_bill_object_key),
          isNotNull(tradelinePhoneSetups.port_loa_object_key),
        ),
      ),
    );

  let cleared = 0;
  let partial = 0;

  for (const row of candidates) {
    const billOk = row.bill ? await deleteObject(row.bill) : true;
    const loaOk = row.loa ? await deleteObject(row.loa) : true;

    if (billOk && loaOk) {
      await db
        .update(tradelinePhoneSetups)
        .set({
          port_bill_object_key: null,
          port_loa_object_key: null,
          updated_at: new Date(),
        })
        .where(eq(tradelinePhoneSetups.id, row.id));
      cleared++;
    } else {
      partial++;
      log.warn("partial retention failure", { id: row.id, billOk, loaOk });
    }
  }

  log.info("Retention sweep complete", {
    scanned: candidates.length,
    cleared,
    partial,
  });

  return { scanned: candidates.length, cleared, partial };
}
