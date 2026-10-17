import { Link, useParams } from "react-router";
import { api, userMessage } from "../api";
import { EmptyState } from "../components/empty-state";
import { ErrorState } from "../components/error-state";
import { LoadingState } from "../components/loading-state";
import { useApiData } from "../hooks/use-api-data";
import { formatDateTime } from "../lib/format";

const PROGRESS_LABELS = { started: "Început", completed: "Terminat" } as const;

/** What the API returns for one student of a class: lesson progress and quiz attempts. */
export function TeacherStudentProgressPage() {
  const { id = "", studentId = "" } = useParams();
  const progress = useApiData(() => api.classes.getStudentProgress(id, studentId), [id, studentId]);
  // The progress rows only carry material ids; the teacher's own materials give them titles.
  const materials = useApiData(() => api.materials.listMaterials());

  const titleOf = (materialId: string) =>
    materials.data?.find((material) => material.id === materialId)?.title ??
    `Material ${materialId.slice(0, 8)}`;

  const back = (
    <p>
      <Link to={`/teacher/classes/${id}`}>← Înapoi la clasă</Link>
    </p>
  );

  if (progress.loading) return <LoadingState message="Se încarcă progresul…" />;
  if (progress.error || !progress.data) {
    return (
      <section>
        {back}
        <ErrorState message={userMessage(progress.error)} onRetry={progress.reload} />
      </section>
    );
  }

  const { student, lesson_progress: lessons, quiz_attempts: attempts } = progress.data;
  return (
    <section>
      {back}
      <h1>Progres: {student.display_name}</h1>

      {lessons.length === 0 && attempts.length === 0 ? (
        <EmptyState message="Elevul nu are încă nicio activitate înregistrată în această clasă." />
      ) : null}

      {lessons.length > 0 ? (
        <section className="card" aria-label="Lecții">
          <h2>Lecții</h2>
          <ul className="plain-list">
            {lessons.map((lesson) => (
              <li key={lesson.material_id}>
                <strong>{titleOf(lesson.material_id)}</strong> · {PROGRESS_LABELS[lesson.status]}
                <span className="muted"> · {formatDateTime(lesson.updated_at)}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {attempts.length > 0 ? (
        <section className="card" aria-label="Teste">
          <h2>Teste</h2>
          <ul className="plain-list">
            {attempts.map((attempt) => (
              <li key={attempt.id}>
                <strong>{titleOf(attempt.material_id)}</strong> · {attempt.score} /{" "}
                {attempt.max_score} puncte
                <span className="muted"> · {formatDateTime(attempt.submitted_at)}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </section>
  );
}
