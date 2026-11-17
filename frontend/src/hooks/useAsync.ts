import { useCallback, useEffect, useState } from 'react';
import { isAbortError, toApiError } from '../api/types';
import type { ApiError } from '../api/types';

/** One-shot loader with cancellation and manual reload. */
export function useAsync<T>(fn: (signal: AbortSignal) => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    fn(controller.signal)
      .then((d) => {
        if (!controller.signal.aborted) setData(d);
      })
      .catch((err) => {
        if (!controller.signal.aborted && !isAbortError(err)) setError(toApiError(err));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { data, error, loading, reload, setData };
}
