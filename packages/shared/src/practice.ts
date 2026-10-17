import { z } from "zod";
import { questionSchema, studentQuestionSchema } from "./materials";
import { safeText } from "./safe-text";

// Adaptive practice loop on class objectives: exercise -> mistake -> feedback + a new explanation
// strategy -> next exercise, until understood or the safety cap is reached.

/** The order strategies are tried in. Cycling always picks the first one not yet tried. */
export const EXPLANATION_STRATEGIES = [
  "ANALOGIE",
  "PAS_CU_PAS",
  "EXEMPLU_LUCRAT",
  "EXPLICATIE_VIZUALA",
  "PARCURGERE_COD",
  "INTREBARE_SOCRATICA",
] as const;
export const explanationStrategySchema = z.enum(EXPLANATION_STRATEGIES);
export type ExplanationStrategy = z.infer<typeof explanationStrategySchema>;

/** Wrong answers on one objective after which the loop stops and asks for the teacher. */
export const PRACTICE_ATTEMPT_CAP = EXPLANATION_STRATEGIES.length;

export const OBJECTIVE_PROGRESS_STATUSES = ["not_started", "struggling", "mastered"] as const;
export const objectiveProgressStatusSchema = z.enum(OBJECTIVE_PROGRESS_STATUSES);

export const MAX_PRACTICE_FEEDBACK_CHARS = 2000;
export const MAX_PRACTICE_EXPLANATION_CHARS = 4000;

export const practiceObjectiveParamsSchema = z.object({ id: z.uuid() });
export const practiceExerciseParamsSchema = z.object({ id: z.uuid(), exerciseId: z.uuid() });

/** What a provider must return for one exercise: one auto-gradable question. */
export const generatedExerciseSchema = z.object({
  question: questionSchema.refine((q) => q.type === "mcq" || q.type === "short", {
    message: "a practice exercise must be auto-gradable (mcq or short)",
  }),
});
export type GeneratedExercise = z.infer<typeof generatedExerciseSchema>;

/** What a provider must return for a wrong answer: both texts, in one structured object. */
export const practiceDiagnosisSchema = z.object({
  feedback: safeText(MAX_PRACTICE_FEEDBACK_CHARS).trim().min(1),
  explanation: safeText(MAX_PRACTICE_EXPLANATION_CHARS).trim().min(1),
});
export type PracticeDiagnosis = z.infer<typeof practiceDiagnosisSchema>;

export const practiceProgressSchema = z.object({
  objectiveId: z.uuid(),
  status: objectiveProgressStatusSchema,
  attemptsCount: z.number().int(),
  strategiesTried: z.array(explanationStrategySchema),
  currentExplanation: z.string().nullable(),
  /** When the student asked the teacher for help; null if they have not. */
  helpRequestedAt: z.string().nullable().default(null),
  updatedAt: z.string(),
});
export type PracticeProgress = z.infer<typeof practiceProgressSchema>;
export const practiceProgressResponseSchema = z.object({ progress: practiceProgressSchema });

/** An exercise as the student sees it: the question without any answer key. */
export const practiceExerciseViewSchema = z.object({
  id: z.uuid(),
  objectiveId: z.uuid(),
  question: studentQuestionSchema,
});
export type PracticeExerciseView = z.infer<typeof practiceExerciseViewSchema>;

export const startPracticeResponseSchema = z.object({
  exercise: practiceExerciseViewSchema,
  progress: practiceProgressSchema,
});

export const submitPracticeRequestSchema = z.object({
  optionIds: z.array(z.string().min(1).max(64)).max(10).optional(),
  text: safeText(5000).optional(),
});
export type SubmitPracticeRequest = z.infer<typeof submitPracticeRequestSchema>;

export const submitPracticeResponseSchema = z.discriminatedUnion("correct", [
  z.object({ correct: z.literal(true), progress: practiceProgressSchema }),
  z.object({
    correct: z.literal(false),
    feedback: z.string(),
    explanation: z.string(),
    /** The strategy the new explanation was written with. */
    strategyUsed: explanationStrategySchema,
    nextExercise: practiceExerciseViewSchema.optional(),
    capped: z.literal(true).optional(),
    progress: practiceProgressSchema,
  }),
]);
export type SubmitPracticeResponse = z.infer<typeof submitPracticeResponseSchema>;

// --- teacher view: per-student progress on a material's objectives ------------------------------

export const studentObjectiveProgressSchema = z.object({
  objectiveId: z.uuid(),
  status: objectiveProgressStatusSchema,
  attemptsCount: z.number().int(),
  strategiesTried: z.array(explanationStrategySchema),
  helpRequestedAt: z.string().nullable().default(null),
});

/** One entry per enrolled student, never averaged or merged with another student's. */
export const objectiveProgressOverviewResponseSchema = z.object({
  objectives: z.array(z.object({ id: z.uuid(), text: z.string() })),
  students: z.array(
    z.object({
      studentId: z.uuid(),
      displayName: z.string(),
      classNames: z.array(z.string()),
      objectives: z.array(studentObjectiveProgressSchema),
    }),
  ),
});
export type ObjectiveProgressOverview = z.infer<typeof objectiveProgressOverviewResponseSchema>;
