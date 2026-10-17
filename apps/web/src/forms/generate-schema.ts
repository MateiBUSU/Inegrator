import { materialKindSchema } from "@app/shared";
import { z } from "zod";
import type { GenerateMaterialInput } from "../api";

// Client-side validation for the "generate a material" form, with Romanian messages. Whatever
// passes is turned into the API request by buildGenerateRequest.

export const generateFormSchema = z.object({
  classId: z.string().min(1, "Alege clasa."),
  subjectId: z.string().min(1, "Alege subiectul."),
  chapterId: z.string().min(1, "Alege capitolul."),
  kind: materialKindSchema,
  objectiveIds: z
    .array(z.string())
    .min(1, "Alege cel puțin un obiectiv.")
    .max(20, "Poți alege cel mult 20 de obiective."),
  documentIds: z.array(z.string()).max(20, "Poți alege cel mult 20 de documente."),
  count: z
    .number({ error: "Introdu numărul de întrebări." })
    .int("Numărul de întrebări trebuie să fie întreg.")
    .min(1, "Numărul de întrebări trebuie să fie între 1 și 20.")
    .max(20, "Numărul de întrebări trebuie să fie între 1 și 20."),
});
export type GenerateFormValues = z.infer<typeof generateFormSchema>;

/**
 * The API request for validated form values. `documentIds` is only sent when the teacher picked
 * specific documents (otherwise all of the class's documents are used), and `count` only for
 * kinds that have questions to count (not for lessons).
 */
export function buildGenerateRequest(values: GenerateFormValues): GenerateMaterialInput {
  return {
    classId: values.classId,
    subjectId: values.subjectId,
    chapterId: values.chapterId,
    kind: values.kind,
    objectiveIds: values.objectiveIds,
    ...(values.documentIds.length > 0 ? { documentIds: values.documentIds } : {}),
    ...(values.kind === "lesson" ? {} : { count: values.count }),
  };
}
