import {
  submitAttemptRequestSchema,
  type StudentQuestion,
  type SubmitAttemptRequest,
  type SubmittedAnswer,
} from "@app/shared";

/** What the student has entered so far for one question. */
export interface AnswerDraft {
  optionIds: string[];
  text: string;
}

export type AnswerDrafts = Record<string, AnswerDraft>;

export type PayloadResult =
  { ok: true; payload: SubmitAttemptRequest } | { ok: false; message: string };

/**
 * Builds the POST /attempts body from the drafts and validates it with the shared schema.
 * Unanswered questions are left out (the backend counts a missing answer as wrong); mcq sends
 * optionIds, short and programming send text.
 */
export function buildAttemptPayload(
  questions: readonly StudentQuestion[],
  drafts: AnswerDrafts,
): PayloadResult {
  const answers: SubmittedAnswer[] = [];
  for (const question of questions) {
    const draft = drafts[question.id];
    if (!draft) continue;
    if (question.type === "mcq") {
      if (draft.optionIds.length > 0) {
        answers.push({ questionId: question.id, optionIds: draft.optionIds });
      }
    } else if (draft.text.trim() !== "") {
      answers.push({ questionId: question.id, text: draft.text });
    }
  }
  const parsed = submitAttemptRequestSchema.safeParse({ answers });
  if (!parsed.success) {
    return {
      ok: false,
      message:
        "Un răspuns este prea lung sau conține caractere nepermise. Verifică-l și încearcă din nou.",
    };
  }
  return { ok: true, payload: parsed.data };
}
