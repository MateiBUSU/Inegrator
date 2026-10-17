import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_POLICY,
  materialDefinitionSchema,
  solvedQuestionsSchema,
  styleNotesSuggestionSchema,
  type Policy,
} from "@app/shared";
import { createAiEngine } from "./engine";
import type { GenerationContext, GenerationKind } from "./generator";
import { MockGenerator } from "./mock-generator";

const engine = createAiEngine(new MockGenerator());

function context(
  objectiveCount: number,
  overrides: Partial<GenerationContext> = {},
): GenerationContext {
  return {
    subjectTitle: "Informatică C++ – clasa a IX-a",
    chapterTitle: "Structuri de control",
    objectives: Array.from({ length: objectiveCount }, (_, i) => ({
      id: `obj-${i + 1}`,
      text: `Obiectivul numărul ${i + 1}: folosește instrucțiunea repetitivă corect`,
    })),
    sourceChunks: [],
    styleNotes: null,
    policy: DEFAULT_POLICY,
    language: "cpp",
    ...overrides,
  };
}

/** Assembles a full material the way the generate endpoint does, with every refinement. */
function assemble(
  kind: "lesson" | "test" | "problem" | "exercise",
  ctx: GenerationContext,
  generated: Record<string, unknown>,
) {
  return materialDefinitionSchema.safeParse({
    title: "Material generat",
    kind,
    section: "programa",
    language: ctx.language ?? "cpp",
    grade: 9,
    objectives: ctx.objectives,
    ...generated,
  });
}

afterEach(() => vi.restoreAllMocks());

describe("MockGenerator.generateLesson", () => {
  const cases: [string, GenerationContext][] = [
    ["one objective, no source", context(1)],
    ["three objectives, with source chunks", context(3, { sourceChunks: ["Prima.", "A doua."] })],
    ["twelve objectives (more than it echoes)", context(12)],
    ["style notes present", context(2, { styleNotes: "Ton prietenos." })],
    ["python", context(2, { language: "python" })],
  ];

  it.each(cases)("produces schema-valid output: %s", async (_name, ctx) => {
    const generated = await engine.generateLesson(ctx);
    expect(generated.lesson.body.length).toBeGreaterThan(0);
    expect(generated.lesson.checkQuestions.length).toBeGreaterThan(0);
    expect(generated.lesson.checkQuestions.length).toBeLessThanOrEqual(5);
    const material = assemble("lesson", ctx, generated);
    expect(material.success, JSON.stringify(material.error?.issues)).toBe(true);
  });

  it("echoes the objectives into the lesson and ties every question to one of them", async () => {
    const ctx = context(4);
    const { lesson } = await engine.generateLesson(ctx);
    for (const objective of ctx.objectives) expect(lesson.body).toContain(objective.text);
    const ids = new Set(ctx.objectives.map((o) => o.id));
    for (const q of lesson.checkQuestions) expect(ids.has(q.objectiveId)).toBe(true);
  });

  it("is deterministic: the same input gives the same output", async () => {
    const ctx = context(3, { sourceChunks: ["Un fragment."] });
    const first = await engine.generateLesson(ctx);
    const second = await engine.generateLesson(ctx);
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });

  it("reflects the policy (worked example first or after) and the source", async () => {
    const exampleFirst: Policy = { ...DEFAULT_POLICY, exampleFirst: true };
    const first = (await engine.generateLesson(context(2, { policy: exampleFirst }))).lesson.body;
    const after = (await engine.generateLesson(context(2))).lesson.body;
    expect(first.indexOf("## Exemplu rezolvat")).toBeLessThan(first.indexOf("## Explicație"));
    expect(after.indexOf("## Explicație")).toBeLessThan(after.indexOf("## Exemplu rezolvat"));

    const withSource = (await engine.generateLesson(context(1, { sourceChunks: ["a", "b"] })))
      .lesson.body;
    expect(withSource).toContain("2 fragment(e)");
    expect(after).toContain("fără document sursă");
  });
});

describe("MockGenerator.generateQuiz", () => {
  const kinds: GenerationKind[] = ["test", "problem", "exercise"];

  it.each(kinds.flatMap((kind) => [1, 6, 20].map((count) => [kind, count] as const)))(
    "produces schema-valid %s with %i questions",
    async (kind, count) => {
      const ctx = context(kind === "test" ? 3 : 7, { sourceChunks: kind === "test" ? ["x"] : [] });
      const generated = await engine.generateQuiz({ ...ctx, count, kind });

      expect(generated.questions).toHaveLength(count);
      const ids = new Set(ctx.objectives.map((o) => o.id));
      for (const q of generated.questions) expect(ids.has(q.objectiveId)).toBe(true);
      const material = assemble(kind, ctx, generated);
      expect(material.success, JSON.stringify(material.error?.issues)).toBe(true);
    },
  );

  it("builds question types that fit the kind", async () => {
    const types = async (kind: GenerationKind) =>
      new Set(
        (await engine.generateQuiz({ ...context(2), count: 6, kind })).questions.map((q) => q.type),
      );
    expect(await types("test")).toEqual(new Set(["mcq", "short"]));
    expect(await types("problem")).toEqual(new Set(["programming"]));
    expect(await types("exercise")).toEqual(new Set(["short", "programming"]));
  });

  it("writes reference solutions in the requested language", async () => {
    const solution = async (language: "cpp" | "python") =>
      (await engine.generateQuiz({ ...context(1, { language }), count: 1, kind: "problem" }))
        .questions[0]?.referenceSolution ?? "";
    expect(await solution("cpp")).toContain("int main");
    expect(await solution("python")).toContain("print(");
  });

  it("is deterministic and always leaves questions unchecked", async () => {
    const input = { ...context(3), count: 5, kind: "test" as const };
    const first = await engine.generateQuiz(input);
    expect(JSON.stringify(await engine.generateQuiz(input))).toBe(JSON.stringify(first));
    expect(first.questions.every((q) => q.verification === "unchecked")).toBe(true);
  });

  it("makes every mcq answer key consistent with its options", async () => {
    const { questions } = await engine.generateQuiz({ ...context(2), count: 8, kind: "test" });
    for (const q of questions.filter((x) => x.type === "mcq")) {
      const optionIds = (q.options ?? []).map((o) => o.id);
      expect(q.correct?.length).toBe(1);
      expect(optionIds).toContain(q.correct?.[0]);
    }
  });
});

describe("MockGenerator: other operations and isolation", () => {
  it("suggests valid style notes from a sample", async () => {
    const sample = "# Titlu\n\nO propoziție scurtă. Încă una. Un exemplu cu #include <iostream>.";
    const raw = await new MockGenerator().extractStyleNotes({ sampleText: sample });
    expect(styleNotesSuggestionSchema.safeParse(raw).success).toBe(true);
    const suggestion = (await engine.extractStyleNotes({ sampleText: sample })).styleNotes;
    expect(suggestion.length).toBeGreaterThan(0);
    expect(suggestion.length).toBeLessThanOrEqual(2000);
    expect(suggestion).toContain("titluri");
    expect(suggestion).toContain("cod");
  });

  it("solves questions with answers for exactly those questions", async () => {
    const questions = [
      {
        id: "q1",
        type: "mcq" as const,
        prompt: "p",
        objectiveId: "o",
        options: [
          { id: "x", text: "t" },
          { id: "y", text: "u" },
        ],
      },
      { id: "q2", type: "short" as const, prompt: "p", objectiveId: "o" },
      { id: "q3", type: "programming" as const, prompt: "p", objectiveId: "o" },
    ];
    const raw = await new MockGenerator().solveQuestions({ questions });
    expect(solvedQuestionsSchema.safeParse(raw).success).toBe(true);
    const solved = await engine.solveQuestions({ questions });
    expect(solved.answers.map((a) => a.questionId)).toEqual(["q1", "q2", "q3"]);
    expect(solved.answers[0]?.correct).toEqual(["x"]);
  });

  it("marks its output as mock-generated", async () => {
    const generator = new MockGenerator();
    expect(generator.provider).toBe("mock");
    const raw = (await generator.generateLesson(context(1))) as { metadata: { generator: string } };
    expect(raw.metadata.generator).toBe("mock");
    expect(engine.provider).toBe("mock");
  });

  it("makes no network calls", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(() => {
      throw new Error("network call attempted");
    });
    await engine.generateLesson(context(2));
    await engine.generateQuiz({ ...context(2), count: 3, kind: "test" });
    await engine.extractStyleNotes({ sampleText: "Un text de probă." });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
