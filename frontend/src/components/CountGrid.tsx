import type { Counts, EventType } from '../api/types';
import { EVENT_META, countOf } from '../lib/events';
import { cx } from './ui';

const PRIMARY: { type: EventType; label: string }[] = [
  { type: 'cough', label: 'Estimated coughs' },
  { type: 'wheezing', label: 'Wheezing' },
  { type: 'snoring', label: 'Snoring' },
];

const SECONDARY: EventType[] = ['breathing', 'sneezing', 'gasping', 'throat_clearing'];

export function CountGrid({ counts, highlight }: { counts: Partial<Counts> | null | undefined; highlight?: string | null }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {PRIMARY.map(({ type, label }) => (
          <div
            key={type}
            className={cx(
              'card-inset relative overflow-hidden px-4 py-4 transition',
              highlight === type && 'ring-1 ring-inset ring-accent/40',
            )}
          >
            <div className="absolute inset-x-0 top-0 h-0.5" style={{ background: EVENT_META[type].color, opacity: 0.8 }} />
            <div className="flex items-center gap-2 text-xs font-medium text-ink-faint">
              <span className="h-2 w-2 rounded-full" style={{ background: EVENT_META[type].color }} />
              {label}
            </div>
            <div className="mt-2 font-mono text-4xl font-medium tabular-nums text-ink">{countOf(counts, type)}</div>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {SECONDARY.map((type) => (
          <div
            key={type}
            className={cx(
              'card-inset flex items-center justify-between px-3.5 py-2.5 transition',
              highlight === type && 'ring-1 ring-inset ring-accent/40',
            )}
          >
            <span className="flex items-center gap-2 text-xs font-medium text-ink-muted">
              <span className="h-2 w-2 rounded-full" style={{ background: EVENT_META[type].color }} />
              {EVENT_META[type].label}
            </span>
            <span className="font-mono text-lg tabular-nums text-ink">{countOf(counts, type)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
