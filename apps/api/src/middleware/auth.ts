import type { CookieOptions, RequestHandler } from "express";
import type { Role } from "@app/shared";
import { env } from "../config/env";
import { TOKEN_TTL_SECONDS, verifyToken, type AuthContext } from "../services/token-service";
import { HttpError } from "./error-handler";

export const AUTH_COOKIE_NAME = "token";

// Shared by set and clear: browsers only clear a cookie when its attributes match.
const baseCookieOptions: CookieOptions = {
  httpOnly: true,
  sameSite: "lax",
  secure: env.NODE_ENV === "production",
  path: "/",
};
export const authCookieOptions: CookieOptions = {
  ...baseCookieOptions,
  maxAge: TOKEN_TTL_SECONDS * 1000,
};
export const clearAuthCookieOptions: CookieOptions = baseCookieOptions;

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

export const requireAuth: RequestHandler = (req, _res, next) => {
  const token: unknown = req.cookies?.[AUTH_COOKIE_NAME];
  const auth = typeof token === "string" ? verifyToken(token) : null;
  if (!auth) {
    next(new HttpError(401, "UNAUTHENTICATED", "Autentificare necesară."));
    return;
  }
  req.auth = auth;
  next();
};

/** Identity of the caller, taken from the verified session only. Use after requireAuth. */
export function getAuth(req: { auth?: AuthContext }): AuthContext {
  if (!req.auth) throw new HttpError(401, "UNAUTHENTICATED", "Autentificare necesară.");
  return req.auth;
}

/** Must run after requireAuth. */
export function requireRole(...roles: Role[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.auth) {
      next(new HttpError(401, "UNAUTHENTICATED", "Autentificare necesară."));
      return;
    }
    if (!roles.includes(req.auth.role)) {
      next(new HttpError(403, "FORBIDDEN", "Nu ai permisiunea să accesezi această resursă."));
      return;
    }
    next();
  };
}
