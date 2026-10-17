import { afterEach, describe, expect, it, vi } from "vitest";
import { getAiEngine, setAiProviderForTesting } from "./index";

// If the Gemini SDK were imported in the default (mock) configuration, this mock would throw.
vi.mock("@google/genai", () => {
  throw new Error("The Gemini SDK must not be loaded unless AI_PROVIDER=gemini");
});

afterEach(() => setAiProviderForTesting(null));

describe("AI provider selection", () => {
  it("defaults to the mock provider and never loads the Gemini SDK", async () => {
    const engine = await getAiEngine();
    expect(engine.provider).toBe("mock");
    const lesson = await engine.generateLesson({
      subjectTitle: "S",
      chapterTitle: "C",
      objectives: [{ id: "o1", text: "Un obiectiv" }],
      sourceChunks: [],
      styleNotes: null,
      policy: {
        explanationLevel: "standard",
        exampleFirst: false,
        scaffolding: "medium",
        hintsEnabled: true,
      },
    });
    expect(lesson.lesson.body.length).toBeGreaterThan(0);
  });

  it("caches the engine for the configured provider", async () => {
    expect(await getAiEngine()).toBe(await getAiEngine());
  });

  it("can be overridden in tests and restored", async () => {
    setAiProviderForTesting({
      provider: "gemini",
      generateLesson: async () => ({}),
      generateQuiz: async () => ({}),
      extractStyleNotes: async () => ({}),
      solveQuestions: async () => ({}),
    });
    expect((await getAiEngine()).provider).toBe("gemini");
    setAiProviderForTesting(null);
    expect((await getAiEngine()).provider).toBe("mock");
  });
});
