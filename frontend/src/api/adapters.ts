import { EVENT_TYPES } from './types';
import type {
  BackendSessionStatus,
  Counts,
  EventType,
  RespiratoryEvent,
  RespiratorySpan,
  Session,
  SessionRow,
  SessionStatus,
  SessionSummary,
} from './types';

/** Backend display category (respiratory.py / config.RESPIRATORY) → UI event type. */
export const CATEGORY_TO_TYPE: Record<string, EventType> = {
  Coughing: 'cough',
  Wheezing: 'wheezing',
  Breathing: 'breathing',
  Sneezing: 'sneezing',
  Snoring: 'snoring',
  Gasping: 'gasping',
  'Throat clearing': 'throat_clearing',
};

export function mapStatus(status: BackendSessionStatus): SessionStatus {
  switch (status) {
    case 'active':
      return 'recording';
    case 'complete':
      return 'completed';
    case 'interrupted':
      return 'interrupted';
    default:
      return 'failed';
  }
}

export function emptyCounts(): Counts {
  return Object.fromEntries(EVENT_TYPES.map((t) => [t, 0])) as Counts;
}

export function spansToEvents(spans: RespiratorySpan[]): RespiratoryEvent[] {
  return spans.map((s, i) => ({
    id: `${s.class_index}-${s.start_seconds}-${i}`,
    type: CATEGORY_TO_TYPE[s.respiratory_category] ?? s.respiratory_category,
    offsetSeconds: s.start_seconds,
    durationSeconds: Math.max(0, s.end_seconds - s.start_seconds),
    score: s.max_score,
  }));
}

export function countsFromSummary(summary: SessionSummary): Counts {
  const counts = emptyCounts();
  for (const item of summary.distribution ?? []) {
    const type = CATEGORY_TO_TYPE[item.category];
    if (type) counts[type] = item.count;
  }
  return counts;
}

/** Build the UI session from a list row and (optionally) its server-computed summary. */
export function toSession(row: SessionRow, summary: SessionSummary | null = null): Session {
  return {
    id: row.id,
    startedAt: row.created_at,
    durationSeconds: summary?.monitoring_duration_seconds ?? row.duration ?? 0,
    status: mapStatus(row.status),
    source: row.source,
    counts: summary ? countsFromSummary(summary) : null,
    events: summary ? spansToEvents(summary.timeline ?? []) : [],
    summary,
  };
}

export function sourceLabel(source: string): string {
  if (source === 'microphone') return 'Microphone';
  if (source === 'file') return 'File upload';
  return source;
}
