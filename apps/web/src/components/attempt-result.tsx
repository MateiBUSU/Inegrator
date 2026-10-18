import type {
  AttemptResult as AttemptResultData,
  QuestionResult,
  StudentQuestion,
} from "@app/shared";
import { QUESTION_TYPE_LABELS } from "../lib/labels";
import { SafeMarkdown } from "./safe-markdown";

interface AttemptResultProps {
  result: AttemptResultData;
  /** The student view of the material, for the prompts and option texts. */
  questions: readonly StudentQuestion[];
}

/** Whole points, or with a comma for the half point (Romanian decimal): 2,5. */
function formatPoints(points: number): string {
  return Number.isInteger(points) ? String(points) : String(points).replace(".", ",");
}

const VERDICT_LABELS = {
  CORECT: "Corect",
  PARTIAL: "Parțial corect",
  GRESIT: "Greșit",
} as const;

/** The score and, per question, the answer key. Shown only after the attempt was submitted. */
export function AttemptResult({ result, questions }: AttemptResultProps) {
  const byId = new Map(questions.map((question) => [question.id, question]));
  const percent = result.maxScore > 0 ? Math.round((result.score / result.maxScore) * 100) : null;
  return (
    <div className="attempt-result">
      <section className="card" aria-label="Scor">
        <h2>
          Scor: {formatPoints(result.score)} din {result.maxScore}
          {percent === null ? "" : ` · ${percent}%`}
        </h2>
        {result.selfEvaluationCount > 0 ? (
          <p className="muted">
            {result.selfEvaluationCount === 1
              ? "O întrebare de programare nu este punctată automat: compar-o cu soluția de referință."
              : `${result.selfEvaluationCount} întrebări de programare nu sunt punctate automat: compară-le cu soluțiile de referință.`}
          </p>
        ) : null}
      </section>

      {result.results.map((item, index) => (
        <QuestionResultView
          key={item.questionId}
          item={item}
          question={byId.get(item.questionId)}
          number={index + 1}
        />
      ))}
    </div>
  );
}

function QuestionResultView({
  item,
  question,
  number,
}: {
  item: QuestionResult;
  question: StudentQuestion | undefined;
  number: number;
}) {
  return (
    <article className="question card" aria-label={`Rezultat întrebarea ${number}`}>
      <header className="question-header">
        <h3>Întrebarea {number}</h3>
        <span className="muted">{QUESTION_TYPE_LABELS[item.type]}</span>
        {item.type === "programming" ? (
          <span className="badge">Autoevaluare</span>
        ) : item.type === "reasoning" ? (
          <span className={`badge badge-verdict-${item.verdict.toLowerCase()}`}>
            {VERDICT_LABELS[item.verdict]}
          </span>
        ) : item.isCorrect ? (
          <span className="result-correct">Corect</span>
        ) : (
          <span className="result-incorrect">Incorect</span>
        )}
      </header>
      {question ? <SafeMarkdown>{question.prompt}</SafeMarkdown> : null}

      {item.type === "mcq" ? (
        <ul className="plain-list">
          {(question?.options ?? []).map((option) => {
            const selected = item.selected.includes(option.id);
            const correct = item.correct.includes(option.id);
            const className = correct
              ? "answer-option answer-option-correct"
              : selected
                ? "answer-option answer-option-wrong"
                : "answer-option";
            return (
              <li key={option.id} className={className}>
                <span className="option-id">{option.id.toUpperCase()}.</span> {option.text}
                {selected ? <strong> (răspunsul tău)</strong> : null}
                {correct ? <strong> (corect)</strong> : null}
              </li>
            );
          })}
        </ul>
      ) : null}

      {item.type === "short" ? (
        <>
          <p>
            Răspunsul tău: <strong>{item.text === "" ? "(fără răspuns)" : item.text}</strong>
          </p>
          {item.isCorrect ? null : (
            <p>
              Răspunsuri acceptate: <strong>{item.acceptedAnswers.join(", ")}</strong>
            </p>
          )}
        </>
      ) : null}

      {item.type === "reasoning" ? (
        <>
          <p>Răspunsul tău:</p>
          <blockquote className="student-answer">
            {item.text === "" ? "(fără răspuns)" : item.text}
          </blockquote>
          <p>
            <strong>Evaluare:</strong> {VERDICT_LABELS[item.verdict]} ({item.points} din 1 punct)
          </p>
          <SafeMarkdown>{item.feedback}</SafeMarkdown>
          {item.reexplanation ? (
            <div className="explanation">
              <p>
                <strong>Pe înțelesul tău:</strong>
              </p>
              <SafeMarkdown>{item.reexplanation}</SafeMarkdown>
            </div>
          ) : null}
        </>
      ) : null}

      {item.type === "programming" ? (
        <>
          <p>Codul tău:</p>
          <pre className="code-block">{item.text === "" ? "(fără răspuns)" : item.text}</pre>
          <p>Soluție de referință:</p>
          <pre className="code-block">{item.referenceSolution}</pre>
          {item.rubric ? (
            <>
              <p>Barem:</p>
              <SafeMarkdown>{item.rubric}</SafeMarkdown>
            </>
          ) : null}
        </>
      ) : null}

      {item.explanation ? (
        <div className="explanation">
          <p>
            <strong>Explicație:</strong>
          </p>
          <SafeMarkdown>{item.explanation}</SafeMarkdown>
        </div>
      ) : null}
    </article>
  );
}
