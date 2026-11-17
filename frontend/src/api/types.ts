// Types mirror the FIXED backend API contract. Do not rename fields.

export const EVENT_TYPES = [
  'cough',
  'wheezing',
  'breathing',
  'sneezing',
  'snoring',
  'gasping',
  'throat_clearing',
] as const;

export type EventType = (typeof EVENT_TYPES)[number];

export type SessionStatus = 'recording' | 'completed' | 'interrupted' | 'failed';
export type MonitorMode = 'live' | 'demo';

export type Counts = Record<EventType, number>;

export interface RespiratoryEvent {
  id: string;
  /** Normally one of EVENT_TYPES; kept as string so unknown types from the backend still render. */
  type: EventType | (string & {});
  timestamp: string;
  offsetSeconds: number;
  durationSeconds: number;
  /** Uncalibrated model score, 0–1. Not a medical probability. */
  score: number;
}

export interface Session {
  id: string;
  startedAt: string;
  endedAt: string | null;
  durationSeconds: number;
  status: SessionStatus;
  mode: MonitorMode;
  counts: Counts;
  events: RespiratoryEvent[];
}

export interface HealthStatus {
  status: string;
  modelReady: boolean;
  microphoneReady: boolean;
}

export interface MonitorStatus {
  active: boolean;
  /** 0–1 input level reported by the backend. */
  audioLevel: number;
  session: Session | null;
}

export interface ApiClient {
  readonly kind: 'http' | 'mock';
  readonly baseUrl: string;
  health(signal?: AbortSignal): Promise<HealthStatus>;
  startMonitoring(mode: MonitorMode): Promise<Session>;
  stopMonitoring(): Promise<Session>;
  monitorStatus(signal?: AbortSignal): Promise<MonitorStatus>;
  listSessions(signal?: AbortSignal): Promise<Session[]>;
  getSession(sessionId: string, signal?: AbortSignal): Promise<Session>;
  deleteSession(sessionId: string): Promise<{ success: boolean }>;
}

export class ApiError extends Error {
  /** HTTP status, or 0 when the backend could not be reached. */
  readonly status: number;
  readonly unreachable: boolean;

  constructor(detail: string, status = 0, unreachable = false) {
    super(detail);
    this.name = 'ApiError';
    this.status = status;
    this.unreachable = unreachable;
  }
}

export function toApiError(err: unknown): ApiError {
  if (err instanceof ApiError) return err;
  if (err instanceof Error) return new ApiError(err.message);
  return new ApiError('Unexpected error');
}

export function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError';
}
