// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useApiData } from "./use-api-data";

const deferred = <T,>() => {
  let resolve: (value: T) => void = () => undefined;
  let reject: (error: unknown) => void = () => undefined;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("useApiData", () => {
  it("starts loading, then exposes the data", async () => {
    const { result } = renderHook(() => useApiData(async () => "ok"));
    expect(result.current).toMatchObject({ loading: true, data: null, error: null });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current).toMatchObject({ data: "ok", error: null });
  });

  it("exposes the error and no data when the load fails", async () => {
    const failure = new Error("boom");
    const { result } = renderHook(() =>
      useApiData(async () => {
        throw failure;
      }),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current).toMatchObject({ data: null, error: failure });
  });

  it("reload runs the fetcher again, clearing a previous error", async () => {
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(new Error("first"))
      .mockResolvedValueOnce("second");
    const { result } = renderHook(() => useApiData(fetcher));
    await waitFor(() => expect(result.current.error).not.toBeNull());

    act(() => result.current.reload());
    await waitFor(() => expect(result.current.data).toBe("second"));
    expect(result.current.error).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("ignores a slow, outdated response when the deps changed in the meantime", async () => {
    const slow = deferred<string>();
    const fast = deferred<string>();
    const fetcher = vi.fn((id: string) => (id === "a" ? slow.promise : fast.promise));
    const { result, rerender } = renderHook(({ id }) => useApiData(() => fetcher(id), [id]), {
      initialProps: { id: "a" },
    });

    rerender({ id: "b" });
    await act(async () => fast.resolve("data for b"));
    await waitFor(() => expect(result.current.data).toBe("data for b"));

    await act(async () => slow.resolve("STALE data for a")); // arrives late
    expect(result.current.data).toBe("data for b");
    expect(result.current.loading).toBe(false);
  });

  it("ignores a late error from an outdated request too", async () => {
    const slow = deferred<string>();
    const fetcher = vi.fn((id: string) => (id === "a" ? slow.promise : Promise.resolve("b-ok")));
    const { result, rerender } = renderHook(({ id }) => useApiData(() => fetcher(id), [id]), {
      initialProps: { id: "a" },
    });
    rerender({ id: "b" });
    await waitFor(() => expect(result.current.data).toBe("b-ok"));

    await act(async () => slow.reject(new Error("old failure")));
    expect(result.current.error).toBeNull();
    expect(result.current.data).toBe("b-ok");
  });

  it("does not update state or log errors if the component unmounts before the response", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const pending = deferred<string>();
    const { unmount } = renderHook(() => useApiData(() => pending.promise));
    unmount();
    await act(async () => pending.resolve("too late"));
    expect(consoleError).not.toHaveBeenCalled();
  });
});
