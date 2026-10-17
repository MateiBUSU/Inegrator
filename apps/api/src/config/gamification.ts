// Gamification tuning. These numbers are PROVISIONAL starting points, not final balancing:
// change them here and nothing else needs to move (the stats are computed on every request).

/** Target number of "activity events" (submitted quiz or completed lesson) per ISO week. */
export const WEEKLY_GOAL = 6;

export const POINTS_PER_CORRECT_ANSWER = 10;
export const POINTS_PER_COMPLETED_LESSON = 20;

export interface LevelThreshold {
  minPoints: number;
  label: string;
}

/** Ordered by minPoints, ascending; the first entry must start at 0. */
export const LEVEL_THRESHOLDS: readonly LevelThreshold[] = [
  { minPoints: 0, label: "Începător" },
  { minPoints: 150, label: "Intermediar" },
  { minPoints: 400, label: "Avansat" },
  { minPoints: 800, label: "Elev de 10" },
];
