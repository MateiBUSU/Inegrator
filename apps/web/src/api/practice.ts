import {
  practiceProgressResponseSchema,
  startPracticeResponseSchema,
  submitPracticeResponseSchema,
  type PracticeProgress,
  type SubmitPracticeRequest,
  type SubmitPracticeResponse,
} from "@app/shared";
import type { z } from "zod";
import { ApiError } from "./errors";
import { request } from "./client";

// Adaptive practice on class objectives (/api/objectives/:id/practice). Students only.

export type StartedPractice = z.infer<typeof startPracticeResponseSchema>;

const base = (objectiveId: string) => `/objectives/${encodeURIComponent(objectiveId)}/practice`;

/** POST .../start: one exercise (a still-unanswered one comes back as is) and the progress. */
export function startPractice(objectiveId: string): Promise<StartedPractice> {
  return request("POST", `${base(objectiveId)}/start`, { schema: startPracticeResponseSchema });
}

/** POST .../:exerciseId/submit */
export function submitPractice(
  objectiveId: string,
  exerciseId: string,
  body: SubmitPracticeRequest,
): Promise<SubmitPracticeResponse> {
  return request("POST", `${base(objectiveId)}/${encodeURIComponent(exerciseId)}/submit`, {
    body,
    schema: submitPracticeResponseSchema,
  });
}

/** POST .../request-help: tells the teacher; only allowed once the loop is capped. */
export async function requestHelp(objectiveId: string): Promise<PracticeProgress> {
  const { progress } = await request("POST", `${base(objectiveId)}/request-help`, {
    schema: practiceProgressResponseSchema,
  });
  return progress;
}

/** GET .../progress; null when the student has not started this objective yet (404). */
export async function getPracticeProgress(objectiveId: string): Promise<PracticeProgress | null> {
  try {
    const { progress } = await request("GET", `${base(objectiveId)}/progress`, {
      schema: practiceProgressResponseSchema,
    });
    return progress;
  } catch (error) {
    if (error instanceof ApiError && error.code === "PROGRESS_NOT_FOUND") return null;
    throw error;
  }
}
