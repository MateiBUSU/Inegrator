import type { TeacherMaterial } from "@app/shared";
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { api, userMessage } from "../api";
import { AssignPanel } from "./assign-panel";
import { ObjectiveProgressPanel } from "./objective-progress-panel";
import { ErrorState } from "./error-state";
import { MaterialEditor } from "./material-editor";
import { MaterialView } from "./material-view";

/**
 * One material, in the right mode for its status: a draft is edited, anything else is read-only
 * (published materials can be assigned to classes, or copied into a new draft version).
 */
export function MaterialScreen({ initial }: { initial: TeacherMaterial }) {
  const [material, setMaterial] = useState(initial);

  async function reload() {
    setMaterial(await api.materials.getMaterial("teacher", material.id));
  }

  return (
    <section>
      <p>
        <Link to="/teacher/materials">← Materiale</Link>
        {material.parentId ? (
          <>
            {" · "}
            <Link to={`/teacher/materials/${material.parentId}`}>versiunea anterioară</Link>
          </>
        ) : null}
      </p>

      {material.status === "draft" ? (
        <MaterialEditor material={material} onMaterialChange={setMaterial} onReload={reload} />
      ) : (
        <>
          <MaterialView material={material} />
          {material.status === "published" ? (
            <>
              <NewVersionPanel materialId={material.id} />
              <AssignPanel materialId={material.id} />
              <ObjectiveProgressPanel materialId={material.id} />
            </>
          ) : null}
        </>
      )}
    </section>
  );
}

function NewVersionPanel({ materialId }: { materialId: string }) {
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function createVersion() {
    setError(null);
    setCreating(true);
    try {
      const draft = await api.materials.createNewVersion(materialId);
      navigate(`/teacher/materials/${draft.id}`);
    } catch (err) {
      setError(userMessage(err));
      setCreating(false);
    }
  }

  return (
    <section className="card" aria-label="Versiune nouă">
      <h2>Modifică materialul</h2>
      <p className="muted">
        Un material publicat nu mai poate fi editat. Poți crea o versiune nouă (o ciornă copiată din
        acesta, cu răspunsurile de confirmat din nou).
      </p>
      <button type="button" onClick={() => void createVersion()} disabled={creating}>
        {creating ? "Se creează…" : "Creează o versiune nouă"}
      </button>
      {error ? <ErrorState message={error} /> : null}
    </section>
  );
}
