import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_POLICY } from "@app/shared";
import { setAiProviderForTesting } from "../ai";
import type { ContentGenerator, TutorInput } from "../ai/generator";
import { MockGenerator } from "../ai/mock-generator";
import { createApp } from "../app";
import { signToken } from "../services/token-service";

// Personal learning space, end to end through the real routes, services, scoring, adaptive rules
// and the real mock AI provider. Repositories are in-memory fakes (no database) that follow the
// same scope rules as the real queries; the real repository where-clauses are checked in
// repositories/scope-boundary.test.ts.
interface MaterialRow {
  id: string;
  ownerId: string;
  scope: "class" | "personal";
  kind: "lesson" | "test" | "problem" | "exercise";
  title: string;
  status: "draft" | "published";
  version: number;
  topicId: string | null;
  content: unknown;
  createdAt: Date;
  publishedAt: Date | null;
  // Columns of the real row that class summaries read.
  subjectId?: string | null;
  chapterId?: string | null;
  source?: string;
  parentId?: string | null;
}
interface PolicyRow {
  studentId: string;
  topicId: string | null;
  version: number;
  explanationLevel: string;
  exampleFirst: boolean;
  scaffolding: string;
  hintsEnabled: boolean;
  reasonCode: string | null;
  note: string | null;
  createdAt: Date;
}
interface AttemptRow {
  id: string;
  studentId: string;
  materialId: string;
  submittedAt: Date;
  score: number;
  maxScore: number;
  answers: {
    questionId: string;
    answer: unknown;
    isCorrect: boolean | null;
    objectiveId: string | null;
  }[];
}

const store = vi.hoisted(() => ({
  topics: [] as { id: string; studentId: string; title: string; goal: string; createdAt: Date }[],
  objectiveByTopic: new Map<string, string>(),
  messages: [] as {
    id: string;
    studentId: string;
    topicId: string;
    role: "user" | "tutor";
    content: string;
    createdAt: Date;
  }[],
  materials: [] as MaterialRow[],
  assignments: [] as { materialId: string; classId: string }[],
  enrollments: [] as { classId: string; studentId: string }[],
  attempts: [] as AttemptRow[],
  stats: new Map<string, { attempts: number; correct: number; hintsUsed: number }>(),
  policies: [] as PolicyRow[],
  usage: new Map<string, number>(),
  tick: 0,
}));

const nextTime = () => new Date(1_700_000_000_000 + ++store.tick * 60_000);

vi.mock("../repositories/topic-repository", () => ({
  createTopic: async (data: { studentId: string; title: string; goal: string }) => {
    const row = { id: crypto.randomUUID(), createdAt: nextTime(), ...data };
    store.topics.push(row);
    store.objectiveByTopic.set(row.id, crypto.randomUUID());
    return { ...row };
  },
  countTopicsByStudent: async (studentId: string) =>
    store.topics.filter((t) => t.studentId === studentId).length,
  listTopicsByStudent: async (studentId: string) =>
    store.topics.filter((t) => t.studentId === studentId).reverse(),
  findTopicById: async (id: string) => store.topics.find((t) => t.id === id) ?? null,
  findTopicObjective: async (topicId: string) => {
    const id = store.objectiveByTopic.get(topicId);
    const topic = store.topics.find((t) => t.id === topicId);
    return id && topic ? { id, text: topic.goal } : null;
  },
  deleteTopicCascade: async (topicId: string) => {
    const materialIds = store.materials.filter((m) => m.topicId === topicId).map((m) => m.id);
    const keep = <T>(list: T[], drop: (item: T) => boolean) => {
      const kept = list.filter((item) => !drop(item));
      list.length = 0;
      list.push(...kept);
    };
    keep(store.attempts, (a) => materialIds.includes(a.materialId));
    keep(store.materials, (m) => m.topicId === topicId);
    keep(store.messages, (m) => m.topicId === topicId);
    keep(store.policies, (p) => p.topicId === topicId);
    keep(store.topics, (t) => t.id === topicId);
    store.objectiveByTopic.delete(topicId);
  },
}));

vi.mock("../repositories/tutor-repository", () => ({
  listRecentMessages: async (studentId: string, topicId: string, take: number) =>
    store.messages
      .filter((m) => m.studentId === studentId && m.topicId === topicId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .slice(-take),
  appendExchange: async (data: {
    studentId: string;
    topicId: string;
    userContent: string;
    tutorContent: string;
  }) => {
    const base = { studentId: data.studentId, topicId: data.topicId };
    store.messages.push({
      id: crypto.randomUUID(),
      ...base,
      role: "user",
      content: data.userContent,
      createdAt: nextTime(),
    });
    const reply = {
      id: crypto.randomUUID(),
      ...base,
      role: "tutor" as const,
      content: data.tutorContent,
      createdAt: nextTime(),
    };
    store.messages.push(reply);
    return reply;
  },
}));

vi.mock("../repositories/personal-material-repository", () => ({
  createPersonalMaterial: async (data: {
    ownerId: string;
    topicId: string;
    kind: MaterialRow["kind"];
    title: string;
    content: unknown;
  }) => {
    const row: MaterialRow = {
      id: crypto.randomUUID(),
      scope: "personal",
      status: "draft",
      version: 1,
      publishedAt: null,
      createdAt: nextTime(),
      ...data,
    };
    store.materials.push(row);
    return { ...row, topicId: data.topicId };
  },
  listPersonalMaterials: async (ownerId: string, topicId: string) =>
    store.materials.filter(
      (m) => m.scope === "personal" && m.ownerId === ownerId && m.topicId === topicId,
    ),
  findPersonalMaterial: async (ownerId: string, topicId: string, id: string) =>
    store.materials.find(
      (m) =>
        m.id === id && m.scope === "personal" && m.ownerId === ownerId && m.topicId === topicId,
    ) ?? null,
}));

vi.mock("../repositories/material-repository", () => ({
  findMaterialById: async (id: string) => store.materials.find((m) => m.id === id) ?? null,
  isAssignedToStudent: async (materialId: string, studentId: string) =>
    store.assignments.some(
      (a) =>
        a.materialId === materialId &&
        store.enrollments.some((e) => e.classId === a.classId && e.studentId === studentId),
    ),
  listPublishedForStudent: async (studentId: string, classId?: string) =>
    store.materials.filter(
      (m) =>
        m.scope === "class" &&
        m.status === "published" &&
        store.assignments.some(
          (a) =>
            a.materialId === m.id &&
            (!classId || a.classId === classId) &&
            store.enrollments.some((e) => e.classId === a.classId && e.studentId === studentId),
        ),
    ),
  listMaterialsByOwner: async (ownerId: string) =>
    store.materials.filter((m) => m.scope === "class" && m.ownerId === ownerId),
}));

vi.mock("../repositories/attempt-repository", () => ({
  findExistingObjectiveIds: async (ids: string[]) =>
    new Set(ids.filter((id) => [...store.objectiveByTopic.values()].includes(id))),
  createAttempt: async (data: Omit<AttemptRow, "id" | "submittedAt">) => {
    const row: AttemptRow = { ...data, id: crypto.randomUUID(), submittedAt: nextTime() };
    store.attempts.push(row);
    return row;
  },
  findAttemptById: async (id: string) => store.attempts.find((a) => a.id === id) ?? null,
}));

vi.mock("../repositories/learning-stats-repository", () => ({
  addObjectiveTallies: async (
    studentId: string,
    tallies: { objectiveId: string; attempts: number; correct: number }[],
  ) => {
    for (const t of tallies) {
      const key = `${studentId}/${t.objectiveId}`;
      const old = store.stats.get(key) ?? { attempts: 0, correct: 0, hintsUsed: 0 };
      store.stats.set(key, {
        ...old,
        attempts: old.attempts + t.attempts,
        correct: old.correct + t.correct,
      });
    }
  },
  listTopicAttempts: async (studentId: string, topicId: string, take: number) =>
    store.attempts
      .filter((a) => {
        const m = store.materials.find((x) => x.id === a.materialId);
        return a.studentId === studentId && m?.scope === "personal" && m.topicId === topicId;
      })
      .sort((a, b) => b.submittedAt.getTime() - a.submittedAt.getTime())
      .slice(0, take),
}));

vi.mock("../repositories/policy-repository", () => ({
  findLatestGlobalPolicy: async (studentId: string) =>
    store.policies
      .filter((p) => p.studentId === studentId && p.topicId === null)
      .sort((a, b) => b.version - a.version)[0] ?? null,
  findLatestPolicyVersion: async (studentId: string, topicId: string | null) =>
    store.policies
      .filter((p) => p.studentId === studentId && p.topicId === topicId)
      .sort((a, b) => b.version - a.version)[0] ?? null,
  insertTopicPolicyVersion: async (data: Omit<PolicyRow, "createdAt">) => {
    if (
      store.policies.some(
        (p) =>
          p.studentId === data.studentId &&
          p.topicId === data.topicId &&
          p.version === data.version,
      )
    ) {
      return false;
    }
    store.policies.push({ ...data, createdAt: nextTime() });
    return true;
  },
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

// --- helpers --------------------------------------------------------------------------------

interface TestUser {
  id: string;
  cookie: string;
}
const makeUser = (role: "student" | "teacher" = "student"): TestUser => {
  const id = crypto.randomUUID();
  return { id, cookie: `token=${signToken({ userId: id, role })}` };
};

let app: ReturnType<typeof createApp>;
const as = (user: TestUser, method: "get" | "post" | "delete" | "put", path: string) =>
  request(app)[method](path).set("Cookie", user.cookie);

async function newTopic(user: TestUser, goal = "Să înțeleg cum funcționează un firewall") {
  const res = await as(user, "post", "/api/me/topics").send({ title: "Rețele", goal });
  expect(res.status).toBe(201);
  return res.body.topic as { id: string; title: string; goal: string };
}

/** A personal quiz of `n` mcq questions (answer "a" is right), tied to the topic's objective. */
function seedQuiz(user: TestUser, topicId: string, n: number): MaterialRow {
  const objectiveId = store.objectiveByTopic.get(topicId) ?? "";
  const row: MaterialRow = {
    id: crypto.randomUUID(),
    ownerId: user.id,
    scope: "personal",
    kind: "test",
    title: "Test",
    status: "draft",
    version: 1,
    topicId,
    createdAt: nextTime(),
    publishedAt: null,
    content: {
      objectives: [{ id: objectiveId, text: "obiectiv" }],
      questions: Array.from({ length: n }, (_, i) => ({
        id: `q${i + 1}`,
        type: "mcq",
        prompt: `Întrebarea ${i + 1}`,
        options: [
          { id: "a", text: "A" },
          { id: "b", text: "B" },
        ],
        correct: ["a"],
        explanation: "SECRET-EXPLICATIE",
        objectiveId,
        verification: "unchecked",
      })),
      generation: { provider: "mock" },
    },
  };
  store.materials.push(row);
  return row;
}

/** Submits an attempt: `pattern[i]` true = answer question i correctly. */
function submit(user: TestUser, material: MaterialRow, pattern: boolean[]) {
  return as(user, "post", `/api/materials/${material.id}/attempts`).send({
    answers: pattern.map((ok, i) => ({ questionId: `q${i + 1}`, optionIds: [ok ? "a" : "b"] })),
  });
}
const policyOf = (user: TestUser, topicId: string) =>
  as(user, "get", `/api/me/topics/${topicId}/policy`);

function capturing() {
  const mock = new MockGenerator();
  const seen = { tutor: [] as TutorInput[], lessons: [] as unknown[], quizzes: [] as unknown[] };
  const provider: ContentGenerator = {
    provider: "mock",
    generateLesson: async (input) => {
      seen.lessons.push(input);
      return mock.generateLesson(input);
    },
    generateQuiz: async (input) => {
      seen.quizzes.push(input);
      return mock.generateQuiz(input);
    },
    extractStyleNotes: (input) => mock.extractStyleNotes(input),
    solveQuestions: (input) => mock.solveQuestions(input),
    tutorReply: async (input) => {
      seen.tutor.push(input);
      return mock.tutorReply(input);
    },
  };
  return { provider, seen };
}

const KEY_NAMES = [
  "correct",
  "acceptedAnswers",
  "referenceSolution",
  "rubric",
  "explanation",
  "verification",
];
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

beforeEach(() => {
  for (const key of Object.keys(store) as (keyof typeof store)[]) {
    const value = store[key];
    if (Array.isArray(value)) value.length = 0;
    else if (value instanceof Map) value.clear();
  }
  store.tick = 0;
  app = createApp();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => {
  setAiProviderForTesting(null);
  vi.restoreAllMocks();
});

// --- topics ---------------------------------------------------------------------------------

describe("topics: create, list, delete", () => {
  it("creates a topic for the session's student and ignores identity fields in the body", async () => {
    const ana = makeUser();
    const other = makeUser();
    const res = await as(ana, "post", "/api/me/topics").send({
      title: "Securitate",
      goal: "Phishing",
      studentId: other.id,
      id: "x",
    });
    expect(res.status).toBe(201);
    expect(res.body.topic).toMatchObject({ title: "Securitate", goal: "Phishing" });
    expect(store.topics[0]?.studentId).toBe(ana.id);
    expect(JSON.stringify(res.body)).not.toContain(ana.id);
  });

  it("accepts any topic, not only networking or security", async () => {
    const ana = makeUser();
    expect(
      (await as(ana, "post", "/api/me/topics").send({ title: "Grafuri", goal: "BFS și DFS" }))
        .status,
    ).toBe(201);
  });

  it("validates: goal up to 300 characters, non-empty title, no NUL", async () => {
    const ana = makeUser();
    const post = (body: object) => as(ana, "post", "/api/me/topics").send(body);
    expect((await post({ title: "T", goal: "g".repeat(300) })).status).toBe(201);
    expect((await post({ title: "T", goal: "g".repeat(301) })).status).toBe(400);
    expect((await post({ title: "  ", goal: "g" })).status).toBe(400);
    expect((await post({ title: "T", goal: "" })).status).toBe(400);
    expect((await post({ title: "T", goal: "a\u0000b" })).status).toBe(400);
    expect((await post({ title: "T" })).status).toBe(400);
  });

  it("caps the number of topics per student with a 409", async () => {
    const ana = makeUser();
    for (let i = 0; i < 20; i++) await newTopic(ana);
    const res = await as(ana, "post", "/api/me/topics").send({ title: "T", goal: "g" });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("TOPIC_LIMIT_REACHED");
    // The cap is per student.
    expect(
      (await as(makeUser(), "post", "/api/me/topics").send({ title: "T", goal: "g" })).status,
    ).toBe(201);
  });

  it("lists only the caller's own topics", async () => {
    const ana = makeUser();
    const bob = makeUser();
    const mine = await newTopic(ana);
    await newTopic(bob);
    const res = await as(ana, "get", "/api/me/topics");
    expect(res.status).toBe(200);
    expect(res.body.topics.map((t: { id: string }) => t.id)).toEqual([mine.id]);
  });

  it("is student-only: teachers 403, anonymous 401, on every route", async () => {
    const teacher = makeUser("teacher");
    const id = crypto.randomUUID();
    const routes: ["get" | "post" | "delete", string][] = [
      ["post", "/api/me/topics"],
      ["get", "/api/me/topics"],
      ["delete", `/api/me/topics/${id}`],
      ["get", `/api/me/topics/${id}/policy`],
      ["get", `/api/me/topics/${id}/tutor-messages`],
      ["post", `/api/me/topics/${id}/tutor`],
      ["post", `/api/me/topics/${id}/lesson`],
      ["post", `/api/me/topics/${id}/quiz`],
      ["get", `/api/me/topics/${id}/materials`],
      ["get", `/api/me/topics/${id}/materials/${id}`],
    ];
    for (const [method, path] of routes) {
      expect((await request(app)[method](path).send({})).status, `${method} ${path}`).toBe(401);
      expect((await as(teacher, method, path).send({})).status, `${method} ${path}`).toBe(403);
    }
  });

  it("deletes the topic and everything tied to it, and nothing that belongs to anyone else", async () => {
    const ana = makeUser();
    const bob = makeUser();
    const topic = await newTopic(ana);
    const bobTopic = await newTopic(bob);
    const quiz = seedQuiz(ana, topic.id, 3);
    seedQuiz(bob, bobTopic.id, 3);
    await submit(ana, quiz, [false, false, false]); // creates stats, an attempt and a policy
    await as(ana, "post", `/api/me/topics/${topic.id}/tutor`).send({ message: "salut" });
    expect(store.policies).toHaveLength(1);

    const res = await as(ana, "delete", `/api/me/topics/${topic.id}`);
    expect(res.status).toBe(204);
    expect(store.topics.map((t) => t.id)).toEqual([bobTopic.id]);
    expect(store.messages.filter((m) => m.topicId === topic.id)).toEqual([]);
    expect(store.materials.map((m) => m.topicId)).toEqual([bobTopic.id]);
    expect(store.attempts).toEqual([]);
    expect(store.policies).toEqual([]);
    expect((await as(ana, "delete", `/api/me/topics/${topic.id}`)).status).toBe(404);
  });
});

// --- ownership ------------------------------------------------------------------------------

describe("another student's topic is a 404, identical to a missing one", () => {
  it("covers read, delete, chat, generation, materials and policy; nothing changes, no quota used", async () => {
    const owner = makeUser();
    const intruder = makeUser();
    const topic = await newTopic(owner);
    const quiz = seedQuiz(owner, topic.id, 2);
    const messagesBefore = store.messages.length;
    const materialsBefore = store.materials.length;

    const calls = (id: string): ["get" | "post" | "delete", string, object][] => [
      ["get", `/api/me/topics/${id}/policy`, {}],
      ["post", `/api/me/topics/${id}/tutor`, { message: "salut" }],
      ["post", `/api/me/topics/${id}/lesson`, {}],
      ["post", `/api/me/topics/${id}/quiz`, {}],
      ["get", `/api/me/topics/${id}/materials`, {}],
      ["get", `/api/me/topics/${id}/materials/${quiz.id}`, {}],
      ["delete", `/api/me/topics/${id}`, {}],
    ];
    const real = calls(topic.id);
    const missing = calls(crypto.randomUUID());
    for (const [i, [method, path, body]] of real.entries()) {
      const res = await as(intruder, method, path).send(body);
      const gone = await as(intruder, method, missing[i]?.[1] ?? "").send(body);
      expect(res.status, `${method} ${path}`).toBe(404);
      expect(res.body.error.code).toBe("TOPIC_NOT_FOUND");
      expect(res.body.error).toEqual(gone.body.error);
    }

    expect(store.topics.map((t) => t.id)).toEqual([topic.id]);
    expect(store.messages).toHaveLength(messagesBefore);
    expect(store.materials).toHaveLength(materialsBefore);
    expect(store.usage.size).toBe(0);
  });

  it("does not hand over a material through the caller's own topic either", async () => {
    const owner = makeUser();
    const intruder = makeUser();
    const theirs = seedQuiz(owner, (await newTopic(owner)).id, 2);
    const mine = await newTopic(intruder);
    const res = await as(intruder, "get", `/api/me/topics/${mine.id}/materials/${theirs.id}`);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("MATERIAL_NOT_FOUND");
  });
});

// --- tutor ----------------------------------------------------------------------------------

describe("GET /api/me/topics/:id/tutor-messages", () => {
  const seedMessages = (user: TestUser, topicId: string, n: number) => {
    for (let i = 1; i <= n; i++) {
      store.messages.push({
        id: crypto.randomUUID(),
        studentId: user.id,
        topicId,
        role: i % 2 ? "user" : "tutor",
        content: `m${i}`,
        createdAt: nextTime(),
      });
    }
  };

  it("returns the owner's messages in chronological order, capped to the last 50", async () => {
    const ana = makeUser();
    const topic = await newTopic(ana);
    seedMessages(ana, topic.id, 55);
    const res = await as(ana, "get", `/api/me/topics/${topic.id}/tutor-messages`);
    expect(res.status).toBe(200);
    const contents = (res.body.messages as { content: string }[]).map((m) => m.content);
    expect(contents).toHaveLength(50);
    expect(contents[0]).toBe("m6");
    expect(contents[49]).toBe("m55");
    expect(Object.keys(res.body.messages[0]).sort()).toEqual([
      "content",
      "createdAt",
      "id",
      "role",
    ]);
  });

  it("answers 404 to another student, without revealing the messages", async () => {
    const ana = makeUser();
    const bob = makeUser();
    const topic = await newTopic(ana);
    seedMessages(ana, topic.id, 2);
    const res = await as(bob, "get", `/api/me/topics/${topic.id}/tutor-messages`);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("TOPIC_NOT_FOUND");
    expect(JSON.stringify(res.body)).not.toContain("m1");
  });

  it("only returns messages of the requested topic", async () => {
    const ana = makeUser();
    const first = await newTopic(ana);
    const second = await newTopic(ana);
    seedMessages(ana, first.id, 2);
    const res = await as(ana, "get", `/api/me/topics/${second.id}/tutor-messages`);
    expect(res.status).toBe(200);
    expect(res.body.messages).toEqual([]);
  });
});

describe("POST /api/me/topics/:id/tutor", () => {
  it("returns the validated reply and saves both messages", async () => {
    const ana = makeUser();
    const topic = await newTopic(ana);
    const res = await as(ana, "post", `/api/me/topics/${topic.id}/tutor`).send({
      message: "Ce este un firewall?",
    });
    expect(res.status).toBe(200);
    expect(res.body.message).toMatchObject({
      role: "tutor",
      content: expect.stringContaining("firewall"),
    });
    expect(res.body.quota).toEqual({ used: 1, limit: 3 });
    expect(store.messages.map((m) => [m.role, m.studentId])).toEqual([
      ["user", ana.id],
      ["tutor", ana.id],
    ]);
    expect(store.messages[0]?.content).toBe("Ce este un firewall?");
    expect(store.messages[1]?.content).toBe(res.body.message.content);
  });

  it("validates the message: up to 1000 characters, non-empty", async () => {
    const ana = makeUser();
    const topic = await newTopic(ana);
    const send = (message: unknown) =>
      as(ana, "post", `/api/me/topics/${topic.id}/tutor`).send({ message });
    expect((await send("m".repeat(1001))).status).toBe(400);
    expect((await send("   ")).status).toBe(400);
    expect((await send(undefined)).status).toBe(400);
    expect((await send("m".repeat(1000))).status).toBe(200);
    expect(store.messages).toHaveLength(2); // only the valid turn was saved
  });

  it("sends the topic goal, the question, the last 10 messages (oldest first) and the topic's policy", async () => {
    const { provider, seen } = capturing();
    setAiProviderForTesting(provider);
    const ana = makeUser();
    const topic = await newTopic(ana, "Obiectiv de test");
    for (let i = 1; i <= 15; i++) {
      store.messages.push({
        id: crypto.randomUUID(),
        studentId: ana.id,
        topicId: topic.id,
        role: i % 2 ? "user" : "tutor",
        content: `m${i}`,
        createdAt: nextTime(),
      });
    }
    store.policies.push({
      studentId: ana.id,
      topicId: topic.id,
      version: 1,
      explanationLevel: "advanced",
      exampleFirst: true,
      scaffolding: "high",
      hintsEnabled: false,
      reasonCode: "REPEATED_OBJECTIVE_ERRORS",
      note: "n",
      createdAt: nextTime(),
    });

    expect(
      (await as(ana, "post", `/api/me/topics/${topic.id}/tutor`).send({ message: "Întrebare?" }))
        .status,
    ).toBe(200);
    const input = seen.tutor[0];
    expect(input?.topicGoal).toBe("Obiectiv de test");
    expect(input?.question).toBe("Întrebare?");
    expect(input?.recentMessages.map((m) => m.content)).toEqual(
      Array.from({ length: 10 }, (_, i) => `m${i + 6}`),
    );
    expect(input?.policy).toEqual({
      explanationLevel: "advanced",
      exampleFirst: true,
      scaffolding: "high",
      hintsEnabled: false,
    });
  });

  it("passes no student identity to the provider", async () => {
    const { provider, seen } = capturing();
    setAiProviderForTesting(provider);
    const ana = makeUser();
    const topic = await newTopic(ana);
    await as(ana, "post", `/api/me/topics/${topic.id}/tutor`).send({ message: "salut" });
    const sent = JSON.stringify(seen.tutor);
    for (const value of [ana.id, topic.id, "studentId", "email", "displayName"]) {
      expect(sent).not.toContain(value);
    }
  });

  it("answers 503 and saves nothing when the AI is unavailable", async () => {
    const { provider } = capturing();
    setAiProviderForTesting({ ...provider, tutorReply: async () => ({ reply: "" }) });
    const ana = makeUser();
    const topic = await newTopic(ana);
    const res = await as(ana, "post", `/api/me/topics/${topic.id}/tutor`).send({
      message: "salut",
    });
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe("AI_UNAVAILABLE");
    expect(store.messages).toEqual([]);
  });
});

// --- generation + quota ---------------------------------------------------------------------

describe("personal lesson and quiz generation", () => {
  it("creates a usable personal material immediately, in personal mode, without an answer key in the response", async () => {
    const { provider, seen } = capturing();
    setAiProviderForTesting(provider);
    const ana = makeUser();
    const topic = await newTopic(ana);

    const quiz = await as(ana, "post", `/api/me/topics/${topic.id}/quiz`).send({ count: 4 });
    expect(quiz.status).toBe(201);
    expect(quiz.body.material.questions).toHaveLength(4);
    expect(quiz.body.quota).toEqual({ used: 1, limit: 3 });
    const lesson = await as(ana, "post", `/api/me/topics/${topic.id}/lesson`).send({});
    expect(lesson.status).toBe(201);
    expect(lesson.body.material.lesson.body).toEqual(expect.any(String));

    for (const body of [quiz.body, lesson.body]) {
      const found = keysOf(body);
      expect(KEY_NAMES.filter((k) => found.has(k))).toEqual([]);
    }
    // Stored as personal, owned by the student, tied to the topic, never published.
    expect(store.materials.map((m) => [m.scope, m.ownerId, m.topicId, m.status])).toEqual([
      ["personal", ana.id, topic.id, "draft"],
      ["personal", ana.id, topic.id, "draft"],
    ]);
    // Personal mode: no teacher chunks, no style notes, the safety rules apply.
    for (const input of [...seen.lessons, ...seen.quizzes] as {
      sourceChunks: string[];
      styleNotes: string | null;
      mode: string;
    }[]) {
      expect(input).toMatchObject({ sourceChunks: [], styleNotes: null, mode: "personal" });
    }
    // The student can open it at once, still without the key.
    const opened = await as(
      ana,
      "get",
      `/api/me/topics/${topic.id}/materials/${quiz.body.material.id}`,
    );
    expect(opened.status).toBe(200);
    expect(KEY_NAMES.filter((k) => keysOf(opened.body).has(k))).toEqual([]);
  });

  it("defaults the quiz to 6 test questions and validates count and kind", async () => {
    const ana = makeUser();
    const topic = await newTopic(ana);
    const quiz = (body: object) => as(ana, "post", `/api/me/topics/${topic.id}/quiz`).send(body);
    expect((await quiz({ count: 0 })).status).toBe(400);
    expect((await quiz({ count: 21 })).status).toBe(400);
    expect((await quiz({ kind: "lesson" })).status).toBe(400);
    expect((await quiz({ kind: "exam" })).status).toBe(400);
    const ok = await quiz({});
    expect(ok.status).toBe(201);
    expect(ok.body.material.kind).toBe("test");
    expect(ok.body.material.questions).toHaveLength(6);
  });

  it("returns 429 QUOTA_EXCEEDED on the shared daily counter, in the teacher quota's shape", async () => {
    const ana = makeUser();
    const topic = await newTopic(ana);
    expect((await as(ana, "post", `/api/me/topics/${topic.id}/lesson`).send({})).status).toBe(201);
    expect((await as(ana, "post", `/api/me/topics/${topic.id}/quiz`).send({})).status).toBe(201);
    expect(
      (await as(ana, "post", `/api/me/topics/${topic.id}/tutor`).send({ message: "x" })).status,
    ).toBe(200);

    const before = { materials: store.materials.length, messages: store.messages.length };
    for (const [path, body] of [
      [`/api/me/topics/${topic.id}/quiz`, {}],
      [`/api/me/topics/${topic.id}/lesson`, {}],
      [`/api/me/topics/${topic.id}/tutor`, { message: "x" }],
    ] as const) {
      const res = await as(ana, "post", path).send(body);
      expect(res.status).toBe(429);
      expect(res.body).toEqual({
        error: {
          code: "QUOTA_EXCEEDED",
          message: "Ai atins limita zilnică de generări cu AI. Încearcă din nou mâine.",
          details: { limit: 3 },
        },
      });
    }
    expect(store.materials).toHaveLength(before.materials); // nothing created
    expect(store.messages).toHaveLength(before.messages);
    // Per student: someone else still has a full budget.
    const bob = makeUser();
    const bobTopic = await newTopic(bob);
    expect((await as(bob, "post", `/api/me/topics/${bobTopic.id}/lesson`).send({})).status).toBe(
      201,
    );
  });

  it("answers 503 and creates nothing when the AI is unavailable", async () => {
    const { provider } = capturing();
    setAiProviderForTesting({ ...provider, generateQuiz: async () => ({ questions: [] }) });
    const ana = makeUser();
    const topic = await newTopic(ana);
    const res = await as(ana, "post", `/api/me/topics/${topic.id}/quiz`).send({});
    expect(res.status).toBe(503);
    expect(store.materials).toEqual([]);
  });
});

// --- scope boundary -------------------------------------------------------------------------

describe("personal and class materials never mix", () => {
  function seedClassMaterial(teacher: TestUser, student: TestUser): MaterialRow {
    const classId = crypto.randomUUID();
    const row: MaterialRow = {
      id: crypto.randomUUID(),
      ownerId: teacher.id,
      scope: "class",
      kind: "test",
      title: "Material de clasă",
      status: "published",
      version: 1,
      topicId: null,
      subjectId: null,
      chapterId: null,
      source: "manual",
      parentId: null,
      createdAt: nextTime(),
      publishedAt: nextTime(),
      content: {
        section: "programa",
        language: "cpp",
        grade: 9,
        objectives: [{ id: "o1", text: "Obiectiv" }],
        questions: [
          {
            id: "q1",
            type: "short",
            prompt: "Cuvânt?",
            acceptedAnswers: ["while"],
            objectiveId: "o1",
            verification: "teacher_confirmed",
          },
        ],
      },
    };
    store.materials.push(row);
    store.assignments.push({ materialId: row.id, classId });
    store.enrollments.push({ classId, studentId: student.id });
    return row;
  }

  it("a personal material appears in no class-scoped listing or read", async () => {
    const teacher = makeUser("teacher");
    const ana = makeUser();
    const topic = await newTopic(ana);
    const personal = seedQuiz(ana, topic.id, 2);
    // Hostile rows the database would not normally allow: published AND assigned to Ana's class.
    personal.status = "published";
    const classId = crypto.randomUUID();
    store.assignments.push({ materialId: personal.id, classId });
    store.enrollments.push({ classId, studentId: ana.id });
    const classMaterial = seedClassMaterial(teacher, ana);

    const mine = await as(ana, "get", "/api/me/materials");
    expect(mine.status).toBe(200);
    expect(mine.body.materials.map((m: { id: string }) => m.id)).toEqual([classMaterial.id]);
    const byClass = await as(ana, "get", `/api/me/materials?classId=${classId}`);
    expect(byClass.body.materials).toEqual([]);

    const teacherList = await as(teacher, "get", "/api/materials");
    expect(teacherList.status).toBe(200);
    expect(teacherList.body.materials.map((m: { id: string }) => m.id)).toEqual([classMaterial.id]);
    expect((await as(ana, "get", `/api/materials/${personal.id}`)).status).toBe(404);
    expect((await as(teacher, "get", `/api/materials/${personal.id}`)).status).toBe(404);
    expect(
      (
        await as(teacher, "post", `/api/materials/${personal.id}/assign`).send({
          classIds: [classId],
        })
      ).status,
    ).toBe(404);
    expect((await as(teacher, "post", `/api/materials/${personal.id}/publish`)).status).toBe(404);
    expect(
      (await as(ana, "put", `/api/me/progress/${personal.id}`).send({ status: "started" })).status,
    ).toBe(404);
  });

  it("a class material appears in no personal listing or read", async () => {
    const teacher = makeUser("teacher");
    const ana = makeUser();
    const topic = await newTopic(ana);
    const personal = seedQuiz(ana, topic.id, 2);
    const classMaterial = seedClassMaterial(teacher, ana);

    const list = await as(ana, "get", `/api/me/topics/${topic.id}/materials`);
    expect(list.body.materials.map((m: { id: string }) => m.id)).toEqual([personal.id]);
    expect(
      (await as(ana, "get", `/api/me/topics/${topic.id}/materials/${classMaterial.id}`)).status,
    ).toBe(404);
  });
});

// --- attempts on personal materials, stats and the adaptive policy --------------------------

describe("attempts on personal materials", () => {
  it("only the owner can submit; another student gets 404, a teacher 403", async () => {
    const ana = makeUser();
    const bob = makeUser();
    const quiz = seedQuiz(ana, (await newTopic(ana)).id, 2);
    expect((await submit(bob, quiz, [true, true])).status).toBe(404);
    expect((await submit(makeUser("teacher"), quiz, [true, true])).status).toBe(403);
    const missing = await as(bob, "post", `/api/materials/${crypto.randomUUID()}/attempts`).send({
      answers: [],
    });
    expect((await submit(bob, quiz, [true, true])).body).toEqual(missing.body);
    expect(store.attempts).toEqual([]);

    const ok = await submit(ana, quiz, [true, false]);
    expect(ok.status).toBe(201);
    expect(ok.body.attempt).toMatchObject({ score: 1, maxScore: 2 });
    // The result (post-submission) may carry the key; the owner can re-read it.
    expect((await as(ana, "get", `/api/attempts/${ok.body.attempt.id}`)).status).toBe(200);
    expect((await as(bob, "get", `/api/attempts/${ok.body.attempt.id}`)).status).toBe(404);
  });

  it("updates objective_stats: attempts, correct, hints_used 0", async () => {
    const ana = makeUser();
    const topic = await newTopic(ana);
    const quiz = seedQuiz(ana, topic.id, 4);
    await submit(ana, quiz, [true, true, false, false]);
    await submit(ana, quiz, [true, false, false, false]);
    const objectiveId = store.objectiveByTopic.get(topic.id);
    expect(store.stats.get(`${ana.id}/${objectiveId}`)).toEqual({
      attempts: 8,
      correct: 3,
      hintsUsed: 0,
    });
  });
});

describe("adaptive policy through the API", () => {
  it("starts from the default (no stored version) and falls back to the global row", async () => {
    const ana = makeUser();
    const topic = await newTopic(ana);
    const fresh = await policyOf(ana, topic.id);
    expect(fresh.status).toBe(200);
    expect(fresh.body).toEqual({
      policy: DEFAULT_POLICY,
      version: null,
      source: "default",
      reasonCode: null,
      note: null,
    });

    store.policies.push({
      studentId: ana.id,
      topicId: null,
      version: 4,
      explanationLevel: "basic",
      exampleFirst: true,
      scaffolding: "high",
      hintsEnabled: true,
      reasonCode: null,
      note: null,
      createdAt: nextTime(),
    });
    const global = await policyOf(ana, topic.id);
    expect(global.body).toMatchObject({
      source: "global",
      version: 4,
      policy: { explanationLevel: "basic" },
    });
  });

  it("exactly 3 wrong answers on one objective triggers Rule A; 2 does not", async () => {
    const ana = makeUser();
    const two = await newTopic(ana);
    await submit(ana, seedQuiz(ana, two.id, 3), [false, false, true]);
    expect((await policyOf(ana, two.id)).body.version).toBeNull();
    expect(store.policies).toEqual([]);

    const three = await newTopic(ana);
    await submit(ana, seedQuiz(ana, three.id, 3), [false, false, false]);
    const res = await policyOf(ana, three.id);
    expect(res.body).toMatchObject({
      version: 1,
      source: "topic",
      reasonCode: "REPEATED_OBJECTIVE_ERRORS",
      policy: { scaffolding: "high", exampleFirst: true },
    });
    expect(res.body.note).toContain("3 greșeli la același obiectiv în ultimele 1 încercări");
  });

  it("a change needs 3 new observations since the last version, and the version increments", async () => {
    const ana = makeUser();
    const topic = await newTopic(ana);
    const quiz = seedQuiz(ana, topic.id, 4);
    await submit(ana, quiz, [false, false, false, true]); // 3 wrong -> version 1
    expect((await policyOf(ana, topic.id)).body.version).toBe(1);

    // Three perfect attempts are needed for Rule B; two (8 observations) are not enough.
    await submit(ana, quiz, [true, true, true, true]);
    await submit(ana, quiz, [true, true, true, true]);
    expect((await policyOf(ana, topic.id)).body.version).toBe(1);
    expect(store.policies).toHaveLength(1);

    await submit(ana, quiz, [true, true, true, true]);
    const res = await policyOf(ana, topic.id);
    expect(res.body).toMatchObject({
      version: 2,
      reasonCode: "HIGH_ACCURACY",
      policy: { explanationLevel: "advanced", scaffolding: "medium", exampleFirst: true },
    });
    expect(res.body.note).toBe(
      "Media ultimelor 3 încercări: 100% (prag 80%). Explicații: standard → avansat, sprijin: high → medium.",
    );
    expect(store.policies.map((p) => p.version)).toEqual([1, 2]);

    // A single further wrong answer (one observation) changes nothing.
    await submit(ana, seedQuiz(ana, topic.id, 1), [false]);
    expect((await policyOf(ana, topic.id)).body.version).toBe(2);
  });

  it("one topic's results never change another topic's policy", async () => {
    const ana = makeUser();
    const a = await newTopic(ana);
    const b = await newTopic(ana);
    await submit(ana, seedQuiz(ana, a.id, 3), [false, false, false]);
    expect((await policyOf(ana, a.id)).body.version).toBe(1);
    expect((await policyOf(ana, b.id)).body.version).toBeNull();
  });

  it("the adapted policy reaches the next generation and tutor turn", async () => {
    const { provider, seen } = capturing();
    setAiProviderForTesting(provider);
    const ana = makeUser();
    const topic = await newTopic(ana);
    await submit(ana, seedQuiz(ana, topic.id, 3), [false, false, false]);

    await as(ana, "post", `/api/me/topics/${topic.id}/lesson`).send({});
    await as(ana, "post", `/api/me/topics/${topic.id}/tutor`).send({ message: "salut" });
    const expected = { ...DEFAULT_POLICY, scaffolding: "high", exampleFirst: true };
    expect((seen.lessons[0] as { policy: unknown }).policy).toEqual(expected);
    expect(seen.tutor[0]?.policy).toEqual(expected);
  });

  it("a failure while adapting never fails the student's submission", async () => {
    const ana = makeUser();
    const topic = await newTopic(ana);
    const quiz = seedQuiz(ana, topic.id, 3);
    vi.spyOn(store.stats, "get").mockImplementation(() => {
      throw new Error("db down");
    });
    const res = await submit(ana, quiz, [false, false, false]);
    expect(res.status).toBe(201);
    expect(store.attempts).toHaveLength(1);
  });

  it("the AI cannot write a policy: generation and tutor never add a student_policies row", async () => {
    const ana = makeUser();
    const topic = await newTopic(ana);
    await as(ana, "post", `/api/me/topics/${topic.id}/quiz`).send({});
    await as(ana, "post", `/api/me/topics/${topic.id}/tutor`).send({ message: "salut" });
    expect(store.policies).toEqual([]);
  });
});
