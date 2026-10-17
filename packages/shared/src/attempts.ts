import { z } from "zod";
import { safeText } from "./safe-text";
import { idSchema, questionTypeSchema, studentMaterialViewSchema } from "./materials";

export const progressStatusSchema = z.enum(["started", "completed"]);
export type ProgressStatus = z.infer<typeof progressStatusSchema>;

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

// One entry per question: mcq sends optionIds, short and programming send text.
export const submittedAnswerSchema = z.object({
  questionId: idSchema,
  optionIds: z.array(idSchema).max(10).optional(),
  text: safeText(20000).optional(),
});
export type SubmittedAnswer = z.infer<typeof submittedAnswerSchema>;

export const submitAttemptRequestSchema = z.object({
  answers: z.array(submittedAnswerSchema).max(150),
});
export type SubmitAttemptRequest = z.infer<typeof submitAttemptRequestSchema>;

export const attemptIdParamsSchema = z.object({ id: z.uuid() });
export const progressParamsSchema = z.object({ materialId: z.uuid() });
export const updateProgressRequestSchema = z.object({ status: progressStatusSchema });
export const listMyMaterialsQuerySchema = z.object({ classId: z.uuid().optional() });

// ---------------------------------------------------------------------------
// Responses. The attempt result is POST-submission: it is the only place (besides the teacher's
// own endpoints) where an answer key is returned, and only for the student who submitted.
// ---------------------------------------------------------------------------

const questionResultBase = {
  questionId: idSchema,
  type: questionTypeSchema,
  objectiveId: idSchema,
  explanation: z.string().optional(),
};

export const questionResultSchema = z.discriminatedUnion("type", [
  z.object({
    ...questionResultBase,
    type: z.literal("mcq"),
    isCorrect: z.boolean(),
    selected: z.array(idSchema),
    correct: z.array(idSchema),
  }),
  z.object({
    ...questionResultBase,
    type: z.literal("short"),
    isCorrect: z.boolean(),
    text: z.string(),
    acceptedAnswers: z.array(z.string()),
  }),
  z.object({
    ...questionResultBase,
    type: z.literal("programming"),
    // Not auto-scored: the student compares their work with the reference themselves.
    evaluation: z.literal("self-evaluation"),
    /** The student's own submitted code. */
    text: z.string(),
    referenceSolution: z.string(),
    rubric: z.string().optional(),
  }),
]);
export type QuestionResult = z.infer<typeof questionResultSchema>;

export const attemptResultSchema = z.object({
  id: z.uuid(),
  materialId: z.uuid(),
  submittedAt: z.string(),
  score: z.number().int().min(0),
  maxScore: z.number().int().min(0),
  /** Programming questions, left out of score and maxScore. */
  selfEvaluationCount: z.number().int().min(0),
  results: z.array(questionResultSchema),
});
export type AttemptResult = z.infer<typeof attemptResultSchema>;
export const attemptResponseSchema = z.object({ attempt: attemptResultSchema });

export const progressItemSchema = z.object({
  materialId: z.uuid(),
  status: progressStatusSchema,
  updatedAt: z.string(),
});
export const progressResponseSchema = z.object({ progress: progressItemSchema });
export const progressListResponseSchema = z.object({ progress: z.array(progressItemSchema) });

export const myMaterialsResponseSchema = z.object({
  materials: z.array(studentMaterialViewSchema),
});
