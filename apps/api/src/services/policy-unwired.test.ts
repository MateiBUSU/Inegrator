import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// getEffectivePolicy (Stage 6) deliberately exists but is NOT wired into any endpoint yet: class
// content is generated with the neutral default policy, and per-student policies are applied only
// in a later stage. This guard fails if production code starts using it by accident, so wiring
// it becomes a conscious change (update this test together with that change).
const SRC = join(__dirname, "..");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "generated" ? [] : sourceFiles(path);
    return entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts") ? [path] : [];
  });
}

describe("student policy is not wired into any endpoint yet", () => {
  const files = sourceFiles(SRC);

  it("scans a meaningful set of production files", () => {
    expect(files.length).toBeGreaterThan(30);
  });

  it("is imported by nothing except policy-service itself importing its own repository", () => {
    const offenders = files
      .filter((file) =>
        /policy-service|policy-repository|getEffectivePolicy|findLatestGlobalPolicy/.test(
          readFileSync(file, "utf8"),
        ),
      )
      .map((file) => file.slice(SRC.length + 1).replace(/\\/g, "/"))
      .sort();
    expect(offenders).toEqual(["repositories/policy-repository.ts", "services/policy-service.ts"]);
  });

  it("keeps generation and the AI folder away from student tables", () => {
    const guarded = files.filter(
      (file) => /services[\\/]generation-service\.ts$/.test(file) || /[\\/]ai[\\/]/.test(file),
    );
    expect(guarded.length).toBeGreaterThan(5);
    for (const file of guarded) {
      const text = readFileSync(file, "utf8");
      expect(text, file).not.toMatch(
        /studentPolicy|student_policies|enrollment|tutorMessage|lessonProgress|quizAttempt|findUserBy/i,
      );
    }
  });
});
