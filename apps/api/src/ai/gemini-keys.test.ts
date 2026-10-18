import { describe, expect, it } from "vitest";
import { isOverloadError, isQuotaError, resolveGeminiKeys } from "./gemini-keys";

describe("resolveGeminiKeys", () => {
  it("uses the single GEMINI_API_KEY when GEMINI_API_KEYS is unset", () => {
    expect(resolveGeminiKeys({ GEMINI_API_KEY: "one" })).toEqual(["one"]);
    expect(resolveGeminiKeys({ GEMINI_API_KEY: "one", GEMINI_API_KEYS: "" })).toEqual(["one"]);
  });

  it("prefers the comma-separated list, trimming blanks and duplicates", () => {
    expect(resolveGeminiKeys({ GEMINI_API_KEYS: " a, b ,,c,a ", GEMINI_API_KEY: "one" })).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("is empty when nothing is configured", () => {
    expect(resolveGeminiKeys({})).toEqual([]);
    expect(resolveGeminiKeys({ GEMINI_API_KEYS: " , " })).toEqual([]);
  });
});

describe("isQuotaError", () => {
  it("is true for the SDK's 429 ApiError and false for everything else", () => {
    const api = (status: number) => Object.assign(new Error("x"), { name: "ApiError", status });
    expect(isQuotaError(api(429))).toBe(true);
    expect(isQuotaError(api(503))).toBe(false); // "high demand": another key does not help
    expect(isQuotaError(api(500))).toBe(false);
    expect(isQuotaError(new Error("timeout"))).toBe(false);
    expect(isQuotaError(new SyntaxError("bad json"))).toBe(false);
    expect(isQuotaError(null)).toBe(false);
    expect(isQuotaError("429")).toBe(false);
  });
});

describe("isOverloadError", () => {
  it("is true only for a 503 ApiError", () => {
    const api = (status: number) => Object.assign(new Error("x"), { name: "ApiError", status });
    expect(isOverloadError(api(503))).toBe(true);
    expect(isOverloadError(api(429))).toBe(false);
    expect(isOverloadError(api(500))).toBe(false);
    expect(isOverloadError(new Error("timeout"))).toBe(false);
    expect(isOverloadError(undefined)).toBe(false);
  });
});
