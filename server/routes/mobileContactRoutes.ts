/**
 * Mobile contact-lookup — surfaces customer/lead context for an in-call
 * screen. The softphone calls this the moment a call rings (or right
 * before placing one) so the tradesperson sees who's calling without
 * leaving the call UI.
 *
 *   GET /api/mobile/lookup?phone=<raw|E.164>
 *
 * Multi-tenant scoping:
 *   - Leads are looked up only within calculators owned by the
 *     authenticated user (calculators.user_id = req.user.id).
 *   - Open invoices are looked up only within client rows owned by
 *     the same user (clients.user_id = req.user.id).
 *   - Recent calls are filtered to mobile_call_records.user_id =
 *     req.user.id.
 *
 * Phone matching uses normalizePhone() from twilioClient — strip non
 * digits, keep the last 10. The same routine is used by inbound SMS
 * matching so a number stored as "+1 (555) 123-4567" and a query of
 * "5551234567" resolve to the same lead.
 */

import type { Express, Request, Response } from "express";
import { and, desc, eq, gte, inArray, or, sql } from "drizzle-orm";
import { db } from "../db";
import {
  leads,
  calculators,
  bookings,
  smsMessages,
  bookflowInvoices,
  clients,
  mobileCallRecords,
} from "@shared/schema";
import { requireSessionOrBearer } from "../lib/mobileAuth";
import { normalizePhone } from "../twilioClient";
import { createLogger } from "../lib/logger";

const log = createLogger("MobileContactLookup");

/** Invoice statuses that count as "open" (unpaid, not cancelled). */
const OPEN_INVOICE_STATUSES = ["sent", "viewed", "overdue"];

/** Days back to count for recentCallsCount. */
const RECENT_CALL_WINDOW_DAYS = 90;

export function registerMobileContactRoutes(app: Express) {
  app.get(
    "/api/mobile/lookup",
    requireSessionOrBearer,
    async (req: Request, res: Response) => {
      const u = req.user as any;
      const rawPhone = typeof req.query.phone === "string" ? req.query.phone : "";
      if (!rawPhone.trim()) {
        return res.status(400).json({ error: "phone required" });
      }

      const normalized = normalizePhone(rawPhone);
      if (!normalized) {
        return res.status(400).json({ error: "phone required" });
      }

      try {
        /* ─── 1. Find calculators owned by this user (tenant scope) ─── */
        const userCalcs = await db
          .select({ id: calculators.id })
          .from(calculators)
          .where(eq(calculators.user_id, u.id));

        const calcIds = userCalcs.map((c) => c.id);

        /* ─── 2. Match lead by normalized phone, scoped to user's calcs ─── */
        // regexp_replace(phone, '\D', '', 'g') gives digits-only; LIKE
        // '%' || last10 catches any stored formatting.
        let matchedLead:
          | {
              id: number;
              name: string | null;
              phone: string | null;
              company: string | null;
              calculator_id: number;
              created_date: Date | null;
            }
          | null = null;

        if (calcIds.length > 0) {
          const [row] = await db
            .select({
              id: leads.id,
              name: leads.name,
              phone: leads.phone,
              company: leads.company,
              calculator_id: leads.calculator_id,
              created_date: leads.created_date,
            })
            .from(leads)
            .where(
              and(
                inArray(leads.calculator_id, calcIds),
                sql`${leads.phone} IS NOT NULL`,
                sql`regexp_replace(${leads.phone}, '\D', '', 'g') LIKE ${"%" + normalized}`,
              ),
            )
            .orderBy(desc(leads.created_date))
            .limit(1);
          matchedLead = row ?? null;
        }

        if (!matchedLead) {
          return res.json({ contact: null });
        }

        /* ─── 3. Pull related context in parallel ─── */
        // Business name = calculator.business_name for the lead's calc
        const businessNameP = db
          .select({ business_name: calculators.business_name })
          .from(calculators)
          .where(eq(calculators.id, matchedLead.calculator_id))
          .limit(1)
          .then((rows) => rows[0]?.business_name ?? null);

        // Last completed booking → last service summary + notes fallback
        const lastBookingP = db
          .select({
            notes: bookings.notes,
            date: bookings.date,
            time: bookings.time,
            created_at: bookings.created_at,
          })
          .from(bookings)
          .where(
            and(
              eq(bookings.lead_id, matchedLead.id),
              eq(bookings.status, "completed"),
            ),
          )
          .orderBy(desc(bookings.created_at))
          .limit(1)
          .then((rows) => rows[0] ?? null);

        // Latest SMS for lastInteractionAt fallback
        const lastSmsP = db
          .select({ created_at: smsMessages.created_at })
          .from(smsMessages)
          .where(eq(smsMessages.lead_id, matchedLead.id))
          .orderBy(desc(smsMessages.created_at))
          .limit(1)
          .then((rows) => rows[0]?.created_at ?? null);

        // Open invoices for this user's clients matching this phone
        const userClients = await db
          .select({ id: clients.id })
          .from(clients)
          .where(eq(clients.user_id, u.id));
        const clientIds = userClients.map((c) => c.id);

        const openInvoicesP =
          clientIds.length > 0
            ? db
                .select({
                  total_cents: bookflowInvoices.total_cents,
                })
                .from(bookflowInvoices)
                .where(
                  and(
                    inArray(bookflowInvoices.client_id, clientIds),
                    inArray(bookflowInvoices.status, OPEN_INVOICE_STATUSES),
                    sql`${bookflowInvoices.customer_phone} IS NOT NULL`,
                    sql`regexp_replace(${bookflowInvoices.customer_phone}, '\D', '', 'g') LIKE ${"%" + normalized}`,
                  ),
                )
            : Promise.resolve([] as { total_cents: number }[]);

        // Recent calls (last 90d) where this user spoke to this number
        const cutoff = new Date(
          Date.now() - RECENT_CALL_WINDOW_DAYS * 24 * 60 * 60 * 1000,
        );
        const recentCallsP = db
          .select({
            id: mobileCallRecords.id,
            started_at: mobileCallRecords.started_at,
          })
          .from(mobileCallRecords)
          .where(
            and(
              eq(mobileCallRecords.user_id, u.id),
              gte(mobileCallRecords.started_at, cutoff),
              or(
                sql`regexp_replace(COALESCE(${mobileCallRecords.from_number}, ''), '\D', '', 'g') LIKE ${"%" + normalized}`,
                sql`regexp_replace(COALESCE(${mobileCallRecords.to_number}, ''), '\D', '', 'g') LIKE ${"%" + normalized}`,
              ),
            ),
          )
          .orderBy(desc(mobileCallRecords.started_at));

        const [businessName, lastBooking, lastSmsAt, openInvoices, recentCalls] =
          await Promise.all([
            businessNameP,
            lastBookingP,
            lastSmsP,
            openInvoicesP,
            recentCallsP,
          ]);

        const openInvoiceCount = openInvoices.length;
        const openInvoiceTotalCents = openInvoices.reduce(
          (sum, inv) => sum + (inv.total_cents ?? 0),
          0,
        );

        // lastInteractionAt = most recent of (latest SMS, latest recent call)
        const candidates: Date[] = [];
        if (lastSmsAt) candidates.push(new Date(lastSmsAt));
        if (recentCalls[0]?.started_at)
          candidates.push(new Date(recentCalls[0].started_at));
        const lastInteractionAt =
          candidates.length > 0
            ? new Date(Math.max(...candidates.map((d) => d.getTime()))).toISOString()
            : null;

        // lastService — derived from bookings.notes / date if present
        let lastService: { summary: string; at: string } | null = null;
        if (lastBooking) {
          const summary =
            (lastBooking.notes && lastBooking.notes.trim().slice(0, 200)) ||
            "Completed service";
          // Prefer booking date+time, fall back to created_at
          let at: string | null = null;
          if (lastBooking.date) {
            const dt = new Date(`${lastBooking.date}T${lastBooking.time || "00:00"}:00`);
            if (!isNaN(dt.getTime())) at = dt.toISOString();
          }
          if (!at && lastBooking.created_at) {
            at = new Date(lastBooking.created_at).toISOString();
          }
          if (at) lastService = { summary, at };
        }

        // notes — latest booking note (any status) if no completed-booking note
        let notes: string | null = lastBooking?.notes?.trim() ?? null;
        if (!notes) {
          const [anyBooking] = await db
            .select({ notes: bookings.notes })
            .from(bookings)
            .where(
              and(
                eq(bookings.lead_id, matchedLead.id),
                sql`${bookings.notes} IS NOT NULL AND length(trim(${bookings.notes})) > 0`,
              ),
            )
            .orderBy(desc(bookings.created_at))
            .limit(1);
          notes = anyBooking?.notes?.trim() ?? null;
        }
        if (notes && notes.length > 500) notes = notes.slice(0, 500);

        return res.json({
          contact: {
            leadId: matchedLead.id,
            name: matchedLead.name,
            phone: matchedLead.phone ?? rawPhone,
            businessName,
            lastInteractionAt,
            recentCallsCount: recentCalls.length,
            lastService,
            openInvoiceCount,
            openInvoiceTotalCents,
            notes,
          },
        });
      } catch (err) {
        log.error("lookup failed", {
          err: (err as Error).message,
          userId: u?.id,
        });
        return res.status(500).json({ error: "Lookup failed" });
      }
    },
  );

  log.info("Mobile contact-lookup routes registered");
}
