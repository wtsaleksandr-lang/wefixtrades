/**
 * Per-request UUID middleware (Wave AJ-6).
 *
 * Generates a short request id once per inbound request, exposes it on
 * `req.requestId`, and echoes it back in the `X-Request-Id` response
 * header. The public API v1 routes envelope every JSON body with this
 * id so customers can quote it when filing support tickets.
 *
 * If the caller already sent an `X-Request-Id` header we honor it
 * verbatim (after a basic shape check) so distributed tracing can
 * propagate from edge proxies.
 */
import type { Request, Response, NextFunction } from "express";
import crypto from "crypto";

declare global {
  namespace Express {
    interface Request {
      requestId?: string;
    }
  }
}

const ID_PATTERN = /^[A-Za-z0-9_-]{8,80}$/;

export function requestId(req: Request, res: Response, next: NextFunction): void {
  // Idempotent: if a prior mount of this same middleware already tagged
  // the request, keep the existing id so the apiV1 router's local mount
  // (kept for backward compatibility) doesn't clobber the global one
  // and break customer-quoted ids mid-stack. PR #730 audit follow-up.
  if (req.requestId) {
    if (!res.getHeader("X-Request-Id")) {
      res.setHeader("X-Request-Id", req.requestId);
    }
    return next();
  }

  const inbound = req.get("x-request-id");
  let id: string;
  if (inbound && ID_PATTERN.test(inbound)) {
    id = inbound;
  } else {
    id = `req_${crypto.randomBytes(12).toString("base64url").replace(/[-_]/g, "")}`;
  }
  req.requestId = id;
  res.setHeader("X-Request-Id", id);
  next();
}
