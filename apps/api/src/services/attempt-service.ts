import {
  allQuestions,
  attemptResultSchema,
  type AttemptResult,
  type SubmitAttemptRequest,
  type SubmittedAnswer,
} from "@app/shared";
import { HttpError } from "../middleware/error-handler";
import {
  createAttempt,
  findAttemptById,
  findExistingObjectiveIds,
  type AttemptRecord,
} from "../repositories/attempt-repository";
import { findMaterialById, isAssignedToStudent } from "../repositories/material-repository";
import { definitionOf } from "./material-content";
import { scoreAttempt, type ScoredAttempt } from "./scoring";
import type { AuthContext } from "./token-service";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function assertStudent(auth: AuthContext): void {
  if (auth.role !== "student") {
    throw new HttpError(403, "FORBIDDEN", "Nu ai permisiunea să accesezi această resursă.");
  }
}

// A resource you may not see is indistinguishable from one that does not exist.
const attemptNotFound = () =>
  new HttpError(404, "ATTEMPT_NOT_FOUND", "Încercarea nu a fost găsită.");
const materialNotFound = () =>
  new HttpError(404, "MATERIAL_NOT_FOUND", "Materialul nu a fost găsit.");

function toResult(attempt: AttemptRecord, scored: ScoredAttempt): AttemptResult {
  return attemptResultSchema.parse({
    id: attempt.id,
    materialId: attempt.materialId,
    submittedAt: attempt.submittedAt.toISOString(),
    score: attempt.score,
    maxScore: attempt.maxScore,
    selfEvaluationCount: scored.selfEvaluationCount,
    results: scored.results,
  });
}

/**
 * Scores and stores one attempt. The material must be published and assigned to a class the
 * student is enrolled in; the score comes only from the confirmed answer key stored server-side.
 */
export async function submitAttempt(
  auth: AuthContext,
  materialId: string,
  input: SubmitAttemptRequest,
): Promise<AttemptResult> {
  assertStudent(auth);
  const record = await findMaterialById(materialId);
  if (!record || record.scope !== "class" || record.status !== "published") {
    throw materialNotFound();
  }
  if (!(await isAssignedToStudent(record.id, auth.userId))) throw materialNotFound();

  const material = definitionOf(record);
  const questions = allQuestions(material);
  const known = new Set(questions.map((q) => q.id));
  const seen = new Set<string>();
  for (const answer of input.answers) {
    if (!known.has(answer.questionId) || seen.has(answer.questionId)) {
      throw new HttpError(
        400,
        "INVALID_ANSWERS",
        "Răspunsurile trimise nu corespund materialului.",
      );
    }
    seen.add(answer.questionId);
  }

  const scored = scoreAttempt(material, input.answers);
  const byQuestion = new Map(input.answers.map((answer) => [answer.questionId, answer]));

  // Material objective ids are local to the material; only a real catalogue row can be linked.
  const candidateIds = [
    ...new Set(questions.map((q) => q.objectiveId).filter((id) => UUID.test(id))),
  ];
  const catalogue = await findExistingObjectiveIds(candidateIds);

  // Programming answers are stored with isCorrect = null ("not graded"): a fake "incorrect" would
  // corrupt future per-objective mastery.
  const rows = scored.results.map((result) => ({
    questionId: result.questionId,
    answer:
      result.type === "mcq"
        ? { optionIds: result.selected }
        : { text: byQuestion.get(result.questionId)?.text ?? "" },
    isCorrect: result.type === "programming" ? null : result.isCorrect,
    objectiveId: catalogue.has(result.objectiveId) ? result.objectiveId : null,
  }));

  const attempt = await createAttempt({
    studentId: auth.userId,
    materialId: record.id,
    score: scored.score,
    maxScore: scored.maxScore,
    answers: rows,
  });
  return toResult(attempt, scored);
}

/** Post-submission view, with the answer key. Only the student who made the attempt. */
export async function getAttempt(auth: AuthContext, attemptId: string): Promise<AttemptResult> {
  assertStudent(auth);
  const attempt = await findAttemptById(attemptId);
  if (!attempt || attempt.studentId !== auth.userId) throw attemptNotFound();

  const record = await findMaterialById(attempt.materialId);
  if (!record) throw attemptNotFound();

  // Published materials are immutable, so re-grading the stored answers reproduces the result.
  const stored: SubmittedAnswer[] = attempt.answers.map((row) => {
    const value = (row.answer ?? {}) as { optionIds?: string[]; text?: string };
    return { questionId: row.questionId, optionIds: value.optionIds, text: value.text };
  });
  return toResult(attempt, scoreAttempt(definitionOf(record), stored));
}
