import type { ProgressStatus, StudentMaterialView } from "@app/shared";
import { Link } from "react-router";
import { KIND_LABELS, PROGRESS_LABELS, type StudentProgressState } from "../lib/labels";
import { ProgressBadge } from "./badges";

interface StudentMaterialListProps {
  materials: readonly StudentMaterialView[];
  progress: ReadonlyMap<string, ProgressStatus>;
}

const GROUP_ORDER: StudentProgressState[] = ["not_started", "started", "completed"];

/** Assigned materials grouped by the student's progress: not started, started, completed. */
export function StudentMaterialList({ materials, progress }: StudentMaterialListProps) {
  return (
    <>
      {GROUP_ORDER.map((state) => {
        const group = materials.filter(
          (material) => (progress.get(material.id) ?? "not_started") === state,
        );
        if (group.length === 0) return null;
        return (
          <section key={state} aria-label={PROGRESS_LABELS[state]}>
            <h2>
              {PROGRESS_LABELS[state]} ({group.length})
            </h2>
            <ul className="card-list">
              {group.map((material) => (
                <li key={material.id} className="card">
                  <h3>
                    <Link to={`/student/materials/${material.id}`}>{material.title}</Link>
                  </h3>
                  <p>{KIND_LABELS[material.kind]}</p>
                  <ProgressBadge state={state} />
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </>
  );
}
