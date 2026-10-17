import { Link } from "react-router";
import { GenerateForm } from "../components/generate-form";

export function TeacherGeneratePage() {
  return (
    <section>
      <p className="mb-4">
        <Link to="/teacher/materials">← Materiale</Link>
      </p>
      <p className="text-primary text-xs font-extrabold tracking-wide uppercase">
        Agent AI pentru clasă
      </p>
      <h1>Generează un material</h1>
      <p className="text-ink-2 mb-6">
        Materialul este creat ca ciornă: îl poți edita, apoi trebuie să confirmi fiecare răspuns
        corect înainte să-l publici.
      </p>
      <GenerateForm />
    </section>
  );
}
