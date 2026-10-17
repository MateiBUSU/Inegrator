import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../app";
import type { ActivityFacts } from "../repositories/gamification-repository";
import { signToken } from "../services/token-service";

// The repository is an in-memory fake keyed by student id: `npm test` needs no database.
// Routing, auth middleware, the service and the stats math are real.
const facts = vi.hoisted(() => new Map<string, ActivityFacts>());
vi.mock("../repositories/gamification-repository", () => ({
  loadActivityFacts: async (studentId: string) =>
    facts.get(studentId) ?? {
      attemptDates: [],
      lessons: [],
      answers: { correct: 0, incorrect: 0 },
    },
}));

const cookieFor = (role: "student" | "teacher") => {
  const id = crypto.randomUUID();
  return { id, cookie: `token=${signToken({ userId: id, role })}` };
};

const ZERO_STATE = {
  currentStreakDays: 0,
  weeklyActivityCount: 0,
  weeklyGoal: 6,
  pointsTotal: 0,
  level: "Începător",
  nextLevelAt: 150,
};

beforeEach(() => facts.clear());

describe("GET /api/me/gamification", () => {
  it("returns the zero state for a student with no activity", async () => {
    const student = cookieFor("student");
    const res = await request(createApp())
      .get("/api/me/gamification")
      .set("Cookie", student.cookie);
    expect(res.status).toBe(200);
    expect(res.body).toEqual(ZERO_STATE);
  });

  it("returns stats computed from the caller's own activity", async () => {
    const student = cookieFor("student");
    facts.set(student.id, {
      attemptDates: [new Date()],
      lessons: [{ status: "completed", updatedAt: new Date() }],
      answers: { correct: 4, incorrect: 2 },
    });
    const res = await request(createApp())
      .get("/api/me/gamification")
      .set("Cookie", student.cookie);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      currentStreakDays: 1,
      pointsTotal: 4 * 10 + 20,
      level: "Începător",
      nextLevelAt: 150,
    });
    expect(res.body.weeklyActivityCount).toBeGreaterThanOrEqual(1);
  });

  it("cannot be pointed at another student: identity comes only from the session", async () => {
    const me = cookieFor("student");
    const other = cookieFor("student");
    facts.set(other.id, {
      attemptDates: [new Date()],
      lessons: [],
      answers: { correct: 50, incorrect: 0 },
    });

    const app = createApp();
    const attempts = [
      request(app).get("/api/me/gamification").query({ studentId: other.id }),
      request(app).get("/api/me/gamification").query({ student_id: other.id, id: other.id }),
      request(app).get("/api/me/gamification").set("X-Student-Id", other.id),
    ];
    for (const attempt of attempts) {
      const res = await attempt.set("Cookie", me.cookie);
      expect(res.status).toBe(200);
      expect(res.body).toEqual(ZERO_STATE); // never the other student's 500 points
    }
    // There is no route that takes a student id.
    const byPath = await request(app)
      .get(`/api/me/gamification/${other.id}`)
      .set("Cookie", me.cookie);
    expect(byPath.status).toBe(404);
  });

  it("is student-only: teachers get 403, anonymous callers 401", async () => {
    const app = createApp();
    const teacher = cookieFor("teacher");
    expect(
      (await request(app).get("/api/me/gamification").set("Cookie", teacher.cookie)).status,
    ).toBe(403);
    const anonymous = await request(app).get("/api/me/gamification");
    expect(anonymous.status).toBe(401);
    expect(anonymous.body.error.code).toBe("UNAUTHENTICATED");
  });
});
