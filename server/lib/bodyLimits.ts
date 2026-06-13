/**
 * Path-scoped raised body-parser limits.
 *
 * THE TRAP THIS MODULE EXISTS TO PREVENT (repo-wide P1, found 2026-06):
 * server/index.ts mounts a global `express.json()` with the 100 KB default
 * limit BEFORE every route. A route-scoped `express.json({ limit: "8mb" })`
 * mounted later CANNOT raise that limit — the GLOBAL parser reads the body
 * first and 413s (`entity.too.large`) before the route's parser ever runs
 * (verified empirically in PRICING-MODELS U4 / PR #1754). Every raised limit
 * therefore has to be PATH-SCOPED and mounted AHEAD of the global parser in
 * server/index.ts. This table is that single mounting point.
 *
 * Everything not listed here keeps the strict global 100 KB default — that
 * is a deliberate DoS posture, do NOT raise the global limit instead.
 *
 * Adding a new large-body JSON route?
 *   1. Add a row here (path prefix + limit + why).
 *   2. Do NOT add a route-scoped `express.json({ limit })` — it would be
 *      dead code (see above). The rows below are the only mechanism that
 *      works.
 *   3. The CI gate (`npm run check:body-limit-preemption`,
 *      server/lib/bodyLimits.test.ts) probes every row in-process: an
 *      over-100KB-but-under-limit body must reach the route, an over-limit
 *      body must 413.
 *
 * The verify hook mirrors the global parser's rawBody capture so webhook
 * signature verification keeps working on these paths too.
 */
import express, { type Express } from "express";

export interface RaisedBodyLimit {
  /** Express mount path — app.use() semantics (prefix match, `:params` ok). */
  path: string;
  /** Body-parser size limit for JSON bodies on this path. */
  limit: string;
  /** Owning route file + why the route needs more than the global 100 KB. */
  why: string;
}

export const RAISED_BODY_LIMITS: readonly RaisedBodyLimit[] = [
  {
    path: "/api/quote-widget/upload",
    limit: "12mb",
    why: "quoteWidgetUploadRoutes.ts (PR #1754) — public photo upload, 8 MB decoded → ~11 MB base64 JSON",
  },
  {
    path: "/api/chat/attachments",
    limit: "21mb",
    why: "chatAttachmentRoutes.ts — portal/admin chat uploads, 15 MB decoded cap → ~20 MB base64 JSON",
  },
  {
    path: "/api/portal/logo/upload",
    limit: "8mb",
    why: "portalRoutes.ts — client logo upload, 5 MB decoded cap → ~7 MB base64 JSON",
  },
  {
    path: "/api/admin/crm/fulfillment/:id/deliverables",
    limit: "16mb",
    why: "adminCrmRoutes.ts — deliverable upload, 10 MB decoded cap → ~14 MB base64 JSON",
  },
  {
    path: "/api/mobile/ai/transcribe",
    limit: "35mb",
    why: "mobileAiVoiceRoutes.ts — voice recording, 25 MB audio → ~33 MB base64 JSON",
  },
  {
    path: "/api/mobile/ai/upload-image",
    limit: "14mb",
    why: "mobileAiImagesRoutes.ts — Ask-tab image attach, 10 MB decoded cap → ~13.4 MB base64 JSON",
  },
  {
    path: "/api/portal/contentflow/generate",
    limit: "12mb",
    why: "portal/contentflow.ts — reference-replication image upload (reference.imageBase64), 8 MB decoded client cap (MAX_UPLOAD_BYTES) → ~11 MB base64 JSON",
  },
  {
    path: "/api/portal/tradeline/setup/port/upload-bill",
    limit: "10mb",
    why: "tradelineSetupRoutes.ts (LARGE_JSON) — phone-bill PDF/JPEG, 5 MB decoded → ~7 MB base64 JSON",
  },
  {
    path: "/api/portal/tradeline/setup/port/extract-bill",
    limit: "10mb",
    why: "tradelineSetupRoutes.ts (LARGE_JSON) — bill OCR extraction, same payload as upload-bill",
  },
  {
    path: "/api/portal/tradeline/setup/port/sign-loa",
    limit: "10mb",
    why: "tradelineSetupRoutes.ts (LARGE_JSON) — LOA signature PNG, 2 MB base64 + confirmed fields",
  },
  {
    path: "/api/quotequick/ai/chat",
    limit: "3mb",
    why: "quotequickAiChatRoutes.ts — chat message may carry a base64 image (schema max 2,000,000 chars)",
  },
];

/**
 * Mount one path-scoped JSON parser per RAISED_BODY_LIMITS row.
 *
 * MUST be called in server/index.ts BEFORE the global `app.use(express.json())`
 * — that ordering is the entire mechanism (the first parser to see the body
 * wins; once a body is parsed the later global parser skips it). The CI gate
 * red-proves the reversed order fails.
 */
export function mountRaisedBodyLimits(app: Express): void {
  for (const { path, limit } of RAISED_BODY_LIMITS) {
    app.use(
      path,
      express.json({
        limit,
        verify: (req, _res, buf) => {
          req.rawBody = buf;
        },
      }),
    );
  }
}
