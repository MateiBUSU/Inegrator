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

// Errors raised by express.json(): a 4xx status, usually with a `type` such as entity.too.large,
// entity.parse.failed, encoding.unsupported or charset.unsupported. A body that fails to
// decompress has a 4xx status and `expose: true` but no `type`, so that counts too.
function isBodyParserError(err: unknown): err is { status: number; type?: string } {
  return (
    typeof err === "object" &&
    err !== null &&
    (("type" in err && typeof err.type === "string") || ("expose" in err && err.expose === true)) &&
    "status" in err &&
    typeof err.status === "number" &&
    err.status >= 400 &&
    err.status < 500
  );
}

function bodyParserResponse(err: { status: number; type?: string }) {
  if (err.type === "entity.too.large") {
    return { code: "PAYLOAD_TOO_LARGE", message: "Cererea este prea mare." };
  }
  if (err.type === "entity.parse.failed") {
    return { code: "INVALID_BODY", message: "Corpul cererii nu este JSON valid." };
  }
  if (err.status === 415) {
    return {
      code: "UNSUPPORTED_MEDIA_TYPE",
      message: "Tipul sau codificarea cererii nu este acceptată.",
    };
  }
  return { code: "BAD_REQUEST", message: "Cerere invalidă." };
}

/**
 * Log form of an unexpected error: its name and stack frames, never the message. Messages can
 * echo request data (a Prisma validation error prints the query arguments, e.g. a password hash).
 */
function describeError(err: unknown): string {
  if (!(err instanceof Error)) return "Unexpected non-Error value thrown";
  const messageLines = err.message.split("\n").length;
  const frames = (err.stack ?? "").split("\n").slice(messageLines);
  return [`Unhandled ${err.name}`, ...frames].join("\n");
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
    res.status(err.status).json({ error: bodyParserResponse(err) });
    return;
  }
  console.error(describeError(err));
  res
    .status(500)
    .json({ error: { code: "INTERNAL_ERROR", message: "A apărut o eroare internă." } });
};
