import { Link } from "react-router";
import { useAuth } from "../auth/auth-context";
import { homePathFor } from "../auth/paths";
import { LoadingState } from "../components/loading-state";

export function HomePage() {
  const { user, loading } = useAuth();

  return (
    <section className="card narrow">
      <h1>Informatică pentru liceu</h1>
      <p>
        Platformă pentru orele de informatică (clasele IX–XII): profesorii creează clase și
        materiale, elevii învață și dau teste.
      </p>
      {loading ? (
        <LoadingState />
      ) : user ? (
        <p>
          <Link to={homePathFor(user.role)}>Mergi la clasele mele</Link>
        </p>
      ) : (
        <p>
          <Link to="/login">Autentifică-te</Link> sau <Link to="/register">creează un cont</Link>.
        </p>
      )}
    </section>
  );
}
