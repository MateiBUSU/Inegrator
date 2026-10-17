import { MAX_TUTOR_MESSAGE_CHARS, type TutorMessage } from "@app/shared";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { api, userMessage } from "../api";
import { ErrorState } from "./error-state";
import { SafeMarkdown } from "./safe-markdown";

export const AI_DISCLAIMER =
  "Răspunsurile sunt generate de AI și pot conține erori. Verifică surse oficiale.";

interface TutorChatProps {
  topicId: string;
  /** The stored history (oldest first), already loaded by the page. */
  initialMessages: readonly TutorMessage[];
}

/**
 * Chat with the AI tutor. The student's message is shown immediately (optimistic); the tutor's
 * reply is appended when the response arrives. If the turn fails nothing was saved server-side,
 * so the optimistic message is removed and the text goes back into the input.
 */
export function TutorChat({ topicId, initialMessages }: TutorChatProps) {
  const [messages, setMessages] = useState<TutorMessage[]>([...initialMessages]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const pendingCounter = useRef(0);

  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [messages]);

  async function send(event: FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || sending) return;
    const pendingId = `pending-${++pendingCounter.current}`;
    setError(null);
    setSending(true);
    setDraft("");
    setMessages((current) => [
      ...current,
      { id: pendingId, role: "user", content: text, createdAt: new Date().toISOString() },
    ]);
    try {
      const { message } = await api.topics.askTutor(topicId, text);
      setMessages((current) => [...current, message]);
    } catch (err) {
      setMessages((current) => current.filter((entry) => entry.id !== pendingId));
      setDraft(text);
      setError(userMessage(err));
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="card" aria-label="Tutore AI">
      <h2>Tutore AI</h2>
      <div
        ref={listRef}
        className="bg-canvas border-line rounded-card mb-3 flex max-h-[28rem] min-h-40 flex-col gap-3 overflow-y-auto border p-3"
        role="log"
        aria-label="Conversația cu tutorele"
        aria-live="polite"
      >
        {messages.length === 0 ? (
          <p className="text-ink-3 m-auto text-sm">
            Pune prima întrebare despre subiectul tău. Tutorele îți răspunde pe înțelesul tău.
          </p>
        ) : null}
        {messages.map((message) =>
          message.role === "user" ? (
            <div
              key={message.id}
              data-role="user"
              className="bg-primary self-end rounded-2xl rounded-br-sm px-4 py-2 text-sm whitespace-pre-wrap text-white sm:max-w-[80%]"
            >
              {message.content}
            </div>
          ) : (
            <div
              key={message.id}
              data-role="tutor"
              className="bg-surface border-line self-start rounded-2xl rounded-bl-sm border px-4 py-2 text-sm sm:max-w-[85%]"
            >
              <SafeMarkdown>{message.content}</SafeMarkdown>
            </div>
          ),
        )}
        {sending ? (
          <p className="text-ink-3 self-start text-sm" role="status">
            Tutorele scrie…
          </p>
        ) : null}
      </div>

      {error ? <ErrorState message={error} /> : null}

      <form className="flex flex-col gap-2 sm:flex-row sm:items-end" onSubmit={(e) => void send(e)}>
        <div className="flex-1">
          <label htmlFor="tutor-message" className="sr-only">
            Mesajul tău
          </label>
          <textarea
            id="tutor-message"
            rows={2}
            maxLength={MAX_TUTOR_MESSAGE_CHARS}
            placeholder="Întreabă tutorele…"
            value={draft}
            disabled={sending}
            onChange={(event) => setDraft(event.target.value)}
          />
        </div>
        <button type="submit" disabled={sending || draft.trim() === ""}>
          Trimite
        </button>
      </form>

      <p className="text-ink-3 mt-3 mb-0 text-xs" role="note">
        {AI_DISCLAIMER}
      </p>
    </section>
  );
}
