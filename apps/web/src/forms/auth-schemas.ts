import { z } from "zod";

// Form validation with Romanian messages. The values that pass here are then normalized and
// checked once more with the shared schemas (loginRequestSchema / registerRequestSchema), which
// are the API's own contract, right before the request is sent.

const email = z
  .string()
  .trim()
  .min(1, "Introdu adresa de email.")
  .pipe(z.email("Adresa de email nu este validă."));

export const loginFormSchema = z.object({
  email,
  password: z
    .string()
    .min(1, "Introdu parola.")
    .max(128, "Parola poate avea cel mult 128 de caractere."),
});
export type LoginFormValues = z.input<typeof loginFormSchema>;

export const registerFormSchema = z
  .object({
    email,
    password: z
      .string()
      .min(8, "Parola trebuie să aibă cel puțin 8 caractere.")
      .max(128, "Parola poate avea cel mult 128 de caractere."),
    role: z.enum(["student", "teacher"], { error: "Alege dacă ești elev sau profesor." }),
    display_name: z
      .string()
      .trim()
      .min(1, "Introdu un nume afișat.")
      .max(60, "Numele afișat poate avea cel mult 60 de caractere."),
    teacher_secret: z.string().max(256, "Codul de profesor este prea lung.").optional(),
  })
  .superRefine((values, ctx) => {
    // The teacher code is only needed (and only sent) when registering as a teacher.
    if (values.role === "teacher" && !values.teacher_secret?.trim()) {
      ctx.addIssue({
        code: "custom",
        path: ["teacher_secret"],
        message: "Introdu codul de profesor.",
      });
    }
  });
export type RegisterFormValues = z.input<typeof registerFormSchema>;
