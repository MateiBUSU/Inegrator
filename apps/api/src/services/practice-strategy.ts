import { EXPLANATION_STRATEGIES, type ExplanationStrategy } from "@app/shared";

/**
 * The strategy for the next explanation: the first one, in the fixed enum order, that has not
 * been tried on this objective yet. When all of them have been tried it wraps back to the start.
 */
export function nextStrategy(tried: readonly ExplanationStrategy[]): ExplanationStrategy {
  const used = new Set(tried);
  return EXPLANATION_STRATEGIES.find((s) => !used.has(s)) ?? EXPLANATION_STRATEGIES[0];
}
