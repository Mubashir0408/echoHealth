import type { RespiratoryEvent } from '../api/types';
import { eventMeta } from '../lib/events';
import { formatOffset, formatScore } from '../lib/format';
import { EmptyState, SCORE_NOTE } from './ui';
import { Waves } from 'lucide-react';

export function EventTimeline({
  events,
  limit,
  emptyMessage = 'Detected respiratory events will appear here.',
  maxHeight = 380,
}: {
  events: RespiratoryEvent[];
  limit?: number;
  emptyMessage?: string;
  maxHeight?: number | 'none';
}) {
  const sorted = [...events].sort((a, b) => b.offsetSeconds - a.offsetSeconds);
  const shown = limit ? sorted.slice(0, limit) : sorted;

  if (shown.length === 0) {
    return <EmptyState icon={<Waves className="h-5 w-5" />} title="No events yet" message={emptyMessage} />;
  }

  return (
    <div className="timeline-scroll overflow-y-auto pr-1" style={{ maxHeight: maxHeight === 'none' ? undefined : maxHeight }}>
      <ol className="relative ml-2 border-l border-white/10">
        {shown.map((e) => {
          const meta = eventMeta(e.type);
          return (
            <li key={e.id} className="relative pb-3 pl-5 last:pb-0 animate-fade-up">
              <span
                className="absolute -left-[5px] top-2 h-2.5 w-2.5 rounded-full ring-4 ring-navy-850"
                style={{ background: meta.color }}
              />
              <div className="card-inset flex items-center justify-between gap-3 px-3.5 py-2.5">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-ink">{meta.label}</div>
                  <div className="mt-0.5 text-xs text-ink-faint">
                    <span className="font-mono">
                      {formatOffset(e.offsetSeconds)}–{formatOffset(e.offsetSeconds + e.durationSeconds)}
                    </span>{' '}
                    into analyzed audio · {e.durationSeconds.toFixed(1)}s span
                  </div>
                </div>
                <div className="text-right" title={SCORE_NOTE}>
                  <div className="font-mono text-sm text-ink">{formatScore(e.score)}</div>
                  <div className="text-[10px] uppercase tracking-wide text-ink-faint">peak score</div>
                </div>
              </div>
            </li>
          );
        })}
      </ol>
      {limit && sorted.length > limit && (
        <p className="mt-3 text-center text-xs text-ink-faint">Showing latest {limit} of {sorted.length} events</p>
      )}
    </div>
  );
}
