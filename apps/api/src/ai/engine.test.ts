import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_POLICY } from "@app/shared";
import { createAiEngine } from "./engine";
import { AiUnavailableError } from "./errors";
import type { ContentGenerator, LessonInput, QuizInput } from "./generator";
import { MockGenerator } from "./mock-generator";

const lessonInput: LessonInput = {
  subjectTitle: "Informatică",
  chapterTitle: "Bucle",
  objectives: [
    { id: "o1", text: "Scrie bucle for" },
    { id: "o2", text: "Scrie bucle while" },
  ],
  sourceChunks: [],
  styleNotes: null,
  policy: DEFAULT_POLICY,
  language: "cpp",
};
const quizInput: QuizInput = { ...lessonInput, count: 3, kind: "test" };

/** A provider whose responses are scripted per call; after the script, it delegates to the mock. */
function scripted(responses: unknown[]) {
  const mock = new MockGenerator();
  const calls = { lesson: 0, quiz: 0 };
  const generator: ContentGenerator = {
    provider: "mock",
    generateLesson: async (input) => {
      const next = responses[calls.lesson++];
      if (next instanceof Error) throw next;
      return next === undefined ? mock.generateLesson(input) : next;
    },
    generateQuiz: async (input) => {
      const next = responses[calls.quiz++];
      if (next instanceof Error) throw next;
      return next === undefined ? mock.generateQuiz(input) : next;
    },
    extractStyleNotes: (input) => mock.extractStyleNotes(input),
    solveQuestions: (input) => mock.solveQuestions(input),
  };
  return { generator, calls };
}

const GARBAGE = [
  "not even an object",
  null,
  {},
  { lesson: { body: "" } },
  { lesson: { body: "x", examples: "nope", checkQuestions: [] } },
  { questions: [] },
];

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => vi.restoreAllMocks());

describe("AI engine: validation and the single retry", () => {
  it("retries exactly once after garbage and then succeeds", async () => {
    const { generator, calls } = scripted([GARBAGE[3]]);
    const result = await createAiEngine(generator).generateLesson(lessonInput);

    expect(calls.lesson).toBe(2);
    expect(result.lesson.body.length).toBeGreaterThan(0);
  });

  it.each(GARBAGE.map((garbage, i) => [i, garbage] as const))(
    "treats garbage #%i as invalid output",
    async (_i, garbage) => {
      const { generator, calls } = scripted([garbage, garbage]);
      const call =
        typeof garbage === "object" && garbage !== null && "questions" in garbage
          ? createAiEngine(generator).generateQuiz(quizInput)
          : createAiEngine(generator).generateLesson(lessonInput);
      await expect(call).rejects.toBeInstanceOf(AiUnavailableError);
      expect(calls.lesson + calls.quiz).toBe(2);
    },
  );

  it("throws AI_UNAVAILABLE after exactly one retry when the output is always garbage", async () => {
    const generate = vi.fn(async (_input: LessonInput) => ({ lesson: { body: "" } }));
    const mock = new MockGenerator();
    const engine = createAiEngine({
      provider: "mock",
      generateLesson: generate,
      generateQuiz: (input) => mock.generateQuiz(input),
      extractStyleNotes: (input) => mock.extractStyleNotes(input),
      solveQuestions: (input) => mock.solveQuestions(input),
    });

    const error = await engine.generateLesson(lessonInput).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AiUnavailableError);
    expect((error as AiUnavailableError).code).toBe("AI_UNAVAILABLE");
    expect((error as AiUnavailableError).status).toBe(503);
    expect(generate).toHaveBeenCalledTimes(2);
    // Both calls received the very same input.
    expect(generate.mock.calls[0]?.[0]).toBe(generate.mock.calls[1]?.[0]);
  });

  it("also retries once on a provider error (timeout) and then gives up", async () => {
    const recovers = scripted([new Error("timeout")]);
    await expect(createAiEngine(recovers.generator).generateQuiz(quizInput)).resolves.toBeDefined();
    expect(recovers.calls.quiz).toBe(2);

    const fails = scripted([new Error("timeout"), new Error("timeout again")]);
    await expect(createAiEngine(fails.generator).generateQuiz(quizInput)).rejects.toBeInstanceOf(
      AiUnavailableError,
    );
    expect(fails.calls.quiz).toBe(2);
  });

  it("does not retry when the first answer is valid", async () => {
    const { generator, calls } = scripted([]);
    await createAiEngine(generator).generateQuiz(quizInput);
    expect(calls.quiz).toBe(1);
  });

  it("rejects questions that reference an objective the request did not contain", async () => {
    const bad = {
      questions: [
        {
          id: "q1",
          type: "short",
          prompt: "?",
          acceptedAnswers: ["x"],
          objectiveId: "invented",
        },
      ],
    };
    const { generator, calls } = scripted([bad, bad]);
    await expect(createAiEngine(generator).generateQuiz(quizInput)).rejects.toBeInstanceOf(
      AiUnavailableError,
    );
    expect(calls.quiz).toBe(2);
  });

  it("rejects an invalid answer key (mcq whose correct id is not an option)", async () => {
    const bad = {
      questions: [
        {
          id: "q1",
          type: "mcq",
          prompt: "?",
          options: [
            { id: "a", text: "x" },
            { id: "b", text: "y" },
          ],
          correct: ["zzz"],
          objectiveId: "o1",
        },
      ],
    };
    const { generator } = scripted([bad, bad]);
    await expect(createAiEngine(generator).generateQuiz(quizInput)).rejects.toBeInstanceOf(
      AiUnavailableError,
    );
  });

  it("never lets a provider confirm an answer key", async () => {
    const sneaky = {
      questions: [
        {
          id: "q1",
          type: "short",
          prompt: "?",
          acceptedAnswers: ["x"],
          objectiveId: "o1",
          verification: "teacher_confirmed",
        },
      ],
    };
    const { generator } = scripted([sneaky]);
    const result = await createAiEngine(generator).generateQuiz(quizInput);
    expect(result.questions[0]?.verification).toBe("unchecked");
  });

  it("keeps at most `count` questions and strips unknown keys from the output", async () => {
    const q = (n: number) => ({
      id: `q${n}`,
      type: "short",
      prompt: "?",
      acceptedAnswers: ["x"],
      objectiveId: "o1",
      shouldBeStripped: "yes",
    });
    const { generator } = scripted([{ questions: [q(1), q(2), q(3), q(4), q(5)], extra: 1 }]);
    const result = await createAiEngine(generator).generateQuiz({ ...quizInput, count: 2 });
    expect(result.questions.map((x) => x.id)).toEqual(["q1", "q2"]);
    expect(JSON.stringify(result)).not.toContain("shouldBeStripped");
    expect(result).not.toHaveProperty("extra");
  });

  it("does not leak raw provider output into logs", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const secret = "RAW-PROVIDER-OUTPUT-SHOULD-NOT-BE-LOGGED";
    const { generator } = scripted([
      { lesson: { body: secret, examples: 7 } },
      { lesson: { body: secret, examples: 7 } },
    ]);
    await createAiEngine(generator)
      .generateLesson(lessonInput)
      .catch(() => undefined);
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain(secret);
  });
});
