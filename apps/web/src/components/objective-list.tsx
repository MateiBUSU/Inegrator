import type { PracticeProgress } from "@app/shared";
import { useState } from "react";
import { Link, useLocation } from "react-router";
import { api } from "../api";
import { ObjectiveStatusBadge } from "./practice-progress";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface ObjectiveListProps {
  objectives: readonly { id: string; text: string }[];
}

/**
 * The objectives of a class material, each with an "Exersează" button and a status badge.
 *
 * Badges are loaded lazily: nothing is requested until the student opens the list, then one
 * progress request per objective (a material has a handful, never more than 30) runs in
 * parallel, once per mount. There is no batch endpoint and nothing is cached across mounts, so
 * coming back from a practice session shows fresh badges. Only objectives that are rows of the
 * catalogue (UUID ids) can be practiced; others show no button.
 */
export function ObjectiveList({ objectives }: ObjectiveListProps) {
  const location = useLocation();
  const [progress, setProgress] = useState<ReadonlyMap<string, PracticeProgress | null>>(new Map());
  const [requested, setRequested] = useState(false);

  function loadBadges() {
    if (requested) return;
    setRequested(true);
    const ids = objectives.map((o) => o.id).filter((id) => UUID.test(id));
    void Promise.allSettled(ids.map((id) => api.practice.getPracticeProgress(id))).then(
      (results) => {
        const next = new Map<string, PracticeProgress | null>();
        results.forEach((result, index) => {
          const id = ids[index];
          // A failed lookup simply shows no badge; the Exersează button still works.
          if (id !== undefined && result.status === "fulfilled") next.set(id, result.value);
        });
        setProgress(next);
      },
    );
  }

  return (
    <details onToggle={(event) => event.currentTarget.open && loadBadges()}>
      <summary>Obiective ({objectives.length})</summary>
      <ul className="plain-list">
        {objectives.map((objective) => {
          const known = progress.get(objective.id);
          return (
            <li key={objective.id} className="document-row">
              <span>
                {objective.text}{" "}
                {known !== undefined ? (
                  <ObjectiveStatusBadge status={known?.status ?? "not_started"} />
                ) : null}
              </span>
              {UUID.test(objective.id) ? (
                <Link
                  className="button"
                  to={`/student/objectives/${objective.id}/practice`}
                  state={{
                    objectiveText: objective.text,
                    from: `${location.pathname}${location.search}`,
                  }}
                >
                  Exersează
                </Link>
              ) : null}
            </li>
          );
        })}
      </ul>
    </details>
  );
}
