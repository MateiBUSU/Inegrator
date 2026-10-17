import { MAX_TOPIC_GOAL_CHARS, MAX_TOPIC_TITLE_CHARS } from "@app/shared";
import { z } from "zod";

export const createTopicFormSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Introdu titlul subiectului.")
    .max(
      MAX_TOPIC_TITLE_CHARS,
      `Titlul poate avea cel mult ${MAX_TOPIC_TITLE_CHARS} de caractere.`,
    ),
  goal: z
    .string()
    .trim()
    .min(1, "Descrie ce vrei să înveți.")
    .max(MAX_TOPIC_GOAL_CHARS, `Scopul poate avea cel mult ${MAX_TOPIC_GOAL_CHARS} de caractere.`),
});
export type CreateTopicFormValues = z.input<typeof createTopicFormSchema>;
