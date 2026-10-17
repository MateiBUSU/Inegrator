import type { StudentQuestion, SubmitAttemptRequest } from "@app/shared";
import { useState } from "react";
import { userMessage } from "../api";
import { buildAttemptPayload, type AnswerDraft, type AnswerDrafts } from "../lib/attempt-payload";
import { ErrorState } from "./error-state";
import { StudentQuestionField } from "./student-question-field";

const EMPTY_DRAFT: AnswerDraft = { optionIds: [], text: "" };

interface AttemptFormProps {
  questions: readonly StudentQuestion[];
  /** Sends the validated payload; a rejection is shown under the form. */
  onSubmit: (payload: SubmitAttemptRequest) => Promise<void>;
  submitLabel?: string;
}

/** The questions of a test, problem set, exercise or lesson check, and the submit button. */
export function AttemptForm({
  questions,
  onSubmit,
  submitLabel = "Trimite testul",
}: AttemptFormProps) {
  const [drafts, setDrafts] = useState<AnswerDrafts>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const built = buildAttemptPayload(questions, drafts);
    if (!built.ok) {
      setError(built.message);
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await onSubmit(built.payload);
    } catch (err) {
      setError(userMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={(event) => void handleSubmit(event)} noValidate>
      {questions.map((question, index) => (
        <StudentQuestionField
          key={question.id}
          question={question}
          number={index + 1}
          draft={drafts[question.id] ?? EMPTY_DRAFT}
          disabled={submitting}
          onChange={(draft) => setDrafts((previous) => ({ ...previous, [question.id]: draft }))}
        />
      ))}
      {error ? <ErrorState message={error} /> : null}
      <button type="submit" disabled={submitting}>
        {submitting ? "Se trimite…" : submitLabel}
      </button>
    </form>
  );
}
