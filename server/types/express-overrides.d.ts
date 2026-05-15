/**
 * @types/express ^5.0.0 typing made `req.params.X` widen to
 * `string | string[]` because Express 5 added support for repeated
 * path parameters (`/items/:id+`). None of our routes use that
 * syntax — every `:id` is a single segment — so this declaration
 * forces `req.params` back to the Express 4 shape
 * (`Record<string, string>`) project-wide. Saves a hundred-odd
 * `as string` casts at callsites.
 */
import "express";

declare global {
  namespace Express {
    interface Request {
      params: Record<string, string>;
    }
  }
}

export {};
