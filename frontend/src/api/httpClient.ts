import { ApiError, isAbortError } from './types';
import type { ApiClient, HealthStatus, MonitorMode, MonitorStatus, Session } from './types';

const REQUEST_TIMEOUT_MS = 10_000;

function extractDetail(body: unknown, fallback: string): string {
  if (body && typeof body === 'object' && 'detail' in body) {
    const detail = (body as { detail: unknown }).detail;
    if (typeof detail === 'string') return detail;
    if (detail != null) return JSON.stringify(detail);
  }
  return fallback;
}

export function createHttpClient(baseUrl: string): ApiClient {
  async function request<T>(path: string, init: RequestInit = {}, outer?: AbortSignal): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    const onOuterAbort = () => controller.abort();
    outer?.addEventListener('abort', onOuterAbort);

    let res: Response;
    try {
      res = await fetch(`${baseUrl}${path}`, {
        ...init,
        signal: controller.signal,
        headers: { Accept: 'application/json', ...(init.body ? { 'Content-Type': 'application/json' } : {}) },
      });
    } catch (err) {
      if (outer?.aborted) throw err; // caller cancelled — propagate as abort
      if (isAbortError(err)) throw new ApiError(`Backend did not respond within ${REQUEST_TIMEOUT_MS / 1000}s`, 0, true);
      throw new ApiError(`Cannot reach the EchoHealth backend at ${baseUrl}`, 0, true);
    } finally {
      clearTimeout(timeout);
      outer?.removeEventListener('abort', onOuterAbort);
    }

    let body: unknown = null;
    const text = await res.text();
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        if (res.ok) throw new ApiError('Backend returned an invalid JSON response', res.status);
      }
    }
    if (!res.ok) throw new ApiError(extractDetail(body, `Request failed with HTTP ${res.status}`), res.status);
    return body as T;
  }

  return {
    kind: 'http',
    baseUrl,
    health: (signal) => request<HealthStatus>('/api/health', {}, signal),
    startMonitoring: (mode: MonitorMode) =>
      request<Session>('/api/monitor/start', { method: 'POST', body: JSON.stringify({ mode }) }),
    stopMonitoring: () => request<Session>('/api/monitor/stop', { method: 'POST' }),
    monitorStatus: (signal) => request<MonitorStatus>('/api/monitor/status', {}, signal),
    listSessions: (signal) => request<Session[]>('/api/sessions', {}, signal),
    getSession: (id, signal) => request<Session>(`/api/sessions/${encodeURIComponent(id)}`, {}, signal),
    deleteSession: (id) =>
      request<{ success: boolean }>(`/api/sessions/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  };
}
