import { useMemo } from "react";
import { Link, useParams } from "react-router";
import { api, userMessage } from "../api";
import { EmptyState } from "../components/empty-state";
import { ErrorState } from "../components/error-state";
import { LoadingState } from "../components/loading-state";
import { StudentMaterialList } from "../components/student-material-list";
import { useApiData } from "../hooks/use-api-data";
import { gradeLabel } from "../lib/labels";

export function StudentClassDetailPage() {
  const { id = "" } = useParams();
  const { data, error, loading, reload } = useApiData(
    () =>
      Promise.all([
        api.classes.getClass("student", id),
        api.me.listMyMaterials(id),
        api.me.listMyProgress(),
      ]),
    [id],
  );
  const [cls, materials, progress] = data ?? [];
  const statuses = useMemo(
    () => new Map((progress ?? []).map((entry) => [entry.materialId, entry.status])),
    [progress],
  );

  return (
    <section>
      <p>
        <Link to="/student/classes">← Clasele mele</Link>
      </p>
      {loading ? <LoadingState message="Se încarcă clasa…" /> : null}
      {!loading && error ? <ErrorState message={userMessage(error)} onRetry={reload} /> : null}
      {!loading && !error && cls && materials ? (
        <>
          <h1>{cls.name}</h1>
          <p className="muted">
            {gradeLabel(cls.grade)} · Profesor: {cls.teacher_display_name}
          </p>
          {materials.length === 0 ? (
            <EmptyState message="Profesorul nu a distribuit încă materiale în această clasă." />
          ) : (
            <StudentMaterialList materials={materials} progress={statuses} />
          )}
        </>
      ) : null}
    </section>
  );
}
