import { zodResolver } from "@hookform/resolvers/zod";
import { registerRequestSchema } from "@app/shared";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, Navigate } from "react-router";
import { api, FALLBACK_MESSAGE, userMessage } from "../api";
import { useAuth } from "../auth/auth-context";
import { homePathFor } from "../auth/paths";
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
    <section className="card narrow">
      <h1>Înregistrare</h1>
      <form onSubmit={(event) => void handleSubmit(onSubmit)(event)} noValidate>
        <fieldset>
          <legend>Sunt</legend>
          <label className="inline">
            <input type="radio" value="student" {...register("role")} /> elev
          </label>
          <label className="inline">
            <input type="radio" value="teacher" {...register("role")} /> profesor
          </label>
          {errors.role?.message ? (
            <small className="field-error" role="alert">
              {errors.role.message}
            </small>
          ) : null}
        </fieldset>

        <FormField label="Email" htmlFor="register-email" error={errors.email?.message}>
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
        <button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Se creează contul…" : "Creează cont"}
        </button>
      </form>
      <p>
        Ai deja cont? <Link to="/login">Autentifică-te</Link>
      </p>
    </section>
  );
}
