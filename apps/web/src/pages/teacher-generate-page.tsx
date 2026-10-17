import { Link } from "react-router";
import { GenerateForm } from "../components/generate-form";

export function TeacherGeneratePage() {
  return (
    <section>
      <p>
        <Link to="/teacher/materials">← Materiale</Link>
      </p>
      <h1>Generează un material</h1>
      <p className="muted">
        Materialul este creat ca ciornă: îl poți edita, apoi trebuie să confirmi fiecare răspuns
        corect înainte să-l publici.
      </p>
      <GenerateForm />
    </section>
  );
}
