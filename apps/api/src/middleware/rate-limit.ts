import type { RequestHandler } from "express";
import { rateLimit } from "express-rate-limit";
import { HttpError } from "./error-handler";

function limiter(options: { windowMs: number; limit: number; skipSuccessful?: boolean }) {
  return rateLimit({
    windowMs: options.windowMs,
    limit: options.limit,
    skipSuccessfulRequests: options.skipSuccessful ?? false,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler: (_req, _res, next) => {
      next(
        new HttpError(429, "RATE_LIMITED", "Prea multe încercări. Încearcă din nou mai târziu."),
      );
    },
  });
}

/** Each call creates fresh in-memory counters (one set per app instance). */
export function createAuthRateLimiters(): { login: RequestHandler; register: RequestHandler } {
  return {
    // Only failed attempts count, so legitimate users are not locked out by their own logins.
    login: limiter({ windowMs: 15 * 60 * 1000, limit: 10, skipSuccessful: true }),
    // Generous: a whole class behind one school NAT registers from the same IP.
    register: limiter({ windowMs: 60 * 60 * 1000, limit: 60 }),
  };
}
