// ---------------------------------------------------------------------------
// Backend wire types — mirror echohealth/server.py, database.py, respiratory.py
// and output.py exactly. Field names are the backend's; do not rename.
// ---------------------------------------------------------------------------

/** GET /api/health */
export interface BackendHealth {
  status: 'ready' | 'unavailable' | (string & {});
  model: string;
  /** Actionable error when the model could not be loaded; null when ready. */
  detail: string | null;
  /** Per-sound entry score floors, keyed by exact YAMNet label. */
  respiratory_thresholds?: Record<string, number>;
  inference?: string;
  raw_microphone_storage?: boolean;
  notice?: string;
}

export type BackendSessionStatus = 'active' | 'complete' | 'interrupted' | 'error' | (string & {});
export type SessionSource = 'microphone' | 'file' | (string & {});

/** One row of GET /api/sessions. `duration` = analyzed audio seconds. */
export interface SessionRow {
  id: string;
  created_at: string;
  source: SessionSource;
  duration: number;
  status: BackendSessionStatus;
}

/** A merged respiratory span (respiratory.detect / summarize_segments). */
export interface RespiratorySpan {
  class_index: number;
  model_label: string;
  /** "Coughing", "Wheezing", "Breathing", "Sneezing", "Snoring", "Gasping", "Throat clearing" */
  respiratory_category: string;
  start_seconds: number;
  end_seconds: number;
  max_score: number;
  mean_score?: number;
  window_count?: number;
  threshold?: number;
}

export interface SessionSummary {
  total_respiratory_events: number;
  events_per_hour: number | null;
  monitoring_duration_seconds: number;
  most_frequent_sound: string | null;
  most_frequent_sounds: string[];
  highest_activity_period: { start_seconds: number; end_seconds: number; count: number } | null;
  distribution: { category: string; count: number; fraction: number }[];
  clusters: { start_seconds: number; end_seconds: number; event_count: number }[];
  timeline: RespiratorySpan[];
  activity_bins: { start_seconds: number; end_seconds: number; count: number }[];
  methodology: Record<string, string | boolean> & { contains_legacy_reports?: boolean };
}

export interface ClassScore {
  class_index: number;
  model_label: string;
  respiratory_category: string | null;
  mean_score: number;
  max_score: number;
  peak_window_start_seconds: number;
  threshold: number;
}

/** Output of Engine.classify — one file or one 1.95 s microphone segment. */
export interface SegmentReport {
  schema_version: number;
  notice: string;
  audio: { duration_seconds: number; [key: string]: unknown };
  timing_seconds: Record<string, number>;
  classes: ClassScore[];
  events: RespiratorySpan[];
  respiratory_events?: RespiratorySpan[];
  signal?: { rms: number; dbfs: number | null; quiet: boolean; quiet_window_fraction: number };
  detection_policy?: { thresholds: Record<string, number>; [key: string]: unknown };
  summary?: SessionSummary;
}

/** GET /api/sessions/{id} */
export interface SessionDetail extends SessionRow {
  reports: { sequence: number; offset_seconds: number; report: SegmentReport }[];
  summary: SessionSummary;
}

/** POST /api/analyze */
export interface AnalyzeResponse {
  session_id: string;
  report: SegmentReport;
}

/** Messages sent by the /api/monitor WebSocket. */
export type MonitorMessage =
  | { type: 'ready'; session_id: string }
  | { type: 'result'; sequence: number; offset_seconds: number; report: SegmentReport; summary: SessionSummary }
  | { type: 'stopped'; session_id: string }
  | { type: 'error'; detail: string };

// ---------------------------------------------------------------------------
// UI view model — what the screens render. Built from backend data in adapters.ts.
// ---------------------------------------------------------------------------

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
export type Counts = Record<EventType, number>;
export type SessionStatus = 'recording' | 'completed' | 'interrupted' | 'failed';

export interface RespiratoryEvent {
  id: string;
  type: EventType | (string & {});
  /** Seconds from the start of the analyzed audio. */
  offsetSeconds: number;
  durationSeconds: number;
  /** Peak uncalibrated model score, 0–1. Not a medical probability. */
  score: number;
}

export interface Session {
  id: string;
  startedAt: string;
  /** Analyzed audio seconds (not wall-clock time). */
  durationSeconds: number;
  status: SessionStatus;
  source: SessionSource;
  /** null until the session's summary has been loaded. */
  counts: Counts | null;
  events: RespiratoryEvent[];
  summary: SessionSummary | null;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

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
