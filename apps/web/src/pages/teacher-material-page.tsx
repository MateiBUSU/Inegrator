import { useParams } from "react-router";
import { api, userMessage } from "../api";
import { ErrorState } from "../components/error-state";
import { LoadingState } from "../components/loading-state";
import { MaterialScreen } from "../components/material-screen";
import { useApiData } from "../hooks/use-api-data";

export function TeacherMaterialPage() {
  const { id = "" } = useParams();
  const {
    data: material,
    error,
    loading,
    reload,
  } = useApiData(() => api.materials.getMaterial("teacher", id), [id]);

  if (loading) return <LoadingState message="Se încarcă materialul…" />;
  if (error || !material) return <ErrorState message={userMessage(error)} onRetry={reload} />;
  // key: opening another material (e.g. a new version) starts from a clean screen.
  return <MaterialScreen key={material.id} initial={material} />;
}
