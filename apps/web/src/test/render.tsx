import type { AuthUser } from "@app/shared";
import { render } from "@testing-library/react";
import type { ReactElement } from "react";
import { MemoryRouter } from "react-router";
import { AuthContext, type AuthContextValue } from "../auth/auth-context";

export const teacherUser: AuthUser = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "prof@example.com",
  role: "teacher",
  display_name: "Prof Test",
};

export const studentUser: AuthUser = {
  id: "22222222-2222-4222-8222-222222222222",
  email: "elev@example.com",
  role: "student",
  display_name: "Elev Test",
};

interface RenderOptions {
  /** The pathname, or a location with router state, to start at. */
  path?: string | { pathname: string; state?: unknown };
  auth: { user: AuthUser | null; loading?: boolean; refetch?: AuthContextValue["refetch"] };
}

/** Renders `ui` inside a MemoryRouter and a hand-made auth context (no network, no provider). */
export function renderAt(ui: ReactElement, { path = "/", auth }: RenderOptions) {
  const value: AuthContextValue = {
    user: auth.user,
    loading: auth.loading ?? false,
    refetch: auth.refetch ?? (async () => auth.user),
  };
  return render(
    <AuthContext.Provider value={value}>
      <MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>
    </AuthContext.Provider>,
  );
}
