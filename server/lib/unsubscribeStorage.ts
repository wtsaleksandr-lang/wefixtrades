/**
 * Unsubscribe registry — DB read/write helpers.
 *
 * Marketing emails MUST call `isEmailUnsubscribed(email)` before sending.
 * Transactional emails (receipts, password setup, cancellation) are exempt
 * under CAN-SPAM and don't need the check.
 *
 * Auto-creates the table at first use so no separate migration is needed.
 */

import { db } from "../db";
import { emailUnsubscribes } from "@shared/schemas/emailUnsubscribes";
import { sql, eq } from "drizzle-orm";

let _tableEnsured = false;

/**
 * Idempotently create the email_unsubscribes table if it doesn't exist.
 * Called on first read/write — costs ~one trip the first time, free after.
 */
async function ensureTable(): Promise<void> {
  if (_tableEnsured) return;
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS email_unsubscribes (
        id SERIAL PRIMARY KEY,
        email VARCHAR(320) NOT NULL UNIQUE,
        unsubscribed_at TIMESTAMP NOT NULL DEFAULT NOW(),
        source VARCHAR(64),
        ip_address VARCHAR(45),
        user_agent VARCHAR(500)
      )
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_email_unsub_email ON email_unsubscribes (email)
    `);
    _tableEnsured = true;
  } catch (err: any) {
    console.warn("[unsubscribe-storage] ensureTable failed (will retry):", err?.message);
  }
}

/**
 * Returns true if the recipient has unsubscribed from marketing emails.
 * Case-insensitive on email.
 */
export async function isEmailUnsubscribed(email: string): Promise<boolean> {
  if (!email) return false;
  await ensureTable();
  try {
    const lower = email.toLowerCase();
    const [row] = await db.select({ id: emailUnsubscribes.id })
      .from(emailUnsubscribes)
      .where(eq(emailUnsubscribes.email, lower))
      .limit(1);
    return !!row;
  } catch (err: any) {
    // Fail open — if the unsubscribe table is broken, prefer over-sending
    // to under-sending. (Operationally easier to spot via complaints than
    // silent failure that nukes all marketing.)
    console.warn("[unsubscribe-storage] isEmailUnsubscribed failed:", err?.message);
    return false;
  }
}

/**
 * Record an unsubscribe. Idempotent on email (ON CONFLICT DO NOTHING).
 */
export async function recordUnsubscribe(params: {
  email: string;
  source?: string;
  ipAddress?: string;
  userAgent?: string;
}): Promise<void> {
  if (!params.email) return;
  await ensureTable();
  const lower = params.email.toLowerCase();
  try {
    await db.execute(sql`
      INSERT INTO email_unsubscribes (email, source, ip_address, user_agent)
      VALUES (${lower}, ${params.source || null}, ${params.ipAddress || null}, ${params.userAgent || null})
      ON CONFLICT (email) DO NOTHING
    `);
  } catch (err: any) {
    console.error("[unsubscribe-storage] recordUnsubscribe failed:", err?.message);
    throw err;
  }
}
