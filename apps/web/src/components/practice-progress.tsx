import { EXPLANATION_STRATEGIES, type PracticeProgress } from "@app/shared";
import { OBJECTIVE_STATUS_LABELS, STRATEGY_LABELS } from "../lib/labels";

type ObjectiveStatus = PracticeProgress["status"];

/** Quick-glance label next to an objective: not started / struggling / mastered. */
export function ObjectiveStatusBadge({ status }: { status: ObjectiveStatus }) {
  return (
    <span className={`badge badge-objective-${status}`}>{OBJECTIVE_STATUS_LABELS[status]}</span>
  );
}

/** Status, attempts and one dot per explanation strategy (filled = already tried). */
export function PracticeProgressSummary({ progress }: { progress: PracticeProgress }) {
  const tried = new Set(progress.strategiesTried);
  return (
    <div className="flex flex-wrap items-center gap-3 text-sm" aria-label="Progresul tău">
      <ObjectiveStatusBadge status={progress.status} />
      <span className="text-ink-2">Încercări: {progress.attemptsCount}</span>
      <span
        className="flex items-center gap-1"
        role="img"
        aria-label={`Explicații încercate: ${tried.size} din ${EXPLANATION_STRATEGIES.length}`}
      >
        {EXPLANATION_STRATEGIES.map((strategy) => (
          <span
            key={strategy}
            title={STRATEGY_LABELS[strategy]}
            className={`size-2.5 rounded-full border ${
              tried.has(strategy) ? "bg-primary border-primary" : "border-line bg-surface"
            }`}
          />
        ))}
      </span>
    </div>
  );
}
