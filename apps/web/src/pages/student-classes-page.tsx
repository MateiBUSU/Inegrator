import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link } from "react-router";
import { api, userMessage } from "../api";
import { EmptyState } from "../components/empty-state";
import { ErrorState } from "../components/error-state";
import { FormField } from "../components/form-field";
import { LoadingState } from "../components/loading-state";
import { joinClassFormSchema, type JoinClassFormValues } from "../forms/class-schemas";
import { useApiData } from "../hooks/use-api-data";

export function StudentClassesPage() {
  const {
    data: classes,
    error,
    loading,
    reload,
  } = useApiData(() => api.classes.listClasses("student"));
  const [joinError, setJoinError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<JoinClassFormValues>({
    resolver: zodResolver(joinClassFormSchema),
    defaultValues: { code: "" },
  });

  async function onJoin(values: JoinClassFormValues) {
    setJoinError(null);
    try {
      await api.classes.joinClass(values.code);
      reset({ code: "" });
      reload();
    } catch (err) {
      setJoinError(userMessage(err));
    }
  }

  return (
    <section>
      <h1>Clasele mele</h1>

      <form
        className="card inline-form"
        onSubmit={(event) => void handleSubmit(onJoin)(event)}
        noValidate
      >
        <h2>Intră într-o clasă</h2>
        <FormField
          label="Codul clasei"
          htmlFor="join-code"
          hint="Îl primești de la profesor."
          error={errors.code?.message}
        >
          <input id="join-code" type="text" autoComplete="off" {...register("code")} />
        </FormField>
        {joinError ? <ErrorState message={joinError} /> : null}
        <button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Se verifică…" : "Intră în clasă"}
        </button>
      </form>

      {loading ? <LoadingState message="Se încarcă clasele…" /> : null}
      {!loading && error ? <ErrorState message={userMessage(error)} onRetry={reload} /> : null}
      {!loading && !error && classes && classes.length === 0 ? (
        <EmptyState message="Nu faci parte din nicio clasă încă. Introdu codul primit de la profesor." />
      ) : null}
      {!loading && !error && classes && classes.length > 0 ? (
        <ul className="card-list">
          {classes.map((cls) => (
            <li key={cls.id} className="card">
              <h2>
                <Link to={`/student/classes/${cls.id}`}>{cls.name}</Link>
              </h2>
              <p>Clasa a {cls.grade}-a</p>
              <p>Profesor: {cls.teacher_display_name}</p>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
