import { Router } from "express";
import { attemptIdParamsSchema, attemptResponseSchema } from "@app/shared";
import { getAuth, requireAuth, requireRole } from "../middleware/auth";
import { validateParams } from "../middleware/validate";
import * as attemptService from "../services/attempt-service";

// Post-submission results (they include the answer key): only the student who made the attempt.
export function createAttemptsRouter(): Router {
  const router = Router();
  router.use(requireAuth);

  router.get(
    "/:id",
    requireRole("student"),
    validateParams(attemptIdParamsSchema),
    async (req, res) => {
      const attempt = await attemptService.getAttempt(getAuth(req), String(req.params.id));
      res.json(attemptResponseSchema.parse({ attempt }));
    },
  );

  return router;
}
