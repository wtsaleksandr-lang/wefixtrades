/**
 * Public API v1 response envelope (Wave AJ-6).
 *
 * Every successful v1 response:
 *   { "data": <T>, "request_id": "req_..." }
 *
 * Every error response (4xx / 5xx):
 *   { "error": { "code": "...", "message": "..." }, "request_id": "req_..." }
 *
 * Helpers are tiny on purpose — they exist to make the contract one place
 * to change later (add timestamps, links, etc.) without combing every
 * route.
 */
import type { Request, Response } from "express";

export function ok<T>(req: Request, res: Response, data: T, status = 200): Response {
  return res.status(status).json({ data, request_id: req.requestId });
}

export interface ErrorBody {
  code: string;
  message: string;
  [extra: string]: unknown;
}

export function fail(
  req: Request,
  res: Response,
  status: number,
  body: ErrorBody,
): Response {
  return res.status(status).json({ error: body, request_id: req.requestId });
}
