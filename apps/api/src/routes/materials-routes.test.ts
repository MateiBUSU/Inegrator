import { isDeepStrictEqual } from "node:util";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../app";
import { signToken } from "../services/token-service";

// Repositories are replaced by in-memory fakes: the default `npm test` must not need a database.
// Routing, validation, auth middleware, services and the shared schemas are all real. The fake
// material repository reproduces the compare-and-set semantics of updateDraftIf/publishIf.
interface FakeMaterial {
  id: string;
  ownerId: string;
  scope: "class" | "personal";
  kind: string;
  title: string;
  status: "draft" | "published" | "archived";
  source: "manual" | "ai" | "document_based";
  subjectId: string | null;
  chapterId: string | null;
  content: unknown;
  version: number;
  parentId: string | null;
  createdAt: Date;
  publishedAt: Date | null;
}

const store = vi.hoisted(() => ({
  materials: [] as FakeMaterial[],
  classes: [] as { id: string; teacherId: string }[],
  enrollments: [] as { classId: string; studentId: string }[],
  assignments: [] as { materialId: string; classId: string }[],
  subjects: [] as {
    id: string;
    slug: string;
    title: string;
    section: "programa" | "bac";
    language: "cpp" | "python";
    grade: number | null;
  }[],
  chapters: [] as { id: string; subjectId: string }[],
  /** Runs inside publishIf/updateDraftIf before the compare, to simulate a concurrent edit. */
  interleave: null as null | (() => void),
  /** Simulates a class deleted between the ownership check and the assignment insert. */
  failAssignWithUnknownClass: false,
}));

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const fakeErrors = vi.hoisted(() => ({
  DuplicateVersionError: class extends Error {},
  UnknownClassError: class extends Error {},
}));

vi.mock("../repositories/material-repository", () => ({
  DuplicateVersionError: fakeErrors.DuplicateVersionError,
  UnknownClassError: fakeErrors.UnknownClassError,
  createMaterial: async (data: {
    ownerId: string;
    kind: string;
    title: string;
    subjectId: string | null;
    chapterId: string | null;
    content: unknown;
    version?: number;
    parentId?: string | null;
  }) => {
    // Mirrors the partial unique index on (parent_id, version).
    if (
      data.parentId &&
      store.materials.some((m) => m.parentId === data.parentId && m.version === (data.version ?? 1))
    ) {
      throw new fakeErrors.DuplicateVersionError();
    }
    const row: FakeMaterial = {
      id: crypto.randomUUID(),
      ownerId: data.ownerId,
      scope: "class",
      kind: data.kind,
      title: data.title,
      status: "draft",
      source: "manual",
      subjectId: data.subjectId,
      chapterId: data.chapterId,
      content: clone(data.content),
      version: data.version ?? 1,
      parentId: data.parentId ?? null,
      createdAt: new Date(),
      publishedAt: null,
    };
    store.materials.push(row);
    return clone(row) && { ...row, content: clone(row.content) };
  },
  findMaterialById: async (id: string) => {
    const row = store.materials.find((m) => m.id === id);
    return row ? { ...row, content: clone(row.content) } : null;
  },
  listMaterialsByOwner: async (ownerId: string, status?: string) =>
    store.materials
      .filter(
        (m) => m.ownerId === ownerId && m.scope === "class" && (!status || m.status === status),
      )
      .map((m) => ({ ...m, content: clone(m.content) })),
  updateDraftIf: async (
    id: string,
    ownerId: string,
    expected: unknown,
    data: { title: string; subjectId: string | null; chapterId: string | null; content: unknown },
  ) => {
    store.interleave?.();
    const row = store.materials.find(
      (m) =>
        m.id === id &&
        m.ownerId === ownerId &&
        m.status === "draft" &&
        isDeepStrictEqual(m.content, expected),
    );
    if (!row) return false;
    row.title = data.title;
    row.subjectId = data.subjectId;
    row.chapterId = data.chapterId;
    row.content = clone(data.content);
    return true;
  },
  publishIf: async (id: string, ownerId: string, expected: unknown, publishedAt: Date) => {
    store.interleave?.();
    const row = store.materials.find(
      (m) =>
        m.id === id &&
        m.ownerId === ownerId &&
        m.status === "draft" &&
        isDeepStrictEqual(m.content, expected),
    );
    if (!row) return false;
    row.status = "published";
    row.publishedAt = publishedAt;
    return true;
  },
  findClassIdsOwnedBy: async (teacherId: string, classIds: string[]) =>
    store.classes
      .filter((c) => c.teacherId === teacherId && classIds.includes(c.id))
      .map((c) => c.id),
  assignToClasses: async (materialId: string, classIds: string[]) => {
    if (store.failAssignWithUnknownClass) throw new fakeErrors.UnknownClassError();
    for (const classId of classIds) {
      if (!store.assignments.some((a) => a.materialId === materialId && a.classId === classId)) {
        store.assignments.push({ materialId, classId });
      }
    }
  },
  isAssignedToStudent: async (materialId: string, studentId: string) =>
    store.assignments.some(
      (a) =>
        a.materialId === materialId &&
        store.enrollments.some((e) => e.classId === a.classId && e.studentId === studentId),
    ),
}));

vi.mock("../repositories/subject-repository", () => ({
  listSubjects: async () =>
    store.subjects.map((s) => ({
      ...s,
      chapters: store.chapters
        .filter((c) => c.subjectId === s.id)
        .map((c, i) => ({ id: c.id, title: `Capitol ${i + 1}`, position: i + 1, objectives: [] })),
    })),
  findSubjectById: async (id: string) => store.subjects.find((s) => s.id === id) ?? null,
  findChapterById: async (id: string) => store.chapters.find((c) => c.id === id) ?? null,
}));

// --- helpers ---------------------------------------------------------------

interface TestUser {
  id: string;
  cookie: string;
}
const makeUser = (role: "student" | "teacher"): TestUser => {
  const id = crypto.randomUUID();
  return { id, cookie: `token=${signToken({ userId: id, role })}` };
};

const objectives = [
  { id: "o1", text: "Folosește variabile" },
  { id: "o2", text: "Scrie bucle" },
];
const mcq = {
  id: "q1",
  type: "mcq",
  prompt: "Ce afișează cout << 2 + 3;?",
  options: [
    { id: "a", text: "5" },
    { id: "b", text: "23" },
  ],
  correct: ["a"],
  explanation: "2 + 3 este 5 (EXPLICATIE-SECRETA).",
  objectiveId: "o1",
};
const short = {
  id: "q2",
  type: "short",
  prompt: "Ce cuvânt cheie începe o buclă cu test inițial?",
  acceptedAnswers: ["while"],
  explanation: "while verifică condiția înainte.",
  objectiveId: "o2",
};
const programming = {
  id: "q3",
  type: "programming",
  prompt: "Scrie un program care afișează suma a două numere.",
  referenceSolution: "int main(){ /* SOLUTIE-SECRETA */ }",
  rubric: "RUBRICA-SECRETA: citește, adună, afișează.",
  objectiveId: "o1",
};

function materialBody(overrides: Record<string, unknown> = {}) {
  return {
    title: "Test variabile și bucle",
    kind: "test",
    section: "programa",
    language: "cpp",
    grade: 9,
    objectives,
    questions: [mcq, short, programming],
    ...overrides,
  };
}

const NOT_FOUND = { error: { code: "MATERIAL_NOT_FOUND", message: expect.any(String) } };
const FORBIDDEN_KEYS = ["correct", "acceptedAnswers", "referenceSolution", "rubric", "explanation"];

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

type App = ReturnType<typeof createApp>;

async function createAs(app: App, teacher: TestUser, body = materialBody()) {
  const res = await request(app).post("/api/materials").set("Cookie", teacher.cookie).send(body);
  expect(res.status).toBe(201);
  return res.body.material as {
    id: string;
    questions?: { id: string; verification: string }[];
    lesson?: { checkQuestions: { id: string; verification: string }[] };
  };
}
const confirmAll = (app: App, teacher: TestUser, id: string, questionIds = ["q1", "q2", "q3"]) =>
  request(app)
    .post(`/api/materials/${id}/confirm`)
    .set("Cookie", teacher.cookie)
    .send({ questionIds });
const publishAs = (app: App, teacher: TestUser, id: string) =>
  request(app).post(`/api/materials/${id}/publish`).set("Cookie", teacher.cookie);

async function publishedMaterial(app: App, teacher: TestUser, body = materialBody()) {
  const material = await createAs(app, teacher, body);
  const questions = [...(material.questions ?? []), ...(material.lesson?.checkQuestions ?? [])];
  // Nothing to confirm (e.g. a lesson without check questions): publish directly.
  if (questions.length > 0) {
    await confirmAll(
      app,
      teacher,
      material.id,
      questions.map((q) => q.id),
    );
  }
  const res = await publishAs(app, teacher, material.id);
  expect(res.status).toBe(200);
  return material.id;
}

function makeClass(teacher: TestUser) {
  const cls = { id: crypto.randomUUID(), teacherId: teacher.id };
  store.classes.push(cls);
  return cls;
}
function enroll(classId: string, student: TestUser) {
  store.enrollments.push({ classId, studentId: student.id });
}

beforeEach(() => {
  store.materials.length = 0;
  store.classes.length = 0;
  store.enrollments.length = 0;
  store.assignments.length = 0;
  store.subjects.length = 0;
  store.chapters.length = 0;
  store.interleave = null;
  store.failAssignWithUnknownClass = false;
});

// --- POST /api/materials ---------------------------------------------------

describe("POST /api/materials", () => {
  it("creates a manual draft for the teacher, scope class, all questions unchecked", async () => {
    const teacher = makeUser("teacher");
    const res = await request(createApp())
      .post("/api/materials")
      .set("Cookie", teacher.cookie)
      .send(materialBody());

    expect(res.status).toBe(201);
    expect(res.body.material).toMatchObject({
      status: "draft",
      source: "manual",
      version: 1,
      parentId: null,
      publishedAt: null,
      kind: "test",
    });
    expect(
      res.body.material.questions.map((q: { verification: string }) => q.verification),
    ).toEqual(["unchecked", "unchecked", "unchecked"]);
    expect(store.materials[0]).toMatchObject({ ownerId: teacher.id, scope: "class" });
  });

  it("ignores a client-supplied verification: a client cannot confirm its own answers", async () => {
    const teacher = makeUser("teacher");
    const res = await request(createApp())
      .post("/api/materials")
      .set("Cookie", teacher.cookie)
      .send(
        materialBody({
          questions: [{ ...mcq, verification: "teacher_confirmed" }, short, programming],
        }),
      );
    expect(res.status).toBe(201);
    expect(res.body.material.questions[0].verification).toBe("unchecked");
  });

  it("is teacher-only and takes the owner from the session", async () => {
    const app = createApp();
    const student = makeUser("student");
    const teacher = makeUser("teacher");
    const other = makeUser("teacher");
    expect(
      (await request(app).post("/api/materials").set("Cookie", student.cookie).send(materialBody()))
        .status,
    ).toBe(403);
    expect((await request(app).post("/api/materials").send(materialBody())).status).toBe(401);

    await request(app)
      .post("/api/materials")
      .set("Cookie", teacher.cookie)
      .send(materialBody({ ownerId: other.id, owner_id: other.id }));
    expect(store.materials[0]?.ownerId).toBe(teacher.id);
  });

  const rejections: [string, Record<string, unknown>, string][] = [
    [
      "mcq without a correct answer",
      { questions: [{ ...mcq, correct: [] }] },
      "at least one correct",
    ],
    [
      "correct id not in options",
      { questions: [{ ...mcq, correct: ["zzz"] }] },
      "present in options",
    ],
    [
      "duplicate option ids",
      {
        questions: [
          {
            ...mcq,
            options: [
              { id: "a", text: "5" },
              { id: "a", text: "6" },
            ],
          },
        ],
      },
      "duplicate option ids",
    ],
    ["bac with python", { section: "bac", language: "python" }, "bac materials must use cpp"],
    [
      "objectiveId not in the objectives list",
      { questions: [{ ...mcq, objectiveId: "nope" }] },
      "not in the material",
    ],
  ];
  it.each(rejections)(
    "rejects %s with 400 and explains why",
    async (_name, overrides, expected) => {
      const teacher = makeUser("teacher");
      const res = await request(createApp())
        .post("/api/materials")
        .set("Cookie", teacher.cookie)
        .send(materialBody(overrides));
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
      expect(JSON.stringify(res.body.error.details.issues)).toContain(expected);
      expect(store.materials).toHaveLength(0);
    },
  );

  it("rejects lone surrogates with 400, not 500 (jsonb cannot store them)", async () => {
    const teacher = makeUser("teacher");
    const res = await request(createApp())
      .post("/api/materials")
      .set("Cookie", teacher.cookie)
      .send(materialBody({ title: "a\ud800b" }));
    expect(res.status).toBe(400);
    expect(store.materials).toHaveLength(0);
  });

  it("rejects NUL characters with 400, not 500", async () => {
    const teacher = makeUser("teacher");
    const res = await request(createApp())
      .post("/api/materials")
      .set("Cookie", teacher.cookie)
      .send(materialBody({ title: "a\u0000b" }));
    expect(res.status).toBe(400);
  });

  it("links a matching subject and chapter, and rejects mismatches", async () => {
    const app = createApp();
    const teacher = makeUser("teacher");
    const subject = {
      id: crypto.randomUUID(),
      slug: "programa-cpp-9",
      title: "C++ 9",
      section: "programa" as const,
      language: "cpp" as const,
      grade: 9,
    };
    const pythonSubject = {
      ...subject,
      id: crypto.randomUUID(),
      slug: "p-py-9",
      language: "python" as const,
    };
    const otherSubject = { ...subject, id: crypto.randomUUID(), slug: "p-cpp-10", grade: 10 };
    const chapter = { id: crypto.randomUUID(), subjectId: subject.id };
    const foreignChapter = { id: crypto.randomUUID(), subjectId: otherSubject.id };
    store.subjects.push(subject, pythonSubject, otherSubject);
    store.chapters.push(chapter, foreignChapter);
    const post = (extra: Record<string, unknown>) =>
      request(app).post("/api/materials").set("Cookie", teacher.cookie).send(materialBody(extra));

    const ok = await post({ subjectId: subject.id, chapterId: chapter.id });
    expect(ok.status).toBe(201);
    expect(ok.body.material).toMatchObject({ subjectId: subject.id, chapterId: chapter.id });

    for (const bad of [
      { chapterId: chapter.id }, // chapter without subject
      { subjectId: crypto.randomUUID() }, // unknown subject
      { subjectId: pythonSubject.id }, // language mismatch
      { subjectId: otherSubject.id }, // grade mismatch
      { subjectId: subject.id, chapterId: foreignChapter.id }, // chapter of another subject
    ]) {
      const res = await post(bad);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("INVALID_SUBJECT");
    }
    expect(store.materials).toHaveLength(1);
  });
});

// --- GET /api/materials and /api/subjects ------------------------------------

describe("GET /api/materials", () => {
  it("lists only the teacher's own materials, with an optional status filter", async () => {
    const app = createApp();
    const a = makeUser("teacher");
    const b = makeUser("teacher");
    const draft = await createAs(app, a, materialBody({ title: "draft A" }));
    const publishedId = await publishedMaterial(app, a, materialBody({ title: "published A" }));
    await createAs(app, b, materialBody({ title: "B only" }));

    const all = await request(app).get("/api/materials").set("Cookie", a.cookie);
    expect(all.status).toBe(200);
    expect(all.body.materials.map((m: { title: string }) => m.title).sort()).toEqual([
      "draft A",
      "published A",
    ]);
    expect(Object.keys(all.body.materials[0])).not.toContain("questions");

    const onlyPublished = await request(app)
      .get("/api/materials?status=published")
      .set("Cookie", a.cookie);
    expect(onlyPublished.body.materials.map((m: { id: string }) => m.id)).toEqual([publishedId]);
    const onlyDraft = await request(app).get("/api/materials?status=draft").set("Cookie", a.cookie);
    expect(onlyDraft.body.materials.map((m: { id: string }) => m.id)).toEqual([draft.id]);
  });

  it("rejects a bad status filter (400), students (403) and anonymous callers (401)", async () => {
    const app = createApp();
    const teacher = makeUser("teacher");
    const student = makeUser("student");
    expect(
      (await request(app).get("/api/materials?status=nope").set("Cookie", teacher.cookie)).status,
    ).toBe(400);
    expect((await request(app).get("/api/materials").set("Cookie", student.cookie)).status).toBe(
      403,
    );
    expect((await request(app).get("/api/materials")).status).toBe(401);
  });
});

describe("GET /api/subjects", () => {
  it("is available to any signed-in user and rejects anonymous callers", async () => {
    const app = createApp();
    store.subjects.push({
      id: crypto.randomUUID(),
      slug: "bac-cpp",
      title: "Bac C++",
      section: "bac",
      language: "cpp",
      grade: null,
    });
    for (const role of ["student", "teacher"] as const) {
      const res = await request(app).get("/api/subjects").set("Cookie", makeUser(role).cookie);
      expect(res.status).toBe(200);
      expect(res.body.subjects[0]).toMatchObject({ slug: "bac-cpp", grade: null, chapters: [] });
    }
    expect((await request(app).get("/api/subjects")).status).toBe(401);
  });
});

// --- GET /api/materials/:id --------------------------------------------------

describe("GET /api/materials/:id", () => {
  it("gives the owning teacher the full content, answer key included", async () => {
    const app = createApp();
    const teacher = makeUser("teacher");
    const { id } = await createAs(app, teacher);
    const res = await request(app).get(`/api/materials/${id}`).set("Cookie", teacher.cookie);
    expect(res.status).toBe(200);
    expect(res.body.material.questions[0].correct).toEqual(["a"]);
    expect(res.body.material.questions[1].acceptedAnswers).toEqual(["while"]);
    expect(res.body.material.questions[2].referenceSolution).toContain("SOLUTIE-SECRETA");
  });

  it("gives another teacher a 404 identical to a nonexistent material", async () => {
    const app = createApp();
    const owner = makeUser("teacher");
    const intruder = makeUser("teacher");
    const { id } = await createAs(app, owner);

    const forbidden = await request(app).get(`/api/materials/${id}`).set("Cookie", intruder.cookie);
    const missing = await request(app)
      .get(`/api/materials/${crypto.randomUUID()}`)
      .set("Cookie", intruder.cookie);
    expect(forbidden.status).toBe(404);
    expect(forbidden.body).toEqual(NOT_FOUND);
    expect(missing.status).toBe(404);
    expect(missing.body).toEqual(forbidden.body);
  });

  it("gives an assigned, enrolled student the view with NO answer-key keys anywhere", async () => {
    const app = createApp();
    const teacher = makeUser("teacher");
    const student = makeUser("student");
    const cls = makeClass(teacher);
    enroll(cls.id, student);
    const id = await publishedMaterial(app, teacher);
    await request(app)
      .post(`/api/materials/${id}/assign`)
      .set("Cookie", teacher.cookie)
      .send({ classIds: [cls.id] });

    const res = await request(app).get(`/api/materials/${id}`).set("Cookie", student.cookie);
    expect(res.status).toBe(200);
    expect(res.body.material.questions).toHaveLength(3);
    const keys = collectKeys(res.body);
    for (const forbidden of FORBIDDEN_KEYS) expect(keys.has(forbidden)).toBe(false);
    for (const internal of [
      "verification",
      "status",
      "source",
      "ownerId",
      "parentId",
      "publishedAt",
    ]) {
      expect(keys.has(internal)).toBe(false);
    }
    const raw = JSON.stringify(res.body);
    for (const secret of [
      "EXPLICATIE-SECRETA",
      "SOLUTIE-SECRETA",
      "RUBRICA-SECRETA",
      "while verifică",
    ]) {
      expect(raw).not.toContain(secret);
    }
    expect(res.body.material.questions[0].options).toEqual(mcq.options);
  });

  it("strips the answer key from lesson check questions too", async () => {
    const app = createApp();
    const teacher = makeUser("teacher");
    const student = makeUser("student");
    const cls = makeClass(teacher);
    enroll(cls.id, student);
    const id = await publishedMaterial(
      app,
      teacher,
      materialBody({
        kind: "lesson",
        questions: undefined,
        lesson: {
          body: "# Variabile",
          examples: [{ title: "Ex", body: "x = 5" }],
          checkQuestions: [mcq],
        },
      }),
    );
    await request(app)
      .post(`/api/materials/${id}/assign`)
      .set("Cookie", teacher.cookie)
      .send({ classIds: [cls.id] });

    const res = await request(app).get(`/api/materials/${id}`).set("Cookie", student.cookie);
    expect(res.status).toBe(200);
    expect(res.body.material.lesson.body).toBe("# Variabile");
    const keys = collectKeys(res.body);
    for (const forbidden of FORBIDDEN_KEYS) expect(keys.has(forbidden)).toBe(false);
  });

  it("gives a student a 404 (same body as nonexistent) when the material is not assigned to their class", async () => {
    const app = createApp();
    const teacher = makeUser("teacher");
    const student = makeUser("student");
    const classWithStudent = makeClass(teacher);
    const otherClass = makeClass(teacher);
    enroll(classWithStudent.id, student);
    const id = await publishedMaterial(app, teacher);
    // Assigned only to a class this student is NOT in.
    await request(app)
      .post(`/api/materials/${id}/assign`)
      .set("Cookie", teacher.cookie)
      .send({ classIds: [otherClass.id] });

    const res = await request(app).get(`/api/materials/${id}`).set("Cookie", student.cookie);
    const missing = await request(app)
      .get(`/api/materials/${crypto.randomUUID()}`)
      .set("Cookie", student.cookie);
    expect(res.status).toBe(404);
    expect(res.body).toEqual(NOT_FOUND);
    expect(missing.body).toEqual(res.body);

    // Never assigned at all.
    const unassigned = await publishedMaterial(app, teacher);
    expect(
      (await request(app).get(`/api/materials/${unassigned}`).set("Cookie", student.cookie)).status,
    ).toBe(404);
  });

  it("hides drafts and archived materials from students even if an assignment row exists", async () => {
    const app = createApp();
    const teacher = makeUser("teacher");
    const student = makeUser("student");
    const cls = makeClass(teacher);
    enroll(cls.id, student);
    const draft = await createAs(app, teacher);
    store.assignments.push({ materialId: draft.id, classId: cls.id });
    expect(
      (await request(app).get(`/api/materials/${draft.id}`).set("Cookie", student.cookie)).status,
    ).toBe(404);

    const archivedId = await publishedMaterial(app, teacher);
    store.assignments.push({ materialId: archivedId, classId: cls.id });
    const row = store.materials.find((m) => m.id === archivedId);
    if (row) row.status = "archived";
    expect(
      (await request(app).get(`/api/materials/${archivedId}`).set("Cookie", student.cookie)).status,
    ).toBe(404);
  });

  it("rejects a malformed id (400) and anonymous callers (401)", async () => {
    const app = createApp();
    expect(
      (await request(app).get("/api/materials/nope").set("Cookie", makeUser("teacher").cookie))
        .status,
    ).toBe(400);
    expect((await request(app).get(`/api/materials/${crypto.randomUUID()}`)).status).toBe(401);
  });
});

// --- PATCH ---------------------------------------------------------------------

describe("PATCH /api/materials/:id", () => {
  const patch = (app: App, user: TestUser, id: string, body: unknown) =>
    request(app)
      .patch(`/api/materials/${id}`)
      .set("Cookie", user.cookie)
      .send(body as object);

  it("updates a draft; edited questions lose their confirmation, unchanged ones keep it", async () => {
    const app = createApp();
    const teacher = makeUser("teacher");
    const { id } = await createAs(app, teacher);
    await confirmAll(app, teacher, id);

    const edited = { ...mcq, correct: ["b"] }; // changes the answer key of q1 only
    const res = await patch(app, teacher, id, {
      title: "Titlu nou",
      questions: [edited, short, programming],
    });
    expect(res.status).toBe(200);
    expect(res.body.material.title).toBe("Titlu nou");
    const verification = Object.fromEntries(
      res.body.material.questions.map((q: { id: string; verification: string }) => [
        q.id,
        q.verification,
      ]),
    );
    expect(verification).toEqual({
      q1: "unchecked",
      q2: "teacher_confirmed",
      q3: "teacher_confirmed",
    });
  });

  it("a title-only patch keeps every confirmation", async () => {
    const app = createApp();
    const teacher = makeUser("teacher");
    const { id } = await createAs(app, teacher);
    await confirmAll(app, teacher, id);
    const res = await patch(app, teacher, id, { title: "Doar titlul" });
    expect(
      res.body.material.questions.every(
        (q: { verification: string }) => q.verification === "teacher_confirmed",
      ),
    ).toBe(true);
  });

  it("cannot self-confirm through a patch", async () => {
    const app = createApp();
    const teacher = makeUser("teacher");
    const { id } = await createAs(app, teacher);
    const res = await patch(app, teacher, id, {
      questions: [{ ...mcq, verification: "teacher_confirmed" }, short, programming],
    });
    expect(res.status).toBe(200);
    expect(res.body.material.questions[0].verification).toBe("unchecked");
  });

  it("returns 409 for a published material and leaves it untouched", async () => {
    const app = createApp();
    const teacher = makeUser("teacher");
    const id = await publishedMaterial(app, teacher);
    const res = await patch(app, teacher, id, { title: "Încerc să schimb" });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("MATERIAL_NOT_DRAFT");
    expect(store.materials.find((m) => m.id === id)?.title).toBe("Test variabile și bucle");
  });

  it("returns 404 for another teacher, 400 for an invalid merged result, and ignores kind", async () => {
    const app = createApp();
    const teacher = makeUser("teacher");
    const intruder = makeUser("teacher");
    const { id } = await createAs(app, teacher);

    expect((await patch(app, intruder, id, { title: "x" })).status).toBe(404);
    expect((await patch(app, makeUser("student"), id, { title: "x" })).status).toBe(403);

    const bad = await patch(app, teacher, id, { language: "python", section: "bac" });
    expect(bad.status).toBe(400);
    expect(JSON.stringify(bad.body.error.details.issues)).toContain("bac materials must use cpp");

    const badObjective = await patch(app, teacher, id, {
      objectives: [{ id: "other", text: "Alt obiectiv" }],
    });
    expect(badObjective.status).toBe(400);

    const kind = await patch(app, teacher, id, { title: "Același tip", kind: "lesson" });
    expect(kind.status).toBe(200);
    expect(kind.body.material.kind).toBe("test");

    expect((await patch(app, teacher, id, {})).status).toBe(400);
  });
});

// --- confirm + publish -----------------------------------------------------------

describe("POST /api/materials/:id/confirm", () => {
  it("marks the given questions teacher_confirmed and rejects unknown ids", async () => {
    const app = createApp();
    const teacher = makeUser("teacher");
    const { id } = await createAs(app, teacher);

    const res = await confirmAll(app, teacher, id, ["q1", "q3"]);
    expect(res.status).toBe(200);
    const status = Object.fromEntries(
      res.body.material.questions.map((q: { id: string; verification: string }) => [
        q.id,
        q.verification,
      ]),
    );
    expect(status).toEqual({ q1: "teacher_confirmed", q2: "unchecked", q3: "teacher_confirmed" });

    const unknown = await confirmAll(app, teacher, id, ["q1", "ghost"]);
    expect(unknown.status).toBe(400);
    expect(unknown.body.error.details.questionIds).toEqual(["ghost"]);
  });

  it("is owner-only and draft-only", async () => {
    const app = createApp();
    const teacher = makeUser("teacher");
    const { id } = await createAs(app, teacher);
    expect((await confirmAll(app, makeUser("teacher"), id)).status).toBe(404);
    expect((await confirmAll(app, makeUser("student"), id)).status).toBe(403);

    const publishedId = await publishedMaterial(app, teacher);
    expect((await confirmAll(app, teacher, publishedId)).status).toBe(409);
  });
});

describe("POST /api/materials/:id/publish", () => {
  it("is blocked with 409 and lists exactly the unconfirmed question ids", async () => {
    const app = createApp();
    const teacher = makeUser("teacher");
    const { id } = await createAs(app, teacher);

    const none = await publishAs(app, teacher, id);
    expect(none.status).toBe(409);
    expect(none.body.error.code).toBe("UNCONFIRMED_QUESTIONS");
    expect(none.body.error.details.questionIds).toEqual(["q1", "q2", "q3"]);

    await confirmAll(app, teacher, id, ["q2"]);
    const some = await publishAs(app, teacher, id);
    expect(some.status).toBe(409);
    expect(some.body.error.details.questionIds).toEqual(["q1", "q3"]);
    expect(store.materials.find((m) => m.id === id)).toMatchObject({
      status: "draft",
      publishedAt: null,
    });
  });

  it("publishes once every question is confirmed and sets published_at", async () => {
    const app = createApp();
    const teacher = makeUser("teacher");
    const { id } = await createAs(app, teacher);
    await confirmAll(app, teacher, id);

    const res = await publishAs(app, teacher, id);
    expect(res.status).toBe(200);
    expect(res.body.material.status).toBe("published");
    expect(res.body.material.publishedAt).toEqual(expect.any(String));
    expect(store.materials.find((m) => m.id === id)?.publishedAt).toBeInstanceOf(Date);

    const again = await publishAs(app, teacher, id);
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe("MATERIAL_NOT_DRAFT");
  });

  it("an edit after confirming re-blocks publishing", async () => {
    const app = createApp();
    const teacher = makeUser("teacher");
    const { id } = await createAs(app, teacher);
    await confirmAll(app, teacher, id);
    await request(app)
      .patch(`/api/materials/${id}`)
      .set("Cookie", teacher.cookie)
      .send({ questions: [mcq, { ...short, acceptedAnswers: ["do-while"] }, programming] });

    const res = await publishAs(app, teacher, id);
    expect(res.status).toBe(409);
    expect(res.body.error.details.questionIds).toEqual(["q2"]);
  });

  it("refuses to publish content that changed after it was checked (compare-and-set)", async () => {
    const app = createApp();
    const teacher = makeUser("teacher");
    const { id } = await createAs(app, teacher);
    await confirmAll(app, teacher, id);
    // A concurrent edit lands after the confirmation check but before the publish write.
    store.interleave = () => {
      const row = store.materials.find((m) => m.id === id);
      if (row) (row.content as { grade: number }).grade = 10;
    };

    const res = await publishAs(app, teacher, id);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("MATERIAL_CHANGED");
    expect(store.materials.find((m) => m.id === id)?.status).toBe("draft");
  });

  it("lets a lesson without check questions publish, and is owner-only", async () => {
    const app = createApp();
    const teacher = makeUser("teacher");
    const lesson = await createAs(
      app,
      teacher,
      materialBody({ kind: "lesson", questions: undefined, lesson: { body: "# Doar text" } }),
    );
    expect((await publishAs(app, makeUser("teacher"), lesson.id)).status).toBe(404);
    expect((await publishAs(app, makeUser("student"), lesson.id)).status).toBe(403);
    expect((await publishAs(app, teacher, lesson.id)).status).toBe(200);
  });
});

// --- new-version -----------------------------------------------------------------

describe("POST /api/materials/:id/new-version", () => {
  const newVersion = (app: App, user: TestUser, id: string) =>
    request(app).post(`/api/materials/${id}/new-version`).set("Cookie", user.cookie);

  it("copies the content into a new draft, with parent and version+1, verification reset", async () => {
    const app = createApp();
    const teacher = makeUser("teacher");
    const id = await publishedMaterial(app, teacher);
    const original = (await request(app).get(`/api/materials/${id}`).set("Cookie", teacher.cookie))
      .body.material;
    expect(
      original.questions.every(
        (q: { verification: string }) => q.verification === "teacher_confirmed",
      ),
    ).toBe(true);

    const res = await newVersion(app, teacher, id);
    expect(res.status).toBe(201);
    const copy = res.body.material;
    expect(copy).toMatchObject({ status: "draft", version: 2, parentId: id, publishedAt: null });
    expect(copy.id).not.toBe(id);
    expect(
      copy.questions.every((q: { verification: string }) => q.verification === "unchecked"),
    ).toBe(true);

    const strip = (questions: Record<string, unknown>[]) =>
      questions.map(({ verification: _v, ...rest }) => rest);
    expect(strip(copy.questions)).toEqual(strip(original.questions));
    expect(copy.title).toBe(original.title);
    expect(copy.objectives).toEqual(original.objectives);

    // The published original is untouched, and the new draft can be published only after confirming.
    expect(store.materials.find((m) => m.id === id)).toMatchObject({
      status: "published",
      version: 1,
    });
    expect((await publishAs(app, teacher, copy.id)).status).toBe(409);
  });

  it("requires a published source (409), ownership (404) and the teacher role (403)", async () => {
    const app = createApp();
    const teacher = makeUser("teacher");
    const draft = await createAs(app, teacher);
    const draftRes = await newVersion(app, teacher, draft.id);
    expect(draftRes.status).toBe(409);
    expect(draftRes.body.error.code).toBe("MATERIAL_NOT_PUBLISHED");

    const id = await publishedMaterial(app, teacher);
    expect((await newVersion(app, makeUser("teacher"), id)).status).toBe(404);
    expect((await newVersion(app, makeUser("student"), id)).status).toBe(403);
    expect(store.materials.filter((m) => m.parentId === id)).toHaveLength(0);
  });

  it("a repeated new-version call returns 409 instead of a second draft with the same version", async () => {
    const app = createApp();
    const teacher = makeUser("teacher");
    const id = await publishedMaterial(app, teacher);

    const first = await newVersion(app, teacher, id);
    const second = await newVersion(app, teacher, id);
    expect(first.status).toBe(201);
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe("VERSION_EXISTS");
    expect(store.materials.filter((m) => m.parentId === id)).toHaveLength(1);
  });

  it("the new draft is not visible to students of classes the old version was assigned to", async () => {
    const app = createApp();
    const teacher = makeUser("teacher");
    const student = makeUser("student");
    const cls = makeClass(teacher);
    enroll(cls.id, student);
    const id = await publishedMaterial(app, teacher);
    await request(app)
      .post(`/api/materials/${id}/assign`)
      .set("Cookie", teacher.cookie)
      .send({ classIds: [cls.id] });

    const copy = (await newVersion(app, teacher, id)).body.material;
    expect(
      (await request(app).get(`/api/materials/${copy.id}`).set("Cookie", student.cookie)).status,
    ).toBe(404);
    expect(
      (await request(app).get(`/api/materials/${id}`).set("Cookie", student.cookie)).status,
    ).toBe(200);
  });
});

// --- assign ----------------------------------------------------------------------

describe("POST /api/materials/:id/assign", () => {
  const assign = (app: App, user: TestUser, id: string, body: unknown) =>
    request(app)
      .post(`/api/materials/${id}/assign`)
      .set("Cookie", user.cookie)
      .send(body as object);

  it("assigns a published material to the teacher's own classes (idempotent)", async () => {
    const app = createApp();
    const teacher = makeUser("teacher");
    const c1 = makeClass(teacher);
    const c2 = makeClass(teacher);
    const id = await publishedMaterial(app, teacher);

    const res = await assign(app, teacher, id, { classIds: [c1.id, c2.id, c1.id] });
    expect(res.status).toBe(200);
    expect(res.body.classIds.sort()).toEqual([c1.id, c2.id].sort());
    expect(store.assignments).toHaveLength(2);

    expect((await assign(app, teacher, id, { classIds: [c1.id] })).status).toBe(200);
    expect(store.assignments).toHaveLength(2);
  });

  it("rejects the WHOLE request, creating zero rows, if one class belongs to another teacher", async () => {
    const app = createApp();
    const teacher = makeUser("teacher");
    const other = makeUser("teacher");
    const mine1 = makeClass(teacher);
    const mine2 = makeClass(teacher);
    const theirs = makeClass(other);
    const id = await publishedMaterial(app, teacher);

    for (const classIds of [
      [mine1.id, theirs.id, mine2.id],
      [theirs.id],
      [mine1.id, crypto.randomUUID()],
    ]) {
      const res = await assign(app, teacher, id, { classIds });
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe("CLASS_NOT_FOUND");
      expect(store.assignments).toHaveLength(0);
    }
    // The foreign class's students cannot see it either.
    const outsider = makeUser("student");
    enroll(theirs.id, outsider);
    expect(
      (await request(app).get(`/api/materials/${id}`).set("Cookie", outsider.cookie)).status,
    ).toBe(404);
  });

  it("gives the foreign-class and nonexistent-class cases the same response", async () => {
    const app = createApp();
    const teacher = makeUser("teacher");
    const theirs = makeClass(makeUser("teacher"));
    const id = await publishedMaterial(app, teacher);
    const foreign = await assign(app, teacher, id, { classIds: [theirs.id] });
    const ghost = await assign(app, teacher, id, { classIds: [crypto.randomUUID()] });
    expect(foreign.status).toBe(ghost.status);
    expect(foreign.body).toEqual(ghost.body);
  });

  it("accepts uppercase class ids for the teacher's own classes", async () => {
    const app = createApp();
    const teacher = makeUser("teacher");
    const cls = makeClass(teacher);
    const id = await publishedMaterial(app, teacher);
    const res = await assign(app, teacher, id, { classIds: [cls.id.toUpperCase()] });
    expect(res.status).toBe(200);
    expect(res.body.classIds).toEqual([cls.id]);
    expect(store.assignments).toEqual([{ materialId: id, classId: cls.id }]);
  });

  it("returns 404 (not 500) if a class disappears mid-request, with nothing assigned", async () => {
    const app = createApp();
    const teacher = makeUser("teacher");
    const cls = makeClass(teacher);
    const id = await publishedMaterial(app, teacher);
    store.failAssignWithUnknownClass = true;
    const res = await assign(app, teacher, id, { classIds: [cls.id] });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("CLASS_NOT_FOUND");
    expect(store.assignments).toHaveLength(0);
  });

  it("is owner-only: another teacher cannot assign your material, even to their own class", async () => {
    const app = createApp();
    const owner = makeUser("teacher");
    const intruder = makeUser("teacher");
    const intruderClass = makeClass(intruder);
    const id = await publishedMaterial(app, owner);

    const res = await assign(app, intruder, id, { classIds: [intruderClass.id] });
    expect(res.status).toBe(404);
    expect(res.body).toEqual(NOT_FOUND);
    expect(store.assignments).toHaveLength(0);
  });

  it("requires a published material (409), the teacher role (403) and valid input (400)", async () => {
    const app = createApp();
    const teacher = makeUser("teacher");
    const cls = makeClass(teacher);
    const draft = await createAs(app, teacher);

    const notPublished = await assign(app, teacher, draft.id, { classIds: [cls.id] });
    expect(notPublished.status).toBe(409);
    expect(notPublished.body.error.code).toBe("MATERIAL_NOT_PUBLISHED");
    expect(store.assignments).toHaveLength(0);

    const id = await publishedMaterial(app, teacher);
    expect((await assign(app, makeUser("student"), id, { classIds: [cls.id] })).status).toBe(403);
    expect(
      (
        await request(app)
          .post(`/api/materials/${id}/assign`)
          .send({ classIds: [cls.id] })
      ).status,
    ).toBe(401);
    for (const body of [{}, { classIds: [] }, { classIds: ["not-a-uuid"] }, { classIds: "x" }]) {
      expect((await assign(app, teacher, id, body)).status).toBe(400);
    }
    expect(store.assignments).toHaveLength(0);
  });

  it("after assignment, an enrolled student can read it and an unenrolled one still cannot", async () => {
    const app = createApp();
    const teacher = makeUser("teacher");
    const cls = makeClass(teacher);
    const inClass = makeUser("student");
    const outside = makeUser("student");
    enroll(cls.id, inClass);
    const id = await publishedMaterial(app, teacher);
    await assign(app, teacher, id, { classIds: [cls.id] });

    expect(
      (await request(app).get(`/api/materials/${id}`).set("Cookie", inClass.cookie)).status,
    ).toBe(200);
    expect(
      (await request(app).get(`/api/materials/${id}`).set("Cookie", outside.cookie)).status,
    ).toBe(404);
  });
});
