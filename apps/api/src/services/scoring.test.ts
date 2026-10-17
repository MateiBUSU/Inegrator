import { materialDefinitionSchema } from "@app/shared";
import { describe, expect, it } from "vitest";
import { normalizeShortAnswer, scoreAttempt } from "./scoring";

const material = materialDefinitionSchema.parse({
  title: "Test",
  kind: "test",
  section: "programa",
  language: "cpp",
  grade: 9,
  objectives: [{ id: "o1", text: "Obiectiv" }],
  questions: [
    {
      id: "m1",
      type: "mcq",
      prompt: "Care sunt tipuri întregi?",
      options: [
        { id: "a", text: "int" },
        { id: "b", text: "long" },
        { id: "c", text: "string" },
      ],
      correct: ["a", "b"],
      objectiveId: "o1",
    },
    {
      id: "s1",
      type: "short",
      prompt: "Cuvânt cheie pentru buclă?",
      acceptedAnswers: ["while", "do while"],
      objectiveId: "o1",
    },
    {
      id: "p1",
      type: "programming",
      prompt: "Scrie suma.",
      referenceSolution: "int main(){}",
      objectiveId: "o1",
    },
  ],
});

const grade = (answers: Parameters<typeof scoreAttempt>[1]) => scoreAttempt(material, answers);
const isCorrect = (result: ReturnType<typeof grade>, id: string) => {
  const entry = result.results.find((r) => r.questionId === id);
  return entry && "isCorrect" in entry ? entry.isCorrect : undefined;
};

describe("scoreAttempt: mcq", () => {
  it("is correct only on an exact match of the selected set (order and duplicates ignored)", () => {
    expect(isCorrect(grade([{ questionId: "m1", optionIds: ["b", "a"] }]), "m1")).toBe(true);
    expect(isCorrect(grade([{ questionId: "m1", optionIds: ["a", "a", "b"] }]), "m1")).toBe(true);
  });

  it("scores a partial selection as wrong (no partial credit)", () => {
    const result = grade([{ questionId: "m1", optionIds: ["a"] }]);
    expect(isCorrect(result, "m1")).toBe(false);
    expect(result.score).toBe(0);
  });

  it("scores an extra selection as wrong", () => {
    expect(isCorrect(grade([{ questionId: "m1", optionIds: ["a", "b", "c"] }]), "m1")).toBe(false);
  });

  it("scores an unanswered question as wrong", () => {
    expect(isCorrect(grade([]), "m1")).toBe(false);
  });
});

describe("scoreAttempt: short", () => {
  it("normalizes case, surrounding and internal whitespace on both sides", () => {
    for (const text of ["while", "  WHILE ", "While\t", "DO   while", "do\nwhile"]) {
      expect(isCorrect(grade([{ questionId: "s1", text }]), "s1")).toBe(true);
    }
  });

  it("rejects other answers and empty text", () => {
    for (const text of ["for", "whil e", "", "   "]) {
      expect(isCorrect(grade([{ questionId: "s1", text }]), "s1")).toBe(false);
    }
  });

  it("normalizeShortAnswer lowercases, trims and collapses whitespace", () => {
    expect(normalizeShortAnswer("  A \n  B\tC ")).toBe("a b c");
  });
});

describe("scoreAttempt: programming and totals", () => {
  it("excludes programming from score and maxScore and flags it as self-evaluation", () => {
    const result = grade([
      { questionId: "m1", optionIds: ["a", "b"] },
      { questionId: "s1", text: "while" },
      { questionId: "p1", text: "int main(){ return 0; }" },
    ]);
    expect(result.score).toBe(2);
    expect(result.maxScore).toBe(2);
    expect(result.selfEvaluationCount).toBe(1);
    const programming = result.results.find((r) => r.questionId === "p1");
    expect(programming).toMatchObject({ type: "programming", evaluation: "self-evaluation" });
    expect(programming && "isCorrect" in programming).toBe(false);
  });

  it("is deterministic", () => {
    const answers = [{ questionId: "m1", optionIds: ["a"] }];
    expect(grade(answers)).toEqual(grade(answers));
  });
});
