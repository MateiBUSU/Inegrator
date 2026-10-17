import { Router } from "express";
import {
  gamificationStatsSchema,
  listMyMaterialsQuerySchema,
  myMaterialsResponseSchema,
  progressListResponseSchema,
  progressParamsSchema,
  progressResponseSchema,
  updateProgressRequestSchema,
  type ProgressStatus,
} from "@app/shared";
import { getAuth, requireAuth, requireRole } from "../middleware/auth";
import { validateBody, validateParams, validateQuery } from "../middleware/validate";
import { computeGamificationStats } from "../services/gamification";
import * as progressService from "../services/progress-service";

// The student is always the session's user: there is no id in the URL, body or query to spoof.
export function createMeRouter(): Router {
  const router = Router();
  router.use(requireAuth);

  router.get("/gamification", requireRole("student"), async (req, res) => {
    const stats = await computeGamificationStats(getAuth(req).userId);
    res.json(gamificationStatsSchema.parse(stats));
  });

  router.get("/progress", requireRole("student"), async (req, res) => {
    const progress = await progressService.listMyProgress(getAuth(req));
    res.json(progressListResponseSchema.parse({ progress }));
  });

  router.put(
    "/progress/:materialId",
    requireRole("student"),
    validateParams(progressParamsSchema),
    validateBody(updateProgressRequestSchema),
    async (req, res) => {
      const { status } = req.body as { status: ProgressStatus };
      const progress = await progressService.setProgress(
        getAuth(req),
        String(req.params.materialId),
        status,
      );
      res.json(progressResponseSchema.parse({ progress }));
    },
  );

  router.get(
    "/materials",
    requireRole("student"),
    validateQuery(listMyMaterialsQuerySchema),
    async (req, res) => {
      const { classId } = listMyMaterialsQuerySchema.parse(req.query);
      const materials = await progressService.listMyMaterials(getAuth(req), classId);
      res.json(myMaterialsResponseSchema.parse({ materials }));
    },
  );

  return router;
}
