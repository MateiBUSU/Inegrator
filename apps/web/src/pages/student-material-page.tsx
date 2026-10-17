import { Link, useParams } from "react-router";
import { api, userMessage } from "../api";
import { ErrorState } from "../components/error-state";
import { LoadingState } from "../components/loading-state";
import { StudentMaterialScreen } from "../components/student-material-screen";
import { useApiData } from "../hooks/use-api-data";

export function StudentMaterialPage() {
  const { id = "" } = useParams();
  const { data, error, loading, reload } = useApiData(
    () => Promise.all([api.materials.getMaterial("student", id), api.me.listMyProgress()]),
    [id],
  );

  return (
    <section>
      <p>
        <Link to="/student/classes">← Clasele mele</Link>
      </p>
      {loading ? <LoadingState message="Se încarcă materialul…" /> : null}
      {!loading && error ? <ErrorState message={userMessage(error)} onRetry={reload} /> : null}
      {!loading && !error && data ? (
        <StudentMaterialScreen
          key={data[0].id}
          material={data[0]}
          initialStatus={data[1].find((entry) => entry.materialId === data[0].id)?.status}
        />
      ) : null}
    </section>
  );
}
