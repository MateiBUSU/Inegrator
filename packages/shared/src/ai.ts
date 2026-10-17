import { z } from "zod";
import { MAX_STYLE_NOTES_CHARS } from "./documents";
import {
  idSchema,
  lessonSchema,
  materialKindSchema,
  questionSchema,
  teacherMaterialSchema,
} from "./materials";
import { safeText } from "./safe-text";

// What a provider must return. Everything a provider returns is parsed with these schemas before
// it is used anywhere; unknown keys are stripped.

export const generatedLessonSchema = z.object({ lesson: lessonSchema });
export type GeneratedLesson = z.infer<typeof generatedLessonSchema>;

export const generatedQuizSchema = z.object({ questions: z.array(questionSchema).min(1).max(50) });
export type GeneratedQuiz = z.infer<typeof generatedQuizSchema>;

export const styleNotesSuggestionSchema = z.object({
  styleNotes: safeText(MAX_STYLE_NOTES_CHARS).refine(
    (value) => value.trim().length > 0,
    "style notes must not be empty",
  ),
});
export type StyleNotesSuggestion = z.infer<typeof styleNotesSuggestionSchema>;

// Proposed answers, used later to cross-check the teacher's key. Never shown to students.
export const solvedQuestionsSchema = z.object({
  answers: z
    .array(
      z.object({
        questionId: idSchema,
        correct: z.array(idSchema).max(10).optional(), // mcq option ids
        acceptedAnswer: safeText(500).optional(), // short
        solution: safeText(20000).optional(), // programming
      }),
    )
    .max(100),
});
export type SolvedQuestions = z.infer<typeof solvedQuestionsSchema>;

// --- endpoints (camelCase, like the rest of the materials API) ---------------------------------

export const generateMaterialRequestSchema = z.object({
  classId: z.uuid().transform((id) => id.toLowerCase()),
  subjectId: z.uuid().transform((id) => id.toLowerCase()),
  chapterId: z.uuid().transform((id) => id.toLowerCase()),
  kind: materialKindSchema,
  objectiveIds: z
    .array(z.uuid().transform((id) => id.toLowerCase()))
    .min(1)
    .max(20),
  // Optional: restrict the source material to these documents of the class.
  documentIds: z
    .array(z.uuid().transform((id) => id.toLowerCase()))
    .min(1)
    .max(20)
    .optional(),
  // Number of questions for tests, problem sets and exercises (ignored for lessons).
  count: z.number().int().min(1).max(20).optional(),
});
export type GenerateMaterialRequest = z.infer<typeof generateMaterialRequestSchema>;

const quotaSchema = z.object({ used: z.number().int(), limit: z.number().int() });

export const generateMaterialResponseSchema = z.object({
  material: teacherMaterialSchema,
  // False when no teacher document was used: the content then comes from the model's general
  // knowledge only and should be reviewed with extra care.
  usedTeacherSource: z.boolean(),
  quota: quotaSchema,
});
export type GenerateMaterialResponse = z.infer<typeof generateMaterialResponseSchema>;

export const styleNotesSuggestionResponseSchema = z.object({
  suggestion: z.string(),
  basedOnChunks: z.number().int(),
  quota: quotaSchema,
});
