import type { TeacherMaterial } from "@app/shared";
import { formatDateTime } from "../lib/format";
import { gradeLabel, KIND_LABELS, LANGUAGE_LABELS, SECTION_LABELS } from "../lib/labels";
import { questionsOf } from "../lib/material-state";
import { StatusBadge } from "./badges";
import { GenerationNotice } from "./generation-notice";
import { QuestionView } from "./question-view";
import { SafeMarkdown } from "./safe-markdown";

/** Read-only view of a whole material (used for published and archived materials). */
export function MaterialView({ material }: { material: TeacherMaterial }) {
  const questions = questionsOf(material);
  return (
    <div className="material-view">
      <MaterialHeader material={material} />
      <GenerationNotice generation={material.generation} />

      {material.lesson ? (
        <section aria-label="Lecție">
          <h2>Lecție</h2>
          <SafeMarkdown>{material.lesson.body}</SafeMarkdown>
          {material.lesson.examples.map((example) => (
            <div key={example.title} className="card">
              <h3>{example.title}</h3>
              <SafeMarkdown>{example.body}</SafeMarkdown>
            </div>
          ))}
        </section>
      ) : null}

      {questions.length > 0 ? (
        <section aria-label="Întrebări">
          <h2>Întrebări</h2>
          {questions.map((question, index) => (
            <QuestionView key={question.id} question={question} number={index + 1} />
          ))}
        </section>
      ) : null}
    </div>
  );
}

/** Title and the facts about a material, shared by the read-only view and the editor. */
export function MaterialHeader({ material }: { material: TeacherMaterial }) {
  return (
    <header className="material-header">
      <h1>{material.title}</h1>
      <p className="muted">
        {KIND_LABELS[material.kind]} · {SECTION_LABELS[material.section]} ·{" "}
        {LANGUAGE_LABELS[material.language]} · {gradeLabel(material.grade)} · versiunea{" "}
        {material.version} <StatusBadge status={material.status} />
      </p>
      <p className="muted">
        Creat: {formatDateTime(material.createdAt)}
        {material.publishedAt ? ` · Publicat: ${formatDateTime(material.publishedAt)}` : ""}
      </p>
      <details>
        <summary>Obiective ({material.objectives.length})</summary>
        <ul>
          {material.objectives.map((objective) => (
            <li key={objective.id}>{objective.text}</li>
          ))}
        </ul>
      </details>
    </header>
  );
}
