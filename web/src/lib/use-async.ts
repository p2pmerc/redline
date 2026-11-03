import { useCallback, useEffect, useRef, useState } from "react";

export interface AsyncState<T> {
  data: T | undefined;
  error: Error | undefined;
  loading: boolean;
  reload: () => void;
}

/** Runs an async loader on mount and whenever `deps` change. */
export function useAsync<T>(loader: () => Promise<T>, deps: unknown[]): AsyncState<T> {
  const [data, setData] = useState<T | undefined>();
  const [error, setError] = useState<Error | undefined>();
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);
  const latest = useRef(0);

  useEffect(() => {
    const ticket = ++latest.current;
    setLoading(true);
    setError(undefined);
    loader()
      .then((value) => {
        if (ticket === latest.current) setData(value);
      })
      .catch((e: unknown) => {
        if (ticket === latest.current) setError(e instanceof Error ? e : new Error(String(e)));
      })
      .finally(() => {
        if (ticket === latest.current) setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { data, error, loading, reload };
}
