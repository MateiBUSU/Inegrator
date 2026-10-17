import { describe, expect, it } from "vitest";
import { personalContentSchema } from "./personal";

const question = (objectiveId: string) => ({
  id: "q1",
  type: "short" as const,
  prompt: "Ce face un firewall?",
  acceptedAnswers: ["filtrează"],
  objectiveId,
});

describe("personalContentSchema", () => {
  const objectives = [{ id: "11111111-1111-4111-8111-111111111111", text: "Firewall" }];

  it("accepts questions that point at the material's own objective", () => {
    const parsed = personalContentSchema.safeParse({
      objectives,
      questions: [question(objectives[0]?.id ?? "")],
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects a question whose objectiveId is not one of the material's objectives", () => {
    const parsed = personalContentSchema.safeParse({ objectives, questions: [question("o1")] });
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.path).toEqual(["questions", 0, "objectiveId"]);
  });

  it("applies the same rule to lesson check questions", () => {
    const parsed = personalContentSchema.safeParse({
      objectives,
      lesson: { body: "Text", examples: [], checkQuestions: [question("elsewhere")] },
    });
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.path).toEqual(["lesson", "checkQuestions", 0, "objectiveId"]);
  });

  it("has no section, language or grade: those describe the curriculum, not a student's topic", () => {
    const parsed = personalContentSchema.parse({ objectives });
    expect(Object.keys(parsed)).toEqual(["objectives"]);
  });
});
