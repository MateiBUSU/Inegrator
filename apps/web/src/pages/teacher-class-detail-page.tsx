import { Link, useParams } from "react-router";
import { api, userMessage } from "../api";
import { ClassStudents } from "../components/class-students";
import { DocumentsSection } from "../components/documents-section";
import { ErrorState } from "../components/error-state";
import { LoadingState } from "../components/loading-state";
import { StyleNotesEditor } from "../components/style-notes-editor";
import { useApiData } from "../hooks/use-api-data";
import { formatDate } from "../lib/format";
import { gradeLabel } from "../lib/labels";

export function TeacherClassDetailPage() {
  const { id = "" } = useParams();
  const {
    data: cls,
    error,
    loading,
    reload,
  } = useApiData(() => api.classes.getClass("teacher", id), [id]);

  if (loading) return <LoadingState message="Se încarcă clasa…" />;
  if (error || !cls) return <ErrorState message={userMessage(error)} onRetry={reload} />;

  return (
    <section>
      <p>
        <Link to="/teacher/classes">← Clasele mele</Link>
      </p>
      <h1>{cls.name}</h1>
      <div className="card">
        <p>{gradeLabel(cls.grade)}</p>
        <p>
          Cod de alăturare: <code>{cls.join_code}</code>
        </p>
        <p className="muted">Creată pe {formatDate(cls.created_at)}</p>
      </div>

      <ClassStudents classId={cls.id} students={cls.students} joinCode={cls.join_code} />
      <StyleNotesEditor key={cls.id} classId={cls.id} initialValue={cls.style_notes} />
      <DocumentsSection classId={cls.id} />
    </section>
  );
}
