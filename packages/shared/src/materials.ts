import { z } from "zod";
import { safeText } from "./safe-text";

export const sectionSchema = z.enum(["programa", "bac"]);
export const languageSchema = z.enum(["cpp", "python"]);
export const materialKindSchema = z.enum(["lesson", "test", "problem", "exercise"]);
export const materialStatusSchema = z.enum(["draft", "published", "archived"]);
export const questionTypeSchema = z.enum(["mcq", "short", "programming"]);
export const verificationSchema = z.enum([
  "unchecked",
  "agrees",
  "needs_review",
  "teacher_confirmed",
]);
export type Verification = z.infer<typeof verificationSchema>;

const text = safeText;

export const idSchema = z.string().regex(/^[A-Za-z0-9_.-]{1,64}$/, "invalid id");

const optionSchema = z.object({ id: idSchema, text: text(1000).min(1) });

export const objectiveRefSchema = z.object({ id: idSchema, text: text(500).min(1) });

// ---------------------------------------------------------------------------
// Question
// ---------------------------------------------------------------------------

interface QuestionShape {
  type: "mcq" | "short" | "programming";
  options?: { id: string }[] | undefined;
  correct?: string[] | undefined;
  acceptedAnswers?: string[] | undefined;
  referenceSolution?: string | undefined;
}

type AddIssue = (path: (string | number)[], message: string) => void;

function checkQuestionShape(q: QuestionShape, add: AddIssue): void {
  if (q.type === "mcq") {
    const optionIds = (q.options ?? []).map((option) => option.id);
    if (optionIds.length < 2) add(["options"], "mcq needs at least 2 options");
    if (new Set(optionIds).size !== optionIds.length) add(["options"], "duplicate option ids");
    const correct = q.correct ?? [];
    if (correct.length === 0) add(["correct"], "mcq needs at least one correct answer");
    if (new Set(correct).size !== correct.length) add(["correct"], "duplicate correct ids");
    if (correct.some((id) => !optionIds.includes(id))) {
      add(["correct"], "correct ids must be present in options");
    }
  } else if (q.type === "short") {
    if (!q.acceptedAnswers || q.acceptedAnswers.length === 0) {
      add(["acceptedAnswers"], "short questions need at least one accepted answer");
    }
  } else if (!q.referenceSolution || q.referenceSolution.trim() === "") {
    add(["referenceSolution"], "programming questions need a reference solution");
  }
}

export const questionSchema = z
  .object({
    id: idSchema,
    type: questionTypeSchema,
    prompt: text(5000).min(1),
    options: z.array(optionSchema).max(10).optional(),
    correct: z.array(idSchema).max(10).optional(), // mcq: ids of the correct options
    acceptedAnswers: z.array(text(500).min(1)).max(20).optional(), // short
    referenceSolution: text(20000).optional(), // programming
    rubric: text(5000).optional(), // programming
    explanation: text(5000).optional(),
    objectiveId: idSchema,
    // Only the confirm endpoint (and later AI checks) may change this; clients' values are ignored.
    verification: verificationSchema.default("unchecked"),
  })
  .superRefine((q, ctx) => {
    checkQuestionShape(q, (path, message) => ctx.addIssue({ code: "custom", path, message }));
  });
export type Question = z.infer<typeof questionSchema>;

// ---------------------------------------------------------------------------
// Material
// ---------------------------------------------------------------------------

export const lessonSchema = z.object({
  body: text(50000).min(1), // markdown
  examples: z
    .array(z.object({ title: text(200).min(1), body: text(10000).min(1) }))
    .max(20)
    .default([]),
  checkQuestions: z.array(questionSchema).max(50).default([]),
});
export type Lesson = z.infer<typeof lessonSchema>;

const contentShape = {
  section: sectionSchema,
  language: languageSchema,
  grade: z.number().int().min(9).max(12),
  objectives: z.array(objectiveRefSchema).min(1).max(30),
  lesson: lessonSchema.optional(),
  questions: z.array(questionSchema).max(100).optional(),
  // Set by the generation endpoint only (never accepted from clients); useful for debugging
  // and never part of the student view.
  generation: z
    .object({ provider: z.enum(["mock", "gemini"]), teacherSource: z.boolean() })
    .optional(),
};

/** What is stored in materials.content (title and kind are separate columns). */
export const materialContentSchema = z.object(contentShape);
export type MaterialContent = z.infer<typeof materialContentSchema>;

const definitionBaseSchema = z.object({
  title: text(200).trim().min(1),
  kind: materialKindSchema,
  ...contentShape,
});

interface DefinitionShape {
  kind: "lesson" | "test" | "problem" | "exercise";
  section: "programa" | "bac";
  language: "cpp" | "python";
  objectives: { id: string }[];
  lesson?: { checkQuestions: { id: string; objectiveId: string }[] } | undefined;
  questions?: { id: string; objectiveId: string }[] | undefined;
}

/** All questions of a material: lesson check questions, or the test/problem/exercise questions. */
export function allQuestions<T>(m: {
  lesson?: { checkQuestions: T[] } | undefined;
  questions?: T[] | undefined;
}): T[] {
  return [...(m.lesson?.checkQuestions ?? []), ...(m.questions ?? [])];
}

function refineDefinition(m: DefinitionShape, ctx: z.RefinementCtx): void {
  const add: AddIssue = (path, message) => ctx.addIssue({ code: "custom", path, message });

  if (m.section === "bac" && m.language === "python") {
    add(["language"], "bac materials must use cpp");
  }
  if (m.kind === "lesson") {
    if (!m.lesson) add(["lesson"], "lesson materials need a lesson");
    if (m.questions && m.questions.length > 0)
      add(["questions"], "lessons use lesson.checkQuestions");
  } else {
    if (!m.questions || m.questions.length === 0)
      add(["questions"], "this kind needs at least one question");
    if (m.lesson) add(["lesson"], "only lesson materials have a lesson");
  }

  const objectiveIds = m.objectives.map((o) => o.id);
  if (new Set(objectiveIds).size !== objectiveIds.length)
    add(["objectives"], "duplicate objective ids");

  // Each problem points at the exact question (path ["questions", 2, "objectiveId"] and so on),
  // so a client can say which one is wrong.
  const seen = new Set<string>();
  const lists: [(string | number)[], { id: string; objectiveId: string }[]][] = [
    [["lesson", "checkQuestions"], m.lesson?.checkQuestions ?? []],
    [["questions"], m.questions ?? []],
  ];
  for (const [listPath, list] of lists) {
    list.forEach((q, index) => {
      if (seen.has(q.id)) add([...listPath, index, "id"], `duplicate question id: ${q.id}`);
      seen.add(q.id);
      if (!objectiveIds.includes(q.objectiveId)) {
        add(
          [...listPath, index, "objectiveId"],
          `objectiveId "${q.objectiveId}" is not in the material's objectives`,
        );
      }
    });
  }
}

/** The full material definition, with every cross-field refinement. */
export const materialDefinitionSchema = definitionBaseSchema.superRefine(refineDefinition);
export type MaterialDefinition = z.infer<typeof materialDefinitionSchema>;

export const createMaterialRequestSchema = definitionBaseSchema
  .omit({ generation: true })
  .extend({ subjectId: z.uuid().optional(), chapterId: z.uuid().optional() })
  .superRefine(refineDefinition);
export type CreateMaterialRequest = z.infer<typeof createMaterialRequestSchema>;

// Partial update; the result is merged with the stored draft and re-validated as a whole.
// `kind` cannot change after creation.
export const updateMaterialRequestSchema = definitionBaseSchema
  .omit({ kind: true, generation: true })
  .partial()
  .extend({ subjectId: z.uuid().nullable().optional(), chapterId: z.uuid().nullable().optional() })
  .refine((body) => Object.keys(body).length > 0, "empty update");
export type UpdateMaterialRequest = z.infer<typeof updateMaterialRequestSchema>;

export const confirmQuestionsRequestSchema = z.object({
  questionIds: z.array(idSchema).min(1).max(200),
});
export const assignMaterialRequestSchema = z.object({
  // Lowercased: Postgres returns lowercase uuids, so an uppercase id must compare equal.
  classIds: z
    .array(z.uuid().transform((id) => id.toLowerCase()))
    .min(1)
    .max(50),
});
export const listMaterialsQuerySchema = z.object({ status: materialStatusSchema.optional() });
export const materialIdParamsSchema = z.object({ id: z.uuid() });

// ---------------------------------------------------------------------------
// Responses. The materials API uses camelCase throughout (the question fields are camelCase by
// spec); the auth and classes endpoints use snake_case.
// ---------------------------------------------------------------------------

const envelope = {
  id: z.uuid(),
  status: materialStatusSchema,
  source: z.enum(["manual", "ai", "document_based"]),
  version: z.number().int(),
  parentId: z.uuid().nullable(),
  subjectId: z.uuid().nullable(),
  chapterId: z.uuid().nullable(),
  createdAt: z.string(),
  publishedAt: z.string().nullable(),
};

/** Full content, including answer keys. Owning teacher only. */
export const teacherMaterialSchema = definitionBaseSchema.extend(envelope);
export type TeacherMaterial = z.infer<typeof teacherMaterialSchema>;
export const teacherMaterialResponseSchema = z.object({ material: teacherMaterialSchema });

export const materialSummarySchema = z.object({
  id: z.uuid(),
  title: z.string(),
  kind: materialKindSchema,
  status: materialStatusSchema,
  version: z.number().int(),
  section: sectionSchema,
  language: languageSchema,
  grade: z.number().int(),
  subjectId: z.uuid().nullable(),
  chapterId: z.uuid().nullable(),
  createdAt: z.string(),
  publishedAt: z.string().nullable(),
});
export type MaterialSummary = z.infer<typeof materialSummarySchema>;
export const materialListResponseSchema = z.object({ materials: z.array(materialSummarySchema) });

export const assignMaterialResponseSchema = z.object({
  materialId: z.uuid(),
  classIds: z.array(z.uuid()),
});

export const subjectsResponseSchema = z.object({
  subjects: z.array(
    z.object({
      id: z.uuid(),
      slug: z.string(),
      title: z.string(),
      section: sectionSchema,
      language: languageSchema,
      grade: z.number().int().nullable(),
      chapters: z.array(
        z.object({
          id: z.uuid(),
          title: z.string(),
          position: z.number().int(),
          objectives: z.array(z.object({ id: z.uuid(), code: z.string(), text: z.string() })),
        }),
      ),
    }),
  ),
});

// ---------------------------------------------------------------------------
// Student view: the answer key never leaves the backend before submission.
// ---------------------------------------------------------------------------

export const studentQuestionSchema = z.object({
  id: idSchema,
  type: questionTypeSchema,
  prompt: z.string(),
  options: z.array(z.object({ id: idSchema, text: z.string() })).optional(),
  objectiveId: idSchema,
});

export type StudentQuestion = z.infer<typeof studentQuestionSchema>;

export const studentMaterialViewSchema = z.object({
  id: z.uuid(),
  version: z.number().int(),
  title: z.string(),
  kind: materialKindSchema,
  section: sectionSchema,
  language: languageSchema,
  grade: z.number().int(),
  objectives: z.array(objectiveRefSchema),
  lesson: z
    .object({
      body: z.string(),
      examples: z.array(z.object({ title: z.string(), body: z.string() })),
      checkQuestions: z.array(studentQuestionSchema),
    })
    .optional(),
  questions: z.array(studentQuestionSchema).optional(),
});
export type StudentMaterialView = z.infer<typeof studentMaterialViewSchema>;
export const studentMaterialResponseSchema = z.object({ material: studentMaterialViewSchema });

// Whitelist, not blacklist: only listed fields are copied, so correct, acceptedAnswers,
// referenceSolution, rubric, explanation and verification can never leak through.
export function toStudentQuestion(q: Question): z.input<typeof studentQuestionSchema> {
  return {
    id: q.id,
    type: q.type,
    prompt: q.prompt,
    ...(q.options ? { options: q.options.map((o) => ({ id: o.id, text: o.text })) } : {}),
    objectiveId: q.objectiveId,
  };
}

/** The only way a material may be shown to a student. */
export function toStudentMaterialView(
  material: MaterialDefinition & { id: string; version: number },
): StudentMaterialView {
  return studentMaterialViewSchema.parse({
    id: material.id,
    version: material.version,
    title: material.title,
    kind: material.kind,
    section: material.section,
    language: material.language,
    grade: material.grade,
    objectives: material.objectives.map((o) => ({ id: o.id, text: o.text })),
    ...(material.lesson
      ? {
          lesson: {
            body: material.lesson.body,
            examples: material.lesson.examples.map((e) => ({ title: e.title, body: e.body })),
            checkQuestions: material.lesson.checkQuestions.map(toStudentQuestion),
          },
        }
      : {}),
    ...(material.questions ? { questions: material.questions.map(toStudentQuestion) } : {}),
  });
}
