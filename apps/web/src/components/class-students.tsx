import type { ClassStudent } from "@app/shared";
import { Link } from "react-router";
import { formatDate } from "../lib/format";
import { EmptyState } from "./empty-state";

/** The enrolled students of a class (display names only), each linking to their progress. */
export function ClassStudents({
  classId,
  students,
  joinCode,
}: {
  classId: string;
  students: ClassStudent[];
  joinCode: string;
}) {
  return (
    <section className="card" aria-label="Elevi">
      <h2>Elevi ({students.length})</h2>
      {students.length === 0 ? (
        <EmptyState
          message={`Niciun elev nu s-a alăturat încă. Dă-le codul clasei: ${joinCode}.`}
        />
      ) : (
        <ul className="plain-list">
          {students.map((student) => (
            <li key={student.id} className="document-row">
              <div>
                <strong>{student.display_name}</strong>
                <span className="muted"> · alăturat pe {formatDate(student.joined_at)}</span>
              </div>
              <Link to={`/teacher/classes/${classId}/students/${student.id}`}>Vezi progresul</Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
