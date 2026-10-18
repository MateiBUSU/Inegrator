import type { TeacherMaterial } from "@app/shared";
import { MockBadge } from "./badges";

type Generation = TeacherMaterial["generation"];

/** Tells the teacher a material came from the AI and how much to trust it. */
export function GenerationNotice({ generation }: { generation: Generation }) {
  if (!generation) return null;
  return (
    <div className="notice notice-warning" role="note">
      <p>
        <strong>Conținut generat cu AI.</strong> Verifică lecția și, mai ales, răspunsurile corecte
        înainte de publicare: elevii vor învăța din ele.
      </p>
      {generation.teacherSource ? null : (
        <p>
          Materialul a fost generat <strong>fără un document sursă de la profesor</strong>, doar din
          cunoștințe generale ale modelului. Verifică-l cu atenție suplimentară.
        </p>
      )}
      {generation.provider === "mock" ? (
        <p>
          <MockBadge provider="mock" /> Generat de modulul de test, nu de un model AI real:
          conținutul nu reflectă documentul încărcat decât prin fragmentele citate.
        </p>
      ) : null}
    </div>
  );
}
