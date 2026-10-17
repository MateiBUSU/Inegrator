// Adaptive teaching policy tuning. Change the numbers here; the rules read them from this file.

export interface AdaptationConfig {
  /** A policy change needs at least this many graded answers recorded since the last version. */
  minNewObservations: number;
  /** Rule A: wrong answers on ONE objective that trigger more scaffolding. */
  wrongAnswersThreshold: number;
  /** Rule A looks at the most recent N attempts (since the last version) of the topic. */
  errorWindowAttempts: number;
  /** Rule B: number of most recent attempts (all since the last version) that are averaged. */
  accuracyAttempts: number;
  /** Rule B: average score ratio (0..1) at or above which the explanation level goes up. */
  accuracyThreshold: number;
}

export const ADAPTATION: AdaptationConfig = {
  minNewObservations: 3,
  wrongAnswersThreshold: 3,
  errorWindowAttempts: 5,
  accuracyAttempts: 3,
  accuracyThreshold: 0.8,
};

/** How many recent tutor messages are sent to the model as context. */
export const TUTOR_HISTORY_MESSAGES = 10;

/** Topics one student may keep (a guard against unbounded rows, not a pedagogical limit). */
export const MAX_TOPICS_PER_STUDENT = 20;
