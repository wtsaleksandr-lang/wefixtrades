/**
 * Admin Mobile Preview activity feed — Wave W-AW-2.
 *
 * Backs the Calls + Messages tabs on /admin/mobile-preview. The preview
 * page renders the softphone UI inside iPhone / Android frames; the
 * Calls and Messages screens used to be Phase-4 placeholders ("integration
 * ships in the next update"). This endpoint surfaces the most recent
 * inbound activity across the system so the admin sees what a real
 * TradeLine mobile user would see in their app — instead of a hardcoded
 * "coming soon" card.
 *
 *   GET /api/admin/mobile-preview/activity  → { calls: [...], messages: [...] }
 *
 * Admin-only. Returns 5 most recent rows from each table. Errors are
 * caught and a typed empty payload returned so the UI can degrade
 * gracefully to sample data without throwing.
 */

import type { Express, Request, Response } from "express";
import { desc } from "drizzle-orm";
import { requireAdmin } from "../auth";
import { db } from "../db";
import { mobileCallRecords, smsMessages } from "@shared/schema";
import { createLogger } from "../lib/logger";

const log = createLogger("AdminMobilePreview");

const CALL_LIMIT = 5;
const MESSAGE_LIMIT = 5;

export interface MobilePreviewCall {
  id: number;
  callSid: string;
  direction: string;
  fromNumber: string | null;
  toNumber: string | null;
  status: string;
  durationSec: number | null;
  startedAt: string;
  endedAt: string | null;
}

export interface MobilePreviewMessage {
  id: number;
  direction: string;
  channel: string;
  body: string;
  fromNumber: string | null;
  toNumber: string | null;
  isAi: boolean;
  createdAt: string;
}

export interface MobilePreviewActivityResponse {
  calls: MobilePreviewCall[];
  messages: MobilePreviewMessage[];
  hasRealData: boolean;
}

export function registerAdminMobilePreviewRoutes(app: Express): void {
  app.get(
    "/api/admin/mobile-preview/activity",
    requireAdmin,
    async (_req: Request, res: Response) => {
      let calls: MobilePreviewCall[] = [];
      let messages: MobilePreviewMessage[] = [];

      try {
        const callRows = await db
          .select({
            id: mobileCallRecords.id,
            call_sid: mobileCallRecords.call_sid,
            direction: mobileCallRecords.direction,
            from_number: mobileCallRecords.from_number,
            to_number: mobileCallRecords.to_number,
            status: mobileCallRecords.status,
            duration_sec: mobileCallRecords.duration_sec,
            started_at: mobileCallRecords.started_at,
            ended_at: mobileCallRecords.ended_at,
          })
          .from(mobileCallRecords)
          .orderBy(desc(mobileCallRecords.started_at))
          .limit(CALL_LIMIT);

        calls = callRows.map((r) => ({
          id: r.id,
          callSid: r.call_sid,
          direction: r.direction,
          fromNumber: r.from_number,
          toNumber: r.to_number,
          status: r.status,
          durationSec: r.duration_sec,
          startedAt: r.started_at.toISOString(),
          endedAt: r.ended_at ? r.ended_at.toISOString() : null,
        }));
      } catch (err) {
        log.error("Call history query failed", { err: (err as Error).message });
      }

      try {
        const msgRows = await db
          .select({
            id: smsMessages.id,
            direction: smsMessages.direction,
            channel: smsMessages.channel,
            body: smsMessages.body,
            from_number: smsMessages.from_number,
            to_number: smsMessages.to_number,
            is_ai: smsMessages.is_ai,
            created_at: smsMessages.created_at,
          })
          .from(smsMessages)
          .orderBy(desc(smsMessages.created_at))
          .limit(MESSAGE_LIMIT);

        messages = msgRows.map((r) => ({
          id: r.id,
          direction: r.direction,
          channel: r.channel,
          body: r.body,
          fromNumber: r.from_number,
          toNumber: r.to_number,
          isAi: r.is_ai ?? false,
          createdAt: (r.created_at ?? new Date()).toISOString(),
        }));
      } catch (err) {
        log.error("SMS query failed", { err: (err as Error).message });
      }

      const payload: MobilePreviewActivityResponse = {
        calls,
        messages,
        hasRealData: calls.length > 0 || messages.length > 0,
      };
      return res.json(payload);
    },
  );

  log.info("Admin mobile-preview routes registered");
}
