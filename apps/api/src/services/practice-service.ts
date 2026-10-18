import {
  DEFAULT_POLICY,
  PRACTICE_ATTEMPT_CAP,
  practiceExerciseViewSchema,
  practiceProgressSchema,
  questionSchema,
  toStudentQuestion,
  type PracticeExerciseView,
  type PracticeProgress,
  type Question,
  type SubmitPracticeRequest,
  type SubmitPracticeResponse,
} from "@app/shared";
import { getAiEngine } from "../ai";
import type { PracticeExerciseInput } from "../ai/generator";
import { env } from "../config/env";
import { HttpError } from "../middleware/error-handler";
import { addObjectiveTallies } from "../repositories/learning-stats-repository";
import {
  createExerciseEnsuringProgress,
  ExerciseAlreadyAnsweredError,
  findExercise,
  findPendingExercise,
  findPracticeObjective,
  findProgress,
  markHelpRequested,
  recordPracticeResult,
  type ObjectiveProgressRecord,
  type PracticeExerciseRecord,
  type PracticeObjectiveRecord,
} from "../repositories/practice-repository";
import { consumeAiQuota } from "./ai-quota";
import { nextStrategy } from "./practice-strategy";
import { scoreAttempt } from "./scoring";
import type { AuthContext } from "./token-service";
import { assertStudent } from "./topic-service";

// Adaptive practice loop on class objectives. Like all class-level content it uses the neutral
// default policy (student policies are personal-space only, see policy-wiring.test.ts); the
// adaptation here is the strategy rotation.
// Grading is the same deterministic scorer used for
// quizzes; the AI only writes exercises, feedback and explanations (all validated by the engine)
// and never decides whether an answer is correct.

// A resource you may not see is indistinguishable from one that does not exist.
const objectiveNotFound = () =>
  new HttpError(404, "OBJECTIVE_NOT_FOUND", "Obiectivul nu a fost găsit.");
const exerciseNotFound = () =>
  new HttpError(404, "EXERCISE_NOT_FOUND", "Exercițiul nu a fost găsit.");

async function loadObjective(
  auth: AuthContext,
  objectiveId: string,
): Promise<PracticeObjectiveRecord> {
  assertStudent(auth);
  const objective = await findPracticeObjective(auth.userId, objectiveId);
  if (!objective) throw objectiveNotFound();
  return objective;
}

function toProgress(record: ObjectiveProgressRecord): PracticeProgress {
  return practiceProgressSchema.parse({
    objectiveId: record.objectiveId,
    status: record.status,
    attemptsCount: record.attemptsCount,
    strategiesTried: record.strategiesTried,
    currentExplanation: record.currentExplanation,
    helpRequestedAt: record.helpRequestedAt?.toISOString() ?? null,
    updatedAt: record.updatedAt.toISOString(),
  });
}

/** The only way an exercise is shown: whitelisted question fields, no answer key. */
function toExerciseView(record: PracticeExerciseRecord): PracticeExerciseView {
  const question = questionSchema.parse(record.question);
  return practiceExerciseViewSchema.parse({
    id: record.id,
    objectiveId: record.objectiveId,
    question: toStudentQuestion(question),
  });
}

const isCapped = (progress: ObjectiveProgressRecord) =>
  progress.status === "struggling" && progress.attemptsCount >= PRACTICE_ATTEMPT_CAP;

function exerciseInput(
  objective: PracticeObjectiveRecord,
  progress: ObjectiveProgressRecord | null,
  override?: Pick<PracticeExerciseInput, "strategy" | "explanation">,
): PracticeExerciseInput {
  return {
    subjectTitle: objective.subjectTitle,
    chapterTitle: objective.chapterTitle,
    objective: { id: objective.id, text: objective.text },
    language: objective.language,
    policy: DEFAULT_POLICY,
    // No progress yet: baseline. Otherwise the last strategy recorded.
    strategy: override?.strategy ?? progress?.strategiesTried.at(-1) ?? null,
    explanation: override?.explanation ?? progress?.currentExplanation ?? null,
  };
}

/**
 * One exercise for the objective. An exercise the student has not answered yet is returned again
 * (no AI call, no quota); otherwise a new one is generated with the last strategy recorded.
 */
export async function startPractice(
  auth: AuthContext,
  objectiveId: string,
): Promise<{ exercise: PracticeExerciseView; progress: PracticeProgress }> {
  const objective = await loadObjective(auth, objectiveId);
  const progress = await findProgress(auth.userId, objective.id);
  if (progress && isCapped(progress)) {
    throw new HttpError(
      409,
      "PRACTICE_CAPPED",
      "Ai încercat toate strategiile pentru acest obiectiv. Cere ajutorul profesorului.",
    );
  }

  const pending = progress ? await findPendingExercise(auth.userId, objective.id) : null;
  if (progress && pending) {
    return { exercise: toExerciseView(pending), progress: toProgress(progress) };
  }

  // The engine first (a provider that cannot even start must not cost quota), then the quota.
  const engine = await getAiEngine();
  const input = exerciseInput(objective, progress);
  await consumeAiQuota(auth.userId, env.AI_DAILY_LIMIT_PER_STUDENT);
  const { question } = await engine.generatePracticeExercise(input);

  const created = await createExerciseEnsuringProgress({
    studentId: auth.userId,
    objectiveId: objective.id,
    question,
  });
  return { exercise: toExerciseView(created.exercise), progress: toProgress(created.progress) };
}

export async function getPracticeProgress(
  auth: AuthContext,
  objectiveId: string,
): Promise<PracticeProgress> {
  assertStudent(auth);
  const progress = await findProgress(auth.userId, objectiveId);
  if (!progress) {
    throw new HttpError(
      404,
      "PROGRESS_NOT_FOUND",
      "Nu ai început încă exerciții la acest obiectiv.",
    );
  }
  return toProgress(progress);
}

/** What the student sent, as the scorer expects it, or null when it is not a usable answer. */
function usableAnswer(question: Question, answer: SubmitPracticeRequest) {
  if (question.type === "mcq") {
    const known = new Set((question.options ?? []).map((o) => o.id));
    const optionIds = answer.optionIds ?? [];
    if (optionIds.length === 0 || optionIds.some((id) => !known.has(id))) return null;
    return { questionId: question.id, optionIds };
  }
  const text = answer.text?.trim() ?? "";
  return text === "" ? null : { questionId: question.id, text };
}

/**
 * The student asks the teacher for help. Only allowed once the practice loop is capped, i.e. all
 * explanation strategies were tried without success. Asking again keeps the first timestamp.
 */
export async function requestPracticeHelp(
  auth: AuthContext,
  objectiveId: string,
): Promise<PracticeProgress> {
  const objective = await loadObjective(auth, objectiveId);
  const progress = await findProgress(auth.userId, objective.id);
  if (!progress) {
    throw new HttpError(
      404,
      "PROGRESS_NOT_FOUND",
      "Nu ai început încă exerciții la acest obiectiv.",
    );
  }
  if (!isCapped(progress)) {
    throw new HttpError(
      409,
      "PRACTICE_NOT_CAPPED",
      "Poți cere ajutorul profesorului după ce ai încercat toate variantele de explicație.",
    );
  }
  const saved = await markHelpRequested(auth.userId, objective.id);
  if (!saved) {
    throw new HttpError(
      404,
      "PROGRESS_NOT_FOUND",
      "Nu ai început încă exerciții la acest obiectiv.",
    );
  }
  return toProgress(saved);
}

export async function submitPractice(
  auth: AuthContext,
  objectiveId: string,
  exerciseId: string,
  answer: SubmitPracticeRequest,
): Promise<SubmitPracticeResponse> {
  const objective = await loadObjective(auth, objectiveId);
  const exercise = await findExercise(auth.userId, objective.id, exerciseId);
  const progress = await findProgress(auth.userId, objective.id);
  if (!exercise || !progress) throw exerciseNotFound();
  if (exercise.answeredAt) {
    throw new HttpError(
      409,
      "EXERCISE_ALREADY_SUBMITTED",
      "Ai trimis deja un răspuns la acest exercițiu.",
    );
  }

  const question = questionSchema.parse(exercise.question);
  const submitted = usableAnswer(question, answer);
  if (!submitted) {
    throw new HttpError(400, "INVALID_ANSWERS", "Răspunsul trimis nu corespunde exercițiului.");
  }
  const submittedAnswer =
    question.type === "mcq" ? (answer.optionIds ?? []).join(",") : (answer.text?.trim() ?? "");
  const graded = scoreAttempt({ questions: [question] }, [submitted]).results[0];
  const isCorrect =
    graded !== undefined && (graded.type === "mcq" || graded.type === "short") && graded.isCorrect;

  const attemptsCount = progress.attemptsCount + 1;
  const precedingStrategy = progress.strategiesTried.at(-1) ?? null;
  const base = { studentId: auth.userId, objectiveId: objective.id, exerciseId: exercise.id };

  try {
    if (isCorrect) {
      const { progress: saved } = await recordPracticeResult({
        ...base,
        exerciseContent: question.prompt,
        submittedAnswer,
        isCorrect: true,
        feedbackText: null,
        strategyUsed: precedingStrategy,
        progress: {
          status: "mastered",
          attemptsCount,
          strategiesTried: progress.strategiesTried,
          currentExplanation: progress.currentExplanation,
        },
        nextQuestion: null,
      });
      await tallyStats(auth.userId, objective.id, true);
      return { correct: true, progress: toProgress(saved) };
    }

    // Wrong answer: one AI call for the feedback AND the new explanation, then (unless capped)
    // one more for the next exercise. Nothing is saved unless both succeed, so a failed turn
    // leaves the exercise unanswered and the student can send the answer again.
    const strategy = nextStrategy(progress.strategiesTried);
    const capped = attemptsCount >= PRACTICE_ATTEMPT_CAP;
    const engine = await getAiEngine();
    const policy = DEFAULT_POLICY;

    await consumeAiQuota(auth.userId, env.AI_DAILY_LIMIT_PER_STUDENT);
    const diagnosis = await engine.diagnosePracticeAnswer({
      subjectTitle: objective.subjectTitle,
      chapterTitle: objective.chapterTitle,
      objective: { id: objective.id, text: objective.text },
      language: objective.language,
      policy,
      question,
      submittedAnswer,
      strategy,
      previousStrategies: progress.strategiesTried,
    });

    let nextQuestion: Question | null = null;
    if (!capped) {
      await consumeAiQuota(auth.userId, env.AI_DAILY_LIMIT_PER_STUDENT);
      const input = exerciseInput(objective, progress, {
        strategy,
        explanation: diagnosis.explanation,
      });
      nextQuestion = (await engine.generatePracticeExercise(input)).question;
    }

    const saved = await recordPracticeResult({
      ...base,
      exerciseContent: question.prompt,
      submittedAnswer,
      isCorrect: false,
      feedbackText: diagnosis.feedback,
      strategyUsed: precedingStrategy,
      progress: {
        status: "struggling",
        attemptsCount,
        strategiesTried: [...progress.strategiesTried, strategy],
        currentExplanation: diagnosis.explanation,
      },
      nextQuestion,
    });
    await tallyStats(auth.userId, objective.id, false);
    return {
      correct: false,
      feedback: diagnosis.feedback,
      explanation: diagnosis.explanation,
      strategyUsed: strategy,
      ...(saved.nextExercise ? { nextExercise: toExerciseView(saved.nextExercise) } : {}),
      ...(capped ? { capped: true as const } : {}),
      progress: toProgress(saved.progress),
    };
  } catch (err) {
    if (err instanceof ExerciseAlreadyAnsweredError) {
      throw new HttpError(
        409,
        "EXERCISE_ALREADY_SUBMITTED",
        "Ai trimis deja un răspuns la acest exercițiu.",
      );
    }
    throw err;
  }
}

// The attempt is already saved, so a failure here must not turn it into an error.
async function tallyStats(studentId: string, objectiveId: string, correct: boolean) {
  try {
    await addObjectiveTallies(
      studentId,
      [{ objectiveId, attempts: 1, correct: correct ? 1 : 0 }],
      new Date(),
    );
  } catch (err) {
    console.error(
      `Objective stats update failed: ${err instanceof Error ? err.name : "unknown error"}`,
    );
  }
}
