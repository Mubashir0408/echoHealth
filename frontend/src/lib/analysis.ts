import { EVENT_TYPES } from '../api/types';
import type { EventType, RespiratoryEvent, SessionRow } from '../api/types';
import { formatOffset } from './format';
import { isKnownType } from './events';

/** Pick a bucket width that keeps charts readable for any session length. */
export function bucketSizeFor(durationSeconds: number): number {
  if (durationSeconds <= 120) return 10;
  if (durationSeconds <= 600) return 30;
  if (durationSeconds <= 3600) return 60;
  if (durationSeconds <= 4 * 3600) return 300;
  return 900;
}

export type ActivityBucket = {
  start: number;
  end: number;
  label: string;
  total: number;
} & Record<EventType, number>;

export function buildActivityBuckets(events: RespiratoryEvent[], durationSeconds: number): ActivityBucket[] {
  const lastOffset = events.reduce((max, e) => Math.max(max, e.offsetSeconds), 0);
  const span = Math.max(durationSeconds, lastOffset, 1);
  const size = bucketSizeFor(span);
  const count = Math.max(1, Math.ceil(span / size));

  const buckets: ActivityBucket[] = Array.from({ length: count }, (_, i) => {
    const b = {
      start: i * size,
      end: (i + 1) * size,
      label: formatOffset(i * size),
      total: 0,
    } as ActivityBucket;
    for (const t of EVENT_TYPES) b[t] = 0;
    return b;
  });

  for (const e of events) {
    const idx = Math.min(count - 1, Math.max(0, Math.floor(e.offsetSeconds / size)));
    const bucket = buckets[idx];
    if (isKnownType(e.type)) bucket[e.type] += 1;
    bucket.total += 1;
  }
  return buckets;
}

export interface PeakPeriod {
  start: number;
  end: number;
  total: number;
  breakdown: { type: EventType; count: number }[];
}

export function findPeakPeriods(events: RespiratoryEvent[], durationSeconds: number, limit = 3): PeakPeriod[] {
  return buildActivityBuckets(events, durationSeconds)
    .filter((b) => b.total > 0)
    .sort((a, b) => b.total - a.total || a.start - b.start)
    .slice(0, limit)
    .map((b) => ({
      start: b.start,
      end: b.end,
      total: b.total,
      breakdown: EVENT_TYPES.filter((t) => b[t] > 0)
        .map((t) => ({ type: t, count: b[t] }))
        .sort((x, y) => y.count - x.count),
    }));
}

export function sortRowsNewest(rows: SessionRow[]): SessionRow[] {
  return [...rows].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
}
