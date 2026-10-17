import type { RequestHandler } from "express";
import type { z } from "zod";
import { HttpError } from "./error-handler";

function validationError(error: z.ZodError): HttpError {
  const fields = [...new Set(error.issues.map((issue) => issue.path.join(".")))]
    .filter(Boolean)
    .join(", ");
  return new HttpError(
    400,
    "VALIDATION_ERROR",
    fields ? `Date invalide: ${fields}.` : "Date invalide.",
  );
}

/** Validates req.body with a zod schema and replaces it with the parsed (normalized) value. */
export function validateBody(schema: z.ZodType): RequestHandler {
  return (req, _res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      next(validationError(result.error));
      return;
    }
    req.body = result.data;
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
