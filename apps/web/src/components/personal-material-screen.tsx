import type { PersonalMaterialView } from "@app/shared";
import { KIND_LABELS } from "../lib/labels";
import { AttemptSection } from "./attempt-section";
import { MockBadge } from "./badges";
import { EmptyState } from "./empty-state";
import { SafeMarkdown } from "./safe-markdown";

/**
 * A personal lesson or quiz. Same attempt and scoring components as class materials; the scoring
 * itself happens in the backend. Personal answer keys come from the AI and are not confirmed by a
 * teacher, so the score is practice only.
 */
export function PersonalMaterialScreen({ material }: { material: PersonalMaterialView }) {
  const isLesson = material.kind === "lesson";
  const questions = isLesson ? (material.lesson?.checkQuestions ?? []) : (material.questions ?? []);

  return (
    <div className="material-view">
      <header className="material-header">
        <h1>{material.title}</h1>
        <p className="muted">
          {KIND_LABELS[material.kind]} · Studiu individual{" "}
          <MockBadge provider={material.provider} />
        </p>
        <details open={isLesson}>
          <summary>Obiectivul tău ({material.objectives.length})</summary>
          <ul>
            {material.objectives.map((objective) => (
              <li key={objective.id}>{objective.text}</li>
            ))}
          </ul>
        </details>
      </header>

      {material.lesson ? (
        <section aria-label="Lecție">
          <SafeMarkdown>{material.lesson.body}</SafeMarkdown>
          {material.lesson.examples.length > 0 ? <h2>Exemple</h2> : null}
          {material.lesson.examples.map((example, index) => (
            <div key={`${index}-${example.title}`} className="card">
              <h3>{example.title}</h3>
              <SafeMarkdown>{example.body}</SafeMarkdown>
            </div>
          ))}
        </section>
      ) : null}

      {questions.length > 0 ? (
        <section aria-label={isLesson ? "Testează ce ai învățat" : "Întrebări"}>
          <h2>{isLesson ? "Testează ce ai învățat" : "Întrebări"}</h2>
          <p className="muted text-sm">
            Conținut generat de AI, necorectat de un profesor: scorul este doar pentru exercițiu.
          </p>
          <AttemptSection
            materialId={material.id}
            questions={questions}
            submitLabel={isLesson ? "Trimite răspunsurile" : "Trimite testul"}
          />
        </section>
      ) : null}
      {!isLesson && questions.length === 0 ? (
        <EmptyState message="Acest material nu are întrebări." />
      ) : null}
    </div>
  );
}
