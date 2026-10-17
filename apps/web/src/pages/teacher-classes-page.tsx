import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link } from "react-router";
import { api, userMessage } from "../api";
import { EmptyState } from "../components/empty-state";
import { ErrorState } from "../components/error-state";
import { FormField } from "../components/form-field";
import { LoadingState } from "../components/loading-state";
import { createClassFormSchema, type CreateClassFormValues } from "../forms/class-schemas";
import { useApiData } from "../hooks/use-api-data";

const GRADES = [
  { value: 9, label: "a IX-a" },
  { value: 10, label: "a X-a" },
  { value: 11, label: "a XI-a" },
  { value: 12, label: "a XII-a" },
];

export function TeacherClassesPage() {
  const {
    data: classes,
    error,
    loading,
    reload,
  } = useApiData(() => api.classes.listClasses("teacher"));
  const [createError, setCreateError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateClassFormValues>({
    resolver: zodResolver(createClassFormSchema),
    defaultValues: { name: "", grade: 9 },
  });

  async function onCreate(values: CreateClassFormValues) {
    setCreateError(null);
    try {
      await api.classes.createClass({ name: values.name, grade: values.grade });
      reset({ name: "", grade: values.grade });
      reload();
    } catch (err) {
      setCreateError(userMessage(err));
    }
  }

  return (
    <section>
      <h1>Clasele mele</h1>

      <form
        className="card inline-form"
        onSubmit={(event) => void handleSubmit(onCreate)(event)}
        noValidate
      >
        <h2>Creează o clasă</h2>
        <FormField label="Numele clasei" htmlFor="class-name" error={errors.name?.message}>
          <input id="class-name" type="text" {...register("name")} />
        </FormField>
        <FormField label="Clasa" htmlFor="class-grade" error={errors.grade?.message}>
          <select id="class-grade" {...register("grade", { valueAsNumber: true })}>
            {GRADES.map((grade) => (
              <option key={grade.value} value={grade.value}>
                {grade.label}
              </option>
            ))}
          </select>
        </FormField>
        {createError ? <ErrorState message={createError} /> : null}
        <button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Se creează…" : "Creează clasa"}
        </button>
      </form>

      {loading ? <LoadingState message="Se încarcă clasele…" /> : null}
      {!loading && error ? <ErrorState message={userMessage(error)} onRetry={reload} /> : null}
      {!loading && !error && classes && classes.length === 0 ? (
        <EmptyState message="Nu ai creat nicio clasă încă. Creează prima clasă mai sus." />
      ) : null}
      {!loading && !error && classes && classes.length > 0 ? (
        <ul className="card-list">
          {classes.map((cls) => (
            <li key={cls.id} className="card">
              <h2>
                <Link to={`/teacher/classes/${cls.id}`}>{cls.name}</Link>
              </h2>
              <p>Clasa a {cls.grade}-a</p>
              <p>
                Cod de alăturare: <code>{cls.join_code}</code>
              </p>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
