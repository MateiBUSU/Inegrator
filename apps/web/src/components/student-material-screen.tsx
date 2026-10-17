import type { ProgressStatus, StudentMaterialView } from "@app/shared";
import { useEffect, useRef, useState } from "react";
import { api, userMessage } from "../api";
import { gradeLabel, KIND_LABELS, LANGUAGE_LABELS, SECTION_LABELS } from "../lib/labels";
import { AttemptSection } from "./attempt-section";
import { ProgressBadge } from "./badges";
import { ObjectiveList } from "./objective-list";
import { EmptyState } from "./empty-state";
import { ErrorState } from "./error-state";
import { SafeMarkdown } from "./safe-markdown";

interface StudentMaterialScreenProps {
  material: StudentMaterialView;
  /** The student's progress on this material when the page loaded; undefined when there is none. */
  initialStatus: ProgressStatus | undefined;
}

export function StudentMaterialScreen({ material, initialStatus }: StudentMaterialScreenProps) {
  const [status, setStatus] = useState<ProgressStatus | undefined>(initialStatus);
  const [progressError, setProgressError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const autoStarted = useRef(false);
  const isLesson = material.kind === "lesson";

  async function updateProgress(next: ProgressStatus) {
    setProgressError(null);
    setSaving(true);
    try {
      const saved = await api.me.setProgress(material.id, next);
      setStatus(saved.status);
    } catch (error) {
      setProgressError(userMessage(error));
    } finally {
      setSaving(false);
    }
  }

  // Finishing a test, problem set or exercise means attempting it, whatever the score. A failure
  // here must not hide the result the student just got.
  async function completeAfterSubmit() {
    try {
      const saved = await api.me.setProgress(material.id, "completed");
      setStatus(saved.status);
    } catch (error) {
      console.error("Could not mark the material as completed", error);
    }
  }

  // Opening a lesson marks it as started, unless it is already started or completed.
  useEffect(() => {
    if (!isLesson || initialStatus !== undefined || autoStarted.current) return;
    autoStarted.current = true;
    void updateProgress("started");
    // Runs once per opened material.
  }, [material.id]);

  const questions = isLesson ? (material.lesson?.checkQuestions ?? []) : (material.questions ?? []);

  return (
    <div className="material-view">
      <header className="material-header">
        <h1>{material.title}</h1>
        <p className="muted">
          {KIND_LABELS[material.kind]} · {SECTION_LABELS[material.section]} ·{" "}
          {LANGUAGE_LABELS[material.language]} · {gradeLabel(material.grade)}{" "}
          {isLesson ? <ProgressBadge state={status ?? "not_started"} /> : null}
        </p>
        <ObjectiveList objectives={material.objectives} />
      </header>

      {material.lesson ? (
        <section aria-label="Lecție">
          <SafeMarkdown>{material.lesson.body}</SafeMarkdown>
          {material.lesson.examples.map((example, index) => (
            <div key={`${index}-${example.title}`} className="card">
              <h3>{example.title}</h3>
              <SafeMarkdown>{example.body}</SafeMarkdown>
            </div>
          ))}
          <div className="button-row">
            <button
              type="button"
              disabled={saving || status === "completed"}
              onClick={() => void updateProgress("completed")}
            >
              {status === "completed" ? "Lecție încheiată" : "Marchează ca încheiată"}
            </button>
          </div>
          {progressError ? <ErrorState message={progressError} /> : null}
        </section>
      ) : null}

      {questions.length > 0 ? (
        <section aria-label={isLesson ? "Testează ce ai învățat" : "Întrebări"}>
          <h2>{isLesson ? "Testează ce ai învățat" : "Întrebări"}</h2>
          <AttemptSection
            materialId={material.id}
            questions={questions}
            {...(isLesson ? {} : { onSubmitted: () => void completeAfterSubmit() })}
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
