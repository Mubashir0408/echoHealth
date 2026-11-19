import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { toSession } from '../api/adapters';
import { isAbortError } from '../api/types';
import type { Session, SessionRow } from '../api/types';

/**
 * GET /api/sessions returns only id/date/source/duration/status, so per-session event
 * summaries require GET /api/sessions/{id}. Detail payloads include every model score, so
 * they are fetched one at a time and finished sessions are cached in memory.
 */
const cache = new Map<string, Session>();

export function forgetSession(id: string) {
  cache.delete(id);
}

export type DetailEntry = Session | 'loading' | 'error';

export function useSessionDetails(rows: SessionRow[], limit: number): Record<string, DetailEntry> {
  const [details, setDetails] = useState<Record<string, DetailEntry>>({});
  const wanted = rows.slice(0, limit);
  const key = wanted.map((r) => `${r.id}:${r.status}:${r.duration}`).join('|');

  useEffect(() => {
    const controller = new AbortController();
    const initial: Record<string, DetailEntry> = {};
    for (const row of wanted) initial[row.id] = cache.get(row.id) ?? 'loading';
    setDetails(initial);

    (async () => {
      for (const row of wanted) {
        if (controller.signal.aborted) return;
        if (cache.has(row.id)) continue;
        try {
          const detail = await api.getSession(row.id, controller.signal);
          const session = toSession(detail, detail.summary);
          if (detail.status !== 'active') cache.set(row.id, session);
          if (!controller.signal.aborted) setDetails((d) => ({ ...d, [row.id]: session }));
        } catch (err) {
          if (controller.signal.aborted || isAbortError(err)) return;
          setDetails((d) => ({ ...d, [row.id]: 'error' }));
        }
      }
    })();
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return details;
}
