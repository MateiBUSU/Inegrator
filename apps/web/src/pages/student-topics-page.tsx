import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link } from "react-router";
import { api, userMessage } from "../api";
import { EmptyState } from "../components/empty-state";
import { ErrorState } from "../components/error-state";
import { FormField } from "../components/form-field";
import { LoadingState } from "../components/loading-state";
import { createTopicFormSchema, type CreateTopicFormValues } from "../forms/topic-schemas";
import { useApiData } from "../hooks/use-api-data";

export function StudentTopicsPage() {
  const { data: topics, error, loading, reload } = useApiData(() => api.topics.listTopics());
  const [formError, setFormError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateTopicFormValues>({
    resolver: zodResolver(createTopicFormSchema),
    defaultValues: { title: "", goal: "" },
  });

  async function onCreate(values: CreateTopicFormValues) {
    setFormError(null);
    try {
      await api.topics.createTopic({ title: values.title.trim(), goal: values.goal.trim() });
      reset({ title: "", goal: "" });
      reload();
    } catch (err) {
      setFormError(userMessage(err));
    }
  }

  async function onDelete(id: string, title: string) {
    if (
      !window.confirm(
        `Ștergi subiectul „${title}”? Conversația, materialele și încercările lui se șterg.`,
      )
    ) {
      return;
    }
    setDeleteError(null);
    try {
      await api.topics.deleteTopic(id);
      reload();
    } catch (err) {
      setDeleteError(userMessage(err));
    }
  }

  return (
    <section>
      <h1>Materiale individuale</h1>
      <p className="muted">
        Un spațiu doar al tău pentru studiu independent (de exemplu rețelistică sau securitate
        cibernetică), separat de materialele claselor tale.
      </p>

      <form
        className="card inline-form"
        onSubmit={(event) => void handleSubmit(onCreate)(event)}
        noValidate
      >
        <h2>Subiect nou</h2>
        <FormField label="Titlu" htmlFor="topic-title" error={errors.title?.message}>
          <input id="topic-title" type="text" autoComplete="off" {...register("title")} />
        </FormField>
        <FormField
          label="Ce vrei să înveți?"
          htmlFor="topic-goal"
          hint="Scopul tău ajută tutorele să îți potrivească explicațiile."
          error={errors.goal?.message}
        >
          <textarea id="topic-goal" rows={3} {...register("goal")} />
        </FormField>
        {formError ? <ErrorState message={formError} /> : null}
        <button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Se creează…" : "Creează subiectul"}
        </button>
      </form>

      {deleteError ? <ErrorState message={deleteError} /> : null}
      {loading ? <LoadingState message="Se încarcă subiectele…" /> : null}
      {!loading && error ? <ErrorState message={userMessage(error)} onRetry={reload} /> : null}
      {!loading && !error && topics && topics.length === 0 ? (
        <EmptyState message="Nu ai niciun subiect încă. Creează unul pentru a discuta cu tutorele AI și pentru a genera lecții și teste doar pentru tine." />
      ) : null}
      {!loading && !error && topics && topics.length > 0 ? (
        <ul className="card-list">
          {topics.map((topic) => (
            <li key={topic.id} className="card">
              <h2>
                <Link to={`/student/topics/${topic.id}`}>{topic.title}</Link>
              </h2>
              <p>{topic.goal}</p>
              <div className="button-row">
                <button
                  type="button"
                  className="button-secondary"
                  aria-label={`Șterge subiectul ${topic.title}`}
                  onClick={() => void onDelete(topic.id, topic.title)}
                >
                  Șterge
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
