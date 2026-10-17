import { describe, expect, it, vi } from "vitest";
import { computeStatsFromFacts } from "../services/gamification";

// Fake prisma that evaluates `where.isCorrect` with strict equality, like SQL `= true` / `= false`
// (NULL matches neither). The real repository and the real points formula run on top of it.
const rows = vi.hoisted(() => ({
  answers: [] as { isCorrect: boolean | null }[],
}));

vi.mock("./prisma-client", () => ({
  prisma: {
    quizAttempt: { findMany: async () => [] },
    lessonProgress: { findMany: async () => [] },
    attemptAnswer: {
      count: async ({ where }: { where: { isCorrect: boolean } }) =>
        rows.answers.filter((a) => a.isCorrect === where.isCorrect).length,
    },
  },
}));

import { loadActivityFacts } from "./gamification-repository";

describe("gamification and not-graded (null) attempt answers", () => {
  it("counts null as neither correct nor incorrect, and awards no points for it", async () => {
    rows.answers = [
      { isCorrect: true },
      { isCorrect: true },
      { isCorrect: false },
      { isCorrect: null },
      { isCorrect: null },
      { isCorrect: null },
    ];
    const facts = await loadActivityFacts("student");
    expect(facts.answers).toEqual({ correct: 2, incorrect: 1 });

    const withNulls = computeStatsFromFacts(facts, new Date("2026-01-01T00:00:00Z"));
    rows.answers = rows.answers.filter((a) => a.isCorrect !== null);
    const withoutNulls = computeStatsFromFacts(
      await loadActivityFacts("student"),
      new Date("2026-01-01T00:00:00Z"),
    );
    expect(withNulls.pointsTotal).toBe(withoutNulls.pointsTotal);
    expect(withNulls.pointsTotal).toBeGreaterThan(0);
  });
});
