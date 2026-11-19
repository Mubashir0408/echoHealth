import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Braces, FileSpreadsheet, FileX, Printer } from 'lucide-react';
import { api } from '../api/client';
import { sourceLabel, toSession } from '../api/adapters';
import { useAsync } from '../hooks/useAsync';
import { useMonitor } from '../monitor/MonitorContext';
import { findPeakPeriods } from '../lib/analysis';
import { EVENT_META, totalEvents } from '../lib/events';
import { formatDateTime, formatDuration, formatOffset } from '../lib/format';
import { exportSessionCsv, exportSessionJson } from '../lib/export';
import { ActivityChart } from '../components/ActivityChart';
import { BreakdownChart } from '../components/BreakdownChart';
import { EventTimeline } from '../components/EventTimeline';
import { Badge, Button, Card, Disclaimer, EmptyState, Spinner, Stat } from '../components/ui';
import type { Tone } from '../components/ui';

const STATUS_TONE: Record<string, Tone> = {
  completed: 'ok',
  recording: 'info',
  interrupted: 'warn',
  failed: 'bad',
};

export function ReportPage() {
  const { sessionId = '' } = useParams();
  const { state: monitorState } = useMonitor();
  // Re-fetch when a live session for this id finishes so the report shows the final status.
  const liveHere = monitorState.sessionId === sessionId;
  const q = useAsync((signal) => api.getSession(sessionId, signal), [sessionId, liveHere]);
  const detail = q.data;
  const session = useMemo(() => (detail ? toSession(detail, detail.summary) : null), [detail]);
  const peaks = useMemo(() => (session ? findPeakPeriods(session.events, session.durationSeconds) : []), [session]);

  if (q.loading && !session) return <Spinner label="Loading report…" />;

  if (q.error || !session || !detail) {
    return (
      <Card>
        <EmptyState
          icon={<FileX className="h-5 w-5" />}
          title={q.error?.status === 404 ? 'Session not found' : 'Could not load this report'}
          message={q.error?.message ?? 'The session could not be loaded.'}
          action={
            <div className="flex gap-2">
              {q.error?.status !== 404 && <Button onClick={q.reload}>Retry</Button>}
              <Link to="/history" className="inline-flex items-center rounded-xl px-4 py-2.5 text-sm font-semibold text-accent hover:bg-white/5">
                Back to history
              </Link>
            </div>
          }
        />
      </Card>
    );
  }

  const summary = detail.summary;
  const total = totalEvents(session.counts);
  const shortRecording = session.durationSeconds < 60;
  const clusters = summary?.clusters ?? [];

  return (
    <div className="report space-y-6">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <Link to="/history" className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-muted hover:text-ink">
          <ArrowLeft className="h-4 w-4" /> All sessions
        </Link>
        <div className="flex flex-wrap gap-2">
          <Button icon={<Printer className="h-4 w-4" />} onClick={() => window.print()}>
            Print
          </Button>
          <Button icon={<FileSpreadsheet className="h-4 w-4" />} onClick={() => exportSessionCsv(session)}>
            Export CSV
          </Button>
          <Button icon={<Braces className="h-4 w-4" />} onClick={() => exportSessionJson(detail)}>
            Export JSON
          </Button>
        </div>
      </div>

      <section className="card p-6 sm:p-7 animate-fade-up">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Session report</p>
            <h1 className="mt-2 text-2xl font-bold tracking-tight text-ink sm:text-3xl">{formatDateTime(session.startedAt)}</h1>
            <p className="mt-1 text-sm text-ink-faint">
              {sourceLabel(session.source)} · {detail.reports.length} analyzed segment{detail.reports.length === 1 ? '' : 's'} · YAMNet, local
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="neutral">{sourceLabel(session.source)}</Badge>
            <Badge tone={STATUS_TONE[session.status] ?? 'neutral'} dot>
              {session.status}
            </Badge>
          </div>
        </div>
        <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Analyzed audio" value={formatDuration(session.durationSeconds)} />
          <Stat label="Respiratory spans" value={total} />
          <Stat label="Coughs (estimated)" value={session.counts?.cough ?? 0} accent={EVENT_META.cough.color} />
          <Stat
            label="Spans per hour"
            value={summary?.events_per_hour == null ? '—' : summary.events_per_hour.toFixed(1)}
            hint={shortRecording && summary?.events_per_hour != null ? 'Short recording: unstable extrapolation' : undefined}
          />
        </div>
        {summary?.methodology?.contains_legacy_reports && (
          <p className="mt-4 text-xs text-amber-200/80">
            This session includes older reports created with the original selection rules. It has not been reclassified.
          </p>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
        <Card title="Breakdown by sound type">
          <BreakdownChart counts={session.counts ?? {}} />
        </Card>
        <Card title="Respiratory activity over time">
          <ActivityChart events={session.events} durationSeconds={session.durationSeconds} />
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
        <Card title="Peak activity periods" subtitle="Intervals with the most detected spans">
          {peaks.length === 0 ? (
            <EmptyState title="No peaks" message="No respiratory spans were selected in this session. This does not rule out a health problem." />
          ) : (
            <ol className="space-y-3">
              {peaks.map((p, i) => (
                <li key={p.start} className="card-inset px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className="grid h-7 w-7 place-items-center rounded-lg bg-accent/10 font-mono text-xs text-accent">{i + 1}</span>
                      <span className="font-mono text-sm text-ink">
                        {formatOffset(p.start)}–{formatOffset(Math.min(p.end, Math.max(session.durationSeconds, p.start + 1)))}
                      </span>
                    </div>
                    <span className="text-sm font-semibold text-ink">{p.total} spans</span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 pl-10 text-xs text-ink-muted">
                    {p.breakdown.map((b) => (
                      <span key={b.type} className="inline-flex items-center gap-1.5">
                        <span className="h-1.5 w-1.5 rounded-full" style={{ background: EVENT_META[b.type].color }} />
                        {EVENT_META[b.type].label} {b.count}
                      </span>
                    ))}
                  </div>
                </li>
              ))}
            </ol>
          )}
          {clusters.length > 0 && (
            <p className="mt-4 text-xs text-ink-faint">
              Clusters (≥3 spans within 10 s, descriptive only):{' '}
              {clusters.map((c) => `${formatOffset(c.start_seconds)}–${formatOffset(c.end_seconds)} (${c.event_count})`).join('; ')}
            </p>
          )}
        </Card>
        <Card title="Event timeline" subtitle={`${session.events.length} merged spans, newest first`}>
          <EventTimeline events={session.events} maxHeight={460} emptyMessage="No respiratory spans were selected." />
        </Card>
      </div>

      <p className="text-xs text-ink-faint">
        Counts are merged model spans (touching spans of the same sound count once), not clinical episode counts. Timing is
        approximate. Rate = spans × 3600 ÷ analyzed audio seconds.
      </p>
      <Disclaimer />
    </div>
  );
}
