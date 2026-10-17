import { z } from "zod";

/** Per-student stats, always computed from real activity (all zeros when there is none). */
export const gamificationStatsSchema = z.object({
  currentStreakDays: z.number().int().min(0),
  weeklyActivityCount: z.number().int().min(0),
  weeklyGoal: z.number().int().min(1),
  pointsTotal: z.number().int().min(0),
  level: z.string(),
  /** Points needed for the next level, or null at the top level. */
  nextLevelAt: z.number().int().min(0).nullable(),
});
export type GamificationStats = z.infer<typeof gamificationStatsSchema>;
