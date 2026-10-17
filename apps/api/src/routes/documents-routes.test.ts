import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_DOCUMENT_BYTES, MAX_DOCUMENTS_PER_CLASS } from "@app/shared";
import { createApp } from "../app";
import { signToken } from "../services/token-service";

// Repositories are replaced by in-memory fakes: the default `npm test` must not need a database.
// Routing, validation, auth middleware, services, chunking and the shared schemas are real.
// The fake document repository cascades chunks on delete, like the real foreign key.
const store = vi.hoisted(() => ({
  classes: [] as { id: string; teacherId: string; styleNotes: string | null }[],
  documents: [] as {
    id: string;
    classId: string;
    teacherId: string;
    title: string;
    createdAt: Date;
  }[],
  chunks: [] as { documentId: string; position: number; text: string }[],
  /** Simulates the class being deleted between the ownership check and the insert. */
  failCreateWithClassGone: false,
}));

const fakeErrors = vi.hoisted(() => ({ ClassGoneError: class extends Error {} }));

vi.mock("../repositories/class-repository", () => ({
  findClassById: async (id: string) => {
    const c = store.classes.find((x) => x.id === id);
    return c ? { ...c, teacher: { displayName: "Prof" } } : null;
  },
  setStyleNotes: async (classId: string, teacherId: string, styleNotes: string | null) => {
    const c = store.classes.find((x) => x.id === classId && x.teacherId === teacherId);
    if (!c) return false;
    c.styleNotes = styleNotes;
    return true;
  },
}));

vi.mock("../repositories/document-repository", () => ({
  ClassGoneError: fakeErrors.ClassGoneError,
  countDocumentsByClass: async (classId: string) =>
    store.documents.filter((d) => d.classId === classId).length,
  createDocumentWithChunks: async (data: {
    classId: string;
    teacherId: string;
    title: string;
    chunks: string[];
  }) => {
    if (store.failCreateWithClassGone) throw new fakeErrors.ClassGoneError();
    const doc = {
      id: crypto.randomUUID(),
      classId: data.classId,
      teacherId: data.teacherId,
      title: data.title,
      createdAt: new Date(),
    };
    store.documents.push(doc);
    data.chunks.forEach((text, position) =>
      store.chunks.push({ documentId: doc.id, position, text }),
    );
    return {
      id: doc.id,
      title: doc.title,
      createdAt: doc.createdAt,
      chunkCount: data.chunks.length,
    };
  },
  listDocumentsByClass: async (classId: string) =>
    store.documents
      .filter((d) => d.classId === classId)
      .map((d) => ({
        id: d.id,
        title: d.title,
        createdAt: d.createdAt,
        chunkCount: store.chunks.filter((c) => c.documentId === d.id).length,
      })),
  findDocumentOwner: async (id: string) => {
    const d = store.documents.find((x) => x.id === id);
    const c = d && store.classes.find((x) => x.id === d.classId);
    return d && c ? { id: d.id, classId: d.classId, classTeacherId: c.teacherId } : null;
  },
  deleteDocument: async (id: string) => {
    const index = store.documents.findIndex((d) => d.id === id);
    if (index < 0) return false;
    store.documents.splice(index, 1);
    for (let i = store.chunks.length - 1; i >= 0; i--) {
      if (store.chunks[i]?.documentId === id) store.chunks.splice(i, 1);
    }
    return true;
  },
  listChunksForClass: async () => [],
}));

interface TestUser {
  id: string;
  cookie: string;
}
const makeUser = (role: "student" | "teacher"): TestUser => {
  const id = crypto.randomUUID();
  return { id, cookie: `token=${signToken({ userId: id, role })}` };
};
function makeClass(teacher: TestUser) {
  const cls = {
    id: crypto.randomUUID(),
    teacherId: teacher.id,
    styleNotes: null as string | null,
  };
  store.classes.push(cls);
  return cls;
}

const NOT_FOUND_CLASS = { error: { code: "CLASS_NOT_FOUND", message: expect.any(String) } };
const NOT_FOUND_DOC = { error: { code: "DOCUMENT_NOT_FOUND", message: expect.any(String) } };

const sentence = "Bucla while repetă instrucțiunile cât timp condiția este adevărată. ";
const longText = Array.from(
  { length: 30 },
  (_, i) => `Paragraful ${i}. ${sentence.repeat(6)}`,
).join("\n\n");

type App = ReturnType<typeof createApp>;
const postDoc = (app: App, user: TestUser, classId: string, body: unknown) =>
  request(app)
    .post(`/api/classes/${classId}/documents`)
    .set("Cookie", user.cookie)
    .send(body as object);
const listDocs = (app: App, user: TestUser, classId: string) =>
  request(app).get(`/api/classes/${classId}/documents`).set("Cookie", user.cookie);
const deleteDoc = (app: App, user: TestUser, id: string) =>
  request(app).delete(`/api/documents/${id}`).set("Cookie", user.cookie);
const patchNotes = (app: App, user: TestUser, classId: string, body: unknown) =>
  request(app)
    .patch(`/api/classes/${classId}/style-notes`)
    .set("Cookie", user.cookie)
    .send(body as object);

beforeEach(() => {
  store.failCreateWithClassGone = false;
  store.classes.length = 0;
  store.documents.length = 0;
  store.chunks.length = 0;
});

describe("POST /api/classes/:id/documents", () => {
  it("stores the document and chunks it with sequential positions starting at 0", async () => {
    const app = createApp();
    const teacher = makeUser("teacher");
    const cls = makeClass(teacher);

    const res = await postDoc(app, teacher, cls.id, { title: "  Curs bucle  ", text: longText });
    expect(res.status).toBe(201);
    expect(res.body.document).toMatchObject({ title: "Curs bucle" });
    expect(res.body.document.chunk_count).toBeGreaterThan(3);
    expect(Object.keys(res.body.document).sort()).toEqual([
      "chunk_count",
      "created_at",
      "id",
      "title",
    ]);

    const positions = store.chunks.map((c) => c.position);
    expect(positions).toEqual(positions.map((_, i) => i));
    expect(store.chunks.every((c) => c.text.length <= 1000)).toBe(true);
    expect(store.documents[0]).toMatchObject({ classId: cls.id, teacherId: teacher.id });
  });

  it("takes the owner from the session, not from the body", async () => {
    const app = createApp();
    const teacher = makeUser("teacher");
    const other = makeUser("teacher");
    const cls = makeClass(teacher);
    await postDoc(app, teacher, cls.id, {
      title: "x",
      text: "Text.",
      teacherId: other.id,
      classId: crypto.randomUUID(),
    });
    expect(store.documents[0]).toMatchObject({ classId: cls.id, teacherId: teacher.id });
  });

  it("accepts text of exactly 200 KB and rejects one byte more with 400, not 500", async () => {
    const app = createApp();
    const teacher = makeUser("teacher");
    const cls = makeClass(teacher);

    const exact = await postDoc(app, teacher, cls.id, {
      title: "limită",
      text: "a".repeat(MAX_DOCUMENT_BYTES),
    });
    expect(exact.status).toBe(201);

    store.documents.length = 0;
    store.chunks.length = 0;
    const over = await postDoc(app, teacher, cls.id, {
      title: "prea mare",
      text: "a".repeat(MAX_DOCUMENT_BYTES + 1),
    });
    expect(over.status).toBe(400);
    expect(over.body.error.code).toBe("VALIDATION_ERROR");
    expect(JSON.stringify(over.body.error.details.issues)).toContain("200 KB");
    expect(store.documents).toHaveLength(0);
    expect(store.chunks).toHaveLength(0);
  });

  it("measures the limit in bytes: multi-byte text over 200 KB is rejected", async () => {
    const app = createApp();
    const teacher = makeUser("teacher");
    const cls = makeClass(teacher);
    // 110,000 characters but 220,000 bytes in UTF-8.
    const res = await postDoc(app, teacher, cls.id, {
      title: "diacritice",
      text: "ș".repeat(110_000),
    });
    expect(res.status).toBe(400);
    expect(store.documents).toHaveLength(0);
  });

  it("caps the number of documents per class with a 409, and the cap is per class", async () => {
    const app = createApp();
    const teacher = makeUser("teacher");
    const cls = makeClass(teacher);
    const other = makeClass(teacher);
    for (let i = 0; i < MAX_DOCUMENTS_PER_CLASS; i++) {
      expect((await postDoc(app, teacher, cls.id, { title: `d${i}`, text: "Text." })).status).toBe(
        201,
      );
    }
    const blocked = await postDoc(app, teacher, cls.id, { title: "unul în plus", text: "Text." });
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe("DOCUMENT_LIMIT_REACHED");
    expect(store.documents.filter((d) => d.classId === cls.id)).toHaveLength(
      MAX_DOCUMENTS_PER_CLASS,
    );

    expect(
      (await postDoc(app, teacher, other.id, { title: "altă clasă", text: "Text." })).status,
    ).toBe(201);

    // Deleting one frees a slot.
    const first = store.documents[0];
    if (first) await deleteDoc(app, teacher, first.id);
    expect((await postDoc(app, teacher, cls.id, { title: "din nou", text: "Text." })).status).toBe(
      201,
    );
  });

  it("returns 404 (not 500) if the class is deleted mid-request, storing nothing", async () => {
    const app = createApp();
    const teacher = makeUser("teacher");
    const cls = makeClass(teacher);
    store.failCreateWithClassGone = true;
    const res = await postDoc(app, teacher, cls.id, { title: "t", text: "Text." });
    expect(res.status).toBe(404);
    expect(res.body).toEqual(NOT_FOUND_CLASS);
    expect(store.documents).toHaveLength(0);
  });

  it("answers a body above the parser limit with a clean 413, not a 500", async () => {
    const app = createApp();
    const teacher = makeUser("teacher");
    const cls = makeClass(teacher);
    const res = await postDoc(app, teacher, cls.id, {
      title: "enorm",
      text: "a".repeat(1_300_000),
    });
    expect(res.status).toBe(413);
    expect(res.body).toEqual({ error: { code: "PAYLOAD_TOO_LARGE", message: expect.any(String) } });
    expect(store.documents).toHaveLength(0);
  });

  it("rejects empty or whitespace text, a missing title, NUL characters and bad ids (400)", async () => {
    const app = createApp();
    const teacher = makeUser("teacher");
    const cls = makeClass(teacher);
    for (const body of [
      { title: "t", text: "" },
      { title: "t", text: "  \n\t " },
      { title: "", text: "ok" },
      { text: "ok" },
      { title: "t" },
      { title: "t", text: "a\u0000b" },
      { title: "t\u0000", text: "ok" },
      { title: "t", text: 42 },
    ]) {
      const res = await postDoc(app, teacher, cls.id, body);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    }
    expect((await postDoc(app, teacher, "not-a-uuid", { title: "t", text: "ok" })).status).toBe(
      400,
    );
    expect(store.documents).toHaveLength(0);
  });
});

describe("GET /api/classes/:id/documents", () => {
  it("lists id, title, created_at and chunk count, never the text", async () => {
    const app = createApp();
    const teacher = makeUser("teacher");
    const cls = makeClass(teacher);
    const created = await postDoc(app, teacher, cls.id, { title: "Curs", text: longText });

    const res = await listDocs(app, teacher, cls.id);
    expect(res.status).toBe(200);
    expect(res.body.documents).toHaveLength(1);
    expect(res.body.documents[0]).toEqual({
      id: created.body.document.id,
      title: "Curs",
      created_at: expect.any(String),
      chunk_count: created.body.document.chunk_count,
    });
    expect(JSON.stringify(res.body)).not.toContain("Bucla while");
  });

  it("only lists the documents of the requested class", async () => {
    const app = createApp();
    const teacher = makeUser("teacher");
    const c1 = makeClass(teacher);
    const c2 = makeClass(teacher);
    await postDoc(app, teacher, c1.id, { title: "doar în c1", text: "Text unu." });
    await postDoc(app, teacher, c2.id, { title: "doar în c2", text: "Text doi." });

    const res = await listDocs(app, teacher, c1.id);
    expect(res.body.documents.map((d: { title: string }) => d.title)).toEqual(["doar în c1"]);
  });
});

describe("DELETE /api/documents/:id", () => {
  it("deletes the document and its chunks, then 404s on a repeat", async () => {
    const app = createApp();
    const teacher = makeUser("teacher");
    const cls = makeClass(teacher);
    const { body } = await postDoc(app, teacher, cls.id, { title: "Curs", text: longText });
    expect(store.chunks.length).toBeGreaterThan(0);

    const res = await deleteDoc(app, teacher, body.document.id);
    expect(res.status).toBe(204);
    expect(store.documents).toHaveLength(0);
    expect(store.chunks).toHaveLength(0);
    expect((await listDocs(app, teacher, cls.id)).body.documents).toEqual([]);

    expect((await deleteDoc(app, teacher, body.document.id)).status).toBe(404);
  });
});

describe("PATCH /api/classes/:id/style-notes", () => {
  it("stores the notes on the class row", async () => {
    const app = createApp();
    const teacher = makeUser("teacher");
    const cls = makeClass(teacher);

    const res = await patchNotes(app, teacher, cls.id, {
      styleNotes: "  Ton prietenos, exemple scurte.  ",
    });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ class_id: cls.id, style_notes: "Ton prietenos, exemple scurte." });
    expect(store.classes[0]?.styleNotes).toBe("Ton prietenos, exemple scurte.");
  });

  it("clears the notes with an empty string and accepts exactly 2000 characters", async () => {
    const app = createApp();
    const teacher = makeUser("teacher");
    const cls = makeClass(teacher);

    expect((await patchNotes(app, teacher, cls.id, { styleNotes: "a".repeat(2000) })).status).toBe(
      200,
    );
    const cleared = await patchNotes(app, teacher, cls.id, { styleNotes: "   " });
    expect(cleared.body.style_notes).toBeNull();
    expect(store.classes[0]?.styleNotes).toBeNull();
  });

  it("rejects more than 2000 characters, a missing field and NUL characters with 400", async () => {
    const app = createApp();
    const teacher = makeUser("teacher");
    const cls = makeClass(teacher);
    cls.styleNotes = "inițial";
    for (const body of [
      { styleNotes: "a".repeat(2001) },
      {},
      { styleNotes: 5 },
      { styleNotes: "a\u0000" },
    ]) {
      expect((await patchNotes(app, teacher, cls.id, body)).status).toBe(400);
    }
    expect(store.classes[0]?.styleNotes).toBe("inițial");
  });
});

describe("body size limits are scoped", () => {
  it("keeps the 100 KB default on unauthenticated routes (login), 413 above it", async () => {
    const app = createApp();
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "a@example.com", password: "a".repeat(150_000) });
    expect(res.status).toBe(413);
    expect(res.body).toEqual({ error: { code: "PAYLOAD_TOO_LARGE", message: expect.any(String) } });
  });

  it("keeps the 100 KB default on the style-notes route", async () => {
    const app = createApp();
    const teacher = makeUser("teacher");
    const cls = makeClass(teacher);
    const res = await patchNotes(app, teacher, cls.id, { styleNotes: "a".repeat(150_000) });
    expect(res.status).toBe(413);
  });

  it("applies the larger document limit only to the document upload route", async () => {
    const app = createApp();
    const teacher = makeUser("teacher");
    const cls = makeClass(teacher);
    // 150 KB: over the global default, under the document limit and under 200 KB of text.
    const ok = await postDoc(app, teacher, cls.id, { title: "mare", text: "a".repeat(150_000) });
    expect(ok.status).toBe(201);
  });

  it("does not parse a large document body for a student (403 before the body is read)", async () => {
    const app = createApp();
    const student = makeUser("student");
    const res = await postDoc(app, student, crypto.randomUUID(), {
      title: "t",
      text: "a".repeat(300_000),
    });
    expect(res.status).toBe(403);
  });

  it("answers an unsupported content encoding with a clean 415, not a 500", async () => {
    const res = await request(createApp())
      .post("/api/auth/login")
      .set("Content-Type", "application/json")
      .set("Content-Encoding", "x-unknown")
      .send('{"email":"a@example.com","password":"x"}');
    expect(res.status).toBe(415);
    expect(res.body.error.code).toBe("UNSUPPORTED_MEDIA_TYPE");
  });
});

describe("authorization", () => {
  it("gives a student 403 on every document route and style-notes (even for a class they could join)", async () => {
    const app = createApp();
    const teacher = makeUser("teacher");
    const student = makeUser("student");
    const cls = makeClass(teacher);
    const { body } = await postDoc(app, teacher, cls.id, { title: "Curs", text: "Text." });

    const results = await Promise.all([
      postDoc(app, student, cls.id, { title: "t", text: "ok" }),
      listDocs(app, student, cls.id),
      deleteDoc(app, student, body.document.id),
      patchNotes(app, student, cls.id, { styleNotes: "x" }),
    ]);
    for (const res of results) {
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("FORBIDDEN");
    }
    expect(store.documents).toHaveLength(1);
    expect(store.classes[0]?.styleNotes).toBeNull();
  });

  it("gives anonymous callers 401 everywhere", async () => {
    const app = createApp();
    const id = crypto.randomUUID();
    expect(
      (await request(app).post(`/api/classes/${id}/documents`).send({ title: "t", text: "x" }))
        .status,
    ).toBe(401);
    expect((await request(app).get(`/api/classes/${id}/documents`)).status).toBe(401);
    expect((await request(app).delete(`/api/documents/${id}`)).status).toBe(401);
    expect(
      (await request(app).patch(`/api/classes/${id}/style-notes`).send({ styleNotes: "x" })).status,
    ).toBe(401);
  });

  it("gives another teacher a 404, identical to a nonexistent class, and changes nothing", async () => {
    const app = createApp();
    const owner = makeUser("teacher");
    const intruder = makeUser("teacher");
    const cls = makeClass(owner);
    await postDoc(app, owner, cls.id, { title: "Curs", text: "Text secret." });
    const ghostClass = crypto.randomUUID();

    const create = await postDoc(app, intruder, cls.id, { title: "t", text: "ok" });
    const list = await listDocs(app, intruder, cls.id);
    const notes = await patchNotes(app, intruder, cls.id, { styleNotes: "hijack" });
    for (const res of [create, list, notes]) {
      expect(res.status).toBe(404);
      expect(res.body).toEqual(NOT_FOUND_CLASS);
    }
    const ghost = await listDocs(app, intruder, ghostClass);
    expect(ghost.status).toBe(404);
    expect(ghost.body).toEqual(list.body);

    expect(store.documents).toHaveLength(1);
    expect(store.classes[0]?.styleNotes).toBeNull();
    expect(JSON.stringify([create.body, list.body, notes.body])).not.toContain("Text secret");
  });

  it("gives another teacher a 404 on delete, identical to a nonexistent document, and deletes nothing", async () => {
    const app = createApp();
    const owner = makeUser("teacher");
    const intruder = makeUser("teacher");
    const cls = makeClass(owner);
    const { body } = await postDoc(app, owner, cls.id, { title: "Curs", text: "Text." });

    const forbidden = await deleteDoc(app, intruder, body.document.id);
    const missing = await deleteDoc(app, intruder, crypto.randomUUID());
    expect(forbidden.status).toBe(404);
    expect(forbidden.body).toEqual(NOT_FOUND_DOC);
    expect(missing.body).toEqual(forbidden.body);
    expect(store.documents).toHaveLength(1);
    expect(store.chunks.length).toBeGreaterThan(0);
  });

  it("rejects a malformed document id with 400", async () => {
    const teacher = makeUser("teacher");
    expect((await deleteDoc(createApp(), teacher, "nope")).status).toBe(400);
  });
});
