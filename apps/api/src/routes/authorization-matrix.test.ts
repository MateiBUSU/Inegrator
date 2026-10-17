import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../app";
import { signToken } from "../services/token-service";

// One table over a representative protected endpoint from every area (classes, progress,
// documents, materials, attempts, me/gamification). Per endpoint it checks the four outcomes:
// anonymous 401, wrong role 403, wrong owner / not enrolled 404 (the same body as a missing
// resource), and the correct user 200/204. Per-module suites cover the deeper cases; this one
// keeps the whole matrix visible in one place. Repositories are in-memory fakes (no database).
const db = vi.hoisted(() => {
  const id = () => crypto.randomUUID();
  const ids = {
    teacherA: id(),
    teacherB: id(),
    studentIn: id(),
    studentOut: id(),
    classA: id(),
    doc: id(),
    material: id(),
    attempt: id(),
  };
  return { ids };
});

const { ids } = db;

const classRecord = async () => ({
  id: ids.classA,
  teacherId: ids.teacherA,
  name: "9A",
  grade: 9,
  joinCode: "ABC234",
  styleNotes: null,
  createdAt: new Date(),
  teacher: { displayName: "Prof A" },
});

vi.mock("../repositories/class-repository", () => ({
  findClassById: async (classId: string) => (classId === ids.classA ? classRecord() : null),
  listClassesByStudent: async (studentId: string) =>
    studentId === ids.studentIn ? [await classRecord()] : [],
  listClassesByTeacher: async (teacherId: string) =>
    teacherId === ids.teacherA ? [await classRecord()] : [],
  listRoster: async () => [],
  isEnrolled: async (classId: string, studentId: string) =>
    classId === ids.classA && studentId === ids.studentIn,
  findEnrolledStudent: async (classId: string, studentId: string) =>
    classId === ids.classA && studentId === ids.studentIn
      ? { id: studentId, displayName: "Elev" }
      : null,
  setStyleNotes: async () => false,
}));

vi.mock("../repositories/progress-repository", () => ({
  listLessonProgress: async () => [],
  listQuizAttempts: async () => [],
  listProgressByStudent: async () => [],
}));

vi.mock("../repositories/gamification-repository", () => ({
  loadActivityFacts: async () => ({
    attemptDates: [],
    lessons: [],
    answers: { correct: 0, incorrect: 0 },
  }),
}));

vi.mock("../repositories/document-repository", () => ({
  ClassGoneError: class extends Error {},
  listDocumentsByClass: async () => [],
  findDocumentOwner: async (docId: string) =>
    docId === ids.doc ? { id: ids.doc, classId: ids.classA, classTeacherId: ids.teacherA } : null,
  deleteDocument: async () => true,
}));

vi.mock("../repositories/material-repository", () => ({
  findMaterialById: async (materialId: string) =>
    materialId === ids.material
      ? {
          id: ids.material,
          ownerId: ids.teacherA,
          scope: "class",
          kind: "test",
          title: "Lecție",
          status: "published",
          source: "manual",
          subjectId: null,
          chapterId: null,
          content: {
            section: "programa",
            language: "cpp",
            grade: 9,
            objectives: [{ id: "o1", text: "Obiectiv" }],
            questions: [
              {
                id: "s1",
                type: "short",
                prompt: "Cuvânt cheie?",
                acceptedAnswers: ["while"],
                objectiveId: "o1",
                verification: "teacher_confirmed",
              },
              {
                id: "m1",
                type: "mcq",
                prompt: "Care e corect?",
                options: [
                  { id: "a", text: "A" },
                  { id: "b", text: "B" },
                ],
                correct: ["a"],
                explanation: "Explicație",
                objectiveId: "o1",
                verification: "teacher_confirmed",
              },
              {
                id: "p1",
                type: "programming",
                prompt: "Scrie suma.",
                referenceSolution: "int main(){}",
                rubric: "Barem",
                objectiveId: "o1",
                verification: "teacher_confirmed",
              },
            ],
          },
          version: 1,
          parentId: null,
          createdAt: new Date(),
          publishedAt: new Date(),
        }
      : null,
  isAssignedToStudent: async (_materialId: string, studentId: string) =>
    studentId === ids.studentIn,
  listPublishedForStudent: async () => [],
  listMaterialsByOwner: async () => [],
}));

vi.mock("../repositories/subject-repository", () => ({ listSubjects: async () => [] }));

vi.mock("../repositories/attempt-repository", () => ({
  findExistingObjectiveIds: async () => new Set<string>(),
  createAttempt: async () => {
    throw new Error("not used");
  },
  findAttemptById: async (attemptId: string) =>
    attemptId === ids.attempt
      ? {
          id: ids.attempt,
          studentId: ids.studentIn,
          materialId: ids.material,
          submittedAt: new Date(),
          score: 0,
          maxScore: 0,
          answers: [],
        }
      : null,
}));

vi.mock("../repositories/prisma-client", () => ({ prisma: {} }));

const app = createApp();
type Role = "teacher" | "student";
const cookieFor = (userId: string, role: Role) => `token=${signToken({ userId, role })}`;

const teacherA = cookieFor(ids.teacherA, "teacher");
const teacherB = cookieFor(ids.teacherB, "teacher");
const studentIn = cookieFor(ids.studentIn, "student");
const studentOut = cookieFor(ids.studentOut, "student");

interface Row {
  name: string;
  method: "get" | "delete";
  path: string;
  /** Wrong role: expected 403. */
  wrongRole: string;
  /** Right role, wrong owner / not enrolled: expected 404. */
  wrongOwner: string;
  /** The user the endpoint is meant for. */
  owner: string;
  /** Same path with an id that does not exist, to compare the 404 body against. */
  missingPath: string;
  okStatus: number;
}

const missing = () => crypto.randomUUID();

const rows: Row[] = [
  {
    name: "GET /api/classes/:id (teacher)",
    method: "get",
    path: `/api/classes/${ids.classA}`,
    wrongRole: studentOut, // a student gets 404 here, handled below as a special row
    wrongOwner: teacherB,
    owner: teacherA,
    missingPath: `/api/classes/${missing()}`,
    okStatus: 200,
  },
  {
    name: "GET /api/classes/:id/students/:studentId/progress",
    method: "get",
    path: `/api/classes/${ids.classA}/students/${ids.studentIn}/progress`,
    wrongRole: studentIn,
    wrongOwner: teacherB,
    owner: teacherA,
    missingPath: `/api/classes/${missing()}/students/${ids.studentIn}/progress`,
    okStatus: 200,
  },
  {
    name: "GET /api/classes/:id/documents",
    method: "get",
    path: `/api/classes/${ids.classA}/documents`,
    wrongRole: studentIn,
    wrongOwner: teacherB,
    owner: teacherA,
    missingPath: `/api/classes/${missing()}/documents`,
    okStatus: 200,
  },
  {
    name: "DELETE /api/documents/:id",
    method: "delete",
    path: `/api/documents/${ids.doc}`,
    wrongRole: studentIn,
    wrongOwner: teacherB,
    owner: teacherA,
    missingPath: `/api/documents/${missing()}`,
    okStatus: 204,
  },
  {
    name: "GET /api/materials/:id (teacher view)",
    method: "get",
    path: `/api/materials/${ids.material}`,
    wrongRole: "", // GET /:id serves both roles; the student matrix row below covers it
    wrongOwner: teacherB,
    owner: teacherA,
    missingPath: `/api/materials/${missing()}`,
    okStatus: 200,
  },
  {
    name: "GET /api/attempts/:id",
    method: "get",
    path: `/api/attempts/${ids.attempt}`,
    wrongRole: teacherA,
    wrongOwner: studentOut,
    owner: studentIn,
    missingPath: `/api/attempts/${missing()}`,
    okStatus: 200,
  },
];

const call = (method: Row["method"], path: string, cookie?: string) => {
  const req = request(app)[method](path);
  return cookie ? req.set("Cookie", cookie) : req;
};

describe("authorization matrix", () => {
  describe.each(rows)("$name", (row) => {
    it("anonymous: 401", async () => {
      const res = await call(row.method, row.path);
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe("UNAUTHENTICATED");
    });

    it("a tampered or garbage token: 401", async () => {
      expect((await call(row.method, row.path, "token=not-a-jwt")).status).toBe(401);
    });

    it.skipIf(row.wrongRole === "")("wrong role: 403", async () => {
      const res = await call(row.method, row.path, row.wrongRole);
      // GET /classes/:id is open to students (404 when not enrolled), covered separately.
      if (row.path === `/api/classes/${ids.classA}`) {
        expect(res.status).toBe(404);
        return;
      }
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("FORBIDDEN");
    });

    it("wrong owner / not enrolled: 404, identical to a missing resource", async () => {
      const res = await call(row.method, row.path, row.wrongOwner);
      const gone = await call(row.method, row.missingPath, row.wrongOwner);
      expect(res.status).toBe(404);
      expect(gone.status).toBe(404);
      expect(res.body.error.message).toBe(gone.body.error.message);
    });

    it("correct user: success", async () => {
      const res = await call(row.method, row.path, row.owner);
      expect(res.status).toBe(row.okStatus);
    });
  });

  describe("GET /api/classes/:id (student)", () => {
    it("enrolled student 200; a student who is not enrolled gets the same 404 as a missing class", async () => {
      expect((await call("get", `/api/classes/${ids.classA}`, studentIn)).status).toBe(200);
      const out = await call("get", `/api/classes/${ids.classA}`, studentOut);
      const gone = await call("get", `/api/classes/${missing()}`, studentOut);
      expect(out.status).toBe(404);
      expect(out.body).toEqual(gone.body);
    });
  });

  describe("GET /api/materials/:id (student view)", () => {
    it("assigned student 200; a student outside the class gets 404, same as a missing material", async () => {
      expect((await call("get", `/api/materials/${ids.material}`, studentIn)).status).toBe(200);
      const out = await call("get", `/api/materials/${ids.material}`, studentOut);
      const gone = await call("get", `/api/materials/${missing()}`, studentOut);
      expect(out.status).toBe(404);
      expect(out.body).toEqual(gone.body);
    });
  });

  describe("teacher-only material mutations", () => {
    const mutations = [
      ["patch", `/api/materials/${ids.material}`],
      ["post", `/api/materials/${ids.material}/publish`],
      ["post", `/api/materials/${ids.material}/confirm`],
      ["post", `/api/materials/${ids.material}/new-version`],
      ["post", `/api/materials/${ids.material}/assign`],
      ["post", "/api/materials/generate"],
      ["post", `/api/classes/${ids.classA}/style-notes/extract`],
    ] as const;

    it.each(mutations)("%s %s: anonymous 401, student 403", async (method, path) => {
      expect((await request(app)[method](path).send({})).status).toBe(401);
      expect((await request(app)[method](path).set("Cookie", studentIn).send({})).status).toBe(403);
    });

    const ownerChecked = [
      ["patch", "", { title: "Nou" }],
      ["post", "/confirm", { questionIds: ["s1"] }],
      ["post", "/publish", {}],
      ["post", "/new-version", {}],
      ["post", "/assign", { classIds: [ids.classA] }],
    ] as const;

    it.each(ownerChecked)(
      "%s /api/materials/:id%s: another teacher gets the same 404 as for a missing material",
      async (method, suffix, body) => {
        const other = await request(app)
          [method](`/api/materials/${ids.material}${suffix}`)
          .set("Cookie", teacherB)
          .send(body);
        const none = await request(app)
          [method](`/api/materials/${missing()}${suffix}`)
          .set("Cookie", teacherB)
          .send(body);
        expect(other.status).toBe(404);
        expect(other.body).toEqual(none.body);
      },
    );
  });

  describe("student-only /api/me endpoints", () => {
    it.each(["/api/me/gamification", "/api/me/progress", "/api/me/materials"])(
      "%s: anonymous 401, teacher 403, student 200",
      async (path) => {
        expect((await call("get", path)).status).toBe(401);
        expect((await call("get", path, teacherA)).status).toBe(403);
        expect((await call("get", path, studentIn)).status).toBe(200);
      },
    );

    it("POST /api/materials/:id/attempts and PUT /api/me/progress/:id: anonymous 401, teacher 403", async () => {
      const attempt = `/api/materials/${ids.material}/attempts`;
      expect((await request(app).post(attempt).send({ answers: [] })).status).toBe(401);
      expect(
        (await request(app).post(attempt).set("Cookie", teacherA).send({ answers: [] })).status,
      ).toBe(403);
      const progress = `/api/me/progress/${ids.material}`;
      expect((await request(app).put(progress).send({ status: "started" })).status).toBe(401);
      expect(
        (await request(app).put(progress).set("Cookie", teacherA).send({ status: "started" }))
          .status,
      ).toBe(403);
    });
  });

  describe("class creation and joining", () => {
    it("POST /api/classes is teacher-only and POST /api/classes/join is student-only", async () => {
      const create = { name: "9B", grade: 9 };
      expect((await request(app).post("/api/classes").send(create)).status).toBe(401);
      expect(
        (await request(app).post("/api/classes").set("Cookie", studentIn).send(create)).status,
      ).toBe(403);
      const join = { joinCode: "ABC234" };
      expect((await request(app).post("/api/classes/join").send(join)).status).toBe(401);
      expect(
        (await request(app).post("/api/classes/join").set("Cookie", teacherA).send(join)).status,
      ).toBe(403);
    });
  });

  describe("responses never carry secrets", () => {
    const STUDENT_FORBIDDEN = [
      "correct",
      "acceptedAnswers",
      "referenceSolution",
      "rubric",
      "explanation",
      "verification",
    ];
    const NEVER = ["password_hash", "passwordHash", "password"];
    const keysOf = (value: unknown, keys = new Set<string>()): Set<string> => {
      if (Array.isArray(value)) value.forEach((item) => keysOf(item, keys));
      else if (value && typeof value === "object") {
        for (const [key, inner] of Object.entries(value)) {
          keys.add(key);
          keysOf(inner, keys);
        }
      }
      return keys;
    };

    const studentGets = [
      "/api/classes",
      `/api/classes/${ids.classA}`,
      `/api/materials/${ids.material}`,
      "/api/me/materials",
      "/api/me/progress",
      "/api/me/gamification",
      "/api/subjects",
    ];
    const teacherGets = [
      "/api/classes",
      `/api/classes/${ids.classA}`,
      `/api/classes/${ids.classA}/documents`,
      `/api/classes/${ids.classA}/students/${ids.studentIn}/progress`,
      `/api/materials/${ids.material}`,
      "/api/materials",
      "/api/subjects",
    ];

    it.each(studentGets)("student GET %s has no answer key and no credentials", async (path) => {
      const res = await call("get", path, studentIn);
      expect(res.status).toBe(200);
      const found = keysOf(res.body);
      expect([...STUDENT_FORBIDDEN, ...NEVER].filter((k) => found.has(k))).toEqual([]);
    });

    it.each(teacherGets)("teacher GET %s has no credentials", async (path) => {
      const res = await call("get", path, teacherA);
      expect(res.status).toBe(200);
      const found = keysOf(res.body);
      expect(NEVER.filter((k) => found.has(k))).toEqual([]);
    });

    it("the student view of the fixture really does contain an answer key to hide", async () => {
      const teacherView = await call("get", `/api/materials/${ids.material}`, teacherA);
      const teacherKeys = keysOf(teacherView.body);
      expect(STUDENT_FORBIDDEN.filter((k) => !teacherKeys.has(k))).toEqual([]);
    });
  });
});
