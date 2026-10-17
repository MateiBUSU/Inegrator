import { useState } from "react";
import { Link } from "react-router";
import { api, userMessage, type MaterialStatus } from "../api";
import { StatusBadge } from "../components/badges";
import { EmptyState } from "../components/empty-state";
import { ErrorState } from "../components/error-state";
import { LoadingState } from "../components/loading-state";
import { useApiData } from "../hooks/use-api-data";
import { formatDate } from "../lib/format";
import { gradeLabel, KIND_LABELS, STATUS_LABELS } from "../lib/labels";

type Filter = MaterialStatus | "";

export function TeacherMaterialsPage() {
  const [status, setStatus] = useState<Filter>("");
  const {
    data: materials,
    error,
    loading,
    reload,
  } = useApiData(() => api.materials.listMaterials(status === "" ? undefined : status), [status]);

  return (
    <section>
      <header className="mb-6">
        <p className="text-primary text-xs font-extrabold tracking-wide uppercase">
          Spațiul profesorului
        </p>
        <h1>Materiale</h1>
        <p className="text-ink-2">Ciorne, materiale publicate și arhivate, într-un singur loc.</p>
      </header>
      <div className="toolbar">
        <div className="field inline-field">
          <label htmlFor="status-filter">Stare</label>
          <select
            id="status-filter"
            value={status}
            onChange={(event) => setStatus(event.target.value as Filter)}
          >
            <option value="">Toate</option>
            {(Object.keys(STATUS_LABELS) as MaterialStatus[]).map((value) => (
              <option key={value} value={value}>
                {STATUS_LABELS[value]}
              </option>
            ))}
          </select>
        </div>
        <Link className="button" to="/teacher/materials/new">
          Generează un material
        </Link>
      </div>

      {loading ? <LoadingState message="Se încarcă materialele…" /> : null}
      {!loading && error ? <ErrorState message={userMessage(error)} onRetry={reload} /> : null}
      {!loading && !error && materials && materials.length === 0 ? (
        <EmptyState
          message={
            status === ""
              ? "Nu ai niciun material încă. Generează primul material."
              : `Nu ai materiale cu starea „${STATUS_LABELS[status]}”.`
          }
        />
      ) : null}
      {!loading && !error && materials && materials.length > 0 ? (
        <ul className="card-list">
          {materials.map((material) => (
            <li key={material.id} className="card">
              <h2>
                <Link to={`/teacher/materials/${material.id}`}>{material.title}</Link>
              </h2>
              <p>
                {KIND_LABELS[material.kind]} · {gradeLabel(material.grade)} · versiunea{" "}
                {material.version} <StatusBadge status={material.status} />
              </p>
              <p className="muted">
                Creat: {formatDate(material.createdAt)}
                {material.publishedAt ? ` · Publicat: ${formatDate(material.publishedAt)}` : ""}
              </p>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
