import { attemptResponseSchema, type AttemptResult, type SubmitAttemptRequest } from "@app/shared";
import { request } from "./client";

// CamelCase, like the rest of the materials API.

/** POST /api/materials/:id/attempts (student): scores the answers and returns the result with the key. */
export async function submitAttempt(
  materialId: string,
  body: SubmitAttemptRequest,
): Promise<AttemptResult> {
  const { attempt } = await request(
    "POST",
    `/materials/${encodeURIComponent(materialId)}/attempts`,
    {
      body,
      schema: attemptResponseSchema,
    },
  );
  return attempt;
}

/** GET /api/attempts/:id (student): the student's own earlier attempt. */
export async function getAttempt(id: string): Promise<AttemptResult> {
  const { attempt } = await request("GET", `/attempts/${encodeURIComponent(id)}`, {
    schema: attemptResponseSchema,
  });
  return attempt;
}
