import { ApiError, isAbortError } from './types';
import type { AnalyzeResponse, BackendHealth, SessionDetail, SessionRow } from './types';

/**
 * REST client for the EchoHealth Python backend.
 * Requests use same-origin relative paths; Vite proxies /api to VITE_API_URL
 * (default http://127.0.0.1:8000). See vite.config.ts.
 */
const REQUEST_TIMEOUT_MS = 15_000;
const ANALYZE_TIMEOUT_MS = 180_000;

export const BACKEND_HINT = 'Start it with: .\\.venv\\Scripts\\python.exe -m echohealth.server';

function extractDetail(body: unknown): string | null {
  if (body && typeof body === 'object' && 'detail' in body) {
    const detail = (body as { detail: unknown }).detail;
    if (typeof detail === 'string') return detail;
    if (detail != null) return JSON.stringify(detail);
  }
  return null;
}

async function request<T>(path: string, init: RequestInit = {}, outer?: AbortSignal, timeoutMs = REQUEST_TIMEOUT_MS): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const onOuterAbort = () => controller.abort();
  outer?.addEventListener('abort', onOuterAbort);

  let res: Response;
  try {
    res = await fetch(path, { ...init, signal: controller.signal, headers: { Accept: 'application/json', ...init.headers } });
  } catch (err) {
    if (outer?.aborted) throw err;
    if (isAbortError(err)) throw new ApiError(`The backend did not respond within ${timeoutMs / 1000}s`, 0, true);
    throw new ApiError(`Cannot reach the EchoHealth backend. ${BACKEND_HINT}`, 0, true);
  } finally {
    clearTimeout(timeout);
    outer?.removeEventListener('abort', onOuterAbort);
  }

  const text = await res.text();
  let body: unknown = null;
  let parsed = false;
  if (text) {
    try {
      body = JSON.parse(text);
      parsed = true;
    } catch {
      /* non-JSON body */
    }
  }

  if (!res.ok) {
    const detail = extractDetail(body);
    if (detail) throw new ApiError(detail, res.status);
    // The Vite proxy answers 5xx with an empty/non-JSON body when the backend is down.
    if (res.status >= 500) throw new ApiError(`Cannot reach the EchoHealth backend. ${BACKEND_HINT}`, res.status, true);
    throw new ApiError(`Request failed with HTTP ${res.status}`, res.status);
  }
  if (!parsed) throw new ApiError('The backend returned an invalid response', res.status);
  return body as T;
}

export const api = {
  health: (signal?: AbortSignal) => request<BackendHealth>('/api/health', {}, signal),
  listSessions: (signal?: AbortSignal) => request<SessionRow[]>('/api/sessions', {}, signal),
  getSession: (id: string, signal?: AbortSignal) =>
    request<SessionDetail>(`/api/sessions/${encodeURIComponent(id)}`, {}, signal),
  deleteSession: (id: string) =>
    request<{ deleted: boolean }>(`/api/sessions/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  /** Uploads the raw file as the request body, exactly like the backend's own page. */
  analyze: (file: File, threshold: number, signal?: AbortSignal) =>
    request<AnalyzeResponse>(
      `/api/analyze?threshold=${encodeURIComponent(threshold.toFixed(2))}`,
      { method: 'POST', body: file },
      signal,
      ANALYZE_TIMEOUT_MS,
    ),
};

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

export * from './types';
