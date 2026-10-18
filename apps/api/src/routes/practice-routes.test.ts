import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EXPLANATION_STRATEGIES, PRACTICE_ATTEMPT_CAP } from "@app/shared";
import { setAiProviderForTesting } from "../ai";
import type { ContentGenerator } from "../ai/generator";
import { MockGenerator } from "../ai/mock-generator";
import { createApp } from "../app";
import { nextStrategy } from "../services/practice-strategy";
import { signToken } from "../services/token-service";

// The adaptive practice loop, end to end through the real routes, service, scorer and the real
// mock AI provider. Repositories are in-memory fakes (no database) that follow the same rules as
// the real queries.
interface ProgressRow {
  studentId: string;
  objectiveId: string;
  status: "not_started" | "struggling" | "mastered";
  attemptsCount: number;
  strategiesTried: string[];
  currentExplanation: string | null;
  helpRequestedAt: Date | null;
  updatedAt: Date;
}
interface ExerciseRow {
  id: string;
  studentId: string;
  objectiveId: string;
  question: { options?: { id: string }[]; correct?: string[]; prompt: string };
  answeredAt: Date | null;
}
interface AttemptRow {
  studentId: string;
  objectiveId: string;
  exerciseId: string;
  exerciseContent: string;
  submittedAnswer: string;
  isCorrect: boolean;
  feedbackText: string | null;
  strategyUsed: string | null;
}

const store = vi.hoisted(() => ({
  OBJECTIVE_ID: "11111111-1111-4111-8111-111111111111",
  /** `${studentId}|${objectiveId}` pairs a student may practice (enrolled + published material). */
  access: new Set<string>(),
  progress: [] as ProgressRow[],
  exercises: [] as ExerciseRow[],
  attempts: [] as AttemptRow[],
  tallies: [] as { studentId: string; objectiveId: string; correct: number }[],
  usage: new Map<string, number>(),
  quotaLimit: 1000,
  tick: 0,
}));

const rowOf = (studentId: string, objectiveId: string) =>
  store.progress.find((p) => p.studentId === studentId && p.objectiveId === objectiveId);
const asProgressRecord = (row: ProgressRow) => ({ ...row });
const asExerciseRecord = (row: ExerciseRow) => ({
  id: row.id,
  objectiveId: row.objectiveId,
  question: row.question,
  answeredAt: row.answeredAt,
});

vi.mock("../repositories/practice-repository", () => {
  class ExerciseAlreadyAnsweredError extends Error {}
  return {
    ExerciseAlreadyAnsweredError,
    findPracticeObjective: async (studentId: string, objectiveId: string) =>
      store.access.has(`${studentId}|${objectiveId}`)
        ? {
            id: objectiveId,
            text: "Înțelege buclele while",
            chapterTitle: "Structuri repetitive",
            subjectTitle: "Informatică C++",
            language: "cpp",
          }
        : null,
    findProgress: async (studentId: string, objectiveId: string) => {
      const row = rowOf(studentId, objectiveId);
      return row ? asProgressRecord(row) : null;
    },
    findPendingExercise: async (studentId: string, objectiveId: string) => {
      const row = store.exercises
        .filter((e) => e.studentId === studentId && e.objectiveId === objectiveId && !e.answeredAt)
        .at(-1);
      return row ? asExerciseRecord(row) : null;
    },
    findExercise: async (studentId: string, objectiveId: string, exerciseId: string) => {
      const row = store.exercises.find(
        (e) => e.id === exerciseId && e.studentId === studentId && e.objectiveId === objectiveId,
      );
      return row ? asExerciseRecord(row) : null;
    },
    createExerciseEnsuringProgress: async (data: {
      studentId: string;
      objectiveId: string;
      question: ExerciseRow["question"];
    }) => {
      let progress = rowOf(data.studentId, data.objectiveId);
      if (!progress) {
        progress = {
          studentId: data.studentId,
          objectiveId: data.objectiveId,
          status: "not_started",
          attemptsCount: 0,
          strategiesTried: [],
          currentExplanation: null,
          helpRequestedAt: null,
          updatedAt: new Date(1_700_000_000_000 + ++store.tick),
        };
        store.progress.push(progress);
      }
      const exercise: ExerciseRow = {
        id: crypto.randomUUID(),
        studentId: data.studentId,
        objectiveId: data.objectiveId,
        question: data.question,
        answeredAt: null,
      };
      store.exercises.push(exercise);
      return { exercise: asExerciseRecord(exercise), progress: asProgressRecord(progress) };
    },
    markHelpRequested: async (studentId: string, objectiveId: string) => {
      const row = rowOf(studentId, objectiveId);
      if (row && !row.helpRequestedAt)
        row.helpRequestedAt = new Date(1_700_000_000_000 + ++store.tick);
      return row ? asProgressRecord(row) : null;
    },
    recordPracticeResult: async (data: {
      studentId: string;
      objectiveId: string;
      exerciseId: string;
      exerciseContent: string;
      submittedAnswer: string;
      isCorrect: boolean;
      feedbackText: string | null;
      strategyUsed: string | null;
      progress: Omit<ProgressRow, "studentId" | "objectiveId" | "updatedAt" | "helpRequestedAt">;
      nextQuestion: ExerciseRow["question"] | null;
    }) => {
      const exercise = store.exercises.find((e) => e.id === data.exerciseId);
      if (!exercise || exercise.answeredAt) throw new ExerciseAlreadyAnsweredError();
      exercise.answeredAt = new Date();
      store.attempts.push({
        studentId: data.studentId,
        objectiveId: data.objectiveId,
        exerciseId: data.exerciseId,
        exerciseContent: data.exerciseContent,
        submittedAnswer: data.submittedAnswer,
        isCorrect: data.isCorrect,
        feedbackText: data.feedbackText,
        strategyUsed: data.strategyUsed,
      });
      const progress = rowOf(data.studentId, data.objectiveId);
      if (!progress) throw new Error("no progress row");
      Object.assign(progress, data.progress, {
        updatedAt: new Date(1_700_000_000_000 + ++store.tick),
      });
      let nextExercise = null;
      if (data.nextQuestion) {
        const next: ExerciseRow = {
          id: crypto.randomUUID(),
          studentId: data.studentId,
          objectiveId: data.objectiveId,
          question: data.nextQuestion,
          answeredAt: null,
        };
        store.exercises.push(next);
        nextExercise = asExerciseRecord(next);
      }
      return { progress: asProgressRecord(progress), nextExercise };
    },
  };
});

vi.mock("../repositories/learning-stats-repository", () => ({
  addObjectiveTallies: async (
    studentId: string,
    tallies: { objectiveId: string; correct: number }[],
  ) => {
    for (const t of tallies) store.tallies.push({ studentId, ...t });
  },
}));

vi.mock("../repositories/ai-usage-repository", () => ({
  tryConsumeAiQuota: async (userId: string, day: string) => {
    const key = `${userId}|${day}`;
    const current = store.usage.get(key) ?? 0;
    if (current >= store.quotaLimit) return null;
    store.usage.set(key, current + 1);
    return current + 1;
  },
}));

// --- helpers --------------------------------------------------------------------------------

interface TestUser {
  id: string;
  cookie: string;
}
const makeUser = (role: "student" | "teacher" = "student"): TestUser => {
  const id = crypto.randomUUID();
  return { id, cookie: `token=${signToken({ userId: id, role })}` };
};
const makeEnrolledStudent = () => {
  const user = makeUser();
  store.access.add(`${user.id}|${store.OBJECTIVE_ID}`);
  return user;
};

let app: ReturnType<typeof createApp>;
const as = (user: TestUser, method: "get" | "post", path: string) =>
  request(app)[method](path).set("Cookie", user.cookie);

const O = () => store.OBJECTIVE_ID;
const start = (user: TestUser) => as(user, "post", `/api/objectives/${O()}/practice/start`).send();
const submit = (user: TestUser, exerciseId: string, body: unknown) =>
  as(user, "post", `/api/objectives/${O()}/practice/${exerciseId}/submit`).send(body as object);
const progressOf = (user: TestUser) => as(user, "get", `/api/objectives/${O()}/practice/progress`);

/** The stored exercise (with its key) behind an id the client received. */
const stored = (exerciseId: string) => {
  const row = store.exercises.find((e) => e.id === exerciseId);
  if (!row) throw new Error("unknown exercise");
  return row;
};
const rightAnswer = (exerciseId: string) => ({ optionIds: stored(exerciseId).question.correct });
const wrongAnswer = (exerciseId: string) => {
  const q = stored(exerciseId).question;
  const wrong = (q.options ?? []).find((o) => !(q.correct ?? []).includes(o.id));
  return { optionIds: [wrong?.id ?? "?"] };
};

function counting(overrides: Partial<ContentGenerator> = {}) {
  const mock = new MockGenerator();
  const calls = { exercise: 0, diagnosis: 0 };
  const provider: ContentGenerator = {
    provider: "mock",
    generateLesson: (input) => mock.generateLesson(input),
    generateQuiz: (input) => mock.generateQuiz(input),
    extractStyleNotes: (input) => mock.extractStyleNotes(input),
    solveQuestions: (input) => mock.solveQuestions(input),
    tutorReply: (input) => mock.tutorReply(input),
    generatePracticeExercise: async (input) => {
      calls.exercise++;
      return mock.generatePracticeExercise(input);
    },
    diagnosePracticeAnswer: async (input) => {
      calls.diagnosis++;
      return mock.diagnosePracticeAnswer(input);
    },
    gradeReasoningAnswer: (input) => mock.gradeReasoningAnswer(input),
    ...overrides,
  };
  return { provider, calls };
}

function collectKeys(value: unknown, keys = new Set<string>()): Set<string> {
  if (Array.isArray(value)) value.forEach((item) => collectKeys(item, keys));
  else if (value && typeof value === "object") {
    for (const [key, inner] of Object.entries(value)) {
      keys.add(key);
      collectKeys(inner, keys);
    }
  }
  return keys;
}
const FORBIDDEN_KEYS = ["correct", "acceptedAnswers", "referenceSolution", "rubric", "explanation"];

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  store.access.clear();
  store.progress.length = 0;
  store.exercises.length = 0;
  store.attempts.length = 0;
  store.tallies.length = 0;
  store.usage.clear();
  store.quotaLimit = 1000;
  app = createApp();
});
afterEach(() => {
  setAiProviderForTesting(null);
  vi.restoreAllMocks();
});

// --- strategy cycling -------------------------------------------------------------------------

describe("nextStrategy", () => {
  it("never repeats a strategy until all six are used, then wraps to the start", () => {
    const tried: (typeof EXPLANATION_STRATEGIES)[number][] = [];
    for (let i = 0; i < 6; i++) tried.push(nextStrategy(tried));
    expect(tried).toEqual([...EXPLANATION_STRATEGIES]);
    expect(new Set(tried).size).toBe(6);
    expect(nextStrategy(tried)).toBe("ANALOGIE"); // the 7th wraps instead of erroring
  });

  it("skips strategies already tried, whatever the order they were tried in", () => {
    expect(nextStrategy(["ANALOGIE", "EXEMPLU_LUCRAT"])).toBe("PAS_CU_PAS");
    expect(nextStrategy(["PAS_CU_PAS"])).toBe("ANALOGIE");
  });
});

describe("the loop", () => {
  it("rotates through the six strategies with no repeat and stops at the cap", async () => {
    const { provider, calls } = counting();
    setAiProviderForTesting(provider);
    const ana = makeEnrolledStudent();

    const first = await start(ana);
    expect(first.status).toBe(200);
    expect(first.body.progress).toMatchObject({ status: "not_started", attemptsCount: 0 });

    let exerciseId: string = first.body.exercise.id;
    const used: string[] = [];
    for (let attempt = 1; attempt <= PRACTICE_ATTEMPT_CAP; attempt++) {
      const res = await submit(ana, exerciseId, wrongAnswer(exerciseId));
      expect(res.status).toBe(200);
      expect(res.body.correct).toBe(false);
      used.push(res.body.strategyUsed);
      expect(res.body.progress.strategiesTried).toEqual(used);
      expect(new Set(used).size).toBe(used.length); // no duplicate before all six are used
      expect(res.body.progress).toMatchObject({ status: "struggling", attemptsCount: attempt });
      expect(res.body.feedback.length).toBeGreaterThan(0);
      expect(res.body.explanation).toContain(res.body.strategyUsed);

      if (attempt < PRACTICE_ATTEMPT_CAP) {
        expect(res.body.capped).toBeUndefined();
        exerciseId = res.body.nextExercise.id;
      } else {
        expect(res.body.capped).toBe(true);
        expect(res.body.nextExercise).toBeUndefined();
      }
    }
    expect(used).toEqual([...EXPLANATION_STRATEGIES]);

    // The cap: 1 exercise at start + 5 next exercises; the 6th wrong answer generated none.
    expect(calls.exercise).toBe(PRACTICE_ATTEMPT_CAP);
    expect(calls.diagnosis).toBe(PRACTICE_ATTEMPT_CAP);
    // Every attempt is logged, capped one included; strategy_used is the one that PRECEDED it.
    expect(store.attempts).toHaveLength(PRACTICE_ATTEMPT_CAP);
    expect(store.attempts.map((a) => a.strategyUsed)).toEqual([null, ...used.slice(0, 5)]);
    expect(store.attempts.every((a) => !a.isCorrect && a.feedbackText)).toBe(true);

    const again = await start(ana);
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe("PRACTICE_CAPPED");
  });

  it("a correct answer masters the objective and never calls the wrong-answer AI path", async () => {
    const { provider, calls } = counting();
    setAiProviderForTesting(provider);
    const ana = makeEnrolledStudent();
    const started = await start(ana);

    const res = await submit(ana, started.body.exercise.id, rightAnswer(started.body.exercise.id));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      correct: true,
      progress: expect.objectContaining({
        status: "mastered",
        attemptsCount: 1,
        strategiesTried: [],
      }),
    });
    expect(calls.diagnosis).toBe(0);
    expect(calls.exercise).toBe(1); // only the one from start
    expect(store.attempts).toMatchObject([
      { isCorrect: true, feedbackText: null, strategyUsed: null },
    ]);
    expect(store.tallies).toMatchObject([{ studentId: ana.id, correct: 1 }]);
    expect((await progressOf(ana)).body.progress.status).toBe("mastered");
  });

  it("wrong, wrong, right: strategies differ, then mastered with the attempts counted", async () => {
    const ana = makeEnrolledStudent();
    const started = await start(ana);
    const one = await submit(ana, started.body.exercise.id, wrongAnswer(started.body.exercise.id));
    const two = await submit(ana, one.body.nextExercise.id, wrongAnswer(one.body.nextExercise.id));
    expect(one.body.strategyUsed).not.toBe(two.body.strategyUsed);
    const three = await submit(
      ana,
      two.body.nextExercise.id,
      rightAnswer(two.body.nextExercise.id),
    );
    expect(three.body.progress).toMatchObject({
      status: "mastered",
      attemptsCount: 3,
      strategiesTried: [one.body.strategyUsed, two.body.strategyUsed],
    });
    expect(store.attempts.map((a) => a.isCorrect)).toEqual([false, false, true]);
  });

  it("start returns the unanswered exercise again without another AI call", async () => {
    const { provider, calls } = counting();
    setAiProviderForTesting(provider);
    const ana = makeEnrolledStudent();
    const a = await start(ana);
    const b = await start(ana);
    expect(b.body.exercise.id).toBe(a.body.exercise.id);
    expect(calls.exercise).toBe(1);
  });

  it("generates the next start with the last recorded strategy", async () => {
    const seen: unknown[] = [];
    const mock = new MockGenerator();
    setAiProviderForTesting(
      counting({
        generatePracticeExercise: async (input) => {
          seen.push(input.strategy);
          return mock.generatePracticeExercise(input);
        },
      }).provider,
    );
    const ana = makeEnrolledStudent();
    const started = await start(ana);
    const wrong = await submit(
      ana,
      started.body.exercise.id,
      wrongAnswer(started.body.exercise.id),
    );
    const right = await submit(
      ana,
      wrong.body.nextExercise.id,
      rightAnswer(wrong.body.nextExercise.id),
    );
    expect(right.body.correct).toBe(true);
    await start(ana); // mastered: practice again, from the last strategy
    expect(seen).toEqual([null, "ANALOGIE", "ANALOGIE"]);
  });

  it("rejects an unusable answer and a second answer to the same exercise", async () => {
    const ana = makeEnrolledStudent();
    const started = await start(ana);
    const id: string = started.body.exercise.id;
    expect((await submit(ana, id, {})).status).toBe(400);
    expect((await submit(ana, id, { optionIds: ["zzz"] })).status).toBe(400);
    expect((await submit(ana, id, rightAnswer(id))).status).toBe(200);
    const again = await submit(ana, id, rightAnswer(id));
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe("EXERCISE_ALREADY_SUBMITTED");
    expect(store.attempts).toHaveLength(1);
  });
});

// --- no answer key to the client --------------------------------------------------------------

describe("answer key", () => {
  it("never reaches the client in the start or submit responses", async () => {
    const ana = makeEnrolledStudent();
    const started = await start(ana);
    const wrong = await submit(
      ana,
      started.body.exercise.id,
      wrongAnswer(started.body.exercise.id),
    );
    const startedAgain = await start(ana);

    // `correct` and `explanation` are also legitimate top-level fields of the submit response
    // (the verdict and the new explanation), so the exercise parts are walked on their own.
    const exercises = [started.body, startedAgain.body, wrong.body.nextExercise];
    for (const exercise of exercises) {
      const keys = collectKeys(JSON.parse(JSON.stringify(exercise)));
      for (const forbidden of FORBIDDEN_KEYS) expect(keys.has(forbidden)).toBe(false);
      expect(keys.has("verification")).toBe(false);
    }
    expect(Object.keys(wrong.body).sort()).toEqual([
      "correct",
      "explanation",
      "feedback",
      "nextExercise",
      "progress",
      "strategyUsed",
    ]);
    expect(Object.keys(wrong.body.nextExercise.question).sort()).toEqual([
      "id",
      "objectiveId",
      "options",
      "prompt",
      "type",
    ]);
    for (const body of [started.body, wrong.body, startedAgain.body]) {
      expect(JSON.stringify(body)).not.toContain("Varianta corectă"); // the mock's key explanation
    }
    // The key exists server-side, it is just never sent.
    expect(stored(started.body.exercise.id).question.correct).toBeDefined();
  });

  it("is not stored in practice_attempts, only the question text", async () => {
    const ana = makeEnrolledStudent();
    const started = await start(ana);
    await submit(ana, started.body.exercise.id, wrongAnswer(started.body.exercise.id));
    expect(store.attempts[0]?.exerciseContent).toBe(started.body.exercise.question.prompt);
    expect(Object.keys(store.attempts[0] ?? {})).not.toContain("correct");
  });
});

// --- ownership ----------------------------------------------------------------------------------

describe("access", () => {
  it("is student-only: teacher 403, anonymous 401", async () => {
    const teacher = makeUser("teacher");
    const id = crypto.randomUUID();
    const routes: ["get" | "post", string][] = [
      ["post", `/api/objectives/${O()}/practice/start`],
      ["post", `/api/objectives/${O()}/practice/${id}/submit`],
      ["get", `/api/objectives/${O()}/practice/progress`],
    ];
    for (const [method, path] of routes) {
      expect((await request(app)[method](path).send({})).status, path).toBe(401);
      expect((await as(teacher, method, path).send({})).status, path).toBe(403);
    }
  });

  it("answers 404 to a student with no access to the objective, on every endpoint", async () => {
    const ana = makeEnrolledStudent();
    const outsider = makeUser();
    const started = await start(ana);
    expect((await start(outsider)).status).toBe(404);
    const res = await submit(
      outsider,
      started.body.exercise.id,
      wrongAnswer(started.body.exercise.id),
    );
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("OBJECTIVE_NOT_FOUND");
    expect((await progressOf(outsider)).status).toBe(404);
    expect(store.attempts).toHaveLength(0);
  });

  it("answers 404 when another enrolled student uses someone else's exercise, and sees only their own progress", async () => {
    const ana = makeEnrolledStudent();
    const bob = makeEnrolledStudent();
    const started = await start(ana);
    const res = await submit(bob, started.body.exercise.id, rightAnswer(started.body.exercise.id));
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("EXERCISE_NOT_FOUND");
    expect((await progressOf(bob)).body.error.code).toBe("PROGRESS_NOT_FOUND");
    expect((await progressOf(ana)).status).toBe(200);
    expect(stored(started.body.exercise.id).answeredAt).toBeNull();
  });

  it("validates the ids", async () => {
    const ana = makeEnrolledStudent();
    expect((await as(ana, "post", "/api/objectives/nope/practice/start").send()).status).toBe(400);
  });
});

// --- asking the teacher for help ---------------------------------------------------------------

describe("POST /api/objectives/:id/practice/request-help", () => {
  const help = (user: TestUser) =>
    as(user, "post", `/api/objectives/${O()}/practice/request-help`).send();

  /** Gets a student to the cap with six wrong answers. */
  async function capOut(user: TestUser) {
    let exerciseId: string = (await start(user)).body.exercise.id;
    for (let i = 0; i < PRACTICE_ATTEMPT_CAP; i++) {
      const res = await submit(user, exerciseId, wrongAnswer(exerciseId));
      exerciseId = res.body.nextExercise?.id;
    }
  }

  it("rejects an objective that is not capped (never started, in progress, mastered)", async () => {
    const ana = makeEnrolledStudent();
    const never = await help(ana);
    expect(never.status).toBe(404);
    expect(never.body.error.code).toBe("PROGRESS_NOT_FOUND");

    const started = await start(ana);
    const first = await submit(
      ana,
      started.body.exercise.id,
      wrongAnswer(started.body.exercise.id),
    );
    const inProgress = await help(ana);
    expect(inProgress.status).toBe(409);
    expect(inProgress.body.error.code).toBe("PRACTICE_NOT_CAPPED");

    await submit(ana, first.body.nextExercise.id, rightAnswer(first.body.nextExercise.id));
    expect((await help(ana)).status).toBe(409); // mastered
    expect(rowOf(ana.id, O())?.helpRequestedAt).toBeNull();
  });

  it("sets the flag once a student is capped, and a second request keeps the first timestamp", async () => {
    const ana = makeEnrolledStudent();
    await capOut(ana);
    const one = await help(ana);
    expect(one.status).toBe(200);
    expect(one.body.progress.helpRequestedAt).toEqual(expect.any(String));
    const two = await help(ana);
    expect(two.body.progress.helpRequestedAt).toBe(one.body.progress.helpRequestedAt);
    expect((await progressOf(ana)).body.progress.helpRequestedAt).toBe(
      one.body.progress.helpRequestedAt,
    );
  });

  it("is own-progress only: another student, an outsider, a teacher and anonymous are refused", async () => {
    const ana = makeEnrolledStudent();
    const bob = makeEnrolledStudent();
    const outsider = makeUser();
    await capOut(ana);
    expect((await help(bob)).status).toBe(404); // bob has no progress of his own
    expect(rowOf(ana.id, O())?.helpRequestedAt).toBeNull(); // and ana's flag is untouched
    expect((await help(outsider)).status).toBe(404);
    expect((await help(makeUser("teacher"))).status).toBe(403);
    expect((await request(app).post(`/api/objectives/${O()}/practice/request-help`)).status).toBe(
      401,
    );
  });
});

// --- quota and availability ---------------------------------------------------------------------

describe("quota and AI availability", () => {
  it("start: 429 QUOTA_EXCEEDED when the daily quota is used up", async () => {
    const ana = makeEnrolledStudent();
    store.quotaLimit = 0;
    const res = await start(ana);
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe("QUOTA_EXCEEDED");
    expect(store.progress).toHaveLength(0);
  });

  it("start: 503 AI_UNAVAILABLE when the provider fails, leaving nothing behind", async () => {
    setAiProviderForTesting(
      counting({
        generatePracticeExercise: async () => {
          throw new Error("boom");
        },
      }).provider,
    );
    const ana = makeEnrolledStudent();
    const res = await start(ana);
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe("AI_UNAVAILABLE");
    expect(JSON.stringify(res.body)).not.toContain("boom");
    expect(store.progress).toHaveLength(0);
    expect(store.exercises).toHaveLength(0);
  });

  it("start: 503 when the provider returns an invalid exercise (programming is not gradable)", async () => {
    const mock = new MockGenerator();
    setAiProviderForTesting(
      counting({
        generatePracticeExercise: async () => ({
          question: {
            id: "q1",
            type: "programming",
            prompt: "Scrie un program",
            referenceSolution: "x",
            rubric: "y",
            objectiveId: store.OBJECTIVE_ID,
          },
        }),
        tutorReply: (input) => mock.tutorReply(input),
      }).provider,
    );
    const res = await start(makeEnrolledStudent());
    expect(res.status).toBe(503);
  });

  it("submit: 503 when the diagnosis fails; the exercise stays unanswered and can be resent", async () => {
    const mock = new MockGenerator();
    let failing = true;
    setAiProviderForTesting(
      counting({
        diagnosePracticeAnswer: async (input) => {
          if (failing) throw new Error("down");
          return mock.diagnosePracticeAnswer(input);
        },
      }).provider,
    );
    const ana = makeEnrolledStudent();
    const started = await start(ana);
    const id: string = started.body.exercise.id;
    const res = await submit(ana, id, wrongAnswer(id));
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe("AI_UNAVAILABLE");
    expect(store.attempts).toHaveLength(0);
    expect(stored(id).answeredAt).toBeNull();
    expect(rowOf(ana.id, O())).toMatchObject({ attemptsCount: 0, strategiesTried: [] });

    failing = false;
    expect((await submit(ana, id, wrongAnswer(id))).status).toBe(200);
  });

  it("submit: 503 when the next exercise cannot be generated, and nothing is saved", async () => {
    const mock = new MockGenerator();
    let calls = 0;
    setAiProviderForTesting(
      counting({
        generatePracticeExercise: async (input) => {
          if (++calls > 1) throw new Error("down");
          return mock.generatePracticeExercise(input);
        },
      }).provider,
    );
    const ana = makeEnrolledStudent();
    const started = await start(ana);
    const id: string = started.body.exercise.id;
    expect((await submit(ana, id, wrongAnswer(id))).status).toBe(503);
    expect(store.attempts).toHaveLength(0);
    expect(stored(id).answeredAt).toBeNull();
  });

  it("submit: 429 when the quota runs out after the start, and a correct answer needs no quota", async () => {
    const ana = makeEnrolledStudent();
    const started = await start(ana);
    const id: string = started.body.exercise.id;
    store.quotaLimit = 1; // the start used the only unit
    const res = await submit(ana, id, wrongAnswer(id));
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe("QUOTA_EXCEEDED");
    expect(store.attempts).toHaveLength(0);

    const ok = await submit(ana, id, rightAnswer(id));
    expect(ok.status).toBe(200);
    expect(ok.body.correct).toBe(true);
  });
});
