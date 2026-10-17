import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, ApiError, FALLBACK_MESSAGE, messageForCode, userMessage } from "./index";

const fetchMock = vi.fn();
beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const USER = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "ana@example.com",
  role: "student",
  display_name: "Ana",
};

/** The [url, init] of the single fetch call a test made. */
function lastCall() {
  const [url, init] = fetchMock.mock.calls.at(-1) as [string, RequestInit];
  return {
    url,
    method: init.method,
    credentials: init.credentials,
    headers: init.headers,
    body: typeof init.body === "string" ? (JSON.parse(init.body) as unknown) : init.body,
  };
}

describe("requests", () => {
  it("sends cookies (credentials: include) and a JSON body to the /api prefix", async () => {
    fetchMock.mockResolvedValue(json(200, { user: USER }));
    await api.auth.login({ email: "ana@example.com", password: "parola-lunga" });
    expect(lastCall()).toEqual({
      url: "/api/auth/login",
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: { email: "ana@example.com", password: "parola-lunga" },
    });
  });

  it("sends credentials on bodiless requests too, without a Content-Type", async () => {
    fetchMock.mockResolvedValue(json(200, { user: USER }));
    await api.auth.me();
    expect(lastCall()).toMatchObject({
      url: "/api/auth/me",
      method: "GET",
      credentials: "include",
      headers: undefined,
      body: undefined,
    });
  });

  it("returns the validated user and resolves 204 responses to undefined", async () => {
    fetchMock.mockResolvedValueOnce(json(201, { user: USER }));
    expect(
      await api.auth.register({
        email: "ana@example.com",
        password: "parola-lunga",
        role: "student",
        display_name: "Ana",
      }),
    ).toEqual(USER);
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    expect(await api.auth.logout()).toBeUndefined();
    expect(lastCall()).toMatchObject({ url: "/api/auth/logout", method: "POST" });
  });

  it("me() resolves to null on 401 but still throws for other failures", async () => {
    fetchMock.mockResolvedValueOnce(
      json(401, { error: { code: "UNAUTHENTICATED", message: "x" } }),
    );
    expect(await api.auth.me()).toBeNull();
    fetchMock.mockResolvedValueOnce(json(500, { error: { code: "INTERNAL_ERROR", message: "x" } }));
    await expect(api.auth.me()).rejects.toMatchObject({ status: 500, code: "INTERNAL_ERROR" });
  });
});

describe("error mapping", () => {
  it("maps API error codes to Romanian messages, ignoring the server's own text", async () => {
    fetchMock.mockResolvedValue(
      json(401, {
        error: { code: "INVALID_CREDENTIALS", message: "invalid credentials (English)" },
      }),
    );
    const error = await api.auth.login({ email: "a@b.ro", password: "x" }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(401);
    expect((error as ApiError).code).toBe("INVALID_CREDENTIALS");
    expect((error as ApiError).message).toBe("Email sau parolă incorecte.");
    expect(userMessage(error)).toBe("Email sau parolă incorecte.");
    expect((error as ApiError).message).not.toContain("English");
  });

  it("keeps the error details (e.g. unconfirmed question ids)", async () => {
    fetchMock.mockResolvedValue(
      json(409, {
        error: {
          code: "UNCONFIRMED_QUESTIONS",
          message: "x",
          details: { questionIds: ["q1", "q2"] },
        },
      }),
    );
    const error = await api.materials.publishMaterial("m").catch((e: unknown) => e);
    expect((error as ApiError).details).toEqual({ questionIds: ["q1", "q2"] });
  });

  it("uses the fallback message for codes it does not know", async () => {
    fetchMock.mockResolvedValue(json(418, { error: { code: "TEAPOT_OVERFLOW", message: "x" } }));
    const error = await api.classes.listClasses("student").catch((e: unknown) => e);
    expect((error as ApiError).code).toBe("TEAPOT_OVERFLOW");
    expect(userMessage(error)).toBe(FALLBACK_MESSAGE);
    expect(messageForCode("SOMETHING_NEW")).toBe(FALLBACK_MESSAGE);
  });

  it("turns an unparseable error body (e.g. a proxy's HTML page) into an HTTP_<status> error", async () => {
    fetchMock.mockResolvedValue(new Response("<html>Bad gateway</html>", { status: 502 }));
    const error = await api.classes.listClasses("student").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe("HTTP_502");
    expect(userMessage(error)).toBe(FALLBACK_MESSAGE);
  });

  it("reports an unreachable server as NETWORK_ERROR with a Romanian message", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    const error = await api.classes.listClasses("student").catch((e: unknown) => e);
    expect((error as ApiError).code).toBe("NETWORK_ERROR");
    expect(userMessage(error)).toContain("server");
  });

  it("rejects a response that does not match the shared schema (INVALID_RESPONSE)", async () => {
    fetchMock.mockResolvedValue(json(200, { classes: [{ id: "x", name: "9A" }] }));
    const error = await api.classes.listClasses("student").catch((e: unknown) => e);
    expect((error as ApiError).code).toBe("INVALID_RESPONSE");
    fetchMock.mockResolvedValue(new Response("not json", { status: 200 }));
    expect(
      (
        (await api.auth
          .login({ email: "a@b.ro", password: "x" })
          .catch((e: unknown) => e)) as ApiError
      ).code,
    ).toBe("INVALID_RESPONSE");
  });

  it("falls back for errors that are not ApiErrors", () => {
    expect(userMessage(new Error("boom"))).toBe(FALLBACK_MESSAGE);
    expect(userMessage("oops")).toBe(FALLBACK_MESSAGE);
  });
});

describe("endpoint contract: one function per built endpoint, with the API's real shapes", () => {
  const ID = "33333333-3333-4333-8333-333333333333";
  const OTHER = "44444444-4444-4444-8444-444444444444";

  // The response is deliberately wrong (an empty object), so each call fails schema validation
  // AFTER the request was made; we only assert on the request here.
  const calls: [string, () => Promise<unknown>, { method: string; url: string; body?: unknown }][] =
    [
      [
        "auth.register",
        () =>
          api.auth.register({
            email: "a@b.ro",
            password: "12345678",
            role: "teacher",
            display_name: "P",
            teacher_secret: "s",
          }),
        {
          method: "POST",
          url: "/api/auth/register",
          body: {
            email: "a@b.ro",
            password: "12345678",
            role: "teacher",
            display_name: "P",
            teacher_secret: "s",
          },
        },
      ],
      [
        "auth.login",
        () => api.auth.login({ email: "a@b.ro", password: "x" }),
        { method: "POST", url: "/api/auth/login", body: { email: "a@b.ro", password: "x" } },
      ],
      ["auth.logout", () => api.auth.logout(), { method: "POST", url: "/api/auth/logout" }],
      ["auth.me", () => api.auth.me(), { method: "GET", url: "/api/auth/me" }],
      [
        "classes.listClasses",
        () => api.classes.listClasses("teacher"),
        { method: "GET", url: "/api/classes" },
      ],
      [
        "classes.createClass",
        () => api.classes.createClass({ name: "9A", grade: 9 }),
        { method: "POST", url: "/api/classes", body: { name: "9A", grade: 9 } },
      ],
      [
        "classes.getClass",
        () => api.classes.getClass("student", ID),
        { method: "GET", url: `/api/classes/${ID}` },
      ],
      [
        "classes.joinClass",
        () => api.classes.joinClass("ABC234"),
        { method: "POST", url: "/api/classes/join", body: { code: "ABC234" } },
      ],
      [
        "classes.getStudentProgress",
        () => api.classes.getStudentProgress(ID, OTHER),
        { method: "GET", url: `/api/classes/${ID}/students/${OTHER}/progress` },
      ],
      [
        "documents.createDocument",
        () => api.documents.createDocument(ID, { title: "t", text: "x" }),
        { method: "POST", url: `/api/classes/${ID}/documents`, body: { title: "t", text: "x" } },
      ],
      [
        "documents.listDocuments",
        () => api.documents.listDocuments(ID),
        { method: "GET", url: `/api/classes/${ID}/documents` },
      ],
      [
        "documents.deleteDocument",
        () => api.documents.deleteDocument(OTHER),
        { method: "DELETE", url: `/api/documents/${OTHER}` },
      ],
      [
        "documents.updateStyleNotes",
        () => api.documents.updateStyleNotes(ID, "Ton prietenos"),
        {
          method: "PATCH",
          url: `/api/classes/${ID}/style-notes`,
          body: { styleNotes: "Ton prietenos" },
        },
      ],
      [
        "documents.extractStyleNotes",
        () => api.documents.extractStyleNotes(ID),
        { method: "POST", url: `/api/classes/${ID}/style-notes/extract` },
      ],
      [
        "materials.listSubjects",
        () => api.materials.listSubjects(),
        { method: "GET", url: "/api/subjects" },
      ],
      [
        "materials.listMaterials",
        () => api.materials.listMaterials(),
        { method: "GET", url: "/api/materials" },
      ],
      [
        "materials.listMaterials(status)",
        () => api.materials.listMaterials("draft"),
        { method: "GET", url: "/api/materials?status=draft" },
      ],
      [
        "materials.createMaterial",
        () =>
          api.materials.createMaterial({
            title: "T",
            kind: "lesson",
            section: "programa",
            language: "cpp",
            grade: 9,
            objectives: [{ id: "o1", text: "x" }],
            lesson: { body: "b", examples: [], checkQuestions: [] },
          }),
        {
          method: "POST",
          url: "/api/materials",
          body: {
            title: "T",
            kind: "lesson",
            section: "programa",
            language: "cpp",
            grade: 9,
            objectives: [{ id: "o1", text: "x" }],
            lesson: { body: "b", examples: [], checkQuestions: [] },
          },
        },
      ],
      [
        "materials.generateMaterial",
        () =>
          api.materials.generateMaterial({
            classId: ID,
            subjectId: ID,
            chapterId: ID,
            kind: "lesson",
            objectiveIds: [ID],
          }),
        {
          method: "POST",
          url: "/api/materials/generate",
          body: { classId: ID, subjectId: ID, chapterId: ID, kind: "lesson", objectiveIds: [ID] },
        },
      ],
      [
        "materials.getMaterial",
        () => api.materials.getMaterial("teacher", ID),
        { method: "GET", url: `/api/materials/${ID}` },
      ],
      [
        "materials.updateMaterial",
        () => api.materials.updateMaterial(ID, { title: "Nou" }),
        { method: "PATCH", url: `/api/materials/${ID}`, body: { title: "Nou" } },
      ],
      [
        "materials.confirmQuestions",
        () => api.materials.confirmQuestions(ID, ["q1"]),
        { method: "POST", url: `/api/materials/${ID}/confirm`, body: { questionIds: ["q1"] } },
      ],
      [
        "materials.publishMaterial",
        () => api.materials.publishMaterial(ID),
        { method: "POST", url: `/api/materials/${ID}/publish` },
      ],
      [
        "materials.createNewVersion",
        () => api.materials.createNewVersion(ID),
        { method: "POST", url: `/api/materials/${ID}/new-version` },
      ],
      [
        "materials.assignMaterial",
        () => api.materials.assignMaterial(ID, [OTHER]),
        { method: "POST", url: `/api/materials/${ID}/assign`, body: { classIds: [OTHER] } },
      ],
    ];

  it.each(calls)("%s", async (_name, call, expected) => {
    fetchMock.mockResolvedValue(json(200, {}));
    await call().catch(() => undefined);
    const made = lastCall();
    expect(made.method).toBe(expected.method);
    expect(made.url).toBe(expected.url);
    expect(made.credentials).toBe("include");
    if ("body" in expected) expect(made.body).toEqual(expected.body);
    else expect(made.body).toBeUndefined();
  });

  it("encodes ids so they cannot alter the path", async () => {
    fetchMock.mockResolvedValue(json(200, {}));
    await api.classes.getClass("student", "a/../b?x=1").catch(() => undefined);
    expect(lastCall().url).toBe("/api/classes/a%2F..%2Fb%3Fx%3D1");
  });
});
