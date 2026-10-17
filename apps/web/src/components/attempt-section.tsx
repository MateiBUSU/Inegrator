import type { AttemptResult as AttemptResultData, StudentQuestion } from "@app/shared";
import { useState } from "react";
import { api } from "../api";
import { AttemptForm } from "./attempt-form";
import { AttemptResult } from "./attempt-result";

interface AttemptSectionProps {
  materialId: string;
  questions: readonly StudentQuestion[];
  submitLabel?: string;
  /** Called after a successful submit; must not throw (the result is shown regardless). */
  onSubmitted?: () => void;
}

/** Answer the questions, submit, then see the result (the submit response already carries it). */
export function AttemptSection({
  materialId,
  questions,
  submitLabel,
  onSubmitted,
}: AttemptSectionProps) {
  const [result, setResult] = useState<AttemptResultData | null>(null);

  if (result) {
    return (
      <>
        <AttemptResult result={result} questions={questions} />
        <button type="button" className="button-secondary" onClick={() => setResult(null)}>
          Încearcă din nou
        </button>
      </>
    );
  }
  return (
    <AttemptForm
      questions={questions}
      {...(submitLabel ? { submitLabel } : {})}
      onSubmit={async (payload) => {
        setResult(await api.attempts.submitAttempt(materialId, payload));
        onSubmitted?.();
      }}
    />
  );
}
