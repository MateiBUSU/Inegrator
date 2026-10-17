import { zodResolver } from "@hookform/resolvers/zod";
import { loginRequestSchema } from "@app/shared";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, Navigate, useLocation } from "react-router";
import { api, FALLBACK_MESSAGE, userMessage } from "../api";
import { useAuth } from "../auth/auth-context";
import { redirectTargetFor } from "../auth/paths";
import { ErrorState } from "../components/error-state";
import { FormField } from "../components/form-field";
import { loginFormSchema, type LoginFormValues } from "../forms/auth-schemas";

export function LoginPage() {
  const { user, refetch } = useAuth();
  const location = useLocation();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginFormSchema),
    defaultValues: { email: "", password: "" },
  });

  // Already signed in (or just signed in): go where the guard sent them from, or to their home.
  if (user) {
    const from = (location.state as { from?: unknown } | null)?.from;
    return <Navigate to={redirectTargetFor(user.role, from)} replace />;
  }

  async function onSubmit(values: LoginFormValues) {
    setSubmitError(null);
    try {
      await api.auth.login(loginRequestSchema.parse(values));
      // Loads the user; the redirect above then happens on re-render. If the session cannot be
      // read right after logging in, say so instead of silently doing nothing.
      if (!(await refetch())) setSubmitError(FALLBACK_MESSAGE);
    } catch (error) {
      setSubmitError(userMessage(error));
    }
  }

  return (
    <section className="card narrow">
      <h1>Autentificare</h1>
      <form onSubmit={(event) => void handleSubmit(onSubmit)(event)} noValidate>
        <FormField label="Email" htmlFor="login-email" error={errors.email?.message}>
          <input id="login-email" type="email" autoComplete="email" {...register("email")} />
        </FormField>
        <FormField label="Parolă" htmlFor="login-password" error={errors.password?.message}>
          <input
            id="login-password"
            type="password"
            autoComplete="current-password"
            {...register("password")}
          />
        </FormField>
        {submitError ? <ErrorState message={submitError} /> : null}
        <button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Se autentifică…" : "Autentifică-te"}
        </button>
      </form>
      <p>
        Nu ai cont? <Link to="/register">Înregistrează-te</Link>
      </p>
    </section>
  );
}
