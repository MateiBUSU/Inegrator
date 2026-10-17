import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// env.ts validates process.env when it is imported and exits the process on failure, so each case
// stubs the environment, resets the module registry and imports it again with process.exit spied.
const VALID = {
  DATABASE_URL: "postgresql://test:test@localhost:5432/test",
  JWT_SECRET: "test-jwt-secret-test-jwt-secret-1234567890",
  TEACHER_SECRET: "test-teacher-secret",
};

async function loadEnv(overrides: Record<string, string | undefined> = {}) {
  vi.resetModules();
  const values: Record<string, string | undefined> = {
    ...VALID,
    AI_PROVIDER: undefined,
    GEMINI_API_KEY: undefined,
    GEMINI_MODEL: undefined,
    AI_DAILY_LIMIT_PER_TEACHER: undefined,
    ...overrides,
  };
  for (const [key, value] of Object.entries(values)) vi.stubEnv(key, value);
  return (await import("./env")).env;
}

let errorSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
    throw new Error(`exit(${code})`);
  }) as never);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const message = () => errorSpy.mock.calls.map((call: unknown[]) => String(call[0])).join("\n");

describe("AI environment settings", () => {
  it("defaults to the mock provider, no key, and 20 generations per teacher per day", async () => {
    const env = await loadEnv();
    expect(env.AI_PROVIDER).toBe("mock");
    expect(env.GEMINI_API_KEY).toBeUndefined();
    expect(env.GEMINI_MODEL).toBe("gemini-3.8-flash");
    expect(env.AI_DAILY_LIMIT_PER_TEACHER).toBe(20);
  });

  it("treats empty GEMINI_API_KEY / GEMINI_MODEL lines (as in a copied .env.example) as unset", async () => {
    const env = await loadEnv({ GEMINI_API_KEY: "", GEMINI_MODEL: "" });
    expect(env.AI_PROVIDER).toBe("mock");
    expect(env.GEMINI_API_KEY).toBeUndefined();
    expect(env.GEMINI_MODEL).toBe("gemini-3.8-flash");
  });

  it("refuses to start with AI_PROVIDER=gemini and no (or empty) key", async () => {
    await expect(loadEnv({ AI_PROVIDER: "gemini" })).rejects.toThrow("exit(1)");
    expect(message()).toContain("GEMINI_API_KEY");
    await expect(loadEnv({ AI_PROVIDER: "gemini", GEMINI_API_KEY: "" })).rejects.toThrow("exit(1)");
  });

  it("accepts AI_PROVIDER=gemini with a key, and never prints the key", async () => {
    const env = await loadEnv({
      AI_PROVIDER: "gemini",
      GEMINI_API_KEY: "secret-key-value",
      GEMINI_MODEL: "some-model",
    });
    expect(env.AI_PROVIDER).toBe("gemini");
    expect(env.GEMINI_MODEL).toBe("some-model");
    await expect(
      loadEnv({ AI_PROVIDER: "gemini", GEMINI_API_KEY: "secret-key-value", PORT: "abc" }),
    ).rejects.toThrow();
    expect(message()).not.toContain("secret-key-value");
  });

  it("rejects an unknown provider and an invalid daily limit", async () => {
    await expect(loadEnv({ AI_PROVIDER: "openai" })).rejects.toThrow("exit(1)");
    await expect(loadEnv({ AI_DAILY_LIMIT_PER_TEACHER: "-1" })).rejects.toThrow("exit(1)");
    await expect(loadEnv({ AI_DAILY_LIMIT_PER_TEACHER: "many" })).rejects.toThrow("exit(1)");
    expect((await loadEnv({ AI_DAILY_LIMIT_PER_TEACHER: "0" })).AI_DAILY_LIMIT_PER_TEACHER).toBe(0);
  });
});
