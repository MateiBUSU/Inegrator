import type { Role } from "@app/shared";
import { Navigate, Outlet, useLocation } from "react-router";
import { LoadingState } from "../components/loading-state";
import { useAuth } from "./auth-context";

// IMPORTANT: these guards are a UI convenience only. They keep people from seeing screens that
// are not meant for them and send them somewhere sensible. They are NOT security: the browser
// can be tampered with. Every API endpoint enforces authentication, the role and resource
// ownership on the server, and that is the real protection.

/** Wraps routes that need a signed-in user; redirects to /login otherwise. */
export function RequireAuth() {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <LoadingState message="Se verifică sesiunea…" />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <Outlet />;
}

/** Wraps routes for one role; sends the other role to the forbidden page. Use inside RequireAuth. */
export function RequireRole({ role }: { role: Role }) {
  const { user, loading } = useAuth();

  if (loading) return <LoadingState message="Se verifică sesiunea…" />;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== role) return <Navigate to="/forbidden" replace />;
  return <Outlet />;
}
