import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Braces, FileSpreadsheet, FileX, Printer } from 'lucide-react';
import { IS_MOCK_API, api } from '../api/client';
import { useAsync } from '../hooks/useAsync';
import { findPeakPeriods } from '../lib/analysis';
import { EVENT_META, totalEvents } from '../lib/events';
import { formatDateTime, formatDuration, formatOffset } from '../lib/format';
import { exportSessionCsv, exportSessionJson } from '../lib/export';
import { ActivityChart } from '../components/ActivityChart';
import { BreakdownChart } from '../components/BreakdownChart';
import { EventTimeline } from '../components/EventTimeline';
import { Badge, Button, Card, DemoBadge, Disclaimer, EmptyState, Spinner, Stat } from '../components/ui';
import type { Tone } from '../components/ui';

const STATUS_TONE: Record<string, Tone> = {
  completed: 'ok',
  recording: 'info',
  interrupted: 'warn',
  failed: 'bad',
};

export function ReportPage() {
  const { sessionId = '' } = useParams();
  const q = useAsync((signal) => api.getSession(sessionId, signal), [sessionId]);
  const session = q.data;
  const peaks = useMemo(
    () => (session ? findPeakPeriods(session.events, session.durationSeconds) : []),
    [session],
  );

  if (q.loading && !session) return <Spinner label="Loading report…" />;

  if (q.error || !session) {
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

  const total = totalEvents(session.counts);
  const isDemo = IS_MOCK_API || session.mode === 'demo';

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
          <Button icon={<Braces className="h-4 w-4" />} onClick={() => exportSessionJson(session)}>
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
              {formatDateTime(session.startedAt)} → {session.endedAt ? formatDateTime(session.endedAt) : 'in progress'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {isDemo && <DemoBadge label={IS_MOCK_API ? 'Demo Mode — simulated data' : 'Demo session'} />}
            <Badge tone={STATUS_TONE[session.status] ?? 'neutral'} dot>
              {session.status}
            </Badge>
          </div>
        </div>
        <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Monitoring duration" value={formatDuration(session.durationSeconds)} />
          <Stat label="Detected events" value={total} />
          <Stat label="Coughs (estimated)" value={session.counts.cough ?? 0} accent={EVENT_META.cough.color} />
          <Stat
            label="Events per hour"
            value={session.durationSeconds >= 60 ? ((total / session.durationSeconds) * 3600).toFixed(1) : '—'}
            hint={session.durationSeconds < 60 ? 'Needs ≥ 1 min of data' : undefined}
          />
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
        <Card title="Breakdown by sound type">
          <BreakdownChart counts={session.counts} />
        </Card>
        <Card title="Respiratory activity over time">
          <ActivityChart events={session.events} durationSeconds={session.durationSeconds} />
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
        <Card title="Peak activity periods" subtitle="Intervals with the most detected events">
          {peaks.length === 0 ? (
            <EmptyState title="No peaks" message="No respiratory events were detected in this session." />
          ) : (
            <ol className="space-y-3">
              {peaks.map((p, i) => (
                <li key={p.start} className="card-inset px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className="grid h-7 w-7 place-items-center rounded-lg bg-accent/10 font-mono text-xs text-accent">
                        {i + 1}
                      </span>
                      <span className="font-mono text-sm text-ink">
                        {formatOffset(p.start)}–{formatOffset(Math.min(p.end, Math.max(session.durationSeconds, p.start + 1)))}
                      </span>
                    </div>
                    <span className="text-sm font-semibold text-ink">{p.total} events</span>
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
        </Card>
        <Card title="Event timeline" subtitle={`${session.events.length} events, newest first`}>
          <EventTimeline events={session.events} maxHeight={460} emptyMessage="No respiratory events were detected." />
        </Card>
      </div>

      <Disclaimer />
    </div>
  );
}
