import { z } from "zod";

export const createClassFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Introdu numele clasei.")
    .max(80, "Numele clasei poate avea cel mult 80 de caractere."),
  // The <select> is registered with valueAsNumber, so this receives a number.
  grade: z
    .number({ error: "Alege clasa." })
    .int("Alege clasa.")
    .min(9, "Clasa trebuie să fie între a IX-a și a XII-a.")
    .max(12, "Clasa trebuie să fie între a IX-a și a XII-a."),
});
export type CreateClassFormValues = z.input<typeof createClassFormSchema>;

export const joinClassFormSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, "Introdu codul clasei.")
    .max(20, "Codul clasei este prea lung.")
    .regex(/^[A-Za-z0-9]+$/, "Codul clasei conține doar litere și cifre."),
});
export type JoinClassFormValues = z.input<typeof joinClassFormSchema>;
