import { afterEach, describe, expect, it, vi } from "vitest";

// Provider wiring when AI_PROVIDER=gemini, with NO network and NO real SDK: both the env module
// and the Gemini generator module are replaced. This only checks setup and failure mapping; the
// real Gemini client is never constructed and never called.
const state = vi.hoisted(() => ({
  constructed: [] as { apiKey: string | readonly string[]; model: string }[],
  failOnConstruct: false,
}));

vi.mock("../config/env", () => ({
  env: { AI_PROVIDER: "gemini", GEMINI_API_KEY: "fake-key-for-test", GEMINI_MODEL: "fake-model" },
}));

vi.mock("./gemini-generator", () => ({
  GeminiGenerator: class {
    readonly provider = "gemini" as const;
    constructor(apiKey: string | readonly string[], model: string) {
      if (state.failOnConstruct) throw new Error("SDK failed to initialise");
      state.constructed.push({ apiKey, model });
    }
    generateLesson = async () => ({});
    generateQuiz = async () => ({});
    extractStyleNotes = async () => ({});
    solveQuestions = async () => ({});
  },
}));

afterEach(async () => {
  state.constructed.length = 0;
  state.failOnConstruct = false;
  vi.resetModules();
});

describe("AI provider selection with AI_PROVIDER=gemini", () => {
  it("builds the Gemini provider from the configured key and model", async () => {
    const { getAiEngine } = await import("./index");
    const engine = await getAiEngine();
    expect(engine.provider).toBe("gemini");
    expect(state.constructed).toEqual([{ apiKey: ["fake-key-for-test"], model: "fake-model" }]);
    // The engine is cached: the provider is constructed once.
    await getAiEngine();
    expect(state.constructed).toHaveLength(1);
  });

  it("reports a provider that cannot start as the typed AI_UNAVAILABLE error, not a raw failure", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    state.failOnConstruct = true;
    const { getAiEngine, AiUnavailableError } = await import("./index");
    const error = await getAiEngine().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AiUnavailableError);
    expect((error as InstanceType<typeof AiUnavailableError>).status).toBe(503);
    expect((error as InstanceType<typeof AiUnavailableError>).code).toBe("AI_UNAVAILABLE");
  });
});
