import { Router } from "express";
import {
  authResponseSchema,
  loginRequestSchema,
  registerRequestSchema,
  type LoginRequest,
  type RegisterRequest,
} from "@app/shared";
import {
  AUTH_COOKIE_NAME,
  authCookieOptions,
  clearAuthCookieOptions,
  requireAuth,
} from "../middleware/auth";
import { HttpError } from "../middleware/error-handler";
import { createAuthRateLimiters } from "../middleware/rate-limit";
import { validateBody } from "../middleware/validate";
import * as authService from "../services/auth-service";

export function createAuthRouter(): Router {
  const router = Router();
  const limiters = createAuthRateLimiters();

  router.post(
    "/register",
    limiters.register,
    validateBody(registerRequestSchema),
    async (req, res) => {
      const { user, token } = await authService.register(req.body as RegisterRequest);
      res.cookie(AUTH_COOKIE_NAME, token, authCookieOptions);
      res.status(201).json(authResponseSchema.parse({ user }));
    },
  );

  router.post("/login", limiters.login, validateBody(loginRequestSchema), async (req, res) => {
    const { user, token } = await authService.login(req.body as LoginRequest);
    res.cookie(AUTH_COOKIE_NAME, token, authCookieOptions);
    res.json(authResponseSchema.parse({ user }));
  });

  router.post("/logout", (_req, res) => {
    res.clearCookie(AUTH_COOKIE_NAME, clearAuthCookieOptions);
    res.status(204).end();
  });

  router.get("/me", requireAuth, async (req, res) => {
    if (!req.auth) throw new HttpError(401, "UNAUTHENTICATED", "Autentificare necesară.");
    try {
      const user = await authService.getCurrentUser(req.auth.userId);
      res.json(authResponseSchema.parse({ user }));
    } catch (err) {
      // Valid token for a user that no longer exists: drop the stale cookie.
      if (err instanceof HttpError && err.status === 401) {
        res.clearCookie(AUTH_COOKIE_NAME, clearAuthCookieOptions);
      }
      throw err;
    }
  });

  return router;
}
