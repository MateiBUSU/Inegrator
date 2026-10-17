import { useState } from "react";
import { Link, useParams } from "react-router";
import { api, userMessage } from "../api";
import { EmptyState } from "../components/empty-state";
import { ErrorState } from "../components/error-state";
import { LoadingState } from "../components/loading-state";
import { TutorChat } from "../components/tutor-chat";
import { useApiData } from "../hooks/use-api-data";
import { KIND_LABELS, policySummary } from "../lib/labels";

export function StudentTopicDetailPage() {
  const { id = "" } = useParams();
  // The topic itself comes from the list (there is no single-topic endpoint); an id that is not
  // in the student's own list is shown as "not found", same as the API would answer.
  const { data, error, loading, reload } = useApiData(async () => {
    const [topics, messages, policy, materials] = await Promise.all([
      api.topics.listTopics(),
      api.topics.listTutorMessages(id),
      api.topics.getPolicy(id),
      api.topics.listMaterials(id),
    ]);
    return { topic: topics.find((t) => t.id === id) ?? null, messages, policy, materials };
  }, [id]);
  const [generating, setGenerating] = useState<"lesson" | "quiz" | null>(null);
  const [generateError, setGenerateError] = useState<string | null>(null);

  async function generate(kind: "lesson" | "quiz") {
    setGenerateError(null);
    setGenerating(kind);
    try {
      if (kind === "lesson") await api.topics.generateLesson(id);
      else await api.topics.generateQuiz(id, { kind: "test" });
      reload();
    } catch (err) {
      // 429 (QUOTA_EXCEEDED) and 503 (AI_UNAVAILABLE) get their own Romanian message; the chat
      // and the material list on the page stay as they are.
      setGenerateError(userMessage(err));
    } finally {
      setGenerating(null);
    }
  }

  return (
    <section>
      <p>
        <Link to="/student/topics">← Materiale individuale</Link>
      </p>
      {loading && !data ? <LoadingState message="Se încarcă subiectul…" /> : null}
      {!loading && error ? <ErrorState message={userMessage(error)} onRetry={reload} /> : null}
      {data && !data.topic ? <ErrorState message="Subiectul nu a fost găsit." /> : null}
      {data?.topic ? (
        <>
          <h1>{data.topic.title}</h1>
          <p className="muted">{data.topic.goal}</p>
          <p className="text-ink-2 text-sm" data-testid="policy-summary">
            {policySummary(data.policy.policy)}
          </p>

          <TutorChat topicId={id} initialMessages={data.messages} />

          <section className="card" aria-label="Materiale pentru acest subiect">
            <h2>Lecții și teste</h2>
            <div className="button-row">
              <button
                type="button"
                disabled={generating !== null}
                onClick={() => void generate("lesson")}
              >
                {generating === "lesson" ? "Se generează…" : "Generează lecție"}
              </button>
              <button
                type="button"
                disabled={generating !== null}
                onClick={() => void generate("quiz")}
              >
                {generating === "quiz" ? "Se generează…" : "Generează quiz"}
              </button>
            </div>
            {generateError ? <ErrorState message={generateError} /> : null}
            {data.materials.length === 0 ? (
              <EmptyState message="Nu ai generat încă nicio lecție sau niciun quiz pentru acest subiect." />
            ) : (
              <ul className="plain-list mt-4">
                {data.materials.map((material) => (
                  <li key={material.id} className="document-row">
                    <Link to={`/student/topics/${id}/materials/${material.id}`}>
                      {material.title}
                    </Link>
                    <span className="badge">{KIND_LABELS[material.kind]}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      ) : null}
    </section>
  );
}
