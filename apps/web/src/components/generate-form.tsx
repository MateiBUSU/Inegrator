import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { api, userMessage } from "../api";
import { buildGenerateRequest, generateFormSchema } from "../forms/generate-schema";
import { useApiData } from "../hooks/use-api-data";
import { gradeLabel, KIND_LABELS, type MaterialKind } from "../lib/labels";
import { EmptyState } from "./empty-state";
import { ErrorState } from "./error-state";
import { LoadingState } from "./loading-state";

const KINDS = Object.keys(KIND_LABELS) as MaterialKind[];

/** Asks the AI for a draft material and opens it in the editor. */
export function GenerateForm() {
  const navigate = useNavigate();
  const classes = useApiData(() => api.classes.listClasses("teacher"));
  const subjects = useApiData(() => api.materials.listSubjects());

  const [classId, setClassId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [chapterId, setChapterId] = useState("");
  const [kind, setKind] = useState<MaterialKind>("lesson");
  const [objectiveIds, setObjectiveIds] = useState<string[]>([]);
  const [documentIds, setDocumentIds] = useState<string[]>([]);
  const [count, setCount] = useState("6");

  const [problems, setProblems] = useState<string[]>([]);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  const documents = useApiData(
    () => (classId ? api.documents.listDocuments(classId) : Promise.resolve([])),
    [classId],
  );

  const selectedClass = classes.data?.find((cls) => cls.id === classId);
  // A grade-9 class sees grade-9 subjects (and the bac subject, which has no grade).
  const subjectOptions = (subjects.data ?? []).filter(
    (subject) => selectedClass && (subject.grade === null || subject.grade === selectedClass.grade),
  );
  const subject = subjectOptions.find((candidate) => candidate.id === subjectId);
  const chapter = subject?.chapters.find((candidate) => candidate.id === chapterId);

  function toggle(list: string[], setList: (next: string[]) => void, id: string) {
    setList(list.includes(id) ? list.filter((existing) => existing !== id) : [...list, id]);
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitError(null);
    const parsed = generateFormSchema.safeParse({
      classId,
      subjectId,
      chapterId,
      kind,
      objectiveIds,
      documentIds,
      // A lesson has no question count (buildGenerateRequest does not send it for lessons).
      count: kind === "lesson" ? 6 : count.trim() === "" ? Number.NaN : Number(count),
    });
    if (!parsed.success) {
      setProblems([...new Set(parsed.error.issues.map((issue) => issue.message))]);
      return;
    }
    setProblems([]);

    setGenerating(true);
    try {
      const result = await api.materials.generateMaterial(buildGenerateRequest(parsed.data));
      navigate(`/teacher/materials/${result.material.id}`);
    } catch (error) {
      // Quota reached (429) and AI unavailable (503) are expected, not fatal: the form stays as
      // it is and the rest of the app keeps working.
      setSubmitError(userMessage(error));
      setGenerating(false);
    }
  }

  if (classes.loading || subjects.loading) return <LoadingState message="Se încarcă datele…" />;
  if (classes.error)
    return <ErrorState message={userMessage(classes.error)} onRetry={classes.reload} />;
  if (subjects.error)
    return <ErrorState message={userMessage(subjects.error)} onRetry={subjects.reload} />;
  if (!classes.data || classes.data.length === 0) {
    return (
      <EmptyState message="Ca să generezi un material ai nevoie de o clasă. Creează mai întâi una în pagina „Clasele mele”." />
    );
  }

  return (
    <form className="card" onSubmit={(event) => void onSubmit(event)} noValidate>
      <div className="field">
        <label htmlFor="gen-class">Clasa</label>
        <select
          id="gen-class"
          value={classId}
          onChange={(event) => {
            setClassId(event.target.value);
            setSubjectId("");
            setChapterId("");
            setObjectiveIds([]);
            setDocumentIds([]);
          }}
        >
          <option value="">— alege clasa —</option>
          {classes.data.map((cls) => (
            <option key={cls.id} value={cls.id}>
              {cls.name} ({gradeLabel(cls.grade)})
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <label htmlFor="gen-subject">Subiect</label>
        <select
          id="gen-subject"
          value={subjectId}
          disabled={!selectedClass}
          onChange={(event) => {
            setSubjectId(event.target.value);
            setChapterId("");
            setObjectiveIds([]);
          }}
        >
          <option value="">— alege subiectul —</option>
          {subjectOptions.map((option) => (
            <option key={option.id} value={option.id}>
              {option.title}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <label htmlFor="gen-chapter">Capitol</label>
        <select
          id="gen-chapter"
          value={chapterId}
          disabled={!subject}
          onChange={(event) => {
            setChapterId(event.target.value);
            setObjectiveIds([]);
          }}
        >
          <option value="">— alege capitolul —</option>
          {(subject?.chapters ?? []).map((option) => (
            <option key={option.id} value={option.id}>
              {option.position}. {option.title}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <label htmlFor="gen-kind">Tipul materialului</label>
        <select
          id="gen-kind"
          value={kind}
          onChange={(event) => setKind(event.target.value as MaterialKind)}
        >
          {KINDS.map((option) => (
            <option key={option} value={option}>
              {KIND_LABELS[option]}
            </option>
          ))}
        </select>
      </div>

      <fieldset>
        <legend>Obiective</legend>
        {chapter ? (
          chapter.objectives.map((objective) => (
            <label key={objective.id} className="block">
              <input
                type="checkbox"
                checked={objectiveIds.includes(objective.id)}
                onChange={() => toggle(objectiveIds, setObjectiveIds, objective.id)}
              />{" "}
              {objective.code}: {objective.text}
            </label>
          ))
        ) : (
          <p className="muted">Alege mai întâi un capitol.</p>
        )}
      </fieldset>

      {kind !== "lesson" ? (
        <div className="field">
          <label htmlFor="gen-count">Număr de întrebări</label>
          <input
            id="gen-count"
            type="number"
            min={1}
            max={20}
            value={count}
            onChange={(event) => setCount(event.target.value)}
          />
        </div>
      ) : null}

      <fieldset>
        <legend>Documente-sursă</legend>
        {!classId ? (
          <p className="muted">Alege mai întâi clasa.</p>
        ) : documents.loading ? (
          <LoadingState message="Se încarcă documentele…" />
        ) : documents.error ? (
          <ErrorState message={userMessage(documents.error)} onRetry={documents.reload} />
        ) : documents.data && documents.data.length > 0 ? (
          <>
            <p className="muted">Dacă nu bifezi nimic, se folosesc toate documentele clasei.</p>
            {documents.data.map((document) => (
              <label key={document.id} className="block">
                <input
                  type="checkbox"
                  checked={documentIds.includes(document.id)}
                  onChange={() => toggle(documentIds, setDocumentIds, document.id)}
                />{" "}
                {document.title}
              </label>
            ))}
          </>
        ) : (
          <p className="notice notice-warning">
            Clasa nu are documente. Materialul va fi generat{" "}
            <strong>fără sursă de la profesor</strong>, iar tu va trebui să-l verifici cu atenție.
            Poți adăuga documente în pagina clasei.
          </p>
        )}
      </fieldset>

      {problems.length > 0 ? (
        <div className="state state-error" role="alert">
          <ul>
            {problems.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {submitError ? (
        <>
          <ErrorState message={submitError} />
          <p className="muted">
            Restul aplicației funcționează normal: poți edita materialele existente din{" "}
            <Link to="/teacher/materials">lista de materiale</Link>.
          </p>
        </>
      ) : null}

      <button type="submit" disabled={generating}>
        {generating ? "Se generează… (poate dura câteva secunde)" : "Generează materialul"}
      </button>
    </form>
  );
}
