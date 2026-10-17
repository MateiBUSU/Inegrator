import cookieParser from "cookie-parser";
import express from "express";
import jwt from "jsonwebtoken";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { authResponseSchema } from "@app/shared";
import { createApp } from "../app";
import { env } from "../config/env";
import { requireAuth, requireRole } from "../middleware/auth";
import { errorHandler } from "../middleware/error-handler";
import { createAuthRouter } from "./auth-routes";

// Repository is replaced by an in-memory fake: the default `npm test` must not need a database.
// Hashing (argon2), JWT, cookies, middleware and rate limiting are all real.
const store = vi.hoisted(() => ({
  users: new Map<
    string,
    { id: string; email: string; passwordHash: string; role: string; displayName: string }
  >(),
}));

vi.mock("../repositories/user-repository", () => {
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
      if ([...store.users.values()].some((u) => u.email === data.email)) {
        throw new DuplicateEmailError();
      }
      const user = { id: crypto.randomUUID(), ...data };
      store.users.set(user.id, user);
      return user;
    },
  };
});

const student = {
  email: "Ana@Example.com",
  password: "parola-sigura-1",
  role: "student",
  display_name: "Ana",
};
const teacher = {
  email: "prof@example.com",
  password: "parola-sigura-2",
  role: "teacher",
  display_name: "Profesor",
  teacher_secret: env.TEACHER_SECRET,
};

function cookieOf(res: request.Response): string {
  const cookies = res.headers["set-cookie"] as unknown as string[] | undefined;
  const cookie = cookies?.find((c) => c.startsWith("token="));
  if (!cookie) throw new Error("no auth cookie set");
  return cookie;
}

beforeEach(() => store.users.clear());

describe("POST /api/auth/register", () => {
  it("registers a student, lowercases the email and sets a secure-flagged-by-env httpOnly cookie", async () => {
    const res = await request(createApp()).post("/api/auth/register").send(student);

    expect(res.status).toBe(201);
    const body = authResponseSchema.parse(res.body);
    expect(body.user).toMatchObject({
      email: "ana@example.com",
      role: "student",
      display_name: "Ana",
    });

    const cookie = cookieOf(res);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).not.toMatch(/Secure/i); // NODE_ENV=test, Secure is only for production
  });

  it("never returns the password hash and stores an argon2id hash", async () => {
    const res = await request(createApp()).post("/api/auth/register").send(student);

    expect(JSON.stringify(res.body)).not.toMatch(/hash|argon2|passwordHash|password_hash/i);
    const stored = [...store.users.values()][0];
    expect(stored?.passwordHash).toMatch(/^\$argon2id\$/);
    expect(stored?.passwordHash).not.toContain(student.password);
  });

  it("rejects a duplicate email regardless of case with a clean 409", async () => {
    const app = createApp();
    await request(app).post("/api/auth/register").send(student);
    const res = await request(app)
      .post("/api/auth/register")
      .send({ ...student, email: "ANA@example.com" });

    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: { code: "EMAIL_TAKEN", message: expect.any(String) } });
  });

  it("requires the correct teacher secret for teachers", async () => {
    const app = createApp();
    const missing = await request(app)
      .post("/api/auth/register")
      .send({ ...teacher, teacher_secret: undefined });
    const wrong = await request(app)
      .post("/api/auth/register")
      .send({ ...teacher, teacher_secret: "not-the-secret" });
    const ok = await request(app).post("/api/auth/register").send(teacher);

    expect(missing.status).toBe(403);
    expect(wrong.status).toBe(403);
    expect(wrong.body.error.code).toBe("INVALID_TEACHER_SECRET");
    expect(ok.status).toBe(201);
    expect(ok.body.user.role).toBe("teacher");
  });

  it("ignores unexpected body fields and creates no row when the teacher secret is wrong", async () => {
    const app = createApp();
    const extra = await request(app)
      .post("/api/auth/register")
      .send({ ...student, id: "00000000-0000-0000-0000-000000000000", is_admin: true });
    expect(extra.status).toBe(201);
    expect(extra.body.user.id).not.toBe("00000000-0000-0000-0000-000000000000");
    expect(JSON.stringify(extra.body)).not.toContain("is_admin");

    store.users.clear();
    await request(app)
      .post("/api/auth/register")
      .send({ ...teacher, teacher_secret: "wrong-wrong" });
    expect(store.users.size).toBe(0);
  });

  it("does not need a teacher secret for students", async () => {
    const res = await request(createApp())
      .post("/api/auth/register")
      .send({ ...student, teacher_secret: "ignored" });
    expect(res.status).toBe(201);
  });

  it("validates the body and returns the standard error format", async () => {
    const app = createApp();
    const short = await request(app)
      .post("/api/auth/register")
      .send({ ...student, password: "short" });
    expect(short.status).toBe(400);
    expect(short.body).toEqual({
      error: { code: "VALIDATION_ERROR", message: expect.stringContaining("password") },
    });

    const badJson = await request(app)
      .post("/api/auth/register")
      .set("Content-Type", "application/json")
      .send("{not json");
    expect(badJson.status).toBe(400);
    expect(badJson.body.error.code).toBe("INVALID_BODY");
    expect(JSON.stringify(badJson.body)).not.toMatch(/at .*\.(ts|js):\d+/); // no stack trace
  });
});

describe("POST /api/auth/login", () => {
  it("logs in with correct credentials (email case-insensitive)", async () => {
    const app = createApp();
    await request(app).post("/api/auth/register").send(student);

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "ANA@EXAMPLE.COM", password: student.password });

    expect(res.status).toBe(200);
    expect(authResponseSchema.parse(res.body).user.email).toBe("ana@example.com");
    expect(cookieOf(res)).toMatch(/HttpOnly/i);
  });

  it("fails with a wrong password and gives the same answer for an unknown email", async () => {
    const app = createApp();
    await request(app).post("/api/auth/register").send(student);

    const wrongPassword = await request(app)
      .post("/api/auth/login")
      .send({ email: student.email, password: "gresita-gresita" });
    const unknownEmail = await request(app)
      .post("/api/auth/login")
      .send({ email: "nimeni@example.com", password: "gresita-gresita" });

    expect(wrongPassword.status).toBe(401);
    expect(wrongPassword.headers["set-cookie"]).toBeUndefined();
    expect(wrongPassword.body).toEqual({
      error: { code: "INVALID_CREDENTIALS", message: expect.any(String) },
    });
    expect(unknownEmail.status).toBe(wrongPassword.status);
    expect(unknownEmail.body).toEqual(wrongPassword.body);
  });

  it("rate limits repeated failed attempts with 429 in the standard format", async () => {
    const app = createApp();
    const attempt = () =>
      request(app).post("/api/auth/login").send({ email: "x@example.com", password: "gresita-1" });

    for (let i = 0; i < 10; i++) expect((await attempt()).status).toBe(401);
    const limited = await attempt();
    expect(limited.status).toBe(429);
    expect(limited.body).toEqual({ error: { code: "RATE_LIMITED", message: expect.any(String) } });
  });

  it("does not count successful logins towards the limit", async () => {
    const app = createApp();
    await request(app).post("/api/auth/register").send(student);
    for (let i = 0; i < 12; i++) {
      const res = await request(app)
        .post("/api/auth/login")
        .send({ email: student.email, password: student.password });
      expect(res.status).toBe(200);
    }
  });

  it("treats a malformed stored hash as invalid credentials, not a 500", async () => {
    store.users.set("broken", {
      id: crypto.randomUUID(),
      email: "broken@example.com",
      passwordHash: "not-an-argon2-hash",
      role: "student",
      displayName: "Broken",
    });
    const res = await request(createApp())
      .post("/api/auth/login")
      .send({ email: "broken@example.com", password: "orice-parola" });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("INVALID_CREDENTIALS");
  });
});

describe("POST /api/auth/register rate limit", () => {
  it("returns 429 after too many requests", async () => {
    const app = createApp();
    // Invalid body: cheap (no hashing), but still counted by the limiter.
    for (let i = 0; i < 60; i++) {
      expect((await request(app).post("/api/auth/register").send({})).status).toBe(400);
    }
    const limited = await request(app).post("/api/auth/register").send({});
    expect(limited.status).toBe(429);
    expect(limited.body.error.code).toBe("RATE_LIMITED");
  });
});

describe("GET /api/auth/me and POST /api/auth/logout", () => {
  it("returns 401 without a cookie", async () => {
    const res = await request(createApp()).get("/api/auth/me");
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: { code: "UNAUTHENTICATED", message: expect.any(String) } });
  });

  it("returns the current user with a valid cookie", async () => {
    const app = createApp();
    const registered = await request(app).post("/api/auth/register").send(student);

    const res = await request(app).get("/api/auth/me").set("Cookie", cookieOf(registered));
    expect(res.status).toBe(200);
    expect(authResponseSchema.parse(res.body).user.id).toBe(registered.body.user.id);
    expect(JSON.stringify(res.body)).not.toMatch(/hash/i);
  });

  it("returns 401 for garbage, foreign-signed and expired tokens", async () => {
    const app = createApp();
    const id = crypto.randomUUID();
    const foreign = jwt.sign({ role: "teacher" }, "another-secret-another-secret-123456", {
      subject: id,
    });
    const expired = jwt.sign({ role: "student" }, env.JWT_SECRET, {
      subject: id,
      expiresIn: -10,
    });
    const noneAlg = `${Buffer.from('{"alg":"none"}').toString("base64url")}.${Buffer.from(
      JSON.stringify({ sub: id, role: "teacher" }),
    ).toString("base64url")}.`;

    // Correct secret but a different algorithm: algorithm is pinned to HS256.
    const hs512 = jwt.sign({ role: "teacher" }, env.JWT_SECRET, {
      subject: id,
      algorithm: "HS512",
    });

    for (const token of ["garbage", foreign, expired, noneAlg, hs512]) {
      const res = await request(app).get("/api/auth/me").set("Cookie", `token=${token}`);
      expect(res.status).toBe(401);
    }
  });

  it("returns 401 and clears the cookie when the user no longer exists", async () => {
    const app = createApp();
    const registered = await request(app).post("/api/auth/register").send(student);
    store.users.clear();

    const res = await request(app).get("/api/auth/me").set("Cookie", cookieOf(registered));
    expect(res.status).toBe(401);
    expect(cookieOf(res)).toMatch(/token=;/);
  });

  it("logout clears the auth cookie", async () => {
    const res = await request(createApp()).post("/api/auth/logout");
    expect(res.status).toBe(204);
    expect(cookieOf(res)).toMatch(/token=;.*Expires=Thu, 01 Jan 1970/i);
  });
});

describe("requireRole", () => {
  // Trivial protected route, mounted only in this test (no production route needed).
  function appWithTeacherRoute() {
    const app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use("/api/auth", createAuthRouter());
    app.get("/api/teacher-only", requireAuth, requireRole("teacher"), (_req, res) => {
      res.json({ ok: true });
    });
    app.use(errorHandler);
    return app;
  }

  it("lets a teacher in", async () => {
    const app = appWithTeacherRoute();
    const reg = await request(app).post("/api/auth/register").send(teacher);
    const res = await request(app).get("/api/teacher-only").set("Cookie", cookieOf(reg));
    expect(res.status).toBe(200);
  });

  it("gives a student 403 on a teacher-only route", async () => {
    const app = appWithTeacherRoute();
    const reg = await request(app).post("/api/auth/register").send(student);
    const res = await request(app).get("/api/teacher-only").set("Cookie", cookieOf(reg));
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: { code: "FORBIDDEN", message: expect.any(String) } });
  });

  it("gives an anonymous caller 401", async () => {
    const res = await request(appWithTeacherRoute()).get("/api/teacher-only");
    expect(res.status).toBe(401);
  });
});
