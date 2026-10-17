import { Link } from "react-router";
import { api, userMessage } from "../api";
import { ProgressBadge } from "../components/badges";
import { EmptyState } from "../components/empty-state";
import { ErrorState } from "../components/error-state";
import { GamificationStats } from "../components/gamification-stats";
import { LoadingState } from "../components/loading-state";
import { useApiData } from "../hooks/use-api-data";
import { formatDateTime } from "../lib/format";
import { KIND_LABELS } from "../lib/labels";

export function StudentProgressPage() {
  const { data, error, loading, reload } = useApiData(() =>
    Promise.all([api.me.getGamification(), api.me.listMyProgress(), api.me.listMyMaterials()]),
  );
  const [stats, progress, materials] = data ?? [];
  const byId = new Map((materials ?? []).map((material) => [material.id, material]));

  return (
    <section>
      <h1>Progresul meu</h1>
      {loading ? <LoadingState message="Se încarcă progresul…" /> : null}
      {!loading && error ? <ErrorState message={userMessage(error)} onRetry={reload} /> : null}
      {!loading && !error && stats && progress ? (
        <>
          <GamificationStats stats={stats} />
          <h2>Materiale începute</h2>
          {progress.length === 0 ? (
            <EmptyState message="Nu ai început încă niciun material." />
          ) : (
            <ul className="plain-list">
              {progress.map((entry) => {
                const material = byId.get(entry.materialId);
                return (
                  <li key={entry.materialId} className="document-row">
                    <span>
                      {material ? (
                        <Link to={`/student/materials/${material.id}`}>{material.title}</Link>
                      ) : (
                        "Material indisponibil"
                      )}
                      {material ? (
                        <span className="muted"> · {KIND_LABELS[material.kind]}</span>
                      ) : null}
                    </span>
                    <span>
                      <ProgressBadge state={entry.status} />{" "}
                      <span className="muted">{formatDateTime(entry.updatedAt)}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      ) : null}
    </section>
  );
}
