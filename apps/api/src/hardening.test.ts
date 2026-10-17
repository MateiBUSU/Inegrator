import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Cross-cutting checks on the assembled app: CORS, cookie flags in production, no stack traces
// or secrets in responses and logs, and the generation rate limiter on style-notes extraction.
// Repositories are fakes; middleware, routing and services are real.
const store = vi.hoisted(() => ({
  users: new Map<
    string,
    { id: string; email: string; passwordHash: string; role: string; displayName: string }
  >(),
  teacherId: "11111111-1111-4111-8111-111111111111",
  classId: "22222222-2222-4222-8222-222222222222",
}));

vi.mock("./repositories/user-repository", () => {
  class DuplicateEmailError extends Error {}
  return {
    DuplicateEmailError,
    findUserByEmail: async (email: string) =>
      [...store.users.values()].find((u) => u.email === email) ?? null,
    findUserById: async (id: string) => store.users.get(id) ?? null,
    createUser: async (data: {
      email: string;
      passwordHash: string;
      role: string;
      displayName: string;
    }) => {
      const user = { id: crypto.randomUUID(), ...data };
      store.users.set(user.id, user);
      return user;
    },
  };
});

vi.mock("./repositories/class-repository", () => ({
  findClassById: async (id: string) =>
    id === store.classId
      ? {
          id,
          teacherId: store.teacherId,
          name: "9A",
          grade: 9,
          joinCode: "ABC234",
          styleNotes: null,
          createdAt: new Date(),
          teacher: { displayName: "Prof" },
        }
      : null,
}));

vi.mock("./repositories/document-repository", () => ({
  ClassGoneError: class extends Error {},
  listChunksForClass: async () => [],
}));

const ALLOWED = "https://app.example.test";

async function loadApp(nodeEnv: "development" | "production" | "test") {
  vi.resetModules();
  vi.stubEnv("NODE_ENV", nodeEnv);
  vi.stubEnv("CORS_ORIGIN", ALLOWED);
  const { createApp } = await import("./app");
  return createApp();
}

beforeEach(() => store.users.clear());
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("CORS", () => {
  it("echoes an allowed origin with credentials, and no allow-origin header for any other", async () => {
    const app = await loadApp("test");
    const ok = await request(app).get("/api/health").set("Origin", ALLOWED);
    expect(ok.headers["access-control-allow-origin"]).toBe(ALLOWED);
    expect(ok.headers["access-control-allow-credentials"]).toBe("true");

    for (const origin of ["https://evil.example", "http://app.example.test", "null"]) {
      const res = await request(app).get("/api/health").set("Origin", origin);
      expect(res.headers["access-control-allow-origin"]).not.toBe(origin);
      expect(res.headers["access-control-allow-origin"]).not.toBe("*");
    }
  });

  it("answers a preflight from a foreign origin without granting it", async () => {
    const app = await loadApp("test");
    const res = await request(app)
      .options("/api/auth/login")
      .set("Origin", "https://evil.example")
      .set("Access-Control-Request-Method", "POST");
    expect(res.headers["access-control-allow-origin"]).toBe(ALLOWED);
    expect(res.headers["access-control-allow-origin"]).not.toBe("https://evil.example");
  });
});

describe("auth cookie flags", () => {
  const credentials = {
    email: "ana@example.com",
    password: "parola-sigura-1",
    role: "student",
    display_name: "Ana",
  };

  async function registerCookie(nodeEnv: "development" | "production" | "test") {
    const app = await loadApp(nodeEnv);
    const res = await request(app).post("/api/auth/register").send(credentials);
    expect(res.status).toBe(201);
    const cookies = res.headers["set-cookie"] as unknown as string[];
    const cookie = cookies.find((c) => c.startsWith("token="));
    if (!cookie) throw new Error("no auth cookie set");
    return { app, cookie };
  }

  it("is HttpOnly, SameSite=Lax and Secure in production", async () => {
    const { cookie } = await registerCookie("production");
    expect(cookie).toMatch(/;\s*HttpOnly/i);
    expect(cookie).toMatch(/;\s*SameSite=Lax/i);
    expect(cookie).toMatch(/;\s*Secure/i);
    expect(cookie).toMatch(/;\s*Path=\//i);
  });

  it("is HttpOnly and SameSite=Lax but not Secure outside production (plain-http dev)", async () => {
    const { cookie } = await registerCookie("development");
    expect(cookie).toMatch(/;\s*HttpOnly/i);
    expect(cookie).toMatch(/;\s*SameSite=Lax/i);
    expect(cookie).not.toMatch(/;\s*Secure/i);
  });

  it("clears with the same attributes in production on logout and on login", async () => {
    const { app } = await registerCookie("production");
    const res = await request(app).post("/api/auth/logout");
    const cleared = (res.headers["set-cookie"] as unknown as string[]).find((c) =>
      c.startsWith("token="),
    );
    expect(cleared).toMatch(/Expires=Thu, 01 Jan 1970/i);
    expect(cleared).toMatch(/;\s*HttpOnly/i);
    expect(cleared).toMatch(/;\s*Secure/i);
    expect(cleared).toMatch(/;\s*SameSite=Lax/i);

    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: credentials.email, password: credentials.password });
    expect(login.status).toBe(200);
    const cookie = (login.headers["set-cookie"] as unknown as string[]).find((c) =>
      c.startsWith("token="),
    );
    expect(cookie).toMatch(/;\s*Secure/i);
  });

  it("never puts the token in a response body", async () => {
    const app = await loadApp("production");
    const res = await request(app).post("/api/auth/register").send(credentials);
    expect(JSON.stringify(res.body)).not.toMatch(/eyJ|token|argon2|hash/i);
  });
});

describe("error responses and logs", () => {
  const SECRETS = [
    "hunter2-password",
    "eyJhbGciOi.fake.jwt",
    "AIzaSyFAKEKEY",
    "postgres://u:p@h/db",
  ];

  async function throwingApp(nodeEnv: "development" | "production" | "test") {
    vi.resetModules();
    vi.stubEnv("NODE_ENV", nodeEnv);
    const { errorHandler, notFoundHandler } = await import("./middleware/error-handler");
    const app = express();
    app.get("/boom", () => {
      throw new Error(`failed with ${SECRETS.join(" ")}`);
    });
    app.get("/boom-async", async () => {
      throw Object.assign(new TypeError(SECRETS.join("\n")), { code: "P2002", meta: SECRETS });
    });
    app.use(notFoundHandler);
    app.use(errorHandler);
    return app;
  }

  it.each(["development", "test", "production"] as const)(
    "a 500 in %s has only the generic error body: no stack, no message, no secrets",
    async (nodeEnv) => {
      vi.spyOn(console, "error").mockImplementation(() => undefined);
      const app = await throwingApp(nodeEnv);
      for (const path of ["/boom", "/boom-async"]) {
        const res = await request(app).get(path);
        expect(res.status).toBe(500);
        expect(res.body).toEqual({
          error: { code: "INTERNAL_ERROR", message: "A apărut o eroare internă." },
        });
        expect(res.text).not.toMatch(/\bat\s.+\(.*:\d+:\d+\)|node_modules|\.ts:\d+|stack/i);
        for (const secret of SECRETS) expect(res.text).not.toContain(secret);
      }
    },
  );

  it("logs the failure without the error message (which can echo request data)", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const app = await throwingApp("production");
    await request(app).get("/boom");
    await request(app).get("/boom-async");
    expect(spy).toHaveBeenCalledTimes(2);
    const logged = spy.mock.calls.flat().map(String).join("\n");
    expect(logged).toMatch(/Unhandled (Error|TypeError)/);
    for (const secret of SECRETS) expect(logged).not.toContain(secret);
    expect(logged).not.toContain("failed with");
  });

  it("a malformed JSON body is a clean 400 with no parser internals", async () => {
    const app = await loadApp("production");
    const res = await request(app)
      .post("/api/auth/login")
      .set("Content-Type", "application/json")
      .send('{"email": "a@b.c", "password": "hunter2-password"');
    expect(res.status).toBe(400);
    expect(Object.keys(res.body.error).sort()).toEqual(["code", "message"]);
    expect(res.text).not.toContain("hunter2-password");
    expect(res.text).not.toMatch(/SyntaxError|node_modules|\bat\s.+:\d+:\d+/);
  });

  it("an auth failure never logs credentials", async () => {
    const spies = [
      vi.spyOn(console, "error").mockImplementation(() => undefined),
      vi.spyOn(console, "log").mockImplementation(() => undefined),
      vi.spyOn(console, "warn").mockImplementation(() => undefined),
    ];
    const app = await loadApp("production");
    await request(app)
      .post("/api/auth/login")
      .send({ email: "x@y.zz", password: "hunter2-password" });
    await request(app).post("/api/auth/register").send({
      email: "x@y.zz",
      password: "hunter2-password",
      role: "teacher",
      display_name: "X",
      teacher_secret: "wrong-secret-value",
    });
    const logged = spies
      .flatMap((s) => s.mock.calls.flat())
      .map(String)
      .join("\n");
    expect(logged).not.toContain("hunter2-password");
    expect(logged).not.toContain("wrong-secret-value");
  });
});

describe("rate limit on style-notes extraction", () => {
  it("returns 429 RATE_LIMITED after 10 requests in a minute, per signed-in teacher", async () => {
    const app = await loadApp("test");
    const { signToken } = await import("./services/token-service");
    const cookie = `token=${signToken({ userId: store.teacherId, role: "teacher" })}`;
    const extract = () =>
      request(app).post(`/api/classes/${store.classId}/style-notes/extract`).set("Cookie", cookie);

    for (let i = 0; i < 10; i++) expect((await extract()).status).not.toBe(429);
    const limited = await extract();
    expect(limited.status).toBe(429);
    expect(limited.body.error.code).toBe("RATE_LIMITED");
  });
});
