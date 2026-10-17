import { zodResolver } from "@hookform/resolvers/zod";
import { registerRequestSchema } from "@app/shared";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, Navigate } from "react-router";
import { api, FALLBACK_MESSAGE, userMessage } from "../api";
import { useAuth } from "../auth/auth-context";
import { homePathFor } from "../auth/paths";
import { AuthShell } from "../components/auth-shell";
import { ErrorState } from "../components/error-state";
import { FormField } from "../components/form-field";
import { registerFormSchema, type RegisterFormValues } from "../forms/auth-schemas";

export function RegisterPage() {
  const { user, refetch } = useAuth();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerFormSchema),
    defaultValues: {
      email: "",
      password: "",
      role: "student",
      display_name: "",
      teacher_secret: "",
    },
  });
  const role = watch("role");

  if (user) return <Navigate to={homePathFor(user.role)} replace />;

  async function onSubmit(values: RegisterFormValues) {
    setSubmitError(null);
    try {
      // The teacher code is only sent when registering as a teacher.
      const body = registerRequestSchema.parse({
        email: values.email,
        password: values.password,
        role: values.role,
        display_name: values.display_name,
        ...(values.role === "teacher" ? { teacher_secret: values.teacher_secret } : {}),
      });
      await api.auth.register(body); // also signs the user in
      // Loads the user; the redirect above then happens on re-render. If the session cannot be
      // read right after registering, say so instead of silently doing nothing.
      if (!(await refetch())) setSubmitError(FALLBACK_MESSAGE);
    } catch (error) {
      setSubmitError(userMessage(error));
    }
  }

  return (
    <AuthShell
      eyebrow="Creează cont"
      title="Cum vei folosi Nexora?"
      subtitle="Alege tipul de cont și completează datele."
    >
      <form onSubmit={(event) => void handleSubmit(onSubmit)(event)} noValidate>
        <fieldset className="grid gap-3 sm:grid-cols-2">
          <legend className="sr-only">Tipul de cont</legend>
          <label className="block cursor-pointer">
            <input
              type="radio"
              value="teacher"
              aria-label="Cont profesor"
              className="peer sr-only"
              {...register("role")}
            />
            <span className="bg-surface border-line peer-checked:border-primary peer-checked:bg-primary-soft rounded-card peer-focus-visible:outline-primary flex h-full flex-col gap-1 border-2 p-4 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2">
              <span className="text-ink font-extrabold">Cont profesor</span>
              <span className="text-ink-3 text-xs leading-relaxed font-medium">
                Creează clase, materiale și teste. Monitorizează progresul.
              </span>
            </span>
          </label>
          <label className="block cursor-pointer">
            <input
              type="radio"
              value="student"
              aria-label="Cont elev"
              className="peer sr-only"
              {...register("role")}
            />
            <span className="bg-surface border-line peer-checked:border-primary peer-checked:bg-primary-soft rounded-card peer-focus-visible:outline-primary flex h-full flex-col gap-1 border-2 p-4 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2">
              <span className="text-ink font-extrabold">Cont elev</span>
              <span className="text-ink-3 text-xs leading-relaxed font-medium">
                Alătură-te claselor, învață și urmărește-ți progresul.
              </span>
            </span>
          </label>
          {errors.role?.message ? (
            <small className="field-error sm:col-span-2" role="alert">
              {errors.role.message}
            </small>
          ) : null}
        </fieldset>

        <FormField label="Adresă de email" htmlFor="register-email" error={errors.email?.message}>
          <input id="register-email" type="email" autoComplete="email" {...register("email")} />
        </FormField>
        <FormField
          label="Nume afișat"
          htmlFor="register-display-name"
          hint="Folosește un prenume sau o poreclă, nu numele complet."
          error={errors.display_name?.message}
        >
          <input
            id="register-display-name"
            type="text"
            autoComplete="nickname"
            {...register("display_name")}
          />
        </FormField>
        <FormField
          label="Parolă"
          htmlFor="register-password"
          hint="Cel puțin 8 caractere."
          error={errors.password?.message}
        >
          <input
            id="register-password"
            type="password"
            autoComplete="new-password"
            {...register("password")}
          />
        </FormField>
        {role === "teacher" ? (
          <FormField
            label="Cod de profesor"
            htmlFor="register-teacher-secret"
            hint="Primit de la administratorul platformei."
            error={errors.teacher_secret?.message}
          >
            <input
              id="register-teacher-secret"
              type="password"
              autoComplete="off"
              {...register("teacher_secret")}
            />
          </FormField>
        ) : null}

        {submitError ? <ErrorState message={submitError} /> : null}
        <button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? "Se creează contul…" : "Creează contul"}
        </button>
      </form>
      <p className="mt-4 text-center text-sm">
        Ai deja cont? <Link to="/login">Autentifică-te</Link>
      </p>
    </AuthShell>
  );
}
