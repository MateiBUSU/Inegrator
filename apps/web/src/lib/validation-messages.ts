// The shared zod schemas (also used by the API) report problems in English. Before a draft is
// saved the editor validates it with those same schemas and shows the problems to the teacher in
// Romanian, using this mapping.

interface Issue {
  code?: string;
  message: string;
  path: readonly PropertyKey[];
}

// Messages written by the shared schema's own refinements (packages/shared/src/materials.ts).
const KNOWN_MESSAGES: Record<string, string> = {
  "mcq needs at least 2 options": "are nevoie de cel puțin 2 opțiuni.",
  "duplicate option ids": "are opțiuni cu același identificator.",
  "mcq needs at least one correct answer": "are nevoie de cel puțin un răspuns corect bifat.",
  "duplicate correct ids": "are același răspuns corect marcat de două ori.",
  "correct ids must be present in options":
    "are un răspuns corect care nu se află printre opțiuni.",
  "short questions need at least one accepted answer":
    "are nevoie de cel puțin un răspuns acceptat.",
  "programming questions need a reference solution": "are nevoie de o soluție de referință.",
};

const MATERIAL_MESSAGES: Record<string, string> = {
  "bac materials must use cpp": "Materialele pentru bacalaureat folosesc doar C++.",
  "lesson materials need a lesson": "O lecție are nevoie de conținut.",
  "lessons use lesson.checkQuestions": "Întrebările unei lecții se adaugă la lecție.",
  "this kind needs at least one question":
    "Acest tip de material are nevoie de cel puțin o întrebare.",
  "only lesson materials have a lesson": "Doar lecțiile au conținut de lecție.",
  "duplicate objective ids": "Obiectivele au identificatori duplicați.",
  "NUL character not allowed": "Textul conține un caracter nepermis.",
  "invalid unicode (lone surrogate)": "Textul conține un caracter nepermis.",
};

const QUESTION_LIST_KEYS = new Set(["questions", "checkQuestions"]);

/** The 1-based question number a path points into, e.g. ["questions", 2, "prompt"] -> 3. */
function questionNumberInPath(path: readonly PropertyKey[]): number | null {
  const at = path.findIndex(
    (segment) => typeof segment === "string" && QUESTION_LIST_KEYS.has(segment),
  );
  const index = at < 0 ? undefined : path[at + 1];
  return typeof index === "number" ? index + 1 : null;
}

function fieldName(path: readonly PropertyKey[]): string {
  const last = [...path].reverse().find((segment) => typeof segment === "string");
  switch (last) {
    case "title":
      return "Titlul";
    case "body":
      return path.includes("examples") ? "Textul exemplului" : "Textul lecției";
    case "prompt":
      return "Enunțul";
    case "text":
      return "Textul unei opțiuni";
    case "explanation":
      return "Explicația";
    case "referenceSolution":
      return "Soluția de referință";
    case "rubric":
      return "Baremul";
    case "acceptedAnswers":
      return "Răspunsurile acceptate";
    case "objectiveId":
      return "Obiectivul";
    default:
      return "Un câmp";
  }
}

/**
 * One validation problem as a Romanian sentence. Problems inside a question are prefixed with
 * its number ("Întrebarea 2: ..."), so the teacher knows where to look.
 */
export function issueToRomanian(issue: Issue): string {
  const number = questionNumberInPath(issue.path);
  const prefix = number === null ? "" : `Întrebarea ${number}: `;

  const known = KNOWN_MESSAGES[issue.message];
  if (known) return number === null ? `Un element ${known}` : `Întrebarea ${number} ${known}`;

  const material = MATERIAL_MESSAGES[issue.message];
  if (material) return material;

  if (issue.message.startsWith("duplicate question id")) {
    return "Două întrebări au același identificator.";
  }
  if (issue.message.includes("is not in the material's objectives")) {
    return `${prefix}obiectivul ales nu face parte din materialul acesta.`;
  }

  const field = fieldName(issue.path);
  if (issue.code === "too_small") return `${prefix}${field} nu poate fi gol.`;
  if (issue.code === "too_big") return `${prefix}${field} este prea lung.`;
  return `${prefix}${field} nu este valid.`;
}

/** Distinct, ordered messages for a list of issues. */
export function issuesToRomanian(issues: readonly Issue[]): string[] {
  return [...new Set(issues.map(issueToRomanian))];
}
