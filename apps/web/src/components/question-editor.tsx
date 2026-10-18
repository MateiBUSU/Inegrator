import type { Question } from "@app/shared";
import { useEffect, useState } from "react";
import { QUESTION_TYPE_LABELS } from "../lib/labels";
import { isConfirmed } from "../lib/material-state";
import {
  acceptedAnswersToText,
  addOption,
  MAX_OPTIONS,
  MIN_OPTIONS,
  removeOption,
  setOptionText,
  textToAcceptedAnswers,
  toggleCorrect,
} from "../lib/question-editing";
import { VerificationBadge } from "./badges";

interface QuestionEditorProps {
  question: Question;
  number: number;
  objectives: { id: string; text: string }[];
  /** Confirming works on the saved version, so it needs the editor to have no unsaved changes. */
  canConfirm: boolean;
  /** True when this question differs from the saved version; its confirmation then no longer holds. */
  modified: boolean;
  confirming: boolean;
  onChange: (question: Question) => void;
  onConfirm: () => void;
}

/** Edits one question: prompt, answer key and explanation. The type itself cannot change. */
export function QuestionEditor({
  question,
  number,
  objectives,
  canConfirm,
  modified,
  confirming,
  onChange,
  onConfirm,
}: QuestionEditorProps) {
  // Saving a changed question resets its confirmation, so do not show it as confirmed meanwhile.
  const confirmed = isConfirmed(question) && !modified;
  const options = question.options ?? [];
  const correct = new Set(question.correct ?? []);

  // The accepted answers are one per line. Keep the raw text while typing, because parsing it
  // on every keystroke would swallow the trailing newline the teacher has just typed.
  const [answersText, setAnswersText] = useState(acceptedAnswersToText(question.acceptedAnswers));
  useEffect(() => {
    const parsed = JSON.stringify(textToAcceptedAnswers(answersText));
    if (parsed !== JSON.stringify(question.acceptedAnswers ?? [])) {
      setAnswersText(acceptedAnswersToText(question.acceptedAnswers));
    }
    // Only re-sync when the question changes from outside (after saving), not on every keystroke.
  }, [question.acceptedAnswers]);

  const fieldId = (name: string) => `q-${question.id}-${name}`;

  return (
    <article className="question card" aria-label={`Întrebarea ${number}`}>
      <header className="question-header">
        <h3>Întrebarea {number}</h3>
        <span className="muted">{QUESTION_TYPE_LABELS[question.type]}</span>
        <VerificationBadge confirmed={confirmed} />
        {confirmed ? null : (
          <button
            type="button"
            onClick={onConfirm}
            disabled={!canConfirm || confirming}
            title={canConfirm ? undefined : "Salvează mai întâi modificările."}
          >
            {confirming ? "Se confirmă…" : "Confirmă răspunsul"}
          </button>
        )}
      </header>

      <div className="field">
        <label htmlFor={fieldId("prompt")}>Enunț (Markdown)</label>
        <textarea
          id={fieldId("prompt")}
          rows={3}
          value={question.prompt}
          onChange={(event) => onChange({ ...question, prompt: event.target.value })}
        />
      </div>

      {question.type === "mcq" ? (
        <fieldset className="options-editor">
          <legend>Opțiuni (bifează răspunsurile corecte)</legend>
          {options.map((option) => {
            const letter = option.id.toUpperCase();
            return (
              <div key={option.id} className="option-row">
                <input
                  type="checkbox"
                  aria-label={`Opțiunea ${letter} este corectă`}
                  checked={correct.has(option.id)}
                  onChange={() => onChange(toggleCorrect(question, option.id))}
                />
                <span className="option-id">{letter}.</span>
                <input
                  type="text"
                  aria-label={`Textul opțiunii ${letter}`}
                  value={option.text}
                  onChange={(event) =>
                    onChange(setOptionText(question, option.id, event.target.value))
                  }
                />
                <button
                  type="button"
                  className="button-secondary"
                  aria-label={`Șterge opțiunea ${letter}`}
                  disabled={options.length <= MIN_OPTIONS}
                  onClick={() => onChange(removeOption(question, option.id))}
                >
                  Șterge
                </button>
              </div>
            );
          })}
          <button
            type="button"
            className="button-secondary"
            disabled={options.length >= MAX_OPTIONS}
            onClick={() => onChange(addOption(question))}
          >
            Adaugă opțiune
          </button>
        </fieldset>
      ) : null}

      {question.type === "short" ? (
        <div className="field">
          <label htmlFor={fieldId("answers")}>Răspunsuri acceptate (unul pe linie)</label>
          <textarea
            id={fieldId("answers")}
            rows={3}
            value={answersText}
            onChange={(event) => {
              setAnswersText(event.target.value);
              onChange({ ...question, acceptedAnswers: textToAcceptedAnswers(event.target.value) });
            }}
          />
        </div>
      ) : null}

      {question.type === "reasoning" ? (
        <div className="field">
          <label htmlFor={fieldId("reference")}>
            Răspuns de referință (folosit de AI la evaluare; elevii nu îl văd)
          </label>
          <textarea
            id={fieldId("reference")}
            rows={5}
            readOnly
            value={question.referenceSolution ?? ""}
          />
          <small className="field-hint">
            Verifică-l: AI-ul compară răspunsurile elevilor cu acest text. Nu poate fi editat încă.
          </small>
        </div>
      ) : null}

      {question.type === "programming" ? (
        <>
          <div className="field">
            <label htmlFor={fieldId("solution")}>Soluție de referință</label>
            <textarea
              id={fieldId("solution")}
              className="code-input"
              rows={6}
              value={question.referenceSolution ?? ""}
              onChange={(event) => onChange({ ...question, referenceSolution: event.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor={fieldId("rubric")}>Barem</label>
            <textarea
              id={fieldId("rubric")}
              rows={3}
              value={question.rubric ?? ""}
              onChange={(event) =>
                onChange({ ...question, rubric: event.target.value || undefined })
              }
            />
          </div>
        </>
      ) : null}

      <div className="field">
        <label htmlFor={fieldId("explanation")}>Explicație (Markdown)</label>
        <textarea
          id={fieldId("explanation")}
          rows={2}
          value={question.explanation ?? ""}
          onChange={(event) =>
            onChange({ ...question, explanation: event.target.value || undefined })
          }
        />
      </div>

      <div className="field">
        <label htmlFor={fieldId("objective")}>Obiectiv</label>
        <select
          id={fieldId("objective")}
          value={question.objectiveId}
          onChange={(event) => onChange({ ...question, objectiveId: event.target.value })}
        >
          {objectives.map((objective) => (
            <option key={objective.id} value={objective.id}>
              {objective.text}
            </option>
          ))}
        </select>
      </div>
    </article>
  );
}
