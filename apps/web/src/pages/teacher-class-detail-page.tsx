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
      <div className="bg-primary rounded-panel mb-6 p-6 text-white">
        <p className="mb-4">
          <Link to="/teacher/classes" className="text-white/80">
            ← Clasele mele
          </Link>
        </p>
        <h1 className="text-white">{cls.name}</h1>
        <p className="text-white/80">{gradeLabel(cls.grade)}</p>
        <p className="text-white/80">
          Cod de alăturare: <code className="text-ink">{cls.join_code}</code>
        </p>
        <p className="text-sm text-white/70">Creată pe {formatDate(cls.created_at)}</p>
      </div>

      <ClassStudents classId={cls.id} students={cls.students} joinCode={cls.join_code} />
      <StyleNotesEditor key={cls.id} classId={cls.id} initialValue={cls.style_notes} />
      <DocumentsSection classId={cls.id} />
    </section>
  );
}
