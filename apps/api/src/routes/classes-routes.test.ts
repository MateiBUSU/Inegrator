import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../app";
import { signToken } from "../services/token-service";

// Repositories are replaced by in-memory fakes: the default `npm test` must not need a database.
// Routing, validation, auth middleware, services and rate limiting are all real.
const store = vi.hoisted(() => ({
  users: new Map<string, { displayName: string }>(),
  classes: [] as {
    id: string;
    teacherId: string;
    name: string;
    grade: number;
    joinCode: string;
    createdAt: Date;
  }[],
  enrollments: [] as { classId: string; studentId: string; joinedAt: Date }[],
  lessons: [] as {
    classId: string;
    studentId: string;
    materialId: string;
    status: "started" | "completed";
    updatedAt: Date;
  }[],
  attempts: [] as {
    id: string;
    classId: string;
    studentId: string;
    materialId: string;
    score: number;
    maxScore: number;
    submittedAt: Date;
  }[],
  forcedCodes: [] as string[],
}));

vi.mock("../services/join-code", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../services/join-code")>();
  return { generateJoinCode: () => store.forcedCodes.shift() ?? actual.generateJoinCode() };
});

vi.mock("../repositories/class-repository", () => {
  class JoinCodeTakenError extends Error {}
  class UnknownUserError extends Error {}
  const withTeacher = (c: (typeof store.classes)[number]) => ({
    ...c,
    teacher: { displayName: store.users.get(c.teacherId)?.displayName ?? "?" },
  });
  return {
    JoinCodeTakenError,
    UnknownUserError,
    createClass: async (data: {
      teacherId: string;
      name: string;
      grade: number;
      joinCode: string;
    }) => {
      if (!store.users.has(data.teacherId)) throw new UnknownUserError();
      if (store.classes.some((c) => c.joinCode === data.joinCode)) throw new JoinCodeTakenError();
      const row = { id: crypto.randomUUID(), createdAt: new Date(), ...data };
      store.classes.push(row);
      return withTeacher(row);
    },
    findClassById: async (id: string) => {
      const c = store.classes.find((x) => x.id === id);
      return c ? withTeacher(c) : null;
    },
    findClassByJoinCode: async (code: string) => {
      const c = store.classes.find((x) => x.joinCode === code);
      return c ? withTeacher(c) : null;
    },
    listClassesByTeacher: async (teacherId: string) =>
      store.classes.filter((c) => c.teacherId === teacherId).map(withTeacher),
    listClassesByStudent: async (studentId: string) =>
      store.classes
        .filter((c) =>
          store.enrollments.some((e) => e.classId === c.id && e.studentId === studentId),
        )
        .map(withTeacher),
    isEnrolled: async (classId: string, studentId: string) =>
      store.enrollments.some((e) => e.classId === classId && e.studentId === studentId),
    ensureEnrollment: async (classId: string, studentId: string) => {
      if (!store.users.has(studentId)) throw new UnknownUserError();
      if (!store.enrollments.some((e) => e.classId === classId && e.studentId === studentId)) {
        store.enrollments.push({ classId, studentId, joinedAt: new Date() });
      }
    },
    listRoster: async (classId: string) =>
      store.enrollments
        .filter((e) => e.classId === classId)
        .map((e) => ({
          studentId: e.studentId,
          displayName: store.users.get(e.studentId)?.displayName ?? "?",
          joinedAt: e.joinedAt,
        })),
    findEnrolledStudent: async (classId: string, studentId: string) =>
      store.enrollments.some((e) => e.classId === classId && e.studentId === studentId)
        ? { id: studentId, displayName: store.users.get(studentId)?.displayName ?? "?" }
        : null,
  };
});

vi.mock("../repositories/progress-repository", () => ({
  listLessonProgress: async (classId: string, studentId: string) =>
    store.lessons.filter((l) => l.classId === classId && l.studentId === studentId),
  listQuizAttempts: async (classId: string, studentId: string) =>
    store.attempts.filter((a) => a.classId === classId && a.studentId === studentId),
}));

interface TestUser {
  id: string;
  cookie: string;
}

function makeUser(role: "student" | "teacher", displayName: string): TestUser {
  const id = crypto.randomUUID();
  store.users.set(id, { displayName });
  return { id, cookie: `token=${signToken({ userId: id, role })}` };
}

async function createClassAs(app: ReturnType<typeof createApp>, teacher: TestUser, name = "9A") {
  const res = await request(app)
    .post("/api/classes")
    .set("Cookie", teacher.cookie)
    .send({ name, grade: 9 });
  expect(res.status).toBe(201);
  return res.body.class as { id: string; join_code: string };
}

const NOT_FOUND = { error: { code: "CLASS_NOT_FOUND", message: expect.any(String) } };

beforeEach(() => {
  store.users.clear();
  store.classes.length = 0;
  store.enrollments.length = 0;
  store.lessons.length = 0;
  store.attempts.length = 0;
  store.forcedCodes.length = 0;
});

describe("POST /api/classes", () => {
  it("lets a teacher create a class with a typeable join code", async () => {
    const teacher = makeUser("teacher", "Prof");
    const res = await request(createApp())
      .post("/api/classes")
      .set("Cookie", teacher.cookie)
      .send({ name: "  9A  ", grade: 9 });

    expect(res.status).toBe(201);
    expect(res.body.class).toMatchObject({ name: "9A", grade: 9 });
    expect(res.body.class.join_code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    expect(store.classes[0]?.teacherId).toBe(teacher.id);
  });

  it("rejects students (403), anonymous callers (401) and invalid input (400)", async () => {
    const app = createApp();
    const student = makeUser("student", "Elev");
    const teacher = makeUser("teacher", "Prof");

    expect(
      (
        await request(app)
          .post("/api/classes")
          .set("Cookie", student.cookie)
          .send({ name: "x", grade: 9 })
      ).status,
    ).toBe(403);
    expect((await request(app).post("/api/classes").send({ name: "x", grade: 9 })).status).toBe(
      401,
    );
    for (const body of [
      { name: "x", grade: 8 },
      { name: "x", grade: 13 },
      { name: "x", grade: 9.5 },
      { name: "", grade: 10 },
      { grade: 10 },
    ]) {
      const res = await request(app).post("/api/classes").set("Cookie", teacher.cookie).send(body);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    }
  });

  it("retries with a new join code when the first one collides", async () => {
    const app = createApp();
    const teacher = makeUser("teacher", "Prof");
    store.forcedCodes.push("ABC234");
    await createClassAs(app, teacher, "first");

    store.forcedCodes.push("ABC234", "ABC234", "XYZ789");
    const second = await createClassAs(app, teacher, "second");
    expect(second.join_code).toBe("XYZ789");
  });

  it("returns 503 after exhausting join-code retries", async () => {
    const app = createApp();
    const teacher = makeUser("teacher", "Prof");
    store.forcedCodes.push("ABC234");
    await createClassAs(app, teacher, "first");

    store.forcedCodes.push(...Array<string>(8).fill("ABC234"));
    const res = await request(app)
      .post("/api/classes")
      .set("Cookie", teacher.cookie)
      .send({ name: "second", grade: 9 });
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe("JOIN_CODE_UNAVAILABLE");
    expect(store.classes).toHaveLength(1);
  });

  it("rejects control characters (including NUL) in the class name with 400", async () => {
    const teacher = makeUser("teacher", "Prof");
    for (const name of ["9\u0000A", "9\nA", "\u0007"]) {
      const res = await request(createApp())
        .post("/api/classes")
        .set("Cookie", teacher.cookie)
        .send({ name, grade: 9 });
      expect(res.status).toBe(400);
    }
    expect(store.classes).toHaveLength(0);
  });

  it("takes the owner from the session, not from the body", async () => {
    const app = createApp();
    const teacher = makeUser("teacher", "Prof");
    const other = makeUser("teacher", "Alt Prof");
    const res = await request(app)
      .post("/api/classes")
      .set("Cookie", teacher.cookie)
      .send({ name: "9A", grade: 9, teacher_id: other.id, teacherId: other.id });
    expect(res.status).toBe(201);
    expect(store.classes[0]?.teacherId).toBe(teacher.id);
  });
});

describe("GET /api/classes", () => {
  it("returns only the teacher's own classes, with join codes", async () => {
    const app = createApp();
    const a = makeUser("teacher", "A");
    const b = makeUser("teacher", "B");
    const mine = await createClassAs(app, a, "mine");
    await createClassAs(app, b, "theirs");

    const res = await request(app).get("/api/classes").set("Cookie", a.cookie);
    expect(res.status).toBe(200);
    expect(res.body.classes).toHaveLength(1);
    expect(res.body.classes[0]).toMatchObject({ id: mine.id, join_code: mine.join_code });
  });

  it("returns only the classes a student is enrolled in, without join codes", async () => {
    const app = createApp();
    const teacher = makeUser("teacher", "Prof");
    const student = makeUser("student", "Elev");
    const joined = await createClassAs(app, teacher, "joined");
    await createClassAs(app, teacher, "not joined");
    await request(app)
      .post("/api/classes/join")
      .set("Cookie", student.cookie)
      .send({ code: joined.join_code });

    const res = await request(app).get("/api/classes").set("Cookie", student.cookie);
    expect(res.status).toBe(200);
    expect(res.body.classes).toHaveLength(1);
    expect(Object.keys(res.body.classes[0]).sort()).toEqual([
      "grade",
      "id",
      "name",
      "teacher_display_name",
    ]);
    expect(JSON.stringify(res.body)).not.toContain(joined.join_code);
  });

  it("requires authentication", async () => {
    expect((await request(createApp()).get("/api/classes")).status).toBe(401);
  });
});

describe("GET /api/classes/:id authorization", () => {
  it("gives teacher A a 404 for teacher B's class, identical to a nonexistent class", async () => {
    const app = createApp();
    const a = makeUser("teacher", "A");
    const b = makeUser("teacher", "B");
    const bClass = await createClassAs(app, b);

    const forbidden = await request(app).get(`/api/classes/${bClass.id}`).set("Cookie", a.cookie);
    const missing = await request(app)
      .get(`/api/classes/${crypto.randomUUID()}`)
      .set("Cookie", a.cookie);

    expect(forbidden.status).toBe(404);
    expect(forbidden.body).toEqual(NOT_FOUND);
    expect(missing.status).toBe(404);
    expect(missing.body).toEqual(forbidden.body);
  });

  it("gives a student who is not enrolled a 404", async () => {
    const app = createApp();
    const teacher = makeUser("teacher", "Prof");
    const outsider = makeUser("student", "Intrus");
    const cls = await createClassAs(app, teacher);

    const res = await request(app).get(`/api/classes/${cls.id}`).set("Cookie", outsider.cookie);
    expect(res.status).toBe(404);
    expect(res.body).toEqual(NOT_FOUND);
  });

  it("shows the owning teacher the join code and the roster (no emails)", async () => {
    const app = createApp();
    const teacher = makeUser("teacher", "Prof");
    const student = makeUser("student", "Maria");
    const cls = await createClassAs(app, teacher);
    await request(app)
      .post("/api/classes/join")
      .set("Cookie", student.cookie)
      .send({ code: cls.join_code });

    const res = await request(app).get(`/api/classes/${cls.id}`).set("Cookie", teacher.cookie);
    expect(res.status).toBe(200);
    expect(res.body.class.join_code).toBe(cls.join_code);
    expect(res.body.class.students).toHaveLength(1);
    expect(Object.keys(res.body.class.students[0]).sort()).toEqual([
      "display_name",
      "id",
      "joined_at",
    ]);
    expect(res.body.class.students[0]).toMatchObject({ id: student.id, display_name: "Maria" });
  });

  it("gives an enrolled student the class without the student list or join code", async () => {
    const app = createApp();
    const teacher = makeUser("teacher", "Prof");
    const student = makeUser("student", "Maria");
    const classmate = makeUser("student", "Ion Secretul");
    const cls = await createClassAs(app, teacher);
    for (const s of [student, classmate]) {
      await request(app)
        .post("/api/classes/join")
        .set("Cookie", s.cookie)
        .send({ code: cls.join_code });
    }

    const res = await request(app).get(`/api/classes/${cls.id}`).set("Cookie", student.cookie);
    expect(res.status).toBe(200);
    expect(Object.keys(res.body)).toEqual(["class"]);
    expect(Object.keys(res.body.class).sort()).toEqual([
      "grade",
      "id",
      "name",
      "teacher_display_name",
    ]);
    expect(res.body.class).not.toHaveProperty("join_code");
    expect(res.body.class).not.toHaveProperty("students");
    const raw = JSON.stringify(res.body);
    expect(raw).not.toContain(cls.join_code);
    expect(raw).not.toContain("Ion Secretul");
    expect(raw).not.toContain(classmate.id);
  });

  it("rejects a malformed id with 400 and requires authentication", async () => {
    const app = createApp();
    const teacher = makeUser("teacher", "Prof");
    const bad = await request(app).get("/api/classes/not-a-uuid").set("Cookie", teacher.cookie);
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe("VALIDATION_ERROR");
    expect((await request(app).get(`/api/classes/${crypto.randomUUID()}`)).status).toBe(401);
  });
});

describe("POST /api/classes/join", () => {
  it("enrolls a student, and joining again is idempotent", async () => {
    const app = createApp();
    const teacher = makeUser("teacher", "Prof");
    const student = makeUser("student", "Elev");
    const cls = await createClassAs(app, teacher);

    const first = await request(app)
      .post("/api/classes/join")
      .set("Cookie", student.cookie)
      .send({ code: cls.join_code });
    const again = await request(app)
      .post("/api/classes/join")
      .set("Cookie", student.cookie)
      .send({ code: cls.join_code });

    expect(first.status).toBe(200);
    expect(again.status).toBe(200);
    expect(again.body).toEqual(first.body);
    expect(first.body.class).toMatchObject({ id: cls.id, teacher_display_name: "Prof" });
    expect(first.body.class).not.toHaveProperty("join_code");
    expect(store.enrollments.filter((e) => e.studentId === student.id)).toHaveLength(1);
  });

  it("accepts the code in any case with surrounding spaces", async () => {
    const app = createApp();
    const teacher = makeUser("teacher", "Prof");
    const student = makeUser("student", "Elev");
    store.forcedCodes.push("QWERTY");
    await createClassAs(app, teacher);

    const res = await request(app)
      .post("/api/classes/join")
      .set("Cookie", student.cookie)
      .send({ code: " qwerty " });
    expect(res.status).toBe(200);
    expect(store.enrollments).toHaveLength(1);
  });

  it("returns a clean 404 for an unknown code, not a 500", async () => {
    const student = makeUser("student", "Elev");
    const res = await request(createApp())
      .post("/api/classes/join")
      .set("Cookie", student.cookie)
      .send({ code: "ZZZZZZ" });
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: { code: "INVALID_JOIN_CODE", message: expect.any(String) } });
    expect(store.enrollments).toHaveLength(0);
  });

  it("validates the body, is student-only, and ignores identity fields in the body", async () => {
    const app = createApp();
    const teacher = makeUser("teacher", "Prof");
    const student = makeUser("student", "Elev");
    const victim = makeUser("student", "Victima");
    const cls = await createClassAs(app, teacher);

    expect(
      (await request(app).post("/api/classes/join").set("Cookie", student.cookie).send({})).status,
    ).toBe(400);
    expect(
      (
        await request(app)
          .post("/api/classes/join")
          .set("Cookie", teacher.cookie)
          .send({ code: cls.join_code })
      ).status,
    ).toBe(403);
    expect(
      (await request(app).post("/api/classes/join").send({ code: cls.join_code })).status,
    ).toBe(401);

    await request(app)
      .post("/api/classes/join")
      .set("Cookie", student.cookie)
      .send({ code: cls.join_code, student_id: victim.id });
    expect(store.enrollments.map((e) => e.studentId)).toEqual([student.id]);
  });

  it("rate limits repeated wrong codes but not successful joins", async () => {
    const app = createApp();
    const teacher = makeUser("teacher", "Prof");
    const cls = await createClassAs(app, teacher);

    for (let i = 0; i < 25; i++) {
      const s = makeUser("student", `Elev ${i}`);
      const res = await request(app)
        .post("/api/classes/join")
        .set("Cookie", s.cookie)
        .send({ code: cls.join_code });
      expect(res.status).toBe(200);
    }

    const guesser = makeUser("student", "Ghicitor");
    for (let i = 0; i < 20; i++) {
      expect(
        (
          await request(app)
            .post("/api/classes/join")
            .set("Cookie", guesser.cookie)
            .send({ code: "NOPE22" })
        ).status,
      ).toBe(404);
    }
    const limited = await request(app)
      .post("/api/classes/join")
      .set("Cookie", guesser.cookie)
      .send({ code: "NOPE22" });
    expect(limited.status).toBe(429);
    expect(limited.body.error.code).toBe("RATE_LIMITED");

    // Keyed per user, not per IP: a different student on the same IP is unaffected.
    const innocent = makeUser("student", "Nevinovat");
    const ok = await request(app)
      .post("/api/classes/join")
      .set("Cookie", innocent.cookie)
      .send({ code: cls.join_code });
    expect(ok.status).toBe(200);
    const typo = await request(app)
      .post("/api/classes/join")
      .set("Cookie", innocent.cookie)
      .send({ code: "NOPE22" });
    expect(typo.status).toBe(404);
  });

  it("rejects NUL bytes, symbols and oversized codes with 400, not 500", async () => {
    const app = createApp();
    const student = makeUser("student", "Elev");
    for (const code of ["A\u0000B", "AB-CD", "ab cd", "A".repeat(21), 123]) {
      const res = await request(app)
        .post("/api/classes/join")
        .set("Cookie", student.cookie)
        .send({ code });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    }
  });

  it("returns 401 (not 500) for a valid token whose user no longer exists", async () => {
    const app = createApp();
    const teacher = makeUser("teacher", "Prof");
    const student = makeUser("student", "Elev");
    const cls = await createClassAs(app, teacher);
    store.users.delete(student.id);
    store.users.delete(teacher.id);

    const join = await request(app)
      .post("/api/classes/join")
      .set("Cookie", student.cookie)
      .send({ code: cls.join_code });
    const create = await request(app)
      .post("/api/classes")
      .set("Cookie", teacher.cookie)
      .send({ name: "x", grade: 9 });
    expect(join.status).toBe(401);
    expect(create.status).toBe(401);
    expect(join.body.error.code).toBe("UNAUTHENTICATED");
  });
});

describe("GET /api/classes/:id/students/:studentId/progress", () => {
  async function setup() {
    const app = createApp();
    const teacher = makeUser("teacher", "Prof");
    const student = makeUser("student", "Maria");
    const cls = await createClassAs(app, teacher);
    await request(app)
      .post("/api/classes/join")
      .set("Cookie", student.cookie)
      .send({ code: cls.join_code });
    return { app, teacher, student, cls };
  }
  const url = (classId: string, studentId: string) =>
    `/api/classes/${classId}/students/${studentId}/progress`;

  it("returns an empty result for an enrolled student with no activity", async () => {
    const { app, teacher, student, cls } = await setup();
    const res = await request(app).get(url(cls.id, student.id)).set("Cookie", teacher.cookie);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      student: { id: student.id, display_name: "Maria" },
      lesson_progress: [],
      quiz_attempts: [],
    });
  });

  it("returns lesson progress and quiz attempts for that class only", async () => {
    const { app, teacher, student, cls } = await setup();
    const otherClass = await createClassAs(app, teacher, "other");
    const materialId = crypto.randomUUID();
    store.lessons.push(
      {
        classId: cls.id,
        studentId: student.id,
        materialId,
        status: "completed",
        updatedAt: new Date(),
      },
      {
        classId: otherClass.id,
        studentId: student.id,
        materialId: crypto.randomUUID(),
        status: "started",
        updatedAt: new Date(),
      },
    );
    store.attempts.push({
      id: crypto.randomUUID(),
      classId: cls.id,
      studentId: student.id,
      materialId,
      score: 7,
      maxScore: 10,
      submittedAt: new Date(),
    });

    const res = await request(app).get(url(cls.id, student.id)).set("Cookie", teacher.cookie);
    expect(res.status).toBe(200);
    expect(res.body.lesson_progress).toEqual([
      { material_id: materialId, status: "completed", updated_at: expect.any(String) },
    ]);
    expect(res.body.quiz_attempts).toEqual([
      {
        id: expect.any(String),
        material_id: materialId,
        score: 7,
        max_score: 10,
        submitted_at: expect.any(String),
      },
    ]);
  });

  it("gives another teacher a 404 for a class they do not own", async () => {
    const { app, student, cls } = await setup();
    const intruder = makeUser("teacher", "Intrus");
    const res = await request(app).get(url(cls.id, student.id)).set("Cookie", intruder.cookie);
    expect(res.status).toBe(404);
    expect(res.body).toEqual(NOT_FOUND);
  });

  it("gives the owning teacher a 404 for a student who is not in the class", async () => {
    const { app, teacher, cls } = await setup();
    const stranger = makeUser("student", "Strain");
    const res = await request(app).get(url(cls.id, stranger.id)).set("Cookie", teacher.cookie);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("STUDENT_NOT_FOUND");
    expect(store.lessons).toHaveLength(0);
  });

  it("is teacher-only: students get 403 (even for themselves), anonymous gets 401, bad ids get 400", async () => {
    const { app, teacher, student, cls } = await setup();
    expect(
      (await request(app).get(url(cls.id, student.id)).set("Cookie", student.cookie)).status,
    ).toBe(403);
    expect((await request(app).get(url(cls.id, student.id))).status).toBe(401);
    expect(
      (await request(app).get(url("nope", student.id)).set("Cookie", teacher.cookie)).status,
    ).toBe(400);
    expect((await request(app).get(url(cls.id, "nope")).set("Cookie", teacher.cookie)).status).toBe(
      400,
    );
  });
});
