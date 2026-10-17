import type {
  ClassStudent,
  MaterialSummary,
  Question,
  TeacherClassDetail,
  TeacherMaterial,
} from "@app/shared";

// Test data shaped exactly like the API's responses (see packages/shared).

export const OBJECTIVES = [
  { id: "o1", text: "Scrie bucle while corecte" },
  { id: "o2", text: "Scrie bucle for corecte" },
];

export function mcq(id: string, over: Partial<Question> = {}): Question {
  return {
    id,
    type: "mcq",
    prompt: `Enunț pentru ${id}`,
    options: [
      { id: "a", text: "Prima variantă" },
      { id: "b", text: "A doua variantă" },
    ],
    correct: ["a"],
    explanation: `Explicația pentru ${id}`,
    objectiveId: "o1",
    verification: "unchecked",
    ...over,
  };
}

export function shortQuestion(id: string, over: Partial<Question> = {}): Question {
  return {
    id,
    type: "short",
    prompt: `Răspunde la ${id}`,
    acceptedAnswers: ["while"],
    objectiveId: "o2",
    verification: "unchecked",
    ...over,
  };
}

export function programmingQuestion(id: string, over: Partial<Question> = {}): Question {
  return {
    id,
    type: "programming",
    prompt: `Scrie un program pentru ${id}`,
    referenceSolution: "int main() { return 0; }",
    rubric: "Compilează și rulează.",
    objectiveId: "o1",
    verification: "unchecked",
    ...over,
  };
}

export const confirmed = (question: Question): Question => ({
  ...question,
  verification: "teacher_confirmed",
});

const envelope = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  status: "draft" as const,
  source: "manual" as const,
  version: 1,
  parentId: null,
  subjectId: null,
  chapterId: null,
  createdAt: "2026-10-17T10:00:00.000Z",
  publishedAt: null,
};

/** A draft test with two unconfirmed questions (an mcq and a short answer). */
export function testMaterial(over: Partial<TeacherMaterial> = {}): TeacherMaterial {
  return {
    ...envelope,
    title: "Test bucle",
    kind: "test",
    section: "programa",
    language: "cpp",
    grade: 9,
    objectives: OBJECTIVES,
    questions: [mcq("q1"), shortQuestion("q2")],
    ...over,
  };
}

/** A draft lesson with the given check questions. */
export function lessonMaterial(
  checkQuestions: Question[] = [mcq("q1")],
  over: Partial<TeacherMaterial> = {},
): TeacherMaterial {
  return {
    ...envelope,
    title: "Lecție bucle",
    kind: "lesson",
    section: "programa",
    language: "cpp",
    grade: 9,
    objectives: OBJECTIVES,
    lesson: {
      body: "# Bucle\n\nO **buclă** repetă instrucțiuni.",
      examples: [{ title: "Exemplu", body: "`while (x) {}`" }],
      checkQuestions,
    },
    ...over,
  };
}

export function summary(over: Partial<MaterialSummary> = {}): MaterialSummary {
  return {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    title: "Test bucle",
    kind: "test",
    status: "draft",
    version: 1,
    section: "programa",
    language: "cpp",
    grade: 9,
    subjectId: null,
    chapterId: null,
    createdAt: "2026-10-17T10:00:00.000Z",
    publishedAt: null,
    ...over,
  };
}

export const STUDENT: ClassStudent = {
  id: "22222222-2222-4222-8222-222222222222",
  display_name: "Maria",
  joined_at: "2026-10-18T09:00:00.000Z",
};

export function classDetail(over: Partial<TeacherClassDetail> = {}): TeacherClassDetail {
  return {
    id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    name: "9A",
    grade: 9,
    join_code: "ABC234",
    style_notes: null,
    created_at: "2026-10-17T10:00:00.000Z",
    students: [STUDENT],
    ...over,
  };
}
