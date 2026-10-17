import {
  allQuestions,
  materialDefinitionSchema,
  type Question,
  type TeacherMaterial,
} from "@app/shared";
import { useEffect, useMemo, useState } from "react";
import { api, ApiError, userMessage } from "../api";
import { issuesToRomanian } from "../lib/validation-messages";
import { questionsOf, unconfirmedQuestions } from "../lib/material-state";
import { ErrorState } from "./error-state";
import { GenerationNotice } from "./generation-notice";
import { MaterialHeader } from "./material-view";
import { PublishPanel } from "./publish-panel";
import { QuestionEditor } from "./question-editor";
import { SafeMarkdown } from "./safe-markdown";

interface MaterialEditorProps {
  /** The last saved version. The editor keeps its own working copy of the editable parts. */
  material: TeacherMaterial;
  onMaterialChange: (material: TeacherMaterial) => void;
  onReload: () => Promise<void>;
}

interface WorkingCopy {
  title: string;
  lessonBody: string;
  questions: Question[];
}

function workingCopyOf(material: TeacherMaterial): WorkingCopy {
  return {
    title: material.title,
    lessonBody: material.lesson?.body ?? "",
    questions: allQuestions(material),
  };
}

/** Rebuilds the full definition (every field the shared schema validates) with the edits applied. */
function definitionWith(material: TeacherMaterial, edits: WorkingCopy) {
  const base = {
    title: edits.title,
    kind: material.kind,
    section: material.section,
    language: material.language,
    grade: material.grade,
    objectives: material.objectives,
  };
  return material.lesson
    ? {
        ...base,
        lesson: { ...material.lesson, body: edits.lessonBody, checkQuestions: edits.questions },
      }
    : { ...base, questions: edits.questions };
}

export function MaterialEditor({ material, onMaterialChange, onReload }: MaterialEditorProps) {
  const [copy, setCopy] = useState<WorkingCopy>(() => workingCopyOf(material));
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState<string[] | "all" | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const [actionError, setActionError] = useState<string | null>(null);
  const [savedNotice, setSavedNotice] = useState(false);
  const [publishing, setPublishing] = useState(false);

  // Whenever the server hands back a new version (after save, confirm or reload), start from it.
  useEffect(() => {
    setCopy(workingCopyOf(material));
  }, [material]);

  const dirty = useMemo(
    () => JSON.stringify(copy) !== JSON.stringify(workingCopyOf(material)),
    [copy, material],
  );
  const pending = unconfirmedQuestions(material);
  const savedById = new Map(questionsOf(material).map((q) => [q.id, q]));
  // While a request is in flight the inputs are locked: its answer replaces the working copy,
  // so anything typed meanwhile would be lost.
  const busy = saving || confirming !== null || publishing;

  function updateQuestion(index: number, question: Question) {
    setSavedNotice(false);
    setCopy((current) => ({
      ...current,
      questions: current.questions.map((existing, i) => (i === index ? question : existing)),
    }));
  }

  async function save() {
    if (busy) return;
    setActionError(null);
    setSavedNotice(false);
    // The same schema the API uses, so most mistakes are caught before a request is made.
    const parsed = materialDefinitionSchema.safeParse(definitionWith(material, copy));
    if (!parsed.success) {
      setProblems(issuesToRomanian(parsed.error.issues));
      return;
    }
    setProblems([]);

    setSaving(true);
    try {
      const data = parsed.data;
      const updated = await api.materials.updateMaterial(
        material.id,
        data.lesson
          ? { title: data.title, lesson: data.lesson }
          : { title: data.title, questions: data.questions },
      );
      onMaterialChange(updated);
      setSavedNotice(true);
    } catch (error) {
      setActionError(userMessage(error));
      if (error instanceof ApiError && error.code === "MATERIAL_NOT_DRAFT")
        await onReload().catch(() => undefined);
    } finally {
      setSaving(false);
    }
  }

  async function confirm(questionIds: string[], which: string[] | "all") {
    if (busy) return;
    setActionError(null);
    setConfirming(which);
    try {
      onMaterialChange(await api.materials.confirmQuestions(material.id, questionIds));
    } catch (error) {
      setActionError(userMessage(error));
      if (
        error instanceof ApiError &&
        ["MATERIAL_CHANGED", "MATERIAL_NOT_DRAFT"].includes(error.code)
      ) {
        await onReload().catch(() => undefined);
      }
    } finally {
      setConfirming(null);
    }
  }

  return (
    <div className="material-editor">
      <MaterialHeader material={material} />
      <GenerationNotice generation={material.generation} />

      <fieldset className="editor-lock" disabled={busy}>
        <section className="card" aria-label="Conținut">
          <h2>Editare</h2>
          <div className="field">
            <label htmlFor="material-title">Titlu</label>
            <input
              id="material-title"
              type="text"
              value={copy.title}
              onChange={(event) => {
                setSavedNotice(false);
                setCopy({ ...copy, title: event.target.value });
              }}
            />
          </div>

          {material.lesson ? (
            <div className="field">
              <label htmlFor="lesson-body">Textul lecției (Markdown)</label>
              <textarea
                id="lesson-body"
                rows={14}
                value={copy.lessonBody}
                onChange={(event) => {
                  setSavedNotice(false);
                  setCopy({ ...copy, lessonBody: event.target.value });
                }}
              />
              <details>
                <summary>Previzualizare</summary>
                <SafeMarkdown>{copy.lessonBody}</SafeMarkdown>
              </details>
            </div>
          ) : null}
        </section>

        <section aria-label="Întrebări">
          <h2>Întrebări</h2>
          {copy.questions.length === 0 ? (
            <p className="muted">Acest material nu are întrebări.</p>
          ) : (
            <div className="confirm-bar">
              <p>
                <strong>{copy.questions.length - pending.length}</strong> din{" "}
                <strong>{copy.questions.length}</strong> întrebări confirmate.
              </p>
              <button
                type="button"
                onClick={() =>
                  void confirm(
                    pending.map((q) => q.id),
                    "all",
                  )
                }
                disabled={dirty || pending.length === 0 || confirming !== null}
              >
                {confirming === "all" ? "Se confirmă…" : "Confirmă toate răspunsurile"}
              </button>
              {dirty && pending.length > 0 ? (
                <p className="muted">Salvează modificările înainte de a confirma răspunsurile.</p>
              ) : null}
            </div>
          )}
          {copy.questions.map((question, index) => (
            <QuestionEditor
              key={question.id}
              question={question}
              number={index + 1}
              objectives={material.objectives}
              canConfirm={!dirty}
              modified={JSON.stringify(question) !== JSON.stringify(savedById.get(question.id))}
              confirming={Array.isArray(confirming) && confirming.includes(question.id)}
              onChange={(updated) => updateQuestion(index, updated)}
              onConfirm={() => void confirm([question.id], [question.id])}
            />
          ))}
        </section>
      </fieldset>

      <section className="card save-bar" aria-label="Salvare">
        <button type="button" onClick={() => void save()} disabled={!dirty || busy}>
          {saving ? "Se salvează…" : "Salvează modificările"}
        </button>
        {dirty ? <span className="muted">Ai modificări nesalvate.</span> : null}
        {savedNotice && !dirty ? (
          <span role="status" className="success">
            Modificările au fost salvate. Răspunsurile modificate trebuie confirmate din nou.
          </span>
        ) : null}
        {problems.length > 0 ? (
          <div className="state state-error" role="alert">
            <p>Nu am putut salva. Corectează:</p>
            <ul>
              {problems.map((problem) => (
                <li key={problem}>{problem}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {actionError ? <ErrorState message={actionError} /> : null}
      </section>

      <PublishPanel
        material={material}
        dirty={dirty}
        onPublishingChange={setPublishing}
        busy={saving || confirming !== null}
        onPublished={onMaterialChange}
        onReload={onReload}
      />
    </div>
  );
}
