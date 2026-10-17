import { useState } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router";
import { api, userMessage } from "../api";
import { useAuth } from "../auth/auth-context";
import { homePathFor } from "../auth/paths";
import { ErrorState } from "./error-state";

// TODO(restyle): neutral placeholder layout. The final header/navigation comes from the Figma
// design; only this file and styles/global.css should need to change.

export function Layout() {
  const { user, refetch } = useAuth();
  const navigate = useNavigate();
  const [logoutError, setLogoutError] = useState<string | null>(null);

  async function handleLogout() {
    setLogoutError(null);
    try {
      await api.auth.logout();
      await refetch().catch(() => null); // the session is gone either way: user becomes null
      navigate("/login", { replace: true });
    } catch (error) {
      setLogoutError(userMessage(error));
    }
  }

  return (
    <div className="app">
      <header className="app-header">
        <Link to={user ? homePathFor(user.role) : "/"} className="app-title">
          Informatică IX–XII
        </Link>
        <nav className="app-nav" aria-label="Navigare principală">
          {user?.role === "teacher" ? (
            <>
              <NavLink to="/teacher/classes">Clasele mele</NavLink>
              <NavLink to="/teacher/materials">Materiale</NavLink>
            </>
          ) : null}
          {user?.role === "student" ? (
            <>
              <NavLink to="/student/classes">Clasele mele</NavLink>
              <NavLink to="/student/progress">Progres</NavLink>
            </>
          ) : null}
          {user ? (
            <span className="app-user">
              <span>{user.display_name}</span>
              <button type="button" onClick={() => void handleLogout()}>
                Deconectare
              </button>
            </span>
          ) : (
            <>
              <NavLink to="/login">Autentificare</NavLink>
              <NavLink to="/register">Înregistrare</NavLink>
            </>
          )}
        </nav>
      </header>
      <main className="app-main">
        {logoutError ? <ErrorState message={logoutError} /> : null}
        <Outlet />
      </main>
    </div>
  );
}
