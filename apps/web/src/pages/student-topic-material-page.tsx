import { Link, useParams } from "react-router";
import { api, userMessage } from "../api";
import { ErrorState } from "../components/error-state";
import { LoadingState } from "../components/loading-state";
import { PersonalMaterialScreen } from "../components/personal-material-screen";
import { useApiData } from "../hooks/use-api-data";

export function StudentTopicMaterialPage() {
  const { id = "", materialId = "" } = useParams();
  const { data, error, loading, reload } = useApiData(
    () => api.topics.getMaterial(id, materialId),
    [id, materialId],
  );

  return (
    <section>
      <p>
        <Link to={`/student/topics/${id}`}>← Înapoi la subiect</Link>
      </p>
      {loading ? <LoadingState message="Se încarcă materialul…" /> : null}
      {!loading && error ? <ErrorState message={userMessage(error)} onRetry={reload} /> : null}
      {!loading && !error && data ? <PersonalMaterialScreen key={data.id} material={data} /> : null}
    </section>
  );
}
