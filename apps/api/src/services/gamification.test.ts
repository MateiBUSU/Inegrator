import { describe, expect, it, vi } from "vitest";
import {
  LEVEL_THRESHOLDS,
  POINTS_PER_COMPLETED_LESSON,
  POINTS_PER_CORRECT_ANSWER,
  WEEKLY_GOAL,
} from "../config/gamification";
import type { ActivityFacts } from "../repositories/gamification-repository";

// The stats math is pure; the repository (Prisma) is replaced so nothing here needs a database.
const repo = vi.hoisted(() => ({ loadActivityFacts: vi.fn() }));
vi.mock("../repositories/gamification-repository", () => repo);

import { computeGamificationStats, computeStatsFromFacts, levelForPoints } from "./gamification";

// Wednesday 14 October 2026, 15:00 UTC. The ISO week started on Monday 12 October 00:00 UTC.
const NOW = new Date("2026-10-14T15:00:00.000Z");
const at = (iso: string) => new Date(iso);

const facts = (overrides: Partial<ActivityFacts> = {}): ActivityFacts => ({
  attemptDates: [],
  lessons: [],
  answers: { correct: 0, incorrect: 0 },
  ...overrides,
});
const completed = (...isoDates: string[]) =>
  isoDates.map((iso) => ({ status: "completed" as const, updatedAt: new Date(iso) }));
const correct = (n: number) => ({ correct: n, incorrect: 0 });
const stats = (overrides: Partial<ActivityFacts> = {}, now = NOW) =>
  computeStatsFromFacts(facts(overrides), now);

describe("no activity", () => {
  it("is the zero state, with no errors", () => {
    expect(stats()).toEqual({
      currentStreakDays: 0,
      weeklyActivityCount: 0,
      weeklyGoal: WEEKLY_GOAL,
      pointsTotal: 0,
      level: "Începător",
      nextLevelAt: 150,
    });
  });

  it("is also the result of the service for a student with no rows", async () => {
    repo.loadActivityFacts.mockResolvedValue(facts());
    expect(await computeGamificationStats("any-student", NOW)).toEqual(stats());
  });
});

describe("streak", () => {
  it("counts today and yesterday as 2", () => {
    const result = stats({
      attemptDates: [at("2026-10-14T08:00:00Z"), at("2026-10-13T20:00:00Z")],
    });
    expect(result.currentStreakDays).toBe(2);
  });

  it("counts activity today only as 1", () => {
    expect(stats({ attemptDates: [at("2026-10-14T00:00:00Z")] }).currentStreakDays).toBe(1);
  });

  it("keeps the streak alive through yesterday when nothing happened yet today", () => {
    const result = stats({
      attemptDates: [at("2026-10-13T10:00:00Z"), at("2026-10-12T10:00:00Z")],
    });
    expect(result.currentStreakDays).toBe(2);
  });

  it("is 0 when the last activity was 3 days ago", () => {
    expect(stats({ attemptDates: [at("2026-10-11T12:00:00Z")] }).currentStreakDays).toBe(0);
  });

  it("is 0 when the last activity was two days ago (a full missed day)", () => {
    expect(stats({ attemptDates: [at("2026-10-12T12:00:00Z")] }).currentStreakDays).toBe(0);
  });

  it("stops counting at a gap in the middle", () => {
    const result = stats({
      attemptDates: [
        at("2026-10-14T09:00:00Z"),
        at("2026-10-13T09:00:00Z"),
        // 12 October missed
        at("2026-10-11T09:00:00Z"),
        at("2026-10-10T09:00:00Z"),
      ],
    });
    expect(result.currentStreakDays).toBe(2);
  });

  it("counts several events on one day once, and lessons like quizzes", () => {
    const result = stats({
      attemptDates: [at("2026-10-14T01:00:00Z"), at("2026-10-14T02:00:00Z")],
      lessons: completed("2026-10-13T12:00:00Z"),
    });
    expect(result.currentStreakDays).toBe(2);
  });

  it("splits days at UTC midnight exactly", () => {
    const justBeforeMidnight = at("2026-10-13T23:59:59.999Z");
    const justAfterMidnight = at("2026-10-14T00:00:00.000Z");
    expect(stats({ attemptDates: [justBeforeMidnight, justAfterMidnight] }).currentStreakDays).toBe(
      2,
    );
    // Same two instants, but "now" is still the 13th: only one day has happened.
    expect(
      stats({ attemptDates: [justBeforeMidnight] }, at("2026-10-13T23:59:59.999Z"))
        .currentStreakDays,
    ).toBe(1);
  });

  it("ignores events dated in the future", () => {
    expect(stats({ attemptDates: [at("2026-10-15T09:00:00Z")] }).currentStreakDays).toBe(0);
  });

  it("works across a month and a year boundary", () => {
    const now = at("2027-01-01T10:00:00Z");
    const result = stats(
      {
        attemptDates: [
          at("2027-01-01T01:00:00Z"),
          at("2026-12-31T23:00:00Z"),
          at("2026-12-30T05:00:00Z"),
        ],
      },
      now,
    );
    expect(result.currentStreakDays).toBe(3);
  });
});

describe("weekly activity (ISO week, Monday to Sunday, UTC)", () => {
  it("counts quiz attempts and completed lessons of this week", () => {
    const result = stats({
      attemptDates: [at("2026-10-12T00:00:00.000Z"), at("2026-10-14T10:00:00Z")],
      lessons: completed("2026-10-13T10:00:00Z"),
    });
    expect(result.weeklyActivityCount).toBe(3);
    expect(result.weeklyGoal).toBe(WEEKLY_GOAL);
  });

  it("does not count an event from last Sunday, even one millisecond before Monday", () => {
    const result = stats({
      attemptDates: [at("2026-10-11T23:59:59.999Z"), at("2026-10-11T08:00:00Z")],
    });
    expect(result.weeklyActivityCount).toBe(0);
  });

  it("resets when the week rolls over, while the streak continues", () => {
    const events = { attemptDates: [at("2026-10-18T22:00:00Z")] }; // Sunday evening
    const sunday = stats(events, at("2026-10-18T23:59:59.999Z"));
    const monday = stats(events, at("2026-10-19T00:00:00.000Z"));
    expect(sunday.weeklyActivityCount).toBe(1);
    expect(monday.weeklyActivityCount).toBe(0);
    expect(monday.currentStreakDays).toBe(1);
  });

  it("treats Sunday as the last day of the week that began the previous Monday", () => {
    const sunday = at("2026-10-18T12:00:00Z");
    const result = stats(
      { attemptDates: [at("2026-10-12T00:00:00Z"), at("2026-10-11T23:00:00Z")] },
      sunday,
    );
    expect(result.weeklyActivityCount).toBe(1);
  });

  it("counts on a Monday from midnight on", () => {
    const monday = at("2026-10-12T00:00:30Z");
    expect(stats({ attemptDates: [at("2026-10-12T00:00:10Z")] }, monday).weeklyActivityCount).toBe(
      1,
    );
  });
});

describe("points", () => {
  it("sums correct answers and completed lessons", () => {
    const result = stats({
      answers: correct(7),
      lessons: completed("2026-10-01T10:00:00Z", "2026-10-02T10:00:00Z"),
    });
    expect(result.pointsTotal).toBe(
      7 * POINTS_PER_CORRECT_ANSWER + 2 * POINTS_PER_COMPLETED_LESSON,
    );
    expect(result.pointsTotal).toBe(110);
  });

  it("gives nothing for incorrect answers or for lessons that are only started", () => {
    const mixed = stats({
      answers: { correct: 3, incorrect: 9 },
      lessons: [
        ...completed("2026-10-01T10:00:00Z"),
        { status: "started", updatedAt: at("2026-10-02T10:00:00Z") },
        { status: "started", updatedAt: at("2026-10-03T10:00:00Z") },
      ],
    });
    expect(mixed.pointsTotal).toBe(3 * POINTS_PER_CORRECT_ANSWER + POINTS_PER_COMPLETED_LESSON);

    const onlyWrongAndStarted = stats({
      answers: { correct: 0, incorrect: 5 },
      lessons: [{ status: "started", updatedAt: at("2026-10-02T10:00:00Z") }],
    });
    expect(onlyWrongAndStarted.pointsTotal).toBe(0);
  });

  it("does not count a started lesson as an activity event either", () => {
    const result = stats({
      lessons: [{ status: "started", updatedAt: at("2026-10-14T10:00:00Z") }],
    });
    expect(result.weeklyActivityCount).toBe(0);
    expect(result.currentStreakDays).toBe(0);
  });

  it("gives no points for a lesson dated in the future", () => {
    expect(stats({ lessons: completed("2026-10-15T09:00:00Z") }).pointsTotal).toBe(0);
  });

  it("does not turn quiz attempts into points by themselves", () => {
    const result = stats({
      attemptDates: [at("2026-10-14T10:00:00Z"), at("2026-10-13T10:00:00Z")],
    });
    expect(result.pointsTotal).toBe(0);
    expect(result.weeklyActivityCount).toBe(2);
  });
});

describe("level", () => {
  it("switches exactly at each threshold: one point below stays, the threshold itself moves up", () => {
    expect(levelForPoints(0)).toEqual({ label: "Începător", nextLevelAt: 150 });
    expect(levelForPoints(149)).toEqual({ label: "Începător", nextLevelAt: 150 });
    expect(levelForPoints(150)).toEqual({ label: "Intermediar", nextLevelAt: 400 });
    expect(levelForPoints(399)).toEqual({ label: "Intermediar", nextLevelAt: 400 });
    expect(levelForPoints(400)).toEqual({ label: "Avansat", nextLevelAt: 800 });
    expect(levelForPoints(799)).toEqual({ label: "Avansat", nextLevelAt: 800 });
    expect(levelForPoints(800)).toEqual({ label: "Elev de 10", nextLevelAt: null });
    expect(levelForPoints(100_000)).toEqual({ label: "Elev de 10", nextLevelAt: null });
  });

  it("is applied to the computed points: 140 is still the first level, 150 the second", () => {
    const base = { lessons: completed("2026-10-01T00:00:00Z") }; // 20 points
    const at140 = stats({ ...base, answers: correct(12) });
    const at150 = stats({ ...base, answers: correct(13) });
    expect(at140).toMatchObject({ pointsTotal: 140, level: "Începător", nextLevelAt: 150 });
    expect(at150).toMatchObject({ pointsTotal: 150, level: "Intermediar", nextLevelAt: 400 });
  });

  it("starts the configured ladder at 0 points", () => {
    expect(LEVEL_THRESHOLDS[0]?.minPoints).toBe(0);
  });
});
