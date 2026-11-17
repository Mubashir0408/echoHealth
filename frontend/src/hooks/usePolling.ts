import { useCallback, useEffect, useRef, useState } from 'react';
import { isAbortError, toApiError } from '../api/types';
import type { ApiError } from '../api/types';

interface PollingState<T> {
  data: T | null;
  error: ApiError | null;
  loading: boolean;
}

/**
 * Polls `fn` every `intervalMs` while `enabled`.
 * Uses a chained setTimeout (next request starts only after the previous one settles),
 * so requests never overlap. Everything is cancelled on unmount / disable.
 */
export function usePolling<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  intervalMs: number,
  enabled = true,
  onData?: (data: T) => void,
) {
  const [state, setState] = useState<PollingState<T>>({ data: null, error: null, loading: true });
  const fnRef = useRef(fn);
  const onDataRef = useRef(onData);
  fnRef.current = fn;
  onDataRef.current = onData;
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();

    const tick = async () => {
      try {
        const data = await fnRef.current(controller.signal);
        if (cancelled) return;
        setState({ data, error: null, loading: false });
        onDataRef.current?.(data);
      } catch (err) {
        if (cancelled || isAbortError(err)) return;
        setState((prev) => ({ data: prev.data, error: toApiError(err), loading: false }));
      }
      if (!cancelled) timer = setTimeout(tick, intervalMs);
    };

    void tick();
    return () => {
      cancelled = true;
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, [enabled, intervalMs, nonce]);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);
  return { ...state, refresh };
}
