import { describe, expect, it } from "vitest";
import {
  createMaterialRequestSchema,
  materialDefinitionSchema,
  questionSchema,
  toStudentMaterialView,
  updateMaterialRequestSchema,
  type MaterialDefinition,
} from "./materials";

const objectives = [
  { id: "o1", text: "Folosește variabile" },
  { id: "o2", text: "Scrie bucle" },
];

const mcq = {
  id: "q1",
  type: "mcq",
  prompt: "Ce afișează cout << 2 + 3;?",
  options: [
    { id: "a", text: "5" },
    { id: "b", text: "23" },
    { id: "c", text: "eroare" },
  ],
  correct: ["a"],
  explanation: "2 + 3 se evaluează la 5.",
  objectiveId: "o1",
};
const short = {
  id: "q2",
  type: "short",
  prompt: "Ce cuvânt cheie începe o buclă cu test inițial?",
  acceptedAnswers: ["while", "WHILE"],
  explanation: "while verifică condiția înainte.",
  objectiveId: "o2",
};
const programming = {
  id: "q3",
  type: "programming",
  prompt: "Scrie un program care afișează suma a două numere.",
  referenceSolution: "#include <iostream>\nint main(){int a,b;std::cin>>a>>b;std::cout<<a+b;}",
  rubric: "Citește două numere; afișează suma; fără alte afișări.",
  explanation: "Soluție de referință.",
  objectiveId: "o1",
};

const test = {
  title: "Test variabile și bucle",
  kind: "test",
  section: "programa",
  language: "cpp",
  grade: 9,
  objectives,
  questions: [mcq, short, programming],
};
const lesson = {
  title: "Variabile",
  kind: "lesson",
  section: "programa",
  language: "python",
  grade: 9,
  objectives,
  lesson: {
    body: "# Variabile\nO variabilă are un nume și o valoare.",
    examples: [{ title: "Exemplu", body: "x = 5" }],
    checkQuestions: [mcq],
  },
};

function messages(result: { success: boolean; error?: { issues: { message: string }[] } }) {
  return result.error?.issues.map((i) => i.message) ?? [];
}

describe("materialDefinitionSchema: valid input", () => {
  it("accepts a test with all three question types and a lesson with check questions", () => {
    expect(materialDefinitionSchema.safeParse(test).success).toBe(true);
    expect(materialDefinitionSchema.safeParse(lesson).success).toBe(true);
  });

  it("defaults verification to unchecked", () => {
    const parsed = materialDefinitionSchema.parse(test);
    expect(parsed.questions?.every((q) => q.verification === "unchecked")).toBe(true);
  });

  it("accepts a bac material with cpp", () => {
    expect(materialDefinitionSchema.safeParse({ ...test, section: "bac", grade: 12 }).success).toBe(
      true,
    );
  });
});

describe("materialDefinitionSchema: rejections", () => {
  it("rejects an mcq without a correct answer", () => {
    for (const bad of [
      { ...mcq, correct: [] },
      { ...mcq, correct: undefined },
    ]) {
      const result = materialDefinitionSchema.safeParse({ ...test, questions: [bad] });
      expect(result.success).toBe(false);
      expect(messages(result)).toContain("mcq needs at least one correct answer");
    }
  });

  it("rejects correct ids that are not present in options", () => {
    const result = materialDefinitionSchema.safeParse({
      ...test,
      questions: [{ ...mcq, correct: ["a", "zzz"] }],
    });
    expect(result.success).toBe(false);
    expect(messages(result)).toContain("correct ids must be present in options");
  });

  it("rejects duplicate option ids", () => {
    const result = materialDefinitionSchema.safeParse({
      ...test,
      questions: [
        {
          ...mcq,
          options: [
            { id: "a", text: "5" },
            { id: "a", text: "6" },
          ],
        },
      ],
    });
    expect(result.success).toBe(false);
    expect(messages(result)).toContain("duplicate option ids");
  });

  it("rejects a bac material with python", () => {
    const result = materialDefinitionSchema.safeParse({
      ...test,
      section: "bac",
      language: "python",
    });
    expect(result.success).toBe(false);
    expect(messages(result)).toContain("bac materials must use cpp");
  });

  it("rejects an objectiveId that is not in the material's objectives", () => {
    const result = materialDefinitionSchema.safeParse({
      ...test,
      questions: [{ ...mcq, objectiveId: "nope" }],
    });
    expect(result.success).toBe(false);
    expect(messages(result).join(" ")).toContain('objectiveId "nope" is not in the material');
  });

  it("applies the objectiveId rule to lesson check questions too", () => {
    const result = materialDefinitionSchema.safeParse({
      ...lesson,
      lesson: { ...lesson.lesson, checkQuestions: [{ ...mcq, objectiveId: "nope" }] },
    });
    expect(result.success).toBe(false);
  });

  it("rejects short without accepted answers and programming without a reference solution", () => {
    const noAnswers = materialDefinitionSchema.safeParse({
      ...test,
      questions: [{ ...short, acceptedAnswers: [] }],
    });
    const noSolution = materialDefinitionSchema.safeParse({
      ...test,
      questions: [{ ...programming, referenceSolution: "  " }],
    });
    expect(noAnswers.success).toBe(false);
    expect(noSolution.success).toBe(false);
  });

  it("rejects duplicate question ids, a missing lesson, and questions on a lesson", () => {
    expect(
      materialDefinitionSchema.safeParse({ ...test, questions: [mcq, { ...short, id: "q1" }] })
        .success,
    ).toBe(false);
    expect(materialDefinitionSchema.safeParse({ ...lesson, lesson: undefined }).success).toBe(
      false,
    );
    expect(materialDefinitionSchema.safeParse({ ...lesson, questions: [mcq] }).success).toBe(false);
    expect(materialDefinitionSchema.safeParse({ ...test, questions: [] }).success).toBe(false);
  });

  it("rejects out-of-range grade and NUL characters", () => {
    expect(materialDefinitionSchema.safeParse({ ...test, grade: 8 }).success).toBe(false);
    expect(materialDefinitionSchema.safeParse({ ...test, grade: 13 }).success).toBe(false);
    expect(materialDefinitionSchema.safeParse({ ...test, title: "a\u0000b" }).success).toBe(false);
  });

  it("validates a single question on its own", () => {
    expect(questionSchema.safeParse({ ...mcq, correct: [] }).success).toBe(false);
    expect(questionSchema.safeParse(mcq).success).toBe(true);
  });

  it("requires at least one field in an update", () => {
    expect(updateMaterialRequestSchema.safeParse({}).success).toBe(false);
    expect(updateMaterialRequestSchema.safeParse({ title: "Nou" }).success).toBe(true);
  });
});

function collectKeys(value: unknown, keys = new Set<string>()): Set<string> {
  if (Array.isArray(value)) value.forEach((item) => collectKeys(item, keys));
  else if (value && typeof value === "object") {
    for (const [key, inner] of Object.entries(value)) {
      keys.add(key);
      collectKeys(inner, keys);
    }
  }
  return keys;
}

const FORBIDDEN_KEYS = ["correct", "acceptedAnswers", "referenceSolution", "rubric", "explanation"];

describe("toStudentMaterialView", () => {
  const withId = (m: unknown): MaterialDefinition & { id: string; version: number } => ({
    ...materialDefinitionSchema.parse(m),
    id: "123e4567-e89b-42d3-a456-426614174000",
    version: 1,
  });

  it("has no answer-key keys anywhere in the payload (test with all question types)", () => {
    const view = toStudentMaterialView(withId(test));
    const keys = collectKeys(JSON.parse(JSON.stringify(view)));
    for (const forbidden of FORBIDDEN_KEYS) expect(keys.has(forbidden)).toBe(false);
    expect(keys.has("verification")).toBe(false);
  });

  it("has no answer-key keys in a lesson's check questions either", () => {
    const view = toStudentMaterialView(withId(lesson));
    const keys = collectKeys(JSON.parse(JSON.stringify(view)));
    for (const forbidden of FORBIDDEN_KEYS) expect(keys.has(forbidden)).toBe(false);
    expect(view.lesson?.checkQuestions[0]?.options).toHaveLength(3);
  });

  it("keeps exactly the fields a student needs on each question", () => {
    const view = toStudentMaterialView(withId(test));
    const [q1, q2, q3] = view.questions ?? [];
    expect(Object.keys(q1 ?? {}).sort()).toEqual([
      "id",
      "objectiveId",
      "options",
      "prompt",
      "type",
    ]);
    expect(Object.keys(q2 ?? {}).sort()).toEqual(["id", "objectiveId", "prompt", "type"]);
    expect(Object.keys(q3 ?? {}).sort()).toEqual(["id", "objectiveId", "prompt", "type"]);
  });

  it("does not leak the answer text anywhere in the serialized view", () => {
    const raw = JSON.stringify(toStudentMaterialView(withId(test)));
    expect(raw).not.toContain("2 + 3 se evaluează la 5");
    expect(raw).not.toContain("std::cin>>a>>b");
    expect(raw).not.toContain("Citește două numere; afișează suma");
    expect(raw).not.toContain("while verifică condiția");
  });
});

describe("generation metadata", () => {
  const generation = { provider: "mock", teacherSource: true };

  it("is accepted on a stored definition but never shown in the student view", () => {
    const definition = materialDefinitionSchema.parse({ ...test, generation });
    expect(definition.generation).toEqual(generation);
    const view = toStudentMaterialView({
      ...definition,
      id: "123e4567-e89b-42d3-a456-426614174000",
      version: 1,
    });
    expect(collectKeys(JSON.parse(JSON.stringify(view))).has("generation")).toBe(false);
  });

  it("cannot be injected by a client through create or update requests", () => {
    const created = createMaterialRequestSchema.parse({ ...test, generation });
    expect(created).not.toHaveProperty("generation");
    const updated = updateMaterialRequestSchema.parse({ title: "Nou", generation });
    expect(updated).not.toHaveProperty("generation");
  });

  it("rejects an unknown provider name", () => {
    expect(
      materialDefinitionSchema.safeParse({
        ...test,
        generation: { provider: "other", teacherSource: true },
      }).success,
    ).toBe(false);
  });
});

describe("reasoning questions", () => {
  const reasoning = {
    id: "r1",
    type: "reasoning",
    prompt: "Compară BFS și DFS.",
    referenceSolution: "BFS folosește o coadă, DFS o stivă.",
    objectiveId: "o1",
  };

  it("is valid with a full reference answer and invalid without one", () => {
    expect(questionSchema.safeParse(reasoning).success).toBe(true);
    const missing = questionSchema.safeParse({ ...reasoning, referenceSolution: " " });
    expect(missing.success).toBe(false);
    expect(messages(missing)).toContain("reasoning questions need a reference solution");
  });

  it("the student view keeps the type and prompt and drops the reference answer", () => {
    const view = toStudentMaterialView({
      ...materialDefinitionSchema.parse({ ...test, questions: [reasoning] }),
      id: "11111111-1111-4111-8111-111111111111",
      version: 1,
    });
    expect(view.questions?.[0]).toEqual({
      id: "r1",
      type: "reasoning",
      prompt: "Compară BFS și DFS.",
      objectiveId: "o1",
    });
  });
});
