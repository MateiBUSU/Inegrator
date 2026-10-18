import {
  allQuestions,
  attemptResultSchema,
  DEFAULT_POLICY,
  reasoningVerdictValueSchema,
  type AttemptResult,
  type Question,
  type ReasoningVerdict,
  type SubmitAttemptRequest,
  type SubmittedAnswer,
} from "@app/shared";
import { getAiEngine } from "../ai";
import { env } from "../config/env";
import { HttpError } from "../middleware/error-handler";
import {
  createAttempt,
  findAttemptById,
  findExistingObjectiveIds,
  type AttemptRecord,
} from "../repositories/attempt-repository";
import { findMaterialById, isAssignedToStudent } from "../repositories/material-repository";
import { afterPersonalAttempt } from "./adaptation-service";
import { consumeAiQuota } from "./ai-quota";
import { definitionOf, scorableOf } from "./material-content";
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
 * One AI call per answered reasoning question, compared with the stored reference answer. This
 * runs BEFORE anything is saved: if the AI is unavailable (503) or the daily quota is used up
 * (429) the whole submission fails with that error and nothing is stored, so the answer is
 * never recorded as wrong because the grader was down, and the student can send it again. A
 * blank answer is GRESIT without an AI call. Only the question, the reference answer and the
 * student's text reach the provider: no identity.
 */
async function gradeReasoningAnswers(
  auth: AuthContext,
  record: Parameters<typeof definitionOf>[0],
  questions: readonly Question[],
  answers: readonly SubmittedAnswer[],
): Promise<Map<string, ReasoningVerdict>> {
  const verdicts = new Map<string, ReasoningVerdict>();
  const reasoning = questions.filter((q) => q.type === "reasoning");
  if (reasoning.length === 0 || record.scope === "personal") return verdicts;

  const definition = definitionOf(record);
  const byQuestion = new Map(answers.map((answer) => [answer.questionId, answer]));
  const pending = reasoning.filter((q) => (byQuestion.get(q.id)?.text ?? "").trim() !== "");
  if (pending.length === 0) return verdicts;

  const engine = await getAiEngine();
  for (const question of pending) {
    await consumeAiQuota(auth.userId, env.AI_DAILY_LIMIT_PER_STUDENT);
    const objective = definition.objectives.find((o) => o.id === question.objectiveId);
    verdicts.set(
      question.id,
      await engine.gradeReasoningAnswer({
        subjectTitle: "Informatică",
        chapterTitle: definition.title,
        objective: objective ?? { id: question.objectiveId, text: definition.title },
        language: definition.language,
        question: question.prompt,
        referenceAnswer: question.referenceSolution ?? "",
        studentAnswer: (byQuestion.get(question.id)?.text ?? "").trim(),
        policy: DEFAULT_POLICY,
      }),
    );
  }
  return verdicts;
}

/**
 * Scores and stores one attempt. A class material must be published and assigned to a class the
 * student is enrolled in; a personal material must be the student's own. The score comes only
 * from the answer key stored server-side.
 */
export async function submitAttempt(
  auth: AuthContext,
  materialId: string,
  input: SubmitAttemptRequest,
): Promise<AttemptResult> {
  assertStudent(auth);
  const record = await findMaterialById(materialId);
  if (!record) throw materialNotFound();
  const personal = record.scope === "personal";
  if (personal) {
    // Personal materials have no status or assignment: ownership is the whole rule.
    if (record.ownerId !== auth.userId) throw materialNotFound();
  } else {
    if (record.status !== "published") throw materialNotFound();
    if (!(await isAssignedToStudent(record.id, auth.userId))) throw materialNotFound();
  }

  const material = scorableOf(record);
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

  const verdicts = await gradeReasoningAnswers(auth, record, questions, input.answers);
  const scored = scoreAttempt(material, input.answers, verdicts);
  const byQuestion = new Map(input.answers.map((answer) => [answer.questionId, answer]));

  // Material objective ids are local to the material; only a real catalogue row can be linked.
  const candidateIds = [
    ...new Set(questions.map((q) => q.objectiveId).filter((id) => UUID.test(id))),
  ];
  const catalogue = await findExistingObjectiveIds(candidateIds);

  // Programming answers are stored with isCorrect = null ("not graded"): a fake "incorrect" would
  // corrupt future per-objective mastery. A reasoning answer is correct only with a CORECT
  // verdict, and its verdict and feedback are stored so the result can be shown again later
  // without another AI call.
  const rows = scored.results.map((result) => ({
    questionId: result.questionId,
    answer:
      result.type === "mcq"
        ? { optionIds: result.selected }
        : result.type === "reasoning"
          ? {
              text: byQuestion.get(result.questionId)?.text ?? "",
              verdict: result.verdict,
              feedback: result.feedback,
              ...(result.reexplanation ? { explanation: result.reexplanation } : {}),
            }
          : { text: byQuestion.get(result.questionId)?.text ?? "" },
    isCorrect:
      result.type === "programming"
        ? null
        : result.type === "reasoning"
          ? result.verdict === "CORECT"
          : result.isCorrect,
    objectiveId: catalogue.has(result.objectiveId) ? result.objectiveId : null,
  }));

  const attempt = await createAttempt({
    studentId: auth.userId,
    materialId: record.id,
    score: scored.score,
    maxScore: scored.maxScore,
    answers: rows,
  });

  // Personal attempts feed objective_stats and the adaptive policy. The attempt is already
  // saved, so a failure here must not turn the student's submission into an error.
  if (personal && record.topicId) {
    try {
      await afterPersonalAttempt({
        studentId: auth.userId,
        topicId: record.topicId,
        answers: rows,
      });
    } catch (err) {
      console.error(
        `Adaptive policy update failed: ${err instanceof Error ? err.name : "unknown error"}`,
      );
    }
  }
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
  const verdicts = new Map<string, ReasoningVerdict>();
  const stored: SubmittedAnswer[] = attempt.answers.map((row) => {
    const value = (row.answer ?? {}) as {
      optionIds?: string[];
      text?: string;
      verdict?: string;
      feedback?: string;
      explanation?: string;
    };
    // Reasoning verdicts are not recomputable (AI): read back what was stored at submit time.
    const verdict = reasoningVerdictValueSchema.safeParse(value.verdict);
    if (verdict.success && value.feedback) {
      verdicts.set(row.questionId, {
        verdict: verdict.data,
        feedback: value.feedback,
        ...(value.explanation ? { explanation: value.explanation } : {}),
      });
    }
    return { questionId: row.questionId, optionIds: value.optionIds, text: value.text };
  });
  return toResult(attempt, scoreAttempt(scorableOf(record), stored, verdicts));
}
