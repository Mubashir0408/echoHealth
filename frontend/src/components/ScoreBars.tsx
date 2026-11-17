import type { RespiratoryEvent } from '../api/types';
import { eventMeta } from '../lib/events';
import { formatOffset, formatScore } from '../lib/format';
import { EmptyState, SCORE_NOTE } from './ui';
import { Gauge } from 'lucide-react';

/** Latest classification score per detected sound type (from real events only). */
export function ScoreBars({ events }: { events: RespiratoryEvent[] }) {
  if (events.length === 0) {
    return (
      <EmptyState
        icon={<Gauge className="h-5 w-5" />}
        title="No classifications yet"
        message="Scores appear once the model reports a respiratory event."
      />
    );
  }
  return (
    <div className="space-y-3">
      {events.map((e) => {
        const meta = eventMeta(e.type);
        const pct = Math.round(Math.min(1, Math.max(0, e.score)) * 100);
        return (
          <div key={e.id}>
            <div className="mb-1 flex items-baseline justify-between text-xs">
              <span className="font-medium text-ink">{meta.label}</span>
              <span className="text-ink-faint">
                at <span className="font-mono">{formatOffset(e.offsetSeconds)}</span> ·{' '}
                <span className="font-mono text-ink">{formatScore(e.score)}</span>
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-white/5">
              <div
                className="h-full rounded-full transition-[width] duration-500"
                style={{ width: `${pct}%`, background: meta.color }}
              />
            </div>
          </div>
        );
      })}
      <p className="pt-1 text-[11px] leading-relaxed text-ink-faint">{SCORE_NOTE}</p>
    </div>
  );
}
