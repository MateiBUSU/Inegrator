import { api, userMessage } from "../api";
import { useApiData } from "../hooks/use-api-data";
import { STRATEGY_LABELS } from "../lib/labels";
import { EmptyState } from "./empty-state";
import { ErrorState } from "./error-state";
import { LoadingState } from "./loading-state";
import { ObjectiveStatusBadge } from "./practice-progress";

/**
 * Per-student practice progress on the objectives of a published material: one row per student,
 * one cell per objective (status, attempts, strategies already tried). Never aggregated.
 */
export function ObjectiveProgressPanel({ materialId }: { materialId: string }) {
  const { data, error, loading, reload } = useApiData(
    () => api.materials.getObjectiveProgress(materialId),
    [materialId],
  );

  return (
    <section className="card" aria-label="Progresul elevilor la obiective">
      <h2>Progresul elevilor la obiective</h2>
      {loading ? <LoadingState message="Se încarcă progresul…" /> : null}
      {!loading && error ? <ErrorState message={userMessage(error)} onRetry={reload} /> : null}
      {!loading && !error && data && data.students.length === 0 ? (
        <EmptyState message="Materialul nu este atribuit încă niciunei clase cu elevi." />
      ) : null}
      {!loading && !error && data && data.students.length > 0 && data.objectives.length === 0 ? (
        <EmptyState message="Obiectivele acestui material nu pot fi exersate de elevi." />
      ) : null}
      {!loading && !error && data && data.students.length > 0 && data.objectives.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr>
                <th className="border-line border-b p-2">Elev</th>
                {data.objectives.map((objective) => (
                  <th key={objective.id} className="border-line border-b p-2 font-semibold">
                    {objective.text}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.students.map((student) => (
                <tr key={student.studentId} data-student={student.displayName}>
                  <th scope="row" className="border-line border-b p-2 align-top">
                    {student.displayName}
                    <div className="text-ink-3 text-xs font-normal">
                      {student.classNames.join(", ")}
                    </div>
                  </th>
                  {student.objectives.map((cell) => (
                    <td key={cell.objectiveId} className="border-line border-b p-2 align-top">
                      <ObjectiveStatusBadge status={cell.status} />
                      <div className="text-ink-2 mt-1 text-xs">Încercări: {cell.attemptsCount}</div>
                      {cell.strategiesTried.length > 0 ? (
                        <div className="text-ink-3 text-xs">
                          {cell.strategiesTried.map((s) => STRATEGY_LABELS[s]).join(" → ")}
                        </div>
                      ) : null}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
