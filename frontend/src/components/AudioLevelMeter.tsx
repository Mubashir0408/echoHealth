import { cx } from './ui';

const SLOTS = 64;

/**
 * Renders ONLY audioLevel values received from GET /api/monitor/status.
 * Each bar is one real poll sample (oldest → newest). Empty slots stay flat —
 * nothing is interpolated or invented.
 */
export function AudioLevelMeter({ samples, active }: { samples: number[]; active: boolean }) {
  const recent = samples.slice(-SLOTS);
  const padded: (number | null)[] = [...Array(Math.max(0, SLOTS - recent.length)).fill(null), ...recent];
  const current = recent.length ? recent[recent.length - 1] : null;
  const pct = current == null ? null : Math.round(Math.min(1, Math.max(0, current)) * 100);

  return (
    <div>
      <div className="flex h-28 items-end gap-[3px]" role="img" aria-label={pct == null ? 'No audio level yet' : `Audio level ${pct}%`}>
        {padded.map((v, i) => {
          const level = v == null ? 0 : Math.min(1, Math.max(0, v));
          const hot = level > 0.6;
          return (
            <div
              key={i}
              className={cx(
                'flex-1 rounded-sm transition-[height] duration-300 ease-out',
                v == null ? 'bg-white/[0.04]' : hot ? 'bg-amber-300/90' : 'bg-accent/80',
              )}
              style={{ height: `${v == null ? 4 : Math.max(4, level * 100)}%` }}
            />
          );
        })}
      </div>
      <div className="mt-3 flex items-center justify-between text-xs text-ink-faint">
        <span>
          {active ? 'Input level reported by the backend, one bar per status update' : 'Monitoring not active'}
        </span>
        <span className="font-mono text-sm text-ink">{pct == null ? '—' : `${pct}%`}</span>
      </div>
    </div>
  );
}
