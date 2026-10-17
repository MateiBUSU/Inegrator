import type { GamificationStats } from "@app/shared";
import {
  LEVEL_THRESHOLDS,
  POINTS_PER_COMPLETED_LESSON,
  POINTS_PER_CORRECT_ANSWER,
  WEEKLY_GOAL,
} from "../config/gamification";
import { loadActivityFacts, type ActivityFacts } from "../repositories/gamification-repository";

const DAY_MS = 86_400_000;

/** Whole UTC days since 1970-01-01 (a Thursday). */
const utcDay = (date: Date) => Math.floor(date.getTime() / DAY_MS);

/** Monday = 0 ... Sunday = 6 (day 0 of the epoch was a Thursday). */
const isoWeekdayIndex = (day: number) => (((day + 3) % 7) + 7) % 7;

function currentStreak(activityDays: Set<number>, today: number): number {
  // The day is not over yet: with no event today, the streak can still run up to yesterday.
  let day = activityDays.has(today) ? today : today - 1;
  let streak = 0;
  while (activityDays.has(day)) {
    streak += 1;
    day -= 1;
  }
  return streak;
}

export function levelForPoints(points: number) {
  let index = 0;
  LEVEL_THRESHOLDS.forEach((threshold, i) => {
    if (threshold.minPoints <= points) index = i;
  });
  const next = LEVEL_THRESHOLDS[index + 1];
  return { label: LEVEL_THRESHOLDS[index]?.label ?? "", nextLevelAt: next ? next.minPoints : null };
}

/**
 * The stats math, with no database access: give it the raw facts and the current time.
 * Events dated after `now` (clock skew) are ignored.
 */
export function computeStatsFromFacts(facts: ActivityFacts, now: Date): GamificationStats {
  const notInFuture = (date: Date) => date.getTime() <= now.getTime();
  const completedLessonDates = facts.lessons
    .filter((lesson) => lesson.status === "completed")
    .map((lesson) => lesson.updatedAt)
    .filter(notInFuture);
  const events = [...facts.attemptDates.filter(notInFuture), ...completedLessonDates];
  const today = utcDay(now);

  const activityDays = new Set(events.map(utcDay));
  const weekStart = (today - isoWeekdayIndex(today)) * DAY_MS; // Monday 00:00 UTC
  const weeklyActivityCount = events.filter((date) => date.getTime() >= weekStart).length;

  const pointsTotal =
    facts.answers.correct * POINTS_PER_CORRECT_ANSWER +
    completedLessonDates.length * POINTS_PER_COMPLETED_LESSON;
  const level = levelForPoints(pointsTotal);

  return {
    currentStreakDays: currentStreak(activityDays, today),
    weeklyActivityCount,
    weeklyGoal: WEEKLY_GOAL,
    pointsTotal,
    level: level.label,
    nextLevelAt: level.nextLevelAt,
  };
}

/** Stats for one student, derived only from their quiz attempts and lesson progress. */
export async function computeGamificationStats(
  studentId: string,
  now: Date = new Date(),
): Promise<GamificationStats> {
  return computeStatsFromFacts(await loadActivityFacts(studentId), now);
}
