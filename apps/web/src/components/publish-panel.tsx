import type { TeacherMaterial } from "@app/shared";
import { useState } from "react";
import { api, ApiError, userMessage } from "../api";
import { publishBlockReason, questionLabels } from "../lib/material-state";
import { ErrorState } from "./error-state";

interface PublishPanelProps {
  /** The last saved version of the material (what the server will publish). */
  material: TeacherMaterial;
  /** True while the editor has changes that are not saved yet. */
  dirty: boolean;
  /** True while a save or confirm request is running; publishing then waits for its result. */
  busy?: boolean;
  /** Lets the editor lock its inputs while the publish request is in flight. */
  onPublishingChange?: (publishing: boolean) => void;
  onPublished: (material: TeacherMaterial) => void;
  /** Re-reads the material from the server, e.g. after a conflicting answer. */
  onReload: () => Promise<void>;
}

/**
 * The publish button. It is disabled until the material can be published (saved, and every
 * question confirmed by the teacher). That check is a convenience: the server enforces the same
 * rule and may still refuse (a race), in which case its answer is shown here in Romanian.
 */
export function PublishPanel({
  material,
  dirty,
  busy = false,
  onPublishingChange,
  onPublished,
  onReload,
}: PublishPanelProps) {
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const blockReason = publishBlockReason(material, dirty);

  async function publish() {
    setError(null);
    setPublishing(true);
    onPublishingChange?.(true);
    try {
      onPublished(await api.materials.publishMaterial(material.id));
    } catch (err) {
      setError(describePublishError(err, material));
      // The server's view differs from ours (a race): show what it now says.
      if (
        err instanceof ApiError &&
        ["UNCONFIRMED_QUESTIONS", "MATERIAL_CHANGED"].includes(err.code)
      ) {
        await onReload().catch(() => undefined);
      }
    } finally {
      setPublishing(false);
      onPublishingChange?.(false);
    }
  }

  return (
    <section className="card" aria-label="Publicare">
      <h2>Publicare</h2>
      <p className="muted">
        După publicare, materialul nu mai poate fi modificat; poți crea doar o versiune nouă.
      </p>
      <button
        type="button"
        onClick={() => void publish()}
        disabled={blockReason !== null || publishing || busy}
      >
        {publishing ? "Se publică…" : "Publică materialul"}
      </button>
      {blockReason ? (
        <p className="muted" id="publish-reason">
          {blockReason}
        </p>
      ) : null}
      {error ? <ErrorState message={error} /> : null}
    </section>
  );
}

/** The server's refusal as a Romanian message, naming the questions it lists. */
export function describePublishError(error: unknown, material: TeacherMaterial): string {
  if (error instanceof ApiError && error.code === "UNCONFIRMED_QUESTIONS") {
    const ids = error.details?.questionIds;
    if (Array.isArray(ids) && ids.every((id): id is string => typeof id === "string")) {
      return `${userMessage(error)} Neconfirmate: ${questionLabels(material, ids)}.`;
    }
  }
  return userMessage(error);
}
