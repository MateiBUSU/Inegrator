import type { Question } from "@app/shared";
import { QUESTION_TYPE_LABELS } from "../lib/labels";
import { isConfirmed } from "../lib/material-state";
import { VerificationBadge } from "./badges";
import { SafeMarkdown } from "./safe-markdown";

/** Read-only view of one question, including the answer key (this is the teacher's view). */
export function QuestionView({ question, number }: { question: Question; number: number }) {
  const correct = new Set(question.correct ?? []);
  return (
    <article className="question card" aria-label={`Întrebarea ${number}`}>
      <header className="question-header">
        <h3>Întrebarea {number}</h3>
        <span className="muted">{QUESTION_TYPE_LABELS[question.type]}</span>
        <VerificationBadge confirmed={isConfirmed(question)} />
      </header>
      <SafeMarkdown>{question.prompt}</SafeMarkdown>

      {question.type === "mcq" ? (
        <ul className="options">
          {(question.options ?? []).map((option) => (
            <li key={option.id} className={correct.has(option.id) ? "option-correct" : undefined}>
              <span className="option-id">{option.id.toUpperCase()}.</span> {option.text}
              {correct.has(option.id) ? <strong> (corect)</strong> : null}
            </li>
          ))}
        </ul>
      ) : null}
      {question.type === "short" ? (
        <p>
          Răspunsuri acceptate: <strong>{(question.acceptedAnswers ?? []).join(", ")}</strong>
        </p>
      ) : null}
      {question.type === "programming" ? (
        <>
          <p>Soluție de referință:</p>
          <pre className="code-block">{question.referenceSolution}</pre>
          {question.rubric ? (
            <>
              <p>Barem:</p>
              <SafeMarkdown>{question.rubric}</SafeMarkdown>
            </>
          ) : null}
        </>
      ) : null}
      {question.explanation ? (
        <div className="explanation">
          <p>
            <strong>Explicație:</strong>
          </p>
          <SafeMarkdown>{question.explanation}</SafeMarkdown>
        </div>
      ) : null}
    </article>
  );
}
