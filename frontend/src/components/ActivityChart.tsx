import { useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { EVENT_TYPES } from '../api/types';
import type { RespiratoryEvent } from '../api/types';
import { buildActivityBuckets, bucketSizeFor } from '../lib/analysis';
import { EVENT_META } from '../lib/events';
import { formatDuration } from '../lib/format';

export const chartTooltipStyle = {
  contentStyle: {
    background: '#0b1631',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 12,
    fontSize: 12,
    color: '#e6edf7',
    boxShadow: '0 12px 32px -12px rgba(0,0,0,0.6)',
  },
  labelStyle: { color: '#9fb0cc', marginBottom: 4 },
  cursor: { fill: 'rgba(45,212,191,0.06)' },
};

const axisTick = { fill: '#6b7fa3', fontSize: 11 };

export function ActivityChart({
  events,
  durationSeconds,
  height = 260,
}: {
  events: RespiratoryEvent[];
  durationSeconds: number;
  height?: number;
}) {
  const data = useMemo(() => buildActivityBuckets(events, durationSeconds), [events, durationSeconds]);
  const presentTypes = useMemo(() => EVENT_TYPES.filter((t) => data.some((b) => b[t] > 0)), [data]);
  const bucket = bucketSizeFor(Math.max(durationSeconds, 1));

  return (
    <div>
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }} barCategoryGap="18%">
            <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
            <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={false} minTickGap={24} />
            <YAxis allowDecimals={false} tick={axisTick} tickLine={false} axisLine={false} width={40} />
            <Tooltip {...chartTooltipStyle} labelFormatter={(l) => `From ${l}`} />
            {presentTypes.length > 0 && (
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, color: '#9fb0cc', paddingTop: 8 }} />
            )}
            {presentTypes.map((t, i) => (
              <Bar
                key={t}
                dataKey={t}
                name={EVENT_META[t].label}
                stackId="events"
                fill={EVENT_META[t].color}
                radius={i === presentTypes.length - 1 ? [3, 3, 0, 0] : 0}
                isAnimationActive={false}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-2 text-xs text-ink-faint">
        Detected events per {formatDuration(bucket)} interval, measured from session start.
        {events.length === 0 && ' No events detected yet.'}
      </p>
    </div>
  );
}
