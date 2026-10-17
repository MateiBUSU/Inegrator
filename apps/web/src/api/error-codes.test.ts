import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FALLBACK_MESSAGE, messageForCode } from "./errors";

// Keeps the Romanian message table in sync with the backend: every error code the API source can
// emit must have its own Romanian message (not the generic fallback). If you add a code to
// apps/api, this test fails until the web client learns how to talk about it.
const API_SRC = join(__dirname, "..", "..", "..", "api", "src");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "generated" ? [] : sourceFiles(path);
    return entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts") ? [path] : [];
  });
}

// Error codes are UPPER_SNAKE_CASE string literals with at least one underscore, passed to
// HttpError, to helpers such as conflict(...), or returned by the error handler. Scanning for
// every such literal outside config/ (which only holds environment variable names) means a new
// code is caught however it is raised.
const CODE_LITERAL = /"([A-Z]+(?:_[A-Z]+)+)"/g;
// Add a literal here only if it is not an error code. These two are adaptive-policy reason codes
// stored in student_policies, never sent as errors.
const NOT_ERROR_CODES = new Set<string>(["HIGH_ACCURACY", "REPEATED_OBJECTIVE_ERRORS"]);

function emittedCodes(): string[] {
  const codes = new Set<string>();
  for (const file of sourceFiles(API_SRC)) {
    if (/[\\/]config[\\/]/.test(file)) continue;
    for (const match of readFileSync(file, "utf8").matchAll(CODE_LITERAL)) {
      if (match[1] && !NOT_ERROR_CODES.has(match[1])) codes.add(match[1]);
    }
  }
  return [...codes].sort();
}

describe("error code messages", () => {
  const codes = emittedCodes();

  it("finds the API's error codes in its source", () => {
    expect(codes.length).toBeGreaterThan(25);
    expect(codes).toEqual(
      expect.arrayContaining([
        "INVALID_CREDENTIALS",
        "QUOTA_EXCEEDED",
        "UNCONFIRMED_QUESTIONS",
        "CLASS_NOT_FOUND",
      ]),
    );
  });

  it.each(codes)("has a Romanian message for %s", (code) => {
    const message = messageForCode(code);
    expect(message).not.toBe(FALLBACK_MESSAGE);
    expect(message.length).toBeGreaterThan(10);
  });
});
