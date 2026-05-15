/**
 * `@types/express ^5.0.0` changed `req.params.X` from `string` to
 * `string | string[]` because Express 5 added support for repeated
 * path parameters (`/items/:id+`). None of our routes use repeated
 * parameters — every `:id` is a single segment — so this ambient
 * narrows the dictionary back to plain `Record<string, string>`.
 *
 * Picked up by tsc because the file lives under server/** and the
 * tsconfig include list covers `server/**`.
 */
import "express";

declare module "express-serve-static-core" {
  interface ParamsDictionary {
    [key: string]: string;
  }
}
