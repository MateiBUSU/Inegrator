import { Link } from "react-router";
import { useAuth } from "../auth/auth-context";
import { homePathFor } from "../auth/paths";

export function ForbiddenPage() {
  const { user } = useAuth();
  return (
    <section className="card narrow">
      <h1>Acces interzis</h1>
      <p>Nu ai acces la această pagină cu contul tău.</p>
      <p>
        <Link to={user ? homePathFor(user.role) : "/"}>Înapoi la pagina ta</Link>
      </p>
    </section>
  );
}
