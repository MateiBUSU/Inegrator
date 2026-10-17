// @vitest-environment jsdom
import type { AuthUser } from "@app/shared";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../api";
import { request } from "../api/client";
import { studentUser, teacherUser } from "../test/render";
import { AuthProvider, useAuth, type AuthContextValue } from "./auth-context";

// The REAL AuthProvider and request client, with only `api.auth.me` and `fetch` replaced.
const mocks = vi.hoisted(() => ({ me: vi.fn() }));
vi.mock("../api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api")>();
  return { ...actual, api: { auth: { me: mocks.me } } };
});

let latest: AuthContextValue;
function Probe() {
  latest = useAuth();
  const { user, loading } = latest;
  return (
    <span data-testid="state">
      {loading ? "loading" : user ? `user:${user.display_name}` : "anonymous"}
    </span>
  );
}
const state = () => screen.getByTestId("state").textContent;
const renderProvider = (strict = false) => {
  const tree = (
    <AuthProvider>
      <Probe />
    </AuthProvider>
  );
  return render(strict ? <StrictMode>{tree}</StrictMode> : tree);
};

const deferred = <T,>() => {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
};

const fetchMock = vi.fn();
const unauthenticated = () =>
  new Response(JSON.stringify({ error: { code: "UNAUTHENTICATED", message: "x" } }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  });

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  // mockReset (not just clear) also drops unconsumed mockResolvedValueOnce values, so one failing
  // test cannot leak queued answers into the next.
  mocks.me.mockReset();
  vi.clearAllMocks();
  fetchMock.mockReset();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("AuthProvider: loading the session", () => {
  it("starts in the loading state and then exposes the signed-in user", async () => {
    const pending = deferred<AuthUser | null>();
    mocks.me.mockReturnValue(pending.promise);
    renderProvider();
    expect(state()).toBe("loading");

    await act(async () => pending.resolve(studentUser));
    expect(state()).toBe("user:Elev Test");
    expect(mocks.me).toHaveBeenCalledTimes(1);
  });

  it("treats a null answer (401 from /me) as signed out and stops loading", async () => {
    mocks.me.mockResolvedValue(null);
    renderProvider();
    await waitFor(() => expect(state()).toBe("anonymous"));
  });

  it("treats a failing /me (server down) as signed out and stops loading, without crashing", async () => {
    mocks.me.mockRejectedValue(new ApiError(0, "NETWORK_ERROR"));
    renderProvider();
    await waitFor(() => expect(state()).toBe("anonymous"));
  });

  it("ends in the right state under StrictMode's double effect run", async () => {
    mocks.me.mockResolvedValue(teacherUser);
    renderProvider(true);
    await waitFor(() => expect(state()).toBe("user:Prof Test"));
  });

  it("does not update state or log errors if it unmounts before /me answers", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const pending = deferred<AuthUser | null>();
    mocks.me.mockReturnValue(pending.promise);
    const view = renderProvider();
    view.unmount();
    await act(async () => pending.resolve(studentUser));
    expect(consoleError).not.toHaveBeenCalled();
  });
});

describe("AuthProvider: refetch", () => {
  it("picks up a change of user and resolves to the new user", async () => {
    mocks.me.mockResolvedValueOnce(null).mockResolvedValueOnce(studentUser);
    renderProvider();
    await waitFor(() => expect(state()).toBe("anonymous"));

    let result: AuthUser | null = null;
    await act(async () => {
      result = await latest.refetch();
    });
    expect(result).toEqual(studentUser);
    expect(state()).toBe("user:Elev Test");
  });

  it("clears the user and rethrows when the server cannot be asked", async () => {
    mocks.me
      .mockResolvedValueOnce(studentUser)
      .mockRejectedValueOnce(new ApiError(0, "NETWORK_ERROR"));
    renderProvider();
    await waitFor(() => expect(state()).toBe("user:Elev Test"));

    let caught: unknown;
    await act(async () => {
      caught = await latest.refetch().catch((error: unknown) => error);
    });
    expect(caught).toBeInstanceOf(ApiError);
    expect((caught as ApiError).code).toBe("NETWORK_ERROR");
    expect(state()).toBe("anonymous");
  });

  it("resolves to null (not an error) when the session simply ended", async () => {
    mocks.me.mockResolvedValueOnce(studentUser).mockResolvedValueOnce(null);
    renderProvider();
    await waitFor(() => expect(state()).toBe("user:Elev Test"));
    let result: AuthUser | null = studentUser;
    await act(async () => {
      result = await latest.refetch();
    });
    expect(result).toBeNull();
    expect(state()).toBe("anonymous");
  });
});

describe("AuthProvider: a session that ends in the middle of use", () => {
  it("signs the user out when any other endpoint answers 401 UNAUTHENTICATED", async () => {
    mocks.me.mockResolvedValueOnce(studentUser).mockResolvedValueOnce(null);
    renderProvider();
    await waitFor(() => expect(state()).toBe("user:Elev Test"));

    fetchMock.mockResolvedValue(unauthenticated());
    await act(async () => {
      await request("GET", "/classes").catch(() => undefined);
    });

    await waitFor(() => expect(state()).toBe("anonymous"));
    expect(mocks.me).toHaveBeenCalledTimes(2);
  });

  it("does not re-check on 401s that are not 'session ended' (wrong password, or /auth/me itself)", async () => {
    mocks.me.mockResolvedValue(studentUser);
    renderProvider();
    await waitFor(() => expect(state()).toBe("user:Elev Test"));

    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { code: "INVALID_CREDENTIALS" } }), { status: 401 }),
    );
    await act(async () => {
      await request("POST", "/auth/login", { body: {} }).catch(() => undefined);
    });
    fetchMock.mockResolvedValueOnce(unauthenticated());
    await act(async () => {
      await request("GET", "/auth/me").catch(() => undefined);
    });
    expect(mocks.me).toHaveBeenCalledTimes(1); // only the initial load
    expect(state()).toBe("user:Elev Test");
  });

  it("stops reacting once the provider is unmounted", async () => {
    mocks.me.mockResolvedValue(studentUser);
    const view = renderProvider();
    await waitFor(() => expect(state()).toBe("user:Elev Test"));
    view.unmount();

    fetchMock.mockResolvedValue(unauthenticated());
    await request("GET", "/classes").catch(() => undefined);
    expect(mocks.me).toHaveBeenCalledTimes(1);
  });
});
