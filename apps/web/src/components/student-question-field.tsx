import type { StudentQuestion } from "@app/shared";
import { QUESTION_TYPE_LABELS } from "../lib/labels";
import type { AnswerDraft } from "../lib/attempt-payload";
import { SafeMarkdown } from "./safe-markdown";

interface StudentQuestionFieldProps {
  question: StudentQuestion;
  number: number;
  draft: AnswerDraft;
  onChange: (draft: AnswerDraft) => void;
  disabled?: boolean;
}

/** One question as a student sees it: the prompt and an input, never the answer key. */
export function StudentQuestionField({
  question,
  number,
  draft,
  onChange,
  disabled = false,
}: StudentQuestionFieldProps) {
  const inputId = `answer-${question.id}`;

  function toggle(optionId: string, checked: boolean) {
    const optionIds = checked
      ? [...draft.optionIds, optionId]
      : draft.optionIds.filter((id) => id !== optionId);
    onChange({ ...draft, optionIds });
  }

  return (
    <fieldset className="question card" aria-label={`Întrebarea ${number}`}>
      <div className="question-header">
        <h3>Întrebarea {number}</h3>
        <span className="muted">{QUESTION_TYPE_LABELS[question.type]}</span>
      </div>
      <SafeMarkdown>{question.prompt}</SafeMarkdown>

      {question.type === "mcq" ? (
        <div role="group" aria-label={`Variante pentru întrebarea ${number}`}>
          <p className="field-hint">Poți alege una sau mai multe variante.</p>
          {(question.options ?? []).map((option) => (
            <label
              key={option.id}
              className={`answer-option${draft.optionIds.includes(option.id) ? " answer-option-selected" : ""}`}
            >
              <input
                type="checkbox"
                checked={draft.optionIds.includes(option.id)}
                disabled={disabled}
                onChange={(event) => toggle(option.id, event.target.checked)}
              />
              <span className="option-id">{option.id.toUpperCase()}.</span> {option.text}
            </label>
          ))}
        </div>
      ) : null}

      {question.type === "short" ? (
        <div className="field">
          <label htmlFor={inputId}>Răspunsul tău</label>
          <input
            id={inputId}
            type="text"
            autoComplete="off"
            value={draft.text}
            disabled={disabled}
            onChange={(event) => onChange({ ...draft, text: event.target.value })}
          />
        </div>
      ) : null}

      {question.type === "reasoning" ? (
        <div className="field">
          <label htmlFor={inputId}>Răspunsul tău</label>
          <textarea
            id={inputId}
            rows={6}
            placeholder="Explică în câteva propoziții, cu cuvintele tale..."
            value={draft.text}
            disabled={disabled}
            onChange={(event) => onChange({ ...draft, text: event.target.value })}
          />
          <small className="field-hint">
            Răspunsul tău este evaluat de AI prin comparație cu un răspuns de referință.
          </small>
        </div>
      ) : null}

      {question.type === "programming" ? (
        <div className="field">
          <label htmlFor={inputId}>Codul tău</label>
          <textarea
            id={inputId}
            className="code-input"
            rows={10}
            spellCheck={false}
            placeholder="Scrie sau completează secvența de cod..."
            value={draft.text}
            disabled={disabled}
            onChange={(event) => onChange({ ...draft, text: event.target.value })}
          />
          <small className="field-hint">
            Codul tău nu este rulat. După trimitere îl compari cu soluția de referință.
          </small>
        </div>
      ) : null}
    </fieldset>
  );
}
