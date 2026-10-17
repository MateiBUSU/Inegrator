import { useCallback, useEffect, useState } from "react";

interface ApiDataState<T> {
  data: T | null;
  error: unknown;
  loading: boolean;
}

/**
 * Loads data with an async function and tracks loading and error state. `deps` re-run the load
 * (like useEffect deps); `reload` runs it again on demand. Results that arrive after the
 * component unmounted, or after newer deps, are ignored.
 */
export function useApiData<T>(fetcher: () => Promise<T>, deps: readonly unknown[] = []) {
  const [state, setState] = useState<ApiDataState<T>>({ data: null, error: null, loading: true });
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState((previous) => ({ ...previous, loading: true, error: null }));
    fetcher().then(
      (data) => {
        if (!cancelled) setState({ data, error: null, loading: false });
      },
      (error: unknown) => {
        if (!cancelled) setState({ data: null, error, loading: false });
      },
    );
    return () => {
      cancelled = true;
    };
    // The fetcher is intentionally not a dependency: callers pass their own `deps`.
  }, [...deps, version]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  return { ...state, reload };
}
