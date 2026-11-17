import { Bar, BarChart, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { EVENT_TYPES } from '../api/types';
import type { Counts } from '../api/types';
import { EVENT_META, countOf, totalEvents } from '../lib/events';
import { chartTooltipStyle } from './ActivityChart';

export function BreakdownChart({ counts }: { counts: Partial<Counts> }) {
  const total = totalEvents(counts);
  const data = EVENT_TYPES.map((t) => ({
    type: t,
    label: EVENT_META[t].label,
    count: countOf(counts, t),
    color: EVENT_META[t].color,
  })).sort((a, b) => b.count - a.count);

  return (
    <div>
      <div style={{ height: 260 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 0, right: 40, left: 8, bottom: 0 }} barCategoryGap="22%">
            <XAxis type="number" hide allowDecimals={false} />
            <YAxis
              type="category"
              dataKey="label"
              width={110}
              tick={{ fill: '#9fb0cc', fontSize: 12 }}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip {...chartTooltipStyle} formatter={(v: number) => [v, 'Events']} />
            <Bar dataKey="count" radius={[0, 4, 4, 0]} isAnimationActive={false} background={{ fill: 'rgba(255,255,255,0.03)', radius: 4 }}>
              {data.map((d) => (
                <Cell key={d.type} fill={d.color} />
              ))}
              <LabelList
                dataKey="count"
                position="right"
                style={{ fill: '#e6edf7', fontSize: 12, fontFamily: 'JetBrains Mono, monospace' }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-2 text-xs text-ink-faint">
        {total === 0 ? 'No respiratory events were detected in this session.' : `${total} detected events in total.`}
      </p>
    </div>
  );
}
