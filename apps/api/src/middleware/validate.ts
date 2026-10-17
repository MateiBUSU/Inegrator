import type { RequestHandler } from "express";
import type { z } from "zod";
import { HttpError } from "./error-handler";

/** Validates req.body with a zod schema and replaces it with the parsed (normalized) value. */
export function validateBody(schema: z.ZodType): RequestHandler {
  return (req, _res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const fields = [...new Set(result.error.issues.map((issue) => issue.path.join(".")))]
        .filter(Boolean)
        .join(", ");
      next(
        new HttpError(
          400,
          "VALIDATION_ERROR",
          fields ? `Date invalide: ${fields}.` : "Date invalide.",
        ),
      );
      return;
    }
    req.body = result.data;
    next();
  };
}
