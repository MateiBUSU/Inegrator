import type { RequestHandler } from "express";
import type { z } from "zod";
import { HttpError } from "./error-handler";

/**
 * 400 for a failed zod parse. With includeIssues, the response also carries the individual
 * issues (path and message) so a client can show what is wrong inside a large document.
 */
export function validationError(error: z.ZodError, includeIssues = false): HttpError {
  const fields = [...new Set(error.issues.map((issue) => issue.path.join(".")))]
    .filter(Boolean)
    .join(", ");
  return new HttpError(
    400,
    "VALIDATION_ERROR",
    fields ? `Date invalide: ${fields}.` : "Date invalide.",
    includeIssues
      ? {
          issues: error.issues
            .slice(0, 20)
            .map((issue) => ({ path: issue.path.join("."), message: issue.message })),
        }
      : undefined,
  );
}

/** Validates req.body with a zod schema and replaces it with the parsed (normalized) value. */
export function validateBody(
  schema: z.ZodType,
  options: { includeIssues?: boolean } = {},
): RequestHandler {
  return (req, _res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      next(validationError(result.error, options.includeIssues));
      return;
    }
    req.body = result.data;
    next();
  };
}

/** Validates the query string. Handlers re-parse req.query themselves (it is read-only in Express 5). */
export function validateQuery(schema: z.ZodType): RequestHandler {
  return (req, _res, next) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      next(validationError(result.error));
      return;
    }
    next();
  };
}

/** Rejects malformed route params (e.g. a non-uuid id) with a 400 before any query runs. */
export function validateParams(schema: z.ZodType): RequestHandler {
  return (req, _res, next) => {
    const result = schema.safeParse(req.params);
    if (!result.success) {
      next(validationError(result.error));
      return;
    }
    next();
  };
}
