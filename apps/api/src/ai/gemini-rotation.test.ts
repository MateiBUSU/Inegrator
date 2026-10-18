import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Key rotation in the Gemini generator, with the SDK replaced by a scripted fake: no network.
// `behave` decides, per call, what a given key does.
const sdk = vi.hoisted(() => ({
  calls: [] as string[],
  behave: (_key: string, _call: number): unknown => ({ text: "{}" }),
}));

vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    constructor(private readonly options: { apiKey: string }) {}
    models = {
      generateContent: async () => {
        sdk.calls.push(this.options.apiKey);
        const result = sdk.behave(this.options.apiKey, sdk.calls.length);
        if (result instanceof Error) throw result;
        return result;
      },
    };
  },
}));

import { createAiEngine } from "./engine";
import { AiUnavailableError } from "./errors";
import { GeminiGenerator, KEY_COOLDOWN_MS } from "./gemini-generator";

const K1 = "SECRET-KEY-ONE-aaaa1111";
const K2 = "SECRET-KEY-TWO-bbbb2222";
const K3 = "SECRET-KEY-THREE-cccc3333";

const apiError = (status: number) =>
  Object.assign(new Error(`status ${status}`), { name: "ApiError", status });
const quota = () => apiError(429);
const ok = { text: JSON.stringify({ styleNotes: "ton direct" }) };
const input = { sampleText: "Un text de probă." };

let logged: string[];
beforeEach(() => {
  sdk.calls = [];
  sdk.behave = () => ok;
  logged = [];
  vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    logged.push(args.map(String).join(" "));
  });
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const engineOf = (keys: string[]) => createAiEngine(new GeminiGenerator(keys, "m"));

describe("a quota error rotates to the next key", () => {
  it("retries the same request on key 2 and succeeds, and keeps using key 2 afterwards", async () => {
    sdk.behave = (key) => (key === K1 ? quota() : ok);
    const engine = engineOf([K1, K2]);
    expect((await engine.extractStyleNotes(input)).styleNotes).toBe("ton direct");
    expect(sdk.calls).toEqual([K1, K2]);
    await engine.extractStyleNotes(input);
    expect(sdk.calls).toEqual([K1, K2, K2]);
    expect(logged).toEqual(["Gemini key 1 of 2 hit its quota: switched to key 2"]);
  });

  it("walks through three keys when the first two are out of quota", async () => {
    sdk.behave = (key) => (key === K3 ? ok : quota());
    await engineOf([K1, K2, K3]).extractStyleNotes(input);
    expect(sdk.calls).toEqual([K1, K2, K3]);
  });
});

describe("other errors do not rotate", () => {
  it.each([
    ["a timeout", () => new Error("This operation was aborted")],
    ["a 503 high demand", () => apiError(503)],
    ["a server error", () => apiError(500)],
  ])("%s: same key, retried once by the engine, as before", async (_label, make) => {
    sdk.behave = () => make();
    await expect(engineOf([K1, K2]).extractStyleNotes(input)).rejects.toBeInstanceOf(
      AiUnavailableError,
    );
    expect(sdk.calls).toEqual([K1, K1]);
    expect(logged.some((line) => line.includes("switched"))).toBe(false);
  });

  it("malformed output: same key, retried once, no rotation", async () => {
    sdk.behave = () => ({ text: '{"unexpected":1}' });
    await expect(engineOf([K1, K2]).extractStyleNotes(input)).rejects.toBeInstanceOf(
      AiUnavailableError,
    );
    expect(sdk.calls).toEqual([K1, K1]);
  });
});

describe("every key exhausted", () => {
  it("ends in the usual AI_UNAVAILABLE 503 with a bounded number of calls", async () => {
    sdk.behave = () => quota();
    const error = await engineOf([K1, K2])
      .extractStyleNotes(input)
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AiUnavailableError);
    expect((error as AiUnavailableError).status).toBe(503);
    // Never an endless loop: both keys once, then the engine's single retry finds them exhausted.
    expect(sdk.calls.length).toBeLessThanOrEqual(4);
  });

  it("skips exhausted keys for a while, then tries them again", async () => {
    sdk.behave = () => quota();
    const engine = engineOf([K1, K2]);
    await engine.extractStyleNotes(input).catch(() => undefined);
    const after = sdk.calls.length;
    await engine.extractStyleNotes(input).catch(() => undefined);
    expect(sdk.calls.length).toBeLessThanOrEqual(after + 2);

    vi.advanceTimersByTime(KEY_COOLDOWN_MS + 1);
    sdk.behave = () => ok;
    sdk.calls = [];
    await expect(engine.extractStyleNotes(input)).resolves.toBeDefined();
    expect(sdk.calls).toHaveLength(1);
  });
});

describe("a single key behaves exactly as before", () => {
  it("quota error: the same key, retried once by the engine, no rotation, no log line", async () => {
    sdk.behave = () => quota();
    await expect(engineOf([K1]).extractStyleNotes(input)).rejects.toBeInstanceOf(
      AiUnavailableError,
    );
    expect(sdk.calls).toEqual([K1, K1]);
    expect(logged.some((line) => line.includes("switched"))).toBe(false);
  });

  it("a plain string key still works, and a retry after a quota error is not blocked", async () => {
    let call = 0;
    sdk.behave = () => (++call === 1 ? quota() : ok);
    const engine = createAiEngine(new GeminiGenerator(K1, "m"));
    await expect(engine.extractStyleNotes(input)).resolves.toBeDefined();
    expect(sdk.calls).toEqual([K1, K1]);
  });
});

describe("key values are never logged", () => {
  it("no log line contains any key, in full or in part", async () => {
    sdk.behave = (key) => (key === K3 ? ok : quota());
    await engineOf([K1, K2, K3]).extractStyleNotes(input);
    sdk.behave = () => new Error("boom");
    await engineOf([K1, K2])
      .extractStyleNotes(input)
      .catch(() => undefined);
    const all = logged.join("\n");
    expect(all.length).toBeGreaterThan(0);
    for (const key of [K1, K2, K3]) {
      expect(all).not.toContain(key);
      expect(all).not.toContain(key.slice(0, 8));
      expect(all).not.toContain(key.slice(-4));
    }
  });
});
