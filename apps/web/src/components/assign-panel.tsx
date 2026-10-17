import { useState } from "react";
import { api, userMessage } from "../api";
import { useApiData } from "../hooks/use-api-data";
import { gradeLabel } from "../lib/labels";
import { EmptyState } from "./empty-state";
import { ErrorState } from "./error-state";
import { LoadingState } from "./loading-state";

/** Assigns a published material to some of the teacher's own classes. */
export function AssignPanel({ materialId }: { materialId: string }) {
  const {
    data: classes,
    error,
    loading,
    reload,
  } = useApiData(() => api.classes.listClasses("teacher"));
  const [selected, setSelected] = useState<string[]>([]);
  const [assigning, setAssigning] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);
  const [assignedCount, setAssignedCount] = useState<number | null>(null);

  function toggle(classId: string) {
    setAssignedCount(null);
    setSelected((current) =>
      current.includes(classId) ? current.filter((id) => id !== classId) : [...current, classId],
    );
  }

  async function assign() {
    setAssignError(null);
    setAssignedCount(null);
    setAssigning(true);
    try {
      const result = await api.materials.assignMaterial(materialId, selected);
      setAssignedCount(result.classIds.length);
    } catch (err) {
      setAssignError(userMessage(err));
    } finally {
      setAssigning(false);
    }
  }

  return (
    <section className="card" aria-label="Atribuire">
      <h2>Atribuie claselor</h2>
      <p className="muted">Elevii din clasele alese vor putea citi materialul.</p>
      {loading ? <LoadingState message="Se încarcă clasele…" /> : null}
      {!loading && error ? <ErrorState message={userMessage(error)} onRetry={reload} /> : null}
      {!loading && !error && classes && classes.length === 0 ? (
        <EmptyState message="Nu ai nicio clasă. Creează mai întâi o clasă." />
      ) : null}
      {!loading && !error && classes && classes.length > 0 ? (
        <>
          <fieldset>
            <legend>Clase</legend>
            {classes.map((cls) => (
              <label key={cls.id} className="inline-block">
                <input
                  type="checkbox"
                  checked={selected.includes(cls.id)}
                  onChange={() => toggle(cls.id)}
                />{" "}
                {cls.name} ({gradeLabel(cls.grade)})
              </label>
            ))}
          </fieldset>
          <button
            type="button"
            onClick={() => void assign()}
            disabled={selected.length === 0 || assigning}
          >
            {assigning ? "Se atribuie…" : "Atribuie materialul"}
          </button>
        </>
      ) : null}
      {assignedCount !== null ? (
        <p role="status" className="success">
          Materialul a fost atribuit la {assignedCount} {assignedCount === 1 ? "clasă" : "clase"}.
        </p>
      ) : null}
      {assignError ? <ErrorState message={assignError} /> : null}
    </section>
  );
}
