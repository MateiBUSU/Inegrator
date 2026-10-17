import { MAX_STYLE_NOTES_CHARS } from "@app/shared";
import { useState } from "react";
import { api, userMessage } from "../api";
import { ErrorState } from "./error-state";

interface Suggestion {
  text: string;
  used: number;
  limit: number;
}

/**
 * The class's writing-style notes (used to steer AI generation). The teacher can ask the AI for a
 * suggestion based on the class documents; accepting it only fills the text box, nothing is
 * saved until the teacher presses "Salvează".
 */
export function StyleNotesEditor({
  classId,
  initialValue,
}: {
  classId: string;
  initialValue: string | null;
}) {
  const [saved, setSaved] = useState(initialValue ?? "");
  const [value, setValue] = useState(initialValue ?? "");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);

  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [accepted, setAccepted] = useState(false);

  const tooLong = value.length > MAX_STYLE_NOTES_CHARS;
  const dirty = value !== saved;

  async function save() {
    setSaveError(null);
    setJustSaved(false);
    setSaving(true);
    try {
      const result = await api.documents.updateStyleNotes(classId, value);
      const stored = result.style_notes ?? "";
      setSaved(stored);
      setValue(stored);
      setJustSaved(true);
      setAccepted(false);
    } catch (error) {
      setSaveError(userMessage(error));
    } finally {
      setSaving(false);
    }
  }

  async function extract() {
    setExtractError(null);
    setSuggestion(null);
    setAccepted(false);
    setExtracting(true);
    try {
      const result = await api.documents.extractStyleNotes(classId);
      setSuggestion({
        text: result.suggestion,
        used: result.quota.used,
        limit: result.quota.limit,
      });
    } catch (error) {
      // Not fatal: the quota or the AI can be unavailable while everything else keeps working.
      setExtractError(userMessage(error));
    } finally {
      setExtracting(false);
    }
  }

  return (
    <section className="card" aria-label="Stilul clasei">
      <h2>Stilul de predare</h2>
      <p className="muted">
        Aceste notițe îi spun AI-ului cum să scrie materialele pentru clasa ta (ton, structură,
        tipuri de exemple).
      </p>

      <div className="field">
        <label htmlFor="style-notes">Notițe de stil</label>
        <textarea
          id="style-notes"
          rows={6}
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            setJustSaved(false);
          }}
        />
        <small className={tooLong ? "field-error" : "field-hint"}>
          {value.length} / {MAX_STYLE_NOTES_CHARS} caractere
          {tooLong ? " — textul este prea lung." : ""}
        </small>
      </div>

      <div className="button-row">
        <button type="button" onClick={() => void save()} disabled={!dirty || tooLong || saving}>
          {saving ? "Se salvează…" : "Salvează"}
        </button>
        <button
          type="button"
          className="button-secondary"
          onClick={() => void extract()}
          disabled={extracting}
        >
          {extracting ? "Se generează sugestia…" : "Sugerează din documente"}
        </button>
      </div>

      {justSaved && !dirty ? (
        <p role="status" className="success">
          Notițele au fost salvate.
        </p>
      ) : null}
      {saveError ? <ErrorState message={saveError} /> : null}
      {extractError ? <ErrorState message={extractError} /> : null}

      {suggestion ? (
        <div className="notice" role="region" aria-label="Sugestie de stil">
          <h3>Sugestie din documentele clasei</h3>
          <pre className="suggestion">{suggestion.text}</pre>
          <p className="muted">
            Ai folosit {suggestion.used} din {suggestion.limit} generări AI azi.
          </p>
          <div className="button-row">
            <button
              type="button"
              onClick={() => {
                setValue(suggestion.text);
                setSuggestion(null);
                setAccepted(true);
                setJustSaved(false);
              }}
            >
              Folosește sugestia
            </button>
            <button type="button" className="button-secondary" onClick={() => setSuggestion(null)}>
              Renunță
            </button>
          </div>
        </div>
      ) : null}
      {accepted && dirty ? (
        <p role="status" className="muted">
          Sugestia a fost copiată în câmp. Apasă „Salvează” ca să o păstrezi.
        </p>
      ) : null}
    </section>
  );
}
