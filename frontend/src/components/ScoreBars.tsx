import { useMemo } from 'react';
import { Gauge } from 'lucide-react';
import { CATEGORY_TO_TYPE } from '../api/adapters';
import type { SegmentReport } from '../api/types';
import { eventMeta } from '../lib/events';
import { formatScore } from '../lib/format';
import { EmptyState, SCORE_NOTE } from './ui';

/**
 * Real YAMNet scores from the most recent analyzed segment: the seven respiratory classes
 * (with each class's entry floor) plus the strongest sounds overall, so speech, music and
 * environmental sounds stay visible.
 */
export function ScoreBars({ report, offsetSeconds }: { report: SegmentReport | null; offsetSeconds?: number }) {
  const { respiratory, topOverall } = useMemo(() => {
    if (!report) return { respiratory: [], topOverall: [] };
    const selected = new Set((report.respiratory_events ?? []).map((e) => e.class_index));
    const floors = report.detection_policy?.thresholds ?? {};
    const respiratory = report.classes
      .filter((c) => c.respiratory_category)
      .map((c) => ({
        key: c.class_index,
        label: c.respiratory_category as string,
        type: CATEGORY_TO_TYPE[c.respiratory_category as string] ?? (c.respiratory_category as string),
        score: c.max_score,
        floor: floors[c.model_label] ?? c.threshold,
        detected: selected.has(c.class_index),
      }))
      .sort((a, b) => b.score - a.score);
    const topOverall = [...report.classes].sort((a, b) => b.max_score - a.max_score).slice(0, 3);
    return { respiratory, topOverall };
  }, [report]);

  if (!report) {
    return (
      <EmptyState
        icon={<Gauge className="h-5 w-5" />}
        title="No classifications yet"
        message="Scores appear after the first 1.95-second audio segment is analyzed."
      />
    );
  }

  return (
    <div className="space-y-3">
      {offsetSeconds != null && (
        <p className="text-xs text-ink-faint">
          Latest segment at <span className="font-mono text-ink-muted">{offsetSeconds.toFixed(1)}s</span> ·{' '}
          {report.audio.duration_seconds.toFixed(2)}s analyzed
        </p>
      )}
      {respiratory.map((r) => {
        const meta = eventMeta(r.type);
        const pct = Math.round(Math.min(1, Math.max(0, r.score)) * 100);
        const floorPct = Math.round(Math.min(1, Math.max(0, r.floor)) * 100);
        return (
          <div key={r.key}>
            <div className="mb-1 flex items-baseline justify-between text-xs">
              <span className="font-medium text-ink">
                {meta.label}
                {r.detected && <span className="ml-1.5 text-[10px] font-semibold uppercase tracking-wide text-accent">selected</span>}
              </span>
              <span className="text-ink-faint">
                entry ≥ {r.floor.toFixed(2)} · <span className="font-mono text-ink">{formatScore(r.score)}</span>
              </span>
            </div>
            <div className="relative h-1.5 overflow-hidden rounded-full bg-white/5">
              <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${pct}%`, background: meta.color }} />
              <div className="absolute inset-y-0 w-px bg-white/40" style={{ left: `${floorPct}%` }} aria-hidden />
            </div>
          </div>
        );
      })}
      <div className="border-t border-white/5 pt-3">
        <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-ink-faint">Strongest sounds overall</p>
        <div className="flex flex-wrap gap-1.5">
          {topOverall.map((c) => (
            <span key={c.class_index} className="inline-flex items-center gap-1.5 rounded-md bg-white/5 px-2 py-0.5 text-xs text-ink-muted">
              {c.model_label} <span className="font-mono text-ink">{formatScore(c.max_score)}</span>
            </span>
          ))}
        </div>
      </div>
      <p className="pt-1 text-[11px] leading-relaxed text-ink-faint">{SCORE_NOTE}</p>
    </div>
  );
}
