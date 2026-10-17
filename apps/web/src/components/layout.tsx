import { useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router";
import { api, userMessage } from "../api";
import { useAuth } from "../auth/auth-context";
import { homePathFor } from "../auth/paths";
import { Brand } from "./brand";
import { ErrorState } from "./error-state";

/** The login and register screens draw their own full-page layout, without the app shell. */
const BARE_PATHS = ["/login", "/register"];

const ROLE_LABELS = { teacher: "Profesor", student: "Elev" } as const;

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `rounded-control px-3.5 py-2.5 text-sm font-semibold no-underline transition hover:no-underline ${
    isActive ? "bg-primary-soft text-primary" : "text-ink-2 hover:bg-subtle"
  }`;

function initialsOf(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join("") || "?"
  );
}

export function Layout() {
  const { user, refetch } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
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

  if (BARE_PATHS.includes(pathname)) return <Outlet />;

  return (
    <div className="app min-h-screen lg:grid lg:grid-cols-[256px_1fr]">
      <aside className="app-header bg-surface border-line flex flex-col gap-4 border-b p-4 lg:sticky lg:top-0 lg:h-screen lg:gap-8 lg:border-r lg:border-b-0 lg:p-4">
        <Link
          to={user ? homePathFor(user.role) : "/"}
          className="app-title px-2 no-underline hover:no-underline"
        >
          <Brand />
        </Link>
        <nav className="app-nav flex flex-wrap gap-1 lg:flex-col" aria-label="Navigare principală">
          {user?.role === "teacher" ? (
            <>
              <NavLink to="/teacher/classes" className={navLinkClass}>
                Clasele mele
              </NavLink>
              <NavLink to="/teacher/materials" className={navLinkClass}>
                Materialele mele
              </NavLink>
            </>
          ) : null}
          {user?.role === "student" ? (
            <>
              <NavLink to="/student/classes" className={navLinkClass}>
                Clasele mele
              </NavLink>
              <NavLink to="/student/progress" className={navLinkClass}>
                Progresul meu
              </NavLink>
            </>
          ) : null}
          {user ? null : (
            <>
              <NavLink to="/login" className={navLinkClass}>
                Autentificare
              </NavLink>
              <NavLink to="/register" className={navLinkClass}>
                Înregistrare
              </NavLink>
            </>
          )}
        </nav>
        {user ? (
          <div className="lg:mt-auto">
            <button
              type="button"
              className="button-secondary w-full"
              onClick={() => void handleLogout()}
            >
              Deconectare
            </button>
          </div>
        ) : null}
      </aside>

      <div className="min-w-0">
        <header className="bg-surface border-line flex h-16 items-center justify-end border-b px-4 lg:h-20 lg:px-10">
          {user ? (
            <span className="app-user flex items-center gap-3">
              <span
                aria-hidden="true"
                className="bg-primary-soft text-primary flex size-10 items-center justify-center rounded-full text-sm font-extrabold"
              >
                {initialsOf(user.display_name)}
              </span>
              <span className="flex flex-col leading-tight">
                <span className="text-ink text-sm font-bold">{user.display_name}</span>
                <span className="text-ink-3 text-xs font-semibold">{ROLE_LABELS[user.role]}</span>
              </span>
            </span>
          ) : null}
        </header>
        <main className="app-main mx-auto max-w-[1280px] p-4 sm:p-6 lg:p-10">
          {logoutError ? <ErrorState message={logoutError} /> : null}
          <Outlet />
        </main>
      </div>
    </div>
  );
}
