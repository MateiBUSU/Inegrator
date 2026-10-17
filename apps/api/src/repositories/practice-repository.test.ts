import type { Question } from "@app/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createExerciseEnsuringProgress } from "./practice-repository";

// Prisma is mocked only to pin how the progress row is created: INSERT ... ON CONFLICT DO NOTHING
// (createMany + skipDuplicates), never a read-then-insert upsert. The real race (two starts at
// once) is exercised against Postgres in the browser smoke run.
const tx = vi.hoisted(() => ({
  objectiveProgress: { createMany: vi.fn(), findUniqueOrThrow: vi.fn(), upsert: vi.fn() },
  practiceExercise: { create: vi.fn() },
}));
vi.mock("./prisma-client", () => ({
  prisma: { $transaction: (fn: (client: typeof tx) => unknown) => fn(tx) },
}));

const QUESTION: Question = {
  id: "q1",
  type: "short",
  prompt: "Ce?",
  acceptedAnswers: ["x"],
  objectiveId: "o",
  verification: "unchecked",
};

beforeEach(() => {
  vi.clearAllMocks();
  tx.objectiveProgress.createMany.mockResolvedValue({ count: 0 });
  tx.objectiveProgress.findUniqueOrThrow.mockResolvedValue({ status: "not_started" });
  tx.practiceExercise.create.mockResolvedValue({ id: "e1" });
});

describe("createExerciseEnsuringProgress", () => {
  it("creates the progress row with skipDuplicates, so a concurrent start cannot collide", async () => {
    const result = await createExerciseEnsuringProgress({
      studentId: "s",
      objectiveId: "o",
      question: QUESTION,
    });
    expect(tx.objectiveProgress.createMany).toHaveBeenCalledWith({
      data: [{ studentId: "s", objectiveId: "o" }],
      skipDuplicates: true,
    });
    expect(tx.objectiveProgress.upsert).not.toHaveBeenCalled();
    expect(result).toEqual({ exercise: { id: "e1" }, progress: { status: "not_started" } });
  });
});
