import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { setAiProviderForTesting } from "../ai";
import type { ContentGenerator, ReasoningGradeInput } from "../ai/generator";
import { MockGenerator } from "../ai/mock-generator";
import { createApp } from "../app";
import { signToken } from "../services/token-service";

// AI-graded open questions ("reasoning") through the real routes, services and scoring. The AI
// provider is a scripted fake, repositories are in-memory.
const REFERENCE =
  "Parcurgerea în lățime folosește o coadă și vizitează nodurile nivel cu nivel, iar parcurgerea în adâncime folosește o stivă și merge cât mai departe pe fiecare ramură.";

const store = vi.hoisted(() => ({
  material: null as null | { id: string; content: unknown },
  enrolled: new Set<string>(),
  attempts: [] as {
    id: string;
    studentId: string;
    materialId: string;
    submittedAt: Date;
    score: number;
    maxScore: number;
    answers: { questionId: string; answer: unknown; isCorrect: boolean | null }[];
  }[],
  usage: new Map<string, number>(),
}));

vi.mock("../repositories/material-repository", () => {
  const row = () =>
    store.material && {
      id: store.material.id,
      ownerId: "teacher",
      scope: "class" as const,
      kind: "test",
      title: "Parcurgeri",
      status: "published" as const,
      version: 1,
      content: structuredClone(store.material.content),
      publishedAt: new Date(),
    };
  return {
    findMaterialById: async (id: string) => (store.material?.id === id ? row() : null),
    isAssignedToStudent: async (_m: string, studentId: string) => store.enrolled.has(studentId),
    listPublishedForStudent: async (studentId: string) =>
      store.enrolled.has(studentId) && store.material ? [row()] : [],
  };
});
vi.mock("../repositories/attempt-repository", () => ({
  findExistingObjectiveIds: async () => new Set<string>(),
  createAttempt: async (data: Record<string, unknown>) => {
    const row = { ...data, id: crypto.randomUUID(), submittedAt: new Date() } as never;
    store.attempts.push(row);
    return row;
  },
  findAttemptById: async (id: string) => store.attempts.find((a) => a.id === id) ?? null,
}));
vi.mock("../repositories/ai-usage-repository", () => ({
  tryConsumeAiQuota: async (userId: string, day: string, limit: number) => {
    const key = `${userId}|${day}`;
    const current = store.usage.get(key) ?? 0;
    if (current >= limit) return null;
    store.usage.set(key, current + 1);
    return current + 1;
  },
}));

const content = {
  section: "programa",
  language: "cpp",
  grade: 11,
  objectives: [{ id: "o1", text: "Compară BFS și DFS" }],
  questions: [
    {
      id: "m1",
      type: "mcq",
      prompt: "Care e corect?",
      options: [
        { id: "a", text: "A" },
        { id: "b", text: "B" },
      ],
      correct: ["a"],
      explanation: "EXPLICATIE-SECRETA",
      objectiveId: "o1",
      verification: "teacher_confirmed",
    },
    {
      id: "r1",
      type: "reasoning",
      prompt: "Compară BFS și DFS.",
      referenceSolution: REFERENCE,
      explanation: "NOTA-PROFESOR-SECRETA",
      objectiveId: "o1",
      verification: "teacher_confirmed",
    },
  ],
};

function provider(overrides: Partial<ContentGenerator> = {}) {
  const mock = new MockGenerator();
  const graded: ReasoningGradeInput[] = [];
  const generator: ContentGenerator = {
    provider: "mock",
    generateLesson: (i) => mock.generateLesson(i),
    generateQuiz: (i) => mock.generateQuiz(i),
    extractStyleNotes: (i) => mock.extractStyleNotes(i),
    solveQuestions: (i) => mock.solveQuestions(i),
    tutorReply: (i) => mock.tutorReply(i),
    generatePracticeExercise: (i) => mock.generatePracticeExercise(i),
    diagnosePracticeAnswer: (i) => mock.diagnosePracticeAnswer(i),
    gradeReasoningAnswer: async (input) => {
      graded.push(input);
      return mock.gradeReasoningAnswer(input);
    },
    ...overrides,
  };
  return { generator, graded };
}

const scripted = (verdict: "CORECT" | "PARTIAL" | "GRESIT") =>
  provider({
    gradeReasoningAnswer: async () => ({
      verdict,
      feedback: `Feedback ${verdict} despre ce a scris elevul.`,
      ...(verdict === "CORECT" ? {} : { explanation: "Explicație nouă a conceptului." }),
    }),
  });

const student = () => {
  const id = crypto.randomUUID();
  store.enrolled.add(id);
  return { id, cookie: `token=${signToken({ userId: id, role: "student" })}` };
};
const app = createApp();
const submit = (user: { cookie: string }, answers: object[]) =>
  request(app)
    .post(`/api/materials/${store.material?.id}/attempts`)
    .set("Cookie", user.cookie)
    .send({ answers });
const mcqRight = { questionId: "m1", optionIds: ["a"] };
const written = { questionId: "r1", text: "BFS merge pe niveluri cu o coadă, DFS în adâncime." };

function keysOf(value: unknown, keys = new Set<string>()): Set<string> {
  if (Array.isArray(value)) value.forEach((v) => keysOf(v, keys));
  else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      keys.add(k);
      keysOf(v, keys);
    }
  }
  return keys;
}
const FORBIDDEN = ["referenceSolution", "correct", "rubric", "acceptedAnswers", "explanation"];
const reasoningOf = (body: { attempt: { results: { type: string }[] } }) =>
  body.attempt.results.find((r) => r.type === "reasoning") as Record<string, unknown>;

beforeEach(() => {
  store.material = { id: crypto.randomUUID(), content: structuredClone(content) };
  store.enrolled.clear();
  store.attempts.length = 0;
  store.usage.clear();
  setAiProviderForTesting(provider().generator);
});

describe("reasoning questions: the reference answer never reaches a client", () => {
  it("the student's material view has the prompt only", async () => {
    const ana = student();
    const res = await request(app).get("/api/me/materials").set("Cookie", ana.cookie);
    expect(res.status).toBe(200);
    const q = res.body.materials[0].questions.find((x: { id: string }) => x.id === "r1");
    expect(q).toEqual({
      id: "r1",
      type: "reasoning",
      prompt: "Compară BFS și DFS.",
      objectiveId: "o1",
    });
    expect(FORBIDDEN.filter((k) => keysOf(res.body).has(k))).toEqual([]);
    expect(JSON.stringify(res.body)).not.toContain("coadă");
  });

  it("neither the submit response nor the stored attempt contains it, before or after grading", async () => {
    const ana = student();
    const res = await submit(ana, [mcqRight, written]);
    expect(res.status).toBe(201);
    const reasoning = reasoningOf(res.body);
    expect(keysOf(reasoning).has("referenceSolution")).toBe(false);
    expect(JSON.stringify(res.body)).not.toContain(REFERENCE);
    expect(JSON.stringify(res.body)).not.toContain("NOTA-PROFESOR-SECRETA");

    const again = await request(app)
      .get(`/api/attempts/${res.body.attempt.id}`)
      .set("Cookie", ana.cookie);
    expect(again.status).toBe(200);
    expect(JSON.stringify(again.body)).not.toContain(REFERENCE);
    expect(JSON.stringify(again.body)).not.toContain("NOTA-PROFESOR-SECRETA");
    expect(keysOf(reasoningOf(again.body)).has("referenceSolution")).toBe(false);
  });

  it("the provider receives the reference answer and the student's text, but no identity", async () => {
    const { generator, graded } = provider();
    setAiProviderForTesting(generator);
    const ana = student();
    await submit(ana, [mcqRight, written]);
    expect(graded).toHaveLength(1);
    expect(graded[0]?.referenceAnswer).toBe(REFERENCE);
    expect(graded[0]?.studentAnswer).toBe(written.text);
    expect(JSON.stringify(graded[0])).not.toContain(ana.id);
  });
});

describe("reasoning questions: verdicts and points", () => {
  it.each([
    ["CORECT", 1, 2],
    ["PARTIAL", 0.5, 1.5],
    ["GRESIT", 0, 1],
  ] as const)(
    "%s is worth %s point(s): score %s of 2 with the mcq right",
    async (verdict, points, score) => {
      setAiProviderForTesting(scripted(verdict).generator);
      const res = await submit(student(), [mcqRight, written]);
      expect(res.status).toBe(201);
      const r = reasoningOf(res.body);
      expect(r.verdict).toBe(verdict);
      expect(r.points).toBe(points);
      expect(r.feedback).toContain(verdict);
      expect(Boolean(r.reexplanation)).toBe(verdict !== "CORECT");
      expect(res.body.attempt.score).toBe(score);
      expect(res.body.attempt.maxScore).toBe(2);
      expect(store.attempts[0]?.score).toBe(score);
    },
  );

  it("a stored attempt shows the same verdict later without another AI call", async () => {
    const { generator, graded } = provider({
      gradeReasoningAnswer: async () => ({
        verdict: "PARTIAL",
        feedback: "Feedback PARTIAL.",
        explanation: "Explicație.",
      }),
    });
    setAiProviderForTesting({
      ...generator,
      gradeReasoningAnswer: async (input) => {
        graded.push(input);
        return generator.gradeReasoningAnswer(input);
      },
    });
    const ana = student();
    const first = await submit(ana, [mcqRight, written]);
    const again = await request(app)
      .get(`/api/attempts/${first.body.attempt.id}`)
      .set("Cookie", ana.cookie);
    expect(again.body.attempt.results).toEqual(first.body.attempt.results);
    expect(again.body.attempt.score).toBe(1.5);
    expect(graded).toHaveLength(1);
  });

  it("a blank reasoning answer is GRESIT without calling the AI", async () => {
    const { generator, graded } = provider();
    setAiProviderForTesting(generator);
    const res = await submit(student(), [mcqRight]);
    const r = reasoningOf(res.body);
    expect(r.verdict).toBe("GRESIT");
    expect(r.points).toBe(0);
    expect(graded).toHaveLength(0);
  });
});

describe("reasoning questions: when the grader is not available", () => {
  it("503 saves nothing and does not mark the answer wrong; the same answer works on resubmit", async () => {
    let down = true;
    const base = provider();
    setAiProviderForTesting({
      ...base.generator,
      gradeReasoningAnswer: async (input) => {
        if (down) throw new Error("down");
        return base.generator.gradeReasoningAnswer(input);
      },
    });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const ana = student();
    const failed = await submit(ana, [mcqRight, written]);
    expect(failed.status).toBe(503);
    expect(failed.body.error.code).toBe("AI_UNAVAILABLE");
    expect(store.attempts).toHaveLength(0);

    down = false;
    const retry = await submit(ana, [mcqRight, written]);
    expect(retry.status).toBe(201);
    expect(store.attempts).toHaveLength(1);
    expect(reasoningOf(retry.body).text).toBe(written.text);
  });

  it("429 when the daily student quota is used up; nothing saved", async () => {
    const ana = student();
    store.usage.set(`${ana.id}|${new Date().toISOString().slice(0, 10)}`, 10_000);
    const res = await submit(ana, [mcqRight, written]);
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe("QUOTA_EXCEEDED");
    expect(store.attempts).toHaveLength(0);
  });

  it("a test without reasoning questions never needs the AI", async () => {
    store.material = {
      id: crypto.randomUUID(),
      content: { ...content, questions: [content.questions[0]] },
    };
    setAiProviderForTesting({
      ...provider().generator,
      gradeReasoningAnswer: async () => {
        throw new Error("must not be called");
      },
    });
    const res = await submit(student(), [mcqRight]);
    expect(res.status).toBe(201);
    expect(res.body.attempt.score).toBe(1);
  });
});
