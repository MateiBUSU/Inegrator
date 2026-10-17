/** Shown for any error code without a specific message below. */
export const FALLBACK_MESSAGE = "A apărut o eroare. Încearcă din nou.";

// Romanian user-facing messages for the API's `{ error: { code, message } }` codes. The server's
// own message text is never shown: it may be technical or not translated.
const MESSAGES: Record<string, string> = {
  // generic
  VALIDATION_ERROR: "Datele introduse nu sunt valide. Verifică câmpurile și încearcă din nou.",
  INVALID_BODY: "Cererea nu a putut fi citită. Încearcă din nou.",
  PAYLOAD_TOO_LARGE: "Conținutul trimis este prea mare.",
  UNSUPPORTED_MEDIA_TYPE: "Cererea nu este acceptată.",
  BAD_REQUEST: "Cererea nu este validă.",
  NOT_FOUND: "Resursa nu a fost găsită.",
  INTERNAL_ERROR: "A apărut o eroare internă. Încearcă din nou.",
  RATE_LIMITED: "Prea multe încercări. Așteaptă puțin și încearcă din nou.",
  // auth
  UNAUTHENTICATED: "Trebuie să te autentifici.",
  INVALID_CREDENTIALS: "Email sau parolă incorecte.",
  EMAIL_TAKEN: "Există deja un cont cu această adresă de email.",
  INVALID_TEACHER_SECRET: "Codul de profesor este incorect.",
  FORBIDDEN: "Nu ai permisiunea să faci această acțiune.",
  // classes
  CLASS_NOT_FOUND: "Clasa nu a fost găsită.",
  INVALID_JOIN_CODE: "Codul de clasă nu este valid.",
  STUDENT_NOT_FOUND: "Elevul nu face parte din această clasă.",
  JOIN_CODE_UNAVAILABLE: "Nu s-a putut genera un cod de clasă. Încearcă din nou.",
  // documents
  DOCUMENT_NOT_FOUND: "Documentul nu a fost găsit.",
  DOCUMENT_LIMIT_REACHED: "Ai atins numărul maxim de documente pentru această clasă.",
  NO_DOCUMENTS: "Adaugă mai întâi un document.",
  // materials
  MATERIAL_NOT_FOUND: "Materialul nu a fost găsit.",
  ATTEMPT_NOT_FOUND: "Încercarea nu a fost găsită.",
  INVALID_ANSWERS: "Răspunsurile trimise nu corespund materialului.",
  MATERIAL_NOT_DRAFT: "Materialul publicat nu mai poate fi modificat. Creează o versiune nouă.",
  MATERIAL_NOT_PUBLISHED: "Materialul trebuie publicat mai întâi.",
  MATERIAL_CHANGED: "Materialul a fost modificat între timp. Reîncarcă pagina.",
  UNCONFIRMED_QUESTIONS:
    "Confirmă răspunsurile corecte ale tuturor întrebărilor înainte de publicare.",
  UNKNOWN_QUESTIONS: "Unele întrebări nu există în material.",
  VERSION_EXISTS: "Există deja o versiune nouă a acestui material.",
  INVALID_SUBJECT: "Subiectul sau capitolul ales nu este valid.",
  INVALID_OBJECTIVES: "Unele obiective nu aparțin capitolului ales.",
  // personal learning space
  TOPIC_NOT_FOUND: "Subiectul nu a fost găsit.",
  TOPIC_LIMIT_REACHED: "Ai atins numărul maxim de subiecte. Șterge unul pentru a adăuga altul.",
  TOPIC_NOT_READY: "Subiectul nu are un obiectiv de învățare.",

  // AI
  QUOTA_EXCEEDED: "Ai atins limita zilnică de generări cu AI. Încearcă din nou mâine.",
  AI_UNAVAILABLE: "Generarea cu AI nu este disponibilă momentan. Încearcă mai târziu.",
  // raised by the client itself
  NETWORK_ERROR: "Nu m-am putut conecta la server. Verifică conexiunea la internet.",
  INVALID_RESPONSE: "Răspunsul serverului nu a putut fi înțeles.",
};

export function messageForCode(code: string): string {
  return MESSAGES[code] ?? FALLBACK_MESSAGE;
}

/** An error response from the API (or a failure to reach it). `message` is Romanian. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(messageForCode(code));
    this.name = "ApiError";
  }
}

/** The text to show a user for anything thrown by an API call. */
export function userMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : FALLBACK_MESSAGE;
}
