import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Student policies are personal-space only (Stage 9b). Class-level content is generated with the
// neutral default policy, and the AI layer must never be able to write a policy. This guard fails
// if production code starts using policy modules from somewhere new, so widening the wiring is a
// conscious change (update the lists below together with that change).
const SRC = join(__dirname, "..");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "generated" ? [] : sourceFiles(path);
    return entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts") ? [path] : [];
  });
}

const rel = (file: string) => file.slice(SRC.length + 1).replace(/\\/g, "/");
const filesMatching = (files: string[], pattern: RegExp) =>
  files
    .filter((file) => pattern.test(readFileSync(file, "utf8")))
    .map(rel)
    .sort();

describe("student policy wiring is confined to the personal space", () => {
  const files = sourceFiles(SRC);

  it("scans a meaningful set of production files", () => {
    expect(files.length).toBeGreaterThan(30);
  });

  it("is used only by the personal-space services and the policy modules themselves", () => {
    const offenders = filesMatching(
      files,
      /policy-service|policy-repository|getEffectivePolicy|findLatestGlobalPolicy|getTopicPolicy|findLatestPolicyVersion/,
    );
    expect(offenders).toEqual([
      "repositories/policy-repository.ts",
      "routes/topics-routes.ts",
      "services/adaptation-service.ts",
      "services/personal-material-service.ts",
      "services/policy-service.ts",
      "services/tutor-service.ts",
    ]);
  });

  it("lets ONLY the adaptation service append a policy version (the AI cannot)", () => {
    expect(filesMatching(files, /insertTopicPolicyVersion/)).toEqual([
      "repositories/policy-repository.ts",
      "services/adaptation-service.ts",
    ]);
    // No other module touches the student_policies model at all.
    expect(filesMatching(files, /\bstudentPolicy\b/)).toEqual([
      "repositories/policy-repository.ts",
    ]);
    // The adaptation service itself is imported only by the attempt flow.
    expect(filesMatching(files, /from "\.\/adaptation-service"/)).toEqual([
      "services/attempt-service.ts",
    ]);
  });

  it("keeps generation and the AI folder away from student tables and policy writers", () => {
    const guarded = files.filter(
      (file) => /services[\\/]generation-service\.ts$/.test(file) || /[\\/]ai[\\/]/.test(file),
    );
    expect(guarded.length).toBeGreaterThan(5);
    for (const file of guarded) {
      const text = readFileSync(file, "utf8");
      expect(text, file).not.toMatch(
        /studentPolicy|student_policies|enrollment|tutorMessage|lessonProgress|quizAttempt|findUserBy|adaptation-service|insertTopicPolicyVersion|policy-repository/i,
      );
    }
  });
});
