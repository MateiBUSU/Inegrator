import { allQuestions, type Question } from "@app/shared";
import type { MaterialStatusValue } from "./labels";

/** Anything that carries questions the way a material does (lesson check questions or questions). */
interface HasQuestions {
  lesson?: { checkQuestions: Question[] } | undefined;
  questions?: Question[] | undefined;
}

export function isConfirmed(question: Pick<Question, "verification">): boolean {
  return question.verification === "teacher_confirmed";
}

export function questionsOf(material: HasQuestions): Question[] {
  return allQuestions(material);
}

export function unconfirmedQuestions(material: HasQuestions): Question[] {
  return questionsOf(material).filter((question) => !isConfirmed(question));
}

/** 1-based position of a question in the material, or null if it is not there. */
export function questionNumber(material: HasQuestions, questionId: string): number | null {
  const index = questionsOf(material).findIndex((question) => question.id === questionId);
  return index < 0 ? null : index + 1;
}

export function questionLabel(material: HasQuestions, questionId: string): string {
  const number = questionNumber(material, questionId);
  return number === null ? "O întrebare necunoscută" : `Întrebarea ${number}`;
}

/** "Întrebarea 1, Întrebarea 3": for messages that name several questions. */
export function questionLabels(material: HasQuestions, questionIds: readonly string[]): string {
  return questionIds.map((id) => questionLabel(material, id)).join(", ");
}

interface Publishable extends HasQuestions {
  status: MaterialStatusValue;
}

/**
 * Why a material cannot be published right now, in Romanian, or null if it can.
 *
 * This only decides whether the button is enabled. It mirrors the backend rule (draft, and every
 * question teacher-confirmed) for a good user experience; the server enforces the rule itself
 * and may still answer 409, which the publish panel shows.
 */
export function publishBlockReason(material: Publishable, dirty: boolean): string | null {
  if (material.status !== "draft") return "Doar o ciornă poate fi publicată.";
  if (dirty) return "Salvează modificările înainte de a publica.";
  const pending = unconfirmedQuestions(material);
  if (pending.length > 0) {
    return `Confirmă răspunsurile corecte înainte de publicare. Neconfirmate: ${questionLabels(
      material,
      pending.map((question) => question.id),
    )}.`;
  }
  return null;
}

export function canPublish(material: Publishable, dirty: boolean): boolean {
  return publishBlockReason(material, dirty) === null;
}
