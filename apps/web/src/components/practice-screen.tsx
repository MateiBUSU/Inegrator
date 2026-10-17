import type { PracticeExerciseView, PracticeProgress, SubmitPracticeResponse } from "@app/shared";
import { useEffect, useState } from "react";
import { api, ApiError, userMessage } from "../api";
import { STRATEGY_LABELS } from "../lib/labels";
import { AttemptForm } from "./attempt-form";
import { ErrorState } from "./error-state";
import { LoadingState } from "./loading-state";
import { PracticeProgressSummary } from "./practice-progress";
import { SafeMarkdown } from "./safe-markdown";

type WrongAnswer = Extract<SubmitPracticeResponse, { correct: false }>;

type Phase =
  | { kind: "loading" }
  | { kind: "failed"; message: string }
  | { kind: "capped" }
  | { kind: "question"; exercise: PracticeExerciseView }
  | { kind: "review"; result: WrongAnswer }
  | { kind: "mastered" };

interface PracticeScreenProps {
  objectiveId: string;
  /** Shown as the title when known (the page passes it along from the material view). */
  objectiveText?: string | undefined;
  onClose: () => void;
}

/** Why the "ask the teacher" action does nothing yet: no endpoint exists for it. */
export const HELP_UNAVAILABLE_NOTE =
  "Trimiterea cererii către profesor nu este disponibilă încă. Spune-i profesorului la oră că ai nevoie de ajutor la acest obiectiv.";

function CappedNotice({ onClose }: { onClose: () => void }) {
  return (
    <div className="notice notice-warning" role="status">
      <p>
        <strong>Ai încercat toate variantele de explicație pentru acest subiect.</strong>
      </p>
      <p>E momentul să primești ajutor direct de la profesor.</p>
      <div className="button-row">
        <button type="button" disabled aria-describedby="help-note">
          Cere ajutor profesorului
        </button>
        <button type="button" className="button-secondary" onClick={onClose}>
          Închide
        </button>
      </div>
      <p id="help-note" className="text-ink-3 mt-2 text-xs">
        {HELP_UNAVAILABLE_NOTE}
      </p>
    </div>
  );
}

/**
 * The adaptive loop for one objective: one exercise at a time; a wrong answer shows the feedback
 * and a new explanation (a different strategy each time), and the next exercise appears after an
 * explicit "Continuă". The answer key never reaches this component (the API strips it).
 */
export function PracticeScreen({ objectiveId, objectiveText, onClose }: PracticeScreenProps) {
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });
  const [progress, setProgress] = useState<PracticeProgress | null>(null);
  const [attempt, setAttempt] = useState(0); // bumps to retry the start

  useEffect(() => {
    let cancelled = false;
    setPhase({ kind: "loading" });
    api.practice.startPractice(objectiveId).then(
      (started) => {
        if (cancelled) return;
        setProgress(started.progress);
        setPhase({ kind: "question", exercise: started.exercise });
      },
      (error: unknown) => {
        if (cancelled) return;
        if (error instanceof ApiError && error.code === "PRACTICE_CAPPED") {
          setPhase({ kind: "capped" });
        } else {
          setPhase({ kind: "failed", message: userMessage(error) });
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [objectiveId, attempt]);

  // Called by the answer form; a rejection (429, 503, ...) is shown under the form and the typed
  // answer stays in the input because the form is not unmounted.
  async function submit(
    exercise: PracticeExerciseView,
    answer: { optionIds?: string[]; text?: string },
  ) {
    const result = await api.practice.submitPractice(objectiveId, exercise.id, answer);
    setProgress(result.progress);
    setPhase(result.correct ? { kind: "mastered" } : { kind: "review", result });
  }

  return (
    <div className="practice">
      <header className="material-header">
        <h1>Exersează</h1>
        {objectiveText ? <p className="muted">{objectiveText}</p> : null}
        {progress ? <PracticeProgressSummary progress={progress} /> : null}
      </header>

      {phase.kind === "loading" ? <LoadingState message="Se pregătește exercițiul…" /> : null}
      {phase.kind === "failed" ? (
        <ErrorState message={phase.message} onRetry={() => setAttempt((n) => n + 1)} />
      ) : null}
      {phase.kind === "capped" ? <CappedNotice onClose={onClose} /> : null}

      {phase.kind === "question" ? (
        <AttemptForm
          key={phase.exercise.id}
          questions={[phase.exercise.question]}
          submitLabel="Trimite răspunsul"
          onSubmit={async (payload) => {
            const first = payload.answers[0];
            if (!first) throw new ApiError(400, "INVALID_ANSWERS");
            await submit(phase.exercise, {
              ...(first.optionIds ? { optionIds: first.optionIds } : {}),
              ...(first.text !== undefined ? { text: first.text } : {}),
            });
          }}
        />
      ) : null}

      {phase.kind === "review" ? (
        <section aria-label="Feedback">
          <div className="notice notice-warning" role="status">
            <h2>Nu e corect încă</h2>
            <SafeMarkdown>{phase.result.feedback}</SafeMarkdown>
          </div>
          <div className="card">
            <h2>O altă explicație: {STRATEGY_LABELS[phase.result.strategyUsed]}</h2>
            <SafeMarkdown>{phase.result.explanation}</SafeMarkdown>
          </div>
          {phase.result.capped || !phase.result.nextExercise ? (
            <CappedNotice onClose={onClose} />
          ) : (
            <button
              type="button"
              onClick={() => {
                if (phase.result.nextExercise) {
                  setPhase({ kind: "question", exercise: phase.result.nextExercise });
                }
              }}
            >
              Continuă
            </button>
          )}
        </section>
      ) : null}

      {phase.kind === "mastered" ? (
        <div className="notice" role="status">
          <h2 className="success">Corect! Ai stăpânit acest obiectiv.</h2>
          <p>Bravo! Poți închide sau poți reveni oricând să exersezi din nou.</p>
          <button type="button" onClick={onClose}>
            Închide
          </button>
        </div>
      ) : null}
    </div>
  );
}
