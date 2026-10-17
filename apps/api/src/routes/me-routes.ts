import { Router } from "express";
import { gamificationStatsSchema } from "@app/shared";
import { getAuth, requireAuth, requireRole } from "../middleware/auth";
import { computeGamificationStats } from "../services/gamification";

// The student is always the session's user: there is no id in the URL, body or query to spoof.
export function createMeRouter(): Router {
  const router = Router();
  router.use(requireAuth);

  router.get("/gamification", requireRole("student"), async (req, res) => {
    const stats = await computeGamificationStats(getAuth(req).userId);
    res.json(gamificationStatsSchema.parse(stats));
  });

  return router;
}
