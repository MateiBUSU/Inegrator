import {
  isWellFormed,
  MAX_DOCUMENT_BYTES,
  MAX_DOCUMENTS_PER_CLASS,
  utf8ByteLength,
} from "@app/shared";
import { useState, type ChangeEvent, type FormEvent } from "react";
import { api, userMessage } from "../api";
import { useApiData } from "../hooks/use-api-data";
import { formatDateTime, formatKb } from "../lib/format";
import { EmptyState } from "./empty-state";
import { ErrorState } from "./error-state";
import { LoadingState } from "./loading-state";

const MAX_TITLE = 200;

/** The Romanian message for a document text that cannot be sent, or null if it is fine. */
export function documentTextProblem(text: string): string | null {
  if (text.trim() === "") return "Introdu textul documentului.";
  const bytes = utf8ByteLength(text);
  if (bytes > MAX_DOCUMENT_BYTES) {
    return `Documentul are ${formatKb(bytes)}, iar limita este ${formatKb(MAX_DOCUMENT_BYTES)}. Scurtează textul sau împarte-l în mai multe documente.`;
  }
  if (text.includes("\u0000") || !isWellFormed(text))
    return "Textul conține caractere care nu pot fi salvate.";
  return null;
}

/** The class's source documents: list, add (paste or upload a text file) and delete. */
export function DocumentsSection({ classId }: { classId: string }) {
  const {
    data: documents,
    error,
    loading,
    reload,
  } = useApiData(() => api.documents.listDocuments(classId), [classId]);

  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [problems, setProblems] = useState<{ title?: string; text?: string }>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const bytes = utf8ByteLength(text);
  const overLimit = bytes > MAX_DOCUMENT_BYTES;

  async function onFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = ""; // allow choosing the same file again
    if (!file) return;
    setSubmitError(null);
    // Checked on the file size BEFORE reading it into memory.
    if (file.size > MAX_DOCUMENT_BYTES) {
      setProblems({
        text: `Fișierul are ${formatKb(file.size)}, iar limita este ${formatKb(MAX_DOCUMENT_BYTES)}.`,
      });
      return;
    }
    try {
      setText(await file.text());
    } catch {
      setProblems({ text: "Nu am putut citi fișierul. Încearcă din nou sau lipește textul." });
      return;
    }
    if (title.trim() === "") setTitle(file.name.replace(/\.[^.]+$/, "").slice(0, MAX_TITLE));
    setProblems({});
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitError(null);
    const found = {
      title:
        title.trim() === ""
          ? "Introdu un titlu."
          : title.trim().length > MAX_TITLE
            ? "Titlul este prea lung."
            : undefined,
      text: documentTextProblem(text) ?? undefined,
    };
    setProblems(found);
    if (found.title || found.text) return; // nothing is sent

    setSaving(true);
    try {
      await api.documents.createDocument(classId, { title: title.trim(), text });
      setTitle("");
      setText("");
      reload();
    } catch (err) {
      setSubmitError(userMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function remove(documentId: string) {
    setDeleteError(null);
    try {
      await api.documents.deleteDocument(documentId);
      setConfirmDelete(null);
      reload();
    } catch (err) {
      setDeleteError(userMessage(err));
    }
  }

  return (
    <section className="card" aria-label="Documente">
      <h2>Documente-sursă</h2>
      <p className="muted">
        Materialele generate cu AI se bazează pe aceste documente ale tale.
        {documents ? ` (${documents.length} / ${MAX_DOCUMENTS_PER_CLASS} documente)` : ""}
      </p>

      <div className="notice notice-warning" role="note">
        <p>
          <strong>Atenție:</strong> nu încărca documente care conțin date personale ale elevilor
          (nume, note, date de contact sau alte informații care îi pot identifica). Textul
          documentelor poate fi trimis unui serviciu AI extern atunci când generezi materiale.
        </p>
      </div>

      {loading ? <LoadingState message="Se încarcă documentele…" /> : null}
      {!loading && error ? <ErrorState message={userMessage(error)} onRetry={reload} /> : null}
      {!loading && !error && documents && documents.length === 0 ? (
        <EmptyState message="Nu ai încărcat niciun document pentru această clasă." />
      ) : null}
      {!loading && !error && documents && documents.length > 0 ? (
        <ul className="plain-list">
          {documents.map((document) => (
            <li key={document.id} className="document-row">
              <div>
                <strong>{document.title}</strong>
                <span className="muted">
                  {" "}
                  · {document.chunk_count} fragmente · {formatDateTime(document.created_at)}
                </span>
              </div>
              {confirmDelete === document.id ? (
                <span className="button-row">
                  <button type="button" onClick={() => void remove(document.id)}>
                    Da, șterge
                  </button>
                  <button
                    type="button"
                    className="button-secondary"
                    onClick={() => setConfirmDelete(null)}
                  >
                    Anulează
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  className="button-secondary"
                  aria-label={`Șterge documentul ${document.title}`}
                  onClick={() => setConfirmDelete(document.id)}
                >
                  Șterge
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : null}
      {deleteError ? <ErrorState message={deleteError} /> : null}

      <form onSubmit={(event) => void onSubmit(event)} noValidate>
        <h3>Adaugă un document</h3>
        <div className="field">
          <label htmlFor="doc-title">Titlu</label>
          <input
            id="doc-title"
            type="text"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
          {problems.title ? (
            <small className="field-error" role="alert">
              {problems.title}
            </small>
          ) : null}
        </div>
        <div className="field">
          <label htmlFor="doc-file">Încarcă un fișier text (.txt sau .md)</label>
          <input
            id="doc-file"
            type="file"
            accept=".txt,.md,text/plain,text/markdown"
            onChange={(event) => void onFile(event)}
          />
        </div>
        <div className="field">
          <label htmlFor="doc-text">Sau lipește textul aici</label>
          <textarea
            id="doc-text"
            rows={8}
            value={text}
            onChange={(event) => setText(event.target.value)}
          />
          <small className={overLimit ? "field-error" : "field-hint"}>
            {formatKb(bytes)} / {formatKb(MAX_DOCUMENT_BYTES)}
          </small>
          {problems.text ? (
            <small className="field-error" role="alert">
              {problems.text}
            </small>
          ) : null}
        </div>
        {submitError ? <ErrorState message={submitError} /> : null}
        <button type="submit" disabled={saving}>
          {saving ? "Se salvează…" : "Adaugă documentul"}
        </button>
      </form>
    </section>
  );
}
