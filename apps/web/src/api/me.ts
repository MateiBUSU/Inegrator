import {
  gamificationStatsSchema,
  myMaterialsResponseSchema,
  progressListResponseSchema,
  progressResponseSchema,
  type GamificationStats,
  type ProgressStatus,
  type StudentMaterialView,
} from "@app/shared";
import type { z } from "zod";
import { request } from "./client";

// Everything under /api/me is about the signed-in student; there is never an id of the student.

export type ProgressItem = z.infer<typeof progressResponseSchema>["progress"];

/** GET /api/me/materials: published materials assigned to the student's classes (no answer key). */
export async function listMyMaterials(classId?: string): Promise<StudentMaterialView[]> {
  const query = classId ? `?classId=${encodeURIComponent(classId)}` : "";
  const { materials } = await request("GET", `/me/materials${query}`, {
    schema: myMaterialsResponseSchema,
  });
  return materials;
}

/** GET /api/me/progress: one entry per material the student started or completed. */
export async function listMyProgress(): Promise<ProgressItem[]> {
  const { progress } = await request("GET", "/me/progress", { schema: progressListResponseSchema });
  return progress;
}

/** PUT /api/me/progress/:materialId */
export async function setProgress(
  materialId: string,
  status: ProgressStatus,
): Promise<ProgressItem> {
  const { progress } = await request("PUT", `/me/progress/${encodeURIComponent(materialId)}`, {
    body: { status },
    schema: progressResponseSchema,
  });
  return progress;
}

/** GET /api/me/gamification: stats computed from the student's real activity. */
export function getGamification(): Promise<GamificationStats> {
  return request("GET", "/me/gamification", { schema: gamificationStatsSchema });
}
