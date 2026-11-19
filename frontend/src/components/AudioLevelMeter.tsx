import { cx } from './ui';

const SLOTS = 64;

/**
 * Renders ONLY microphone levels measured in this browser (Web Audio AnalyserNode RMS,
 * mapped from −80…0 dBFS to 0…1), one bar per 250 ms sample, oldest → newest.
 * Empty slots stay flat — nothing is interpolated or invented. Sound labels come only
 * from the AI backend, never from this meter.
 */
export function AudioLevelMeter({ samples, active, levelDb }: { samples: number[]; active: boolean; levelDb: number | null }) {
  const recent = samples.slice(-SLOTS);
  const padded: (number | null)[] = [...Array(Math.max(0, SLOTS - recent.length)).fill(null), ...recent];
  const label = !active ? '—' : levelDb == null ? 'Silence' : `${levelDb.toFixed(0)} dBFS`;

  return (
    <div>
      <div className="flex h-28 items-end gap-[3px]" role="img" aria-label={active ? `Microphone level ${label}` : 'Microphone off'}>
        {padded.map((v, i) => {
          const level = v == null ? 0 : Math.min(1, Math.max(0, v));
          const hot = level > 0.75;
          return (
            <div
              key={i}
              className={cx(
                'flex-1 rounded-sm transition-[height] duration-200 ease-out',
                v == null ? 'bg-white/[0.04]' : hot ? 'bg-amber-300/90' : 'bg-accent/80',
              )}
              style={{ height: `${v == null ? 4 : Math.max(4, level * 100)}%` }}
            />
          );
        })}
      </div>
      <div className="mt-3 flex items-center justify-between gap-3 text-xs text-ink-faint">
        <span>{active ? 'Measured microphone input level. Sound labels appear only after AI analysis.' : 'Microphone off'}</span>
        <span className="shrink-0 font-mono text-sm text-ink">{label}</span>
      </div>
    </div>
  );
}
