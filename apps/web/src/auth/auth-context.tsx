import type { AuthUser } from "@app/shared";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { api } from "../api";
import { setUnauthenticatedHandler } from "../api/client";

export interface AuthContextValue {
  /** The signed-in user, or null when nobody is signed in. */
  user: AuthUser | null;
  /** True until the first GET /api/auth/me has finished. */
  loading: boolean;
  /**
   * Re-reads the session from the server (after login, register or logout) and resolves to the
   * user, or null when signed out. If the server cannot be asked at all, the user is cleared and
   * the error is rethrown so the caller can tell the person what happened.
   */
  refetch: () => Promise<AuthUser | null>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const mounted = useRef(true);

  const refetch = useCallback(async () => {
    let next: AuthUser | null;
    let failure: unknown = null;
    try {
      next = await api.auth.me();
    } catch (error) {
      next = null;
      failure = error;
    }
    if (mounted.current) {
      setUser(next);
      setLoading(false);
    }
    if (failure) throw failure;
    return next;
  }, []);

  useEffect(() => {
    mounted.current = true;
    // First load and mid-session "you are signed out" answers: if the server cannot be reached
    // the user simply counts as signed out here (the login form reports real errors itself).
    const refreshQuietly = () => void refetch().catch(() => undefined);
    refreshQuietly();
    setUnauthenticatedHandler(refreshQuietly);
    return () => {
      mounted.current = false;
      setUnauthenticatedHandler(null);
    };
  }, [refetch]);

  const value = useMemo(() => ({ user, loading, refetch }), [user, loading, refetch]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside <AuthProvider>");
  return value;
}
