import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../app";
import { signToken } from "../services/token-service";

// Repositories are in-memory fakes so `npm test` needs no database. Routing, validation, auth,
// services, scoring and the shared schemas are real. For progress, the REAL repository runs
// against a fake prisma client (updateMany bumps updated_at like @updatedAt does), so the
// no-double-update rule is exercised in the real code, not in a fake of it.
interface FakeMaterial {
  id: string;
  ownerId: string;
  scope: "class";
  kind: string;
  title: string;
  status: "draft" | "published" | "archived";
  version: number;
  content: unknown;
  publishedAt: Date | null;
}
interface FakeProgress {
  studentId: string;
  materialId: string;
  status: "started" | "completed";
  updatedAt: Date;
}
interface FakeAttempt {
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
  materials: [] as FakeMaterial[],
  enrollments: [] as { classId: string; studentId: string }[],
  assignments: [] as { materialId: string; classId: string }[],
  progress: [] as FakeProgress[],
  attempts: [] as FakeAttempt[],
  tick: 0,
}));

const nextTime = () => new Date(1_700_000_000_000 + ++store.tick * 60_000);

vi.mock("../repositories/material-repository", () => ({
  findMaterialById: async (id: string) => {
    const row = store.materials.find((m) => m.id === id);
    return row ? { ...row, content: structuredClone(row.content) } : null;
  },
  isAssignedToStudent: async (materialId: string, studentId: string) =>
    store.assignments.some(
      (a) =>
        a.materialId === materialId &&
        store.enrollments.some((e) => e.classId === a.classId && e.studentId === studentId),
    ),
  listPublishedForStudent: async (studentId: string, classId?: string) =>
    store.materials
      .filter(
        (m) =>
          m.status === "published" &&
          store.assignments.some(
            (a) =>
              a.materialId === m.id &&
              (!classId || a.classId === classId) &&
              store.enrollments.some((e) => e.classId === a.classId && e.studentId === studentId),
          ),
      )
      .map((m) => ({ ...m, content: structuredClone(m.content) })),
}));

vi.mock("../repositories/attempt-repository", () => ({
  findExistingObjectiveIds: async () => new Set<string>(),
  createAttempt: async (data: Omit<FakeAttempt, "id" | "submittedAt">) => {
    const row: FakeAttempt = { ...data, id: crypto.randomUUID(), submittedAt: nextTime() };
    store.attempts.push(row);
    return row;
  },
  findAttemptById: async (id: string) => store.attempts.find((a) => a.id === id) ?? null,
}));

vi.mock("../repositories/prisma-client", () => {
  const key = (row: { studentId: string; materialId: string }) =>
    `${row.studentId}/${row.materialId}`;
  return {
    prisma: {
      lessonProgress: {
        updateMany: async ({
          where,
          data,
        }: {
          where: { studentId: string; materialId: string; status: "started" };
          data: { status: "completed" };
        }) => {
          const rows = store.progress.filter(
            (p) => key(p) === key(where) && p.status === where.status,
          );
          rows.forEach((p) => {
            p.status = data.status;
            p.updatedAt = nextTime(); // @updatedAt
          });
          return { count: rows.length };
        },
        createMany: async ({ data }: { data: Omit<FakeProgress, "updatedAt">[] }) => {
          for (const row of data) {
            if (!store.progress.some((p) => key(p) === key(row))) {
              store.progress.push({ ...row, updatedAt: nextTime() });
            }
          }
        },
        findUniqueOrThrow: async ({
          where,
        }: {
          where: { studentId_materialId: { studentId: string; materialId: string } };
        }) => {
          const row = store.progress.find((p) => key(p) === key(where.studentId_materialId));
          if (!row) throw new Error("not found");
          return { ...row };
        },
        findMany: async ({ where }: { where: { studentId: string } }) =>
          store.progress.filter((p) => p.studentId === where.studentId).map((p) => ({ ...p })),
      },
    },
  };
});

interface TestUser {
  id: string;
  cookie: string;
}
const makeUser = (role: "student" | "teacher"): TestUser => {
  const id = crypto.randomUUID();
  return { id, cookie: `token=${signToken({ userId: id, role })}` };
};

const content = {
  section: "programa",
  language: "cpp",
  grade: 9,
  objectives: [{ id: "o1", text: "Obiectiv" }],
  questions: [
    {
      id: "m1",
      type: "mcq",
      prompt: "Care e corect?",
      options: [
        { id: "a", text: "A" },
        { id: "b", text: "B" },
        { id: "c", text: "C" },
      ],
      correct: ["a", "b"],
      explanation: "EXPLICATIE-SECRETA",
      objectiveId: "o1",
      verification: "teacher_confirmed",
    },
    {
      id: "s1",
      type: "short",
      prompt: "Cuvânt cheie?",
      acceptedAnswers: ["while"],
      objectiveId: "o1",
      verification: "teacher_confirmed",
    },
    {
      id: "p1",
      type: "programming",
      prompt: "Scrie suma.",
      referenceSolution: "SOLUTIE-SECRETA",
      rubric: "RUBRICA-SECRETA",
      objectiveId: "o1",
      verification: "teacher_confirmed",
    },
  ],
};

function addMaterial(status: FakeMaterial["status"] = "published"): FakeMaterial {
  const row: FakeMaterial = {
    id: crypto.randomUUID(),
    ownerId: crypto.randomUUID(),
    scope: "class",
    kind: "test",
    title: "Test",
    status,
    version: 1,
    content: structuredClone(content),
    publishedAt: status === "published" ? new Date() : null,
  };
  store.materials.push(row);
  return row;
}
const enroll = (classId: string, student: TestUser) =>
  store.enrollments.push({ classId, studentId: student.id });
const assign = (material: FakeMaterial, classId: string) =>
  store.assignments.push({ materialId: material.id, classId });

const FORBIDDEN_KEYS = [
  "correct",
  "acceptedAnswers",
  "referenceSolution",
  "rubric",
  "explanation",
  "verification",
];
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
const leakedKeys = (body: string | object) =>
  FORBIDDEN_KEYS.filter((k) => collectKeys(body).has(k));

const app = createApp();
const submit = (user: TestUser, materialId: string, body: string | object) =>
  request(app).post(`/api/materials/${materialId}/attempts`).set("Cookie", user.cookie).send(body);
const putProgress = (user: TestUser, materialId: string, body: string | object) =>
  request(app).put(`/api/me/progress/${materialId}`).set("Cookie", user.cookie).send(body);
const ids = (list: { id: string }[]) => list.map((m) => m.id);

const GOOD_ANSWERS = {
  answers: [
    { questionId: "m1", optionIds: ["b", "a"] },
    { questionId: "s1", text: "  While " },
    { questionId: "p1", text: "int main(){}" },
  ],
};

beforeEach(() => {
  store.materials.length = 0;
  store.enrollments.length = 0;
  store.assignments.length = 0;
  store.progress.length = 0;
  store.attempts.length = 0;
  store.tick = 0;
});

describe("POST /api/materials/:id/attempts", () => {
  it("scores server-side, persists the attempt and returns the post-submission result", async () => {
    const student = makeUser("student");
    const classId = crypto.randomUUID();
    const material = addMaterial();
    enroll(classId, student);
    assign(material, classId);

    const res = await submit(student, material.id, GOOD_ANSWERS);
    expect(res.status).toBe(201);
    expect(res.body.attempt).toMatchObject({
      materialId: material.id,
      score: 2,
      maxScore: 2,
      selfEvaluationCount: 1,
    });
    const programming = res.body.attempt.results.find(
      (r: { questionId: string }) => r.questionId === "p1",
    );
    expect(programming).toMatchObject({
      evaluation: "self-evaluation",
      referenceSolution: "SOLUTIE-SECRETA",
    });

    expect(store.attempts).toHaveLength(1);
    expect(store.attempts[0]).toMatchObject({ studentId: student.id, score: 2, maxScore: 2 });
    // Programming is stored too, but "not graded" (null), never as a false incorrect answer.
    expect(store.attempts[0]?.answers).toEqual([
      expect.objectContaining({ questionId: "m1", isCorrect: true }),
      expect.objectContaining({ questionId: "s1", isCorrect: true }),
      {
        questionId: "p1",
        answer: { text: "int main(){}" },
        isCorrect: null,
        objectiveId: null,
      },
    ]);
  });

  it("ignores any client-supplied score or student id", async () => {
    const student = makeUser("student");
    const other = makeUser("student");
    const classId = crypto.randomUUID();
    const material = addMaterial();
    enroll(classId, student);
    assign(material, classId);

    const res = await submit(student, material.id, {
      answers: [{ questionId: "m1", optionIds: ["a"] }],
      score: 99,
      studentId: other.id,
    });
    expect(res.status).toBe(201);
    expect(res.body.attempt.score).toBe(0);
    expect(store.attempts[0]?.studentId).toBe(student.id);
  });

  it("returns 404 when the material is not assigned to the student's class", async () => {
    const student = makeUser("student");
    const material = addMaterial();
    enroll(crypto.randomUUID(), student);
    assign(material, crypto.randomUUID()); // some other class

    const res = await submit(student, material.id, GOOD_ANSWERS);
    const missing = await submit(student, crypto.randomUUID(), GOOD_ANSWERS);
    expect(res.status).toBe(404);
    expect(res.body).toEqual(missing.body);
    expect(leakedKeys(res.body)).toEqual([]);
    expect(store.attempts).toHaveLength(0);
  });

  it("returns 404 for a draft material even if an assignment row exists", async () => {
    const student = makeUser("student");
    const classId = crypto.randomUUID();
    const draft = addMaterial("draft");
    enroll(classId, student);
    assign(draft, classId);
    expect((await submit(student, draft.id, GOOD_ANSWERS)).status).toBe(404);
  });

  it("rejects unknown or duplicate question ids, teachers and anonymous callers", async () => {
    const student = makeUser("student");
    const classId = crypto.randomUUID();
    const material = addMaterial();
    enroll(classId, student);
    assign(material, classId);

    const unknown = await submit(student, material.id, { answers: [{ questionId: "zzz" }] });
    expect(unknown.status).toBe(400);
    const duplicate = await submit(student, material.id, {
      answers: [
        { questionId: "m1", optionIds: ["a"] },
        { questionId: "m1", optionIds: ["b"] },
      ],
    });
    expect(duplicate.status).toBe(400);
    expect(leakedKeys(unknown.body)).toEqual([]);
    expect((await submit(makeUser("teacher"), material.id, GOOD_ANSWERS)).status).toBe(403);
    const anonymous = await request(app)
      .post(`/api/materials/${material.id}/attempts`)
      .send(GOOD_ANSWERS);
    expect(anonymous.status).toBe(401);
    expect(store.attempts).toHaveLength(0);
  });
});

describe("POST /api/materials/:id/attempts: edge cases", () => {
  it("scores an empty submission as 0 of maxScore", async () => {
    const student = makeUser("student");
    const classId = crypto.randomUUID();
    const material = addMaterial();
    enroll(classId, student);
    assign(material, classId);
    const res = await submit(student, material.id, { answers: [] });
    expect(res.status).toBe(201);
    expect(res.body.attempt).toMatchObject({ score: 0, maxScore: 2 });
  });

  it("scores an mcq selection of ids outside the options as wrong", async () => {
    const student = makeUser("student");
    const classId = crypto.randomUUID();
    const material = addMaterial();
    enroll(classId, student);
    assign(material, classId);
    const res = await submit(student, material.id, {
      answers: [{ questionId: "m1", optionIds: ["a", "b", "zzz"] }],
    });
    expect(res.status).toBe(201);
    expect(res.body.attempt.score).toBe(0);
  });
});

describe("GET /api/attempts/:id", () => {
  async function makeAttempt() {
    const student = makeUser("student");
    const classId = crypto.randomUUID();
    const material = addMaterial();
    enroll(classId, student);
    assign(material, classId);
    const res = await submit(student, material.id, GOOD_ANSWERS);
    return { student, id: res.body.attempt.id as string, material };
  }

  it("returns the answer key and explanation to the student who made the attempt", async () => {
    const { student, id } = await makeAttempt();
    const res = await request(app).get(`/api/attempts/${id}`).set("Cookie", student.cookie);
    expect(res.status).toBe(200);
    expect(res.body.attempt).toMatchObject({ id, score: 2, maxScore: 2 });
    const mcq = res.body.attempt.results.find((r: { questionId: string }) => r.questionId === "m1");
    expect(mcq).toMatchObject({
      isCorrect: true,
      correct: ["a", "b"],
      explanation: "EXPLICATIE-SECRETA",
    });
  });

  it("returns the student's own programming answer, and mcq/short verdicts stay true/false", async () => {
    const { student, id } = await makeAttempt();
    const res = await request(app).get(`/api/attempts/${id}`).set("Cookie", student.cookie);
    const byId = (q: string) =>
      res.body.attempt.results.find((r: { questionId: string }) => r.questionId === q);
    expect(byId("p1")).toMatchObject({ evaluation: "self-evaluation", text: "int main(){}" });
    expect(byId("p1")).not.toHaveProperty("isCorrect");
    expect(byId("s1")).toMatchObject({ isCorrect: true });
    expect(res.body.attempt).toMatchObject({ score: 2, maxScore: 2, selfEvaluationCount: 1 });
  });

  it("does not let another student, or a teacher, read the attempt (same 404 as missing)", async () => {
    const { id } = await makeAttempt();
    const intruder = makeUser("student");
    const res = await request(app).get(`/api/attempts/${id}`).set("Cookie", intruder.cookie);
    const missing = await request(app)
      .get(`/api/attempts/${crypto.randomUUID()}`)
      .set("Cookie", intruder.cookie);
    expect(res.status).toBe(404);
    expect(res.body).toEqual(missing.body);
    expect(leakedKeys(res.body)).toEqual([]);

    const teacher = makeUser("teacher");
    const asTeacher = await request(app).get(`/api/attempts/${id}`).set("Cookie", teacher.cookie);
    expect(asTeacher.status).toBe(403);
    expect((await request(app).get(`/api/attempts/${id}`)).status).toBe(401);
  });
});

describe("pre-submission payloads never carry an answer key", () => {
  it("GET /api/me/materials and GET /api/materials/:id have no forbidden keys at any depth", async () => {
    const student = makeUser("student");
    const classId = crypto.randomUUID();
    const material = addMaterial();
    enroll(classId, student);
    assign(material, classId);

    const list = await request(app).get("/api/me/materials").set("Cookie", student.cookie);
    expect(list.status).toBe(200);
    expect(list.body.materials).toHaveLength(1);
    expect(collectKeys(list.body).has("options")).toBe(true); // the walk really saw questions
    expect(leakedKeys(list.body)).toEqual([]);

    const one = await request(app)
      .get(`/api/materials/${material.id}`)
      .set("Cookie", student.cookie);
    expect(one.status).toBe(200);
    expect(leakedKeys(one.body)).toEqual([]);
  });
});

describe("PUT /api/me/progress/:materialId", () => {
  function setup() {
    const student = makeUser("student");
    const classId = crypto.randomUUID();
    const material = addMaterial();
    enroll(classId, student);
    assign(material, classId);
    return { student, material };
  }

  it("marking completed twice does not change updated_at the second time", async () => {
    const { student, material } = setup();
    const first = await putProgress(student, material.id, { status: "completed" });
    const second = await putProgress(student, material.id, { status: "completed" });
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.body.progress.status).toBe("completed");
    expect(second.body.progress.updatedAt).toBe(first.body.progress.updatedAt);
    expect(store.progress).toHaveLength(1);
  });

  it("started then completed moves updated_at once; a later started or completed does not", async () => {
    const { student, material } = setup();
    const started = await putProgress(student, material.id, { status: "started" });
    const done = await putProgress(student, material.id, { status: "completed" });
    expect(done.body.progress.status).toBe("completed");
    expect(done.body.progress.updatedAt).not.toBe(started.body.progress.updatedAt);

    const again = await putProgress(student, material.id, { status: "started" });
    const repeat = await putProgress(student, material.id, { status: "completed" });
    expect(again.body.progress).toEqual(done.body.progress); // never downgraded
    expect(repeat.body.progress).toEqual(done.body.progress);
  });

  it("returns 404 for an unassigned material, 400 for a bad status, 403 for a teacher", async () => {
    const student = makeUser("student");
    const material = addMaterial();
    assign(material, crypto.randomUUID());
    expect((await putProgress(student, material.id, { status: "completed" })).status).toBe(404);

    const { student: enrolled, material: ok } = setup();
    expect((await putProgress(enrolled, ok.id, { status: "done" })).status).toBe(400);
    expect((await putProgress(makeUser("teacher"), ok.id, { status: "started" })).status).toBe(403);
    expect(store.progress).toHaveLength(0);
  });

  it("always acts as the session user, whatever studentId is sent", async () => {
    const { student, material } = setup();
    const other = makeUser("student");
    await putProgress(student, material.id, { status: "started", studentId: other.id });
    expect(store.progress.map((p) => p.studentId)).toEqual([student.id]);
  });
});

describe("GET /api/me/progress", () => {
  it("returns only the caller's rows", async () => {
    const mine = makeUser("student");
    const theirs = makeUser("student");
    const classId = crypto.randomUUID();
    const material = addMaterial();
    enroll(classId, mine);
    enroll(classId, theirs);
    assign(material, classId);
    await putProgress(mine, material.id, { status: "completed" });
    await putProgress(theirs, material.id, { status: "started" });

    const res = await request(app).get("/api/me/progress").set("Cookie", mine.cookie);
    expect(res.status).toBe(200);
    expect(res.body.progress).toHaveLength(1);
    expect(res.body.progress[0]).toMatchObject({ materialId: material.id, status: "completed" });
    expect((await request(app).get("/api/me/progress")).status).toBe(401);
  });
});

describe("GET /api/me/materials", () => {
  it("returns only materials from classes the student is enrolled in", async () => {
    const student = makeUser("student");
    const myClass = crypto.randomUUID();
    const otherClass = crypto.randomUUID();
    const visible = addMaterial();
    const hidden = addMaterial();
    const draft = addMaterial("draft");
    enroll(myClass, student);
    assign(visible, myClass);
    assign(hidden, otherClass);
    assign(draft, myClass);

    const res = await request(app).get("/api/me/materials").set("Cookie", student.cookie);
    expect(res.status).toBe(200);
    expect(ids(res.body.materials)).toEqual([visible.id]);
  });

  it("filters by classId, and a class the student is not in yields nothing", async () => {
    const student = makeUser("student");
    const classA = crypto.randomUUID();
    const classB = crypto.randomUUID();
    const foreign = crypto.randomUUID();
    const a = addMaterial();
    const b = addMaterial();
    const secret = addMaterial();
    enroll(classA, student);
    enroll(classB, student);
    assign(a, classA);
    assign(b, classB);
    assign(secret, foreign);

    const get = (query: string) =>
      request(app).get(`/api/me/materials${query}`).set("Cookie", student.cookie);
    expect(ids((await get(`?classId=${classA}`)).body.materials)).toEqual([a.id]);
    expect((await get(`?classId=${foreign}`)).body.materials).toEqual([]);
    expect((await get("?classId=not-a-uuid")).status).toBe(400);
    const asTeacher = await request(app)
      .get("/api/me/materials")
      .set("Cookie", makeUser("teacher").cookie);
    expect(asTeacher.status).toBe(403);
  });
});
