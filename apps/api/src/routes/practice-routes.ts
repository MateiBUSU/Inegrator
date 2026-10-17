import { Router } from "express";
import {
  practiceExerciseParamsSchema,
  practiceObjectiveParamsSchema,
  practiceProgressResponseSchema,
  startPracticeResponseSchema,
  submitPracticeRequestSchema,
  submitPracticeResponseSchema,
  type SubmitPracticeRequest,
} from "@app/shared";
import { getAuth, requireAuth, requireRole } from "../middleware/auth";
import { createGenerationRateLimiter } from "../middleware/rate-limit";
import { validateBody, validateParams } from "../middleware/validate";
import * as practiceService from "../services/practice-service";

// Adaptive practice on class objectives, mounted at /api/objectives. Students only; the student
// is always the session's user, and objective access is checked in the service (enrolled in a
// class with a published material for the objective's chapter), answering 404 otherwise.
export function createPracticeRouter(): Router {
  const router = Router();
  router.use(requireAuth, requireRole("student"));

  // Burst limit for the AI endpoints; the daily quota is the real budget. Fresh counters per app.
  const aiLimiter = createGenerationRateLimiter();

  router.post(
    "/:id/practice/start",
    aiLimiter,
    validateParams(practiceObjectiveParamsSchema),
    async (req, res) => {
      const result = await practiceService.startPractice(getAuth(req), String(req.params.id));
      res.json(startPracticeResponseSchema.parse(result));
    },
  );

  router.post(
    "/:id/practice/:exerciseId/submit",
    aiLimiter,
    validateParams(practiceExerciseParamsSchema),
    validateBody(submitPracticeRequestSchema),
    async (req, res) => {
      const result = await practiceService.submitPractice(
        getAuth(req),
        String(req.params.id),
        String(req.params.exerciseId),
        req.body as SubmitPracticeRequest,
      );
      res.json(submitPracticeResponseSchema.parse(result));
    },
  );

  router.get(
    "/:id/practice/progress",
    validateParams(practiceObjectiveParamsSchema),
    async (req, res) => {
      const progress = await practiceService.getPracticeProgress(
        getAuth(req),
        String(req.params.id),
      );
      res.json(practiceProgressResponseSchema.parse({ progress }));
    },
  );

  return router;
}
