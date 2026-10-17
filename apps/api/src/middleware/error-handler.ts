import type { ErrorRequestHandler, RequestHandler } from "express";

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    /** Optional machine-readable extras, e.g. which question ids block publishing. */
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

function isBodyParserError(err: unknown): err is { status: number; type: string } {
  return (
    typeof err === "object" &&
    err !== null &&
    "type" in err &&
    typeof err.type === "string" &&
    err.type.startsWith("entity.") &&
    "status" in err &&
    typeof err.status === "number"
  );
}

export const notFoundHandler: RequestHandler = (_req, _res, next) => {
  next(new HttpError(404, "NOT_FOUND", "Resursa nu a fost găsită."));
};

// Express recognizes error handlers by their 4-argument signature.
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({
      error: {
        code: err.code,
        message: err.message,
        ...(err.details ? { details: err.details } : {}),
      },
    });
    return;
  }
  // Malformed or oversized JSON bodies, raised by express.json().
  if (isBodyParserError(err)) {
    const tooLarge = err.type === "entity.too.large";
    res.status(err.status).json({
      error: {
        code: tooLarge ? "PAYLOAD_TOO_LARGE" : "INVALID_BODY",
        message: tooLarge ? "Cererea este prea mare." : "Corpul cererii nu este JSON valid.",
      },
    });
    return;
  }
  console.error(err);
  res
    .status(500)
    .json({ error: { code: "INTERNAL_ERROR", message: "A apărut o eroare internă." } });
};
