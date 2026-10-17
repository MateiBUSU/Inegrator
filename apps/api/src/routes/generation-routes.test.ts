import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_POLICY } from "@app/shared";
import { setAiProviderForTesting } from "../ai";
import type { ContentGenerator, LessonInput, QuizInput } from "../ai/generator";
import { MockGenerator } from "../ai/mock-generator";
import { buildLessonPrompt, buildQuizPrompt } from "../ai/prompts";
import { createApp } from "../app";
import { env } from "../config/env";
import { signToken } from "../services/token-service";

// Repositories are replaced by in-memory fakes: the default `npm test` must not need a database.
// Routing, validation, auth, services, retrieval, the AI engine (mock provider) and the shared
// schemas are real. The fake quota repository reproduces the atomic "increment only below the
// limit" semantics; the real SQL is exercised against Postgres in the manual end-to-end run.
const store = vi.hoisted(() => ({
  classes: [] as { id: string; teacherId: string; grade: number; styleNotes: string | null }[],
  subjects: [] as {
    id: string;
    slug: string;
    title: string;
    section: "programa" | "bac";
    language: "cpp" | "python";
    grade: number | null;
  }[],
  chapters: [] as {
    id: string;
    subjectId: string;
    title: string;
    objectives: { id: string; text: string }[];
  }[],
  documents: [] as { id: string; classId: string }[],
  chunks: [] as {
    classId: string;
    documentId: string;
    documentCreatedAt: Date;
    position: number;
    text: string;
  }[],
  materials: [] as Record<string, unknown>[],
  usage: new Map<string, number>(),
  quotaCalls: [] as { userId: string; day: string; limit: number }[],
}));

vi.mock("../repositories/class-repository", () => ({
  findClassById: async (id: string) => {
    const c = store.classes.find((x) => x.id === id);
    return c ? { ...c, teacher: { displayName: "Prof" } } : null;
  },
}));

vi.mock("../repositories/subject-repository", () => ({
  findSubjectById: async (id: string) => store.subjects.find((s) => s.id === id) ?? null,
  findChapterWithObjectives: async (id: string) => store.chapters.find((c) => c.id === id) ?? null,
}));

vi.mock("../repositories/document-repository", () => ({
  findDocumentIdsInClass: async (classId: string, ids: string[]) =>
    store.documents.filter((d) => d.classId === classId && ids.includes(d.id)).map((d) => d.id),
  listChunksForClass: async (classId: string, options: { take?: number } = {}) => {
    const rows = store.chunks.filter((c) => c.classId === classId);
    return options.take === undefined ? rows : rows.slice(0, options.take);
  },
}));

vi.mock("../repositories/material-repository", () => ({
  createMaterial: async (data: Record<string, unknown>) => {
    const row = {
      id: crypto.randomUUID(),
      scope: "class",
      status: "draft",
      version: 1,
      parentId: null,
      createdAt: new Date(),
      publishedAt: null,
      source: "manual",
      basedOnDocumentIds: [],
      ...data,
    };
    store.materials.push(row);
    return { ...row };
  },
}));

vi.mock("../repositories/ai-usage-repository", () => ({
  tryConsumeAiQuota: async (userId: string, day: string, limit: number) => {
    store.quotaCalls.push({ userId, day, limit });
    if (!Number.isInteger(limit) || limit < 1) return null;
    const key = `${userId}|${day}`;
    const current = store.usage.get(key) ?? 0;
    if (current >= limit) return null;
    store.usage.set(key, current + 1);
    return current + 1;
  },
}));

// --- fixtures ----------------------------------------------------------------------------------

interface TestUser {
  id: string;
  cookie: string;
}
const makeUser = (role: "student" | "teacher"): TestUser => {
  const id = crypto.randomUUID();
  return { id, cookie: `token=${signToken({ userId: id, role })}` };
};

const SUBJECT_ID = crypto.randomUUID();
const OTHER_SUBJECT_ID = crypto.randomUUID();
const BAC_SUBJECT_ID = crypto.randomUUID();
const CHAPTER_ID = crypto.randomUUID();
const OTHER_CHAPTER_ID = crypto.randomUUID();
const OBJ = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()] as const;

function seedCurriculum() {
  store.subjects.push(
    {
      id: SUBJECT_ID,
      slug: "programa-cpp-9",
      title: "Informatică C++ – clasa a IX-a",
      section: "programa",
      language: "cpp",
      grade: 9,
    },
    {
      id: OTHER_SUBJECT_ID,
      slug: "programa-cpp-10",
      title: "Informatică C++ – clasa a X-a",
      section: "programa",
      language: "cpp",
      grade: 10,
    },
    {
      id: BAC_SUBJECT_ID,
      slug: "bac-cpp",
      title: "Bacalaureat C++",
      section: "bac",
      language: "cpp",
      grade: null,
    },
  );
  store.chapters.push(
    {
      id: CHAPTER_ID,
      subjectId: SUBJECT_ID,
      title: "Structuri de control",
      objectives: [
        { id: OBJ[0], text: "Scrie bucle while corecte" },
        { id: OBJ[1], text: "Scrie bucle for corecte" },
        { id: OBJ[2], text: "Folosește variabile de tip int" },
      ],
    },
    { id: OTHER_CHAPTER_ID, subjectId: OTHER_SUBJECT_ID, title: "Altceva", objectives: [] },
  );
}

function makeClass(teacher: TestUser, grade = 9) {
  const cls = {
    id: crypto.randomUUID(),
    teacherId: teacher.id,
    grade,
    styleNotes: null as string | null,
  };
  store.classes.push(cls);
  return cls;
}

let documentClock = 0;
function addDocument(classId: string, texts: string[]) {
  const id = crypto.randomUUID();
  store.documents.push({ id, classId });
  documentClock += 1;
  texts.forEach((text, position) =>
    store.chunks.push({
      classId,
      documentId: id,
      documentCreatedAt: new Date(documentClock * 1000),
      position,
      text,
    }),
  );
  return id;
}

const WHILE_TEXT = "Bucla while repetă instrucțiunile cât timp condiția este adevărată.";
const FOR_TEXT = "Bucla for numără iterațiile și este potrivită când se știe numărul de pași.";
const VARS_TEXT = "Variabilele de tip int rețin numere întregi în memorie.";

type App = ReturnType<typeof createApp>;
const generate = (app: App, user: TestUser, body: unknown) =>
  request(app)
    .post("/api/materials/generate")
    .set("Cookie", user.cookie)
    .send(body as object);
const extract = (app: App, user: TestUser, classId: string) =>
  request(app).post(`/api/classes/${classId}/style-notes/extract`).set("Cookie", user.cookie);

function body(classId: string, overrides: Record<string, unknown> = {}) {
  return {
    classId,
    subjectId: SUBJECT_ID,
    chapterId: CHAPTER_ID,
    kind: "lesson",
    objectiveIds: [OBJ[0], OBJ[1]],
    ...overrides,
  };
}

/** A provider that records what it is asked, then answers like the mock. */
function capturing(overrides: Partial<ContentGenerator> = {}) {
  const mock = new MockGenerator();
  const seen = {
    lessons: [] as LessonInput[],
    quizzes: [] as QuizInput[],
    styleSamples: [] as string[],
  };
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
    extractStyleNotes: async (input) => {
      seen.styleSamples.push(input.sampleText);
      return mock.extractStyleNotes(input);
    },
    solveQuestions: (input) => mock.solveQuestions(input),
    tutorReply: (input) => mock.tutorReply(input),
    generatePracticeExercise: (input) => mock.generatePracticeExercise(input),
    diagnosePracticeAnswer: (input) => mock.diagnosePracticeAnswer(input),
    ...overrides,
  };
  return { provider, seen };
}

const usedBy = (user: TestUser) =>
  [...store.usage.entries()]
    .filter(([key]) => key.startsWith(user.id))
    .reduce((sum, [, n]) => sum + n, 0);

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  store.classes.length = 0;
  store.subjects.length = 0;
  store.chapters.length = 0;
  store.documents.length = 0;
  store.chunks.length = 0;
  store.materials.length = 0;
  store.usage.clear();
  store.quotaCalls.length = 0;
  seedCurriculum();
});
afterEach(() => {
  setAiProviderForTesting(null);
  vi.restoreAllMocks();
});

// --- POST /api/materials/generate ----------------------------------------------------------------

describe("POST /api/materials/generate: results", () => {
  it("creates a draft lesson from the class documents, flagged as using a teacher source", async () => {
    const app = createApp();
    const teacher = makeUser("teacher");
    const cls = makeClass(teacher);
    const docA = addDocument(cls.id, [WHILE_TEXT]);
    addDocument(cls.id, [VARS_TEXT]);

    const res = await generate(app, teacher, body(cls.id));
    expect(res.status).toBe(201);
    expect(res.body.usedTeacherSource).toBe(true);
    expect(res.body.quota).toEqual({ used: 1, limit: env.AI_DAILY_LIMIT_PER_TEACHER });
    expect(res.body.material).toMatchObject({
      status: "draft",
      kind: "lesson",
      version: 1,
      subjectId: SUBJECT_ID,
      chapterId: CHAPTER_ID,
      section: "programa",
      language: "cpp",
      grade: 9,
      title: "Lecție: Structuri de control",
      generation: { provider: "mock", teacherSource: true },
    });
    // Objectives are echoed with their real ids and texts.
    expect(res.body.material.objectives).toEqual([
      { id: OBJ[0], text: "Scrie bucle while corecte" },
      { id: OBJ[1], text: "Scrie bucle for corecte" },
    ]);
    expect(res.body.material.lesson.checkQuestions.length).toBeGreaterThan(0);

    const row = store.materials[0];
    expect(row).toMatchObject({
      ownerId: teacher.id,
      source: "document_based",
      basedOnDocumentIds: [docA],
      subjectId: SUBJECT_ID,
      chapterId: CHAPTER_ID,
    });
  });

  it("flags the material as having NO teacher source when the class has no documents", async () => {
    const app = createApp();
    const teacher = makeUser("teacher");
    const cls = makeClass(teacher);
    const { provider, seen } = capturing();
    setAiProviderForTesting(provider);

    const res = await generate(app, teacher, body(cls.id));
    expect(res.status).toBe(201);
    expect(res.body.usedTeacherSource).toBe(false);
    expect(res.body.material.generation).toEqual({ provider: "mock", teacherSource: false });
    expect(store.materials[0]).toMatchObject({ source: "ai", basedOnDocumentIds: [] });
    // The provider really got an empty source list, and its prompt says so.
    expect(seen.lessons[0]?.sourceChunks).toEqual([]);
    expect(buildLessonPrompt(seen.lessons[0] as LessonInput).system.toLowerCase()).toContain(
      "no teacher source available",
    );
  });

  it("flags no source when documents exist but none matches the objectives", async () => {
    const app = createApp();
    const teacher = makeUser("teacher");
    const cls = makeClass(teacher);
    addDocument(cls.id, ["Text despre cu totul altceva: gradina si florile."]);
    const res = await generate(app, teacher, body(cls.id));
    expect(res.status).toBe(201);
    expect(res.body.usedTeacherSource).toBe(false);
    expect(store.materials[0]).toMatchObject({ source: "ai", basedOnDocumentIds: [] });
  });

  it.each(["test", "problem", "exercise"] as const)(
    "generates a %s with the requested number of questions",
    async (kind) => {
      const app = createApp();
      const teacher = makeUser("teacher");
      const cls = makeClass(teacher);
      addDocument(cls.id, [WHILE_TEXT]);
      const res = await generate(app, teacher, body(cls.id, { kind, count: 4 }));
      expect(res.status).toBe(201);
      expect(res.body.material.kind).toBe(kind);
      expect(res.body.material.questions).toHaveLength(4);
      expect(
        res.body.material.questions.every(
          (q: { verification: string }) => q.verification === "unchecked",
        ),
      ).toBe(true);
      expect(res.body.material.lesson).toBeUndefined();
    },
  );

  it("defaults to 6 questions, uses the class style notes from the class row, and the class grade for bac", async () => {
    const app = createApp();
    const teacher = makeUser("teacher");
    const cls = makeClass(teacher, 12);
    cls.styleNotes = "Ton prietenos, exemple scurte.";
    const { provider, seen } = capturing();
    setAiProviderForTesting(provider);

    const bacChapterId = crypto.randomUUID();
    store.chapters.push({
      id: bacChapterId,
      subjectId: BAC_SUBJECT_ID,
      title: "Subprograme",
      objectives: [{ id: OBJ[0], text: "Scrie funcții" }],
    });
    const bac = await generate(
      app,
      teacher,
      body(cls.id, {
        kind: "test",
        subjectId: BAC_SUBJECT_ID,
        chapterId: bacChapterId,
        objectiveIds: [OBJ[0]],
      }),
    );
    expect(bac.status).toBe(201);
    expect(bac.body.material).toMatchObject({ section: "bac", grade: 12 });
    expect(bac.body.material.questions).toHaveLength(6);
    expect(seen.quizzes[0]?.styleNotes).toBe("Ton prietenos, exemple scurte.");
  });

  it("restricts the source to the chosen documents of the class", async () => {
    const app = createApp();
    const teacher = makeUser("teacher");
    const cls = makeClass(teacher);
    addDocument(cls.id, [WHILE_TEXT]);
    const docFor = addDocument(cls.id, [FOR_TEXT]);
    const { provider, seen } = capturing();
    setAiProviderForTesting(provider);

    const res = await generate(app, teacher, body(cls.id, { documentIds: [docFor] }));
    expect(res.status).toBe(201);
    expect(seen.lessons[0]?.sourceChunks).toEqual([FOR_TEXT]);
    expect(store.materials[0]).toMatchObject({ basedOnDocumentIds: [docFor] });
  });

  it("uses the opening chunks of explicitly chosen documents even when no objective word matches", async () => {
    const app = createApp();
    const teacher = makeUser("teacher");
    const cls = makeClass(teacher);
    const doc = addDocument(cls.id, ["Introducere generală.", "Al doilea paragraf."]);
    const res = await generate(app, teacher, body(cls.id, { documentIds: [doc] }));
    expect(res.status).toBe(201);
    expect(res.body.usedTeacherSource).toBe(true);
    expect(store.materials[0]).toMatchObject({
      source: "document_based",
      basedOnDocumentIds: [doc],
    });
  });
});

describe("POST /api/materials/generate: scoping to the owning teacher", () => {
  it("returns 404 for a class the teacher does not own, identical to a nonexistent class, and does nothing", async () => {
    const app = createApp();
    const owner = makeUser("teacher");
    const intruder = makeUser("teacher");
    const cls = makeClass(owner);
    addDocument(cls.id, [WHILE_TEXT]);
    const { provider, seen } = capturing();
    setAiProviderForTesting(provider);

    const forbidden = await generate(app, intruder, body(cls.id));
    const missing = await generate(app, intruder, body(crypto.randomUUID()));
    expect(forbidden.status).toBe(404);
    expect(forbidden.body).toEqual({
      error: { code: "CLASS_NOT_FOUND", message: expect.any(String) },
    });
    expect(missing.body).toEqual(forbidden.body);

    expect(store.materials).toHaveLength(0);
    expect(store.quotaCalls).toHaveLength(0);
    expect(usedBy(intruder)).toBe(0);
    expect(seen.lessons).toHaveLength(0);
  });

  it("never uses another class's documents, even with the same content, and rejects foreign document ids", async () => {
    const app = createApp();
    const teacher = makeUser("teacher");
    const other = makeUser("teacher");
    const mine = makeClass(teacher);
    const theirs = makeClass(other);
    addDocument(mine.id, [WHILE_TEXT]);
    const foreignDoc = addDocument(theirs.id, [`${WHILE_TEXT} SECRET-OF-ANOTHER-TEACHER`]);
    const { provider, seen } = capturing();
    setAiProviderForTesting(provider);

    const ok = await generate(app, teacher, body(mine.id));
    expect(ok.status).toBe(201);
    expect(JSON.stringify(seen.lessons)).not.toContain("SECRET-OF-ANOTHER-TEACHER");
    expect(store.materials[0]?.basedOnDocumentIds).not.toContain(foreignDoc);

    const stolen = await generate(app, teacher, body(mine.id, { documentIds: [foreignDoc] }));
    expect(stolen.status).toBe(404);
    expect(stolen.body.error.code).toBe("DOCUMENT_NOT_FOUND");
    const mixed = await generate(
      app,
      teacher,
      body(mine.id, { documentIds: [store.documents[0]?.id, foreignDoc] }),
    );
    expect(mixed.status).toBe(404);

    expect(store.materials).toHaveLength(1);
    expect(seen.lessons).toHaveLength(1);
    expect(usedBy(teacher)).toBe(1); // only the successful request used quota
  });

  it("rejects students (403) and anonymous callers (401), without using quota", async () => {
    const app = createApp();
    const teacher = makeUser("teacher");
    const cls = makeClass(teacher);
    const student = makeUser("student");
    expect((await generate(app, student, body(cls.id))).status).toBe(403);
    expect((await request(app).post("/api/materials/generate").send(body(cls.id))).status).toBe(
      401,
    );
    expect(store.quotaCalls).toHaveLength(0);
    expect(store.materials).toHaveLength(0);
  });

  it("takes the owner from the session, not from the body", async () => {
    const app = createApp();
    const teacher = makeUser("teacher");
    const other = makeUser("teacher");
    const cls = makeClass(teacher);
    const res = await generate(app, teacher, {
      ...body(cls.id),
      ownerId: other.id,
      teacherId: other.id,
    });
    expect(res.status).toBe(201);
    expect(store.materials[0]?.ownerId).toBe(teacher.id);
    expect(usedBy(other)).toBe(0);
  });

  it("validates subject, chapter, objectives and body (400) without using quota", async () => {
    const app = createApp();
    const teacher = makeUser("teacher");
    const cls = makeClass(teacher, 9);
    const cases: [string, Record<string, unknown>, string | undefined][] = [
      ["unknown subject", { subjectId: crypto.randomUUID() }, "INVALID_SUBJECT"],
      [
        "subject of another grade",
        { subjectId: OTHER_SUBJECT_ID, chapterId: OTHER_CHAPTER_ID },
        "INVALID_SUBJECT",
      ],
      ["chapter of another subject", { chapterId: OTHER_CHAPTER_ID }, "INVALID_SUBJECT"],
      ["unknown chapter", { chapterId: crypto.randomUUID() }, "INVALID_SUBJECT"],
      [
        "objective not in the chapter",
        { objectiveIds: [OBJ[0], crypto.randomUUID()] },
        "INVALID_OBJECTIVES",
      ],
      ["bad kind", { kind: "exam" }, "VALIDATION_ERROR"],
      ["no objectives", { objectiveIds: [] }, "VALIDATION_ERROR"],
      ["non-uuid objective", { objectiveIds: ["nope"] }, "VALIDATION_ERROR"],
      ["count too large", { kind: "test", count: 99 }, "VALIDATION_ERROR"],
      ["empty documentIds", { documentIds: [] }, "VALIDATION_ERROR"],
    ];
    for (const [name, overrides, code] of cases) {
      const res = await generate(app, teacher, body(cls.id, overrides));
      expect(res.status, name).toBe(400);
      expect(res.body.error.code, name).toBe(code);
    }
    // A fresh app has fresh rate-limit counters (the 10 cases above used up this app's burst).
    expect((await generate(createApp(), teacher, {})).status).toBe(400);
    expect(store.quotaCalls).toHaveLength(0);
    expect(store.materials).toHaveLength(0);
  });
});

describe("POST /api/materials/generate: daily quota", () => {
  it("returns 429 QUOTA_EXCEEDED on request N+1, creating nothing and not incrementing further", async () => {
    const app = createApp();
    const teacher = makeUser("teacher");
    const cls = makeClass(teacher);
    const { provider, seen } = capturing();
    setAiProviderForTesting(provider);
    const limit = env.AI_DAILY_LIMIT_PER_TEACHER;
    expect(limit).toBe(3);

    for (let i = 1; i <= limit; i++) {
      const res = await generate(app, teacher, body(cls.id));
      expect(res.status).toBe(201);
      expect(res.body.quota).toEqual({ used: i, limit });
    }
    expect(store.materials).toHaveLength(limit);

    for (let attempt = 0; attempt < 3; attempt++) {
      const res = await generate(app, teacher, body(cls.id));
      expect(res.status).toBe(429);
      expect(res.body.error.code).toBe("QUOTA_EXCEEDED");
      expect(res.body.error.details).toEqual({ limit });
    }
    expect(store.materials).toHaveLength(limit);
    expect(usedBy(teacher)).toBe(limit); // not incremented past the limit
    expect(seen.lessons).toHaveLength(limit); // the AI was not called again
  });

  it("is per teacher and per UTC day, and style-notes suggestions share the same budget", async () => {
    const app = createApp();
    const a = makeUser("teacher");
    const b = makeUser("teacher");
    const clsA = makeClass(a);
    const clsB = makeClass(b);
    addDocument(clsA.id, [WHILE_TEXT]);

    for (let i = 0; i < 2; i++) expect((await generate(app, a, body(clsA.id))).status).toBe(201);
    expect((await extract(app, a, clsA.id)).status).toBe(200); // 3rd unit, shared counter
    expect((await generate(app, a, body(clsA.id))).status).toBe(429);
    expect((await extract(app, a, clsA.id)).status).toBe(429);

    expect((await generate(app, b, body(clsB.id))).status).toBe(201); // teacher B is unaffected

    const days = new Set(store.quotaCalls.map((c) => c.day));
    expect([...days].every((day) => /^\d{4}-\d{2}-\d{2}$/.test(day))).toBe(true);
    expect(days).toEqual(new Set([new Date().toISOString().slice(0, 10)]));
  });
});

describe("POST /api/materials/generate: invalid AI output", () => {
  it("retries once and succeeds when the first answer is garbage", async () => {
    const app = createApp();
    const teacher = makeUser("teacher");
    const cls = makeClass(teacher);
    const mock = new MockGenerator();
    let calls = 0;
    setAiProviderForTesting({
      ...capturing().provider,
      generateLesson: async (input) =>
        ++calls === 1 ? { lesson: { body: "" } } : mock.generateLesson(input),
    });
    const res = await generate(app, teacher, body(cls.id));
    expect(res.status).toBe(201);
    expect(calls).toBe(2);
    expect(usedBy(teacher)).toBe(1); // one request, one unit, regardless of the retry
  });

  it("returns 503 AI_UNAVAILABLE after exactly one retry and saves nothing", async () => {
    const app = createApp();
    const teacher = makeUser("teacher");
    const cls = makeClass(teacher);
    let calls = 0;
    setAiProviderForTesting({
      ...capturing().provider,
      generateLesson: async () => {
        calls++;
        return { not: "a lesson" };
      },
    });
    const res = await generate(app, teacher, body(cls.id));
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe("AI_UNAVAILABLE");
    expect(calls).toBe(2);
    expect(store.materials).toHaveLength(0);
    // The attempt is counted (the quota caps attempts, not successes) and the app keeps working.
    expect(usedBy(teacher)).toBe(1);
    setAiProviderForTesting(null);
    expect((await generate(app, teacher, body(cls.id))).status).toBe(201);
  });
});

describe("POST /api/materials/generate: privacy of what reaches the AI", () => {
  it("sends only topic, objectives, teacher text, style notes and the neutral policy", async () => {
    const app = createApp();
    const teacher = makeUser("teacher");
    const student = makeUser("student");
    const cls = makeClass(teacher);
    cls.styleNotes = "Ton prietenos.";
    addDocument(cls.id, [WHILE_TEXT]);
    const { provider, seen } = capturing();
    setAiProviderForTesting(provider);

    const res = await generate(app, teacher, body(cls.id));
    expect(res.status).toBe(201);

    const input = seen.lessons[0] as LessonInput;
    expect(Object.keys(input).sort()).toEqual([
      "chapterTitle",
      "language",
      "objectives",
      "policy",
      "sourceChunks",
      "styleNotes",
      "subjectTitle",
    ]);
    expect(input.policy).toEqual(DEFAULT_POLICY); // neutral: no student's policy is used
    expect(input.styleNotes).toBe("Ton prietenos.");

    const everything = JSON.stringify(input) + JSON.stringify(buildLessonPrompt(input));
    for (const identifier of [teacher.id, student.id, cls.id, cls.teacherId]) {
      expect(everything).not.toContain(identifier);
    }
  });

  it("sends the same kind of data for quizzes", async () => {
    const app = createApp();
    const teacher = makeUser("teacher");
    const cls = makeClass(teacher);
    const { provider, seen } = capturing();
    setAiProviderForTesting(provider);
    await generate(app, teacher, body(cls.id, { kind: "test", count: 2 }));
    const input = seen.quizzes[0] as QuizInput;
    expect(Object.keys(input).sort()).toEqual([
      "chapterTitle",
      "count",
      "kind",
      "language",
      "objectives",
      "policy",
      "sourceChunks",
      "styleNotes",
      "subjectTitle",
    ]);
    expect(JSON.stringify(buildQuizPrompt(input))).not.toContain(teacher.id);
  });
});

describe("POST /api/materials/generate: rate limit", () => {
  it("returns 429 RATE_LIMITED after a burst of requests from one teacher", async () => {
    const app = createApp();
    const teacher = makeUser("teacher");
    const other = makeUser("teacher");
    const cls = makeClass(teacher);
    for (let i = 0; i < 10; i++) {
      expect((await generate(app, teacher, body(cls.id, { kind: "exam" }))).status).toBe(400);
    }
    const limited = await generate(app, teacher, body(cls.id));
    expect(limited.status).toBe(429);
    expect(limited.body.error.code).toBe("RATE_LIMITED");
    expect(store.materials).toHaveLength(0);
    // Keyed per user: another teacher is not affected.
    const otherClass = makeClass(other);
    expect((await generate(app, other, body(otherClass.id))).status).toBe(201);
  });
});

// --- POST /api/classes/:id/style-notes/extract -----------------------------------------------------

describe("POST /api/classes/:id/style-notes/extract", () => {
  it("returns a suggestion without saving it", async () => {
    const app = createApp();
    const teacher = makeUser("teacher");
    const cls = makeClass(teacher);
    cls.styleNotes = "Notițe existente.";
    addDocument(cls.id, [
      "# Titlu\n\nO explicație scurtă a profesorului.",
      "Un exemplu cu #include <iostream>.",
    ]);

    const res = await extract(app, teacher, cls.id);
    expect(res.status).toBe(200);
    expect(res.body.suggestion.length).toBeGreaterThan(0);
    expect(res.body.basedOnChunks).toBe(2);
    expect(res.body.quota).toEqual({ used: 1, limit: 3 });
    expect(cls.styleNotes).toBe("Notițe existente."); // NOT saved
  });

  it("caps the sample sent to the provider (first 10 chunks, 8000 characters)", async () => {
    const app = createApp();
    const teacher = makeUser("teacher");
    const cls = makeClass(teacher);
    addDocument(
      cls.id,
      Array.from({ length: 15 }, (_, i) => `CHUNK-${i + 1} ${"x".repeat(990)}`),
    );
    const { provider, seen } = capturing();
    setAiProviderForTesting(provider);

    const res = await extract(app, teacher, cls.id);
    expect(res.status).toBe(200);
    expect(res.body.basedOnChunks).toBe(10);
    const sample = seen.styleSamples[0] ?? "";
    expect(sample.length).toBeLessThanOrEqual(8000);
    expect(sample.startsWith("CHUNK-1 ")).toBe(true);
    expect(sample).not.toContain("CHUNK-11 ");
  });

  it("returns 400 NO_DOCUMENTS without using quota or calling the AI when there is nothing to analyze", async () => {
    const app = createApp();
    const teacher = makeUser("teacher");
    const cls = makeClass(teacher);
    const { provider, seen } = capturing();
    setAiProviderForTesting(provider);
    const res = await extract(app, teacher, cls.id);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("NO_DOCUMENTS");
    expect(store.quotaCalls).toHaveLength(0);
    expect(seen.styleSamples).toHaveLength(0);
  });

  it("is owner-only (404 for another teacher), teacher-only (403) and authenticated (401)", async () => {
    const app = createApp();
    const owner = makeUser("teacher");
    const intruder = makeUser("teacher");
    const cls = makeClass(owner);
    addDocument(cls.id, ["Text secret al profesorului."]);
    const { provider, seen } = capturing();
    setAiProviderForTesting(provider);

    const forbidden = await extract(app, intruder, cls.id);
    expect(forbidden.status).toBe(404);
    expect(forbidden.body.error.code).toBe("CLASS_NOT_FOUND");
    expect((await extract(app, intruder, crypto.randomUUID())).body).toEqual(forbidden.body);
    expect((await extract(app, makeUser("student"), cls.id)).status).toBe(403);
    expect((await request(app).post(`/api/classes/${cls.id}/style-notes/extract`)).status).toBe(
      401,
    );
    expect((await extract(app, owner, "not-a-uuid")).status).toBe(400);

    expect(seen.styleSamples).toHaveLength(0);
    expect(store.quotaCalls).toHaveLength(0);
  });

  it("returns 503 AI_UNAVAILABLE when the AI keeps failing, and the suggestion is never half-saved", async () => {
    const app = createApp();
    const teacher = makeUser("teacher");
    const cls = makeClass(teacher);
    addDocument(cls.id, ["Un text."]);
    setAiProviderForTesting({
      ...capturing().provider,
      extractStyleNotes: async () => ({ styleNotes: "" }),
    });
    const res = await extract(app, teacher, cls.id);
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe("AI_UNAVAILABLE");
    expect(cls.styleNotes).toBeNull();
  });
});
