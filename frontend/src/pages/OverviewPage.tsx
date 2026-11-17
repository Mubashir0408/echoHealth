import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ArrowRight, BrainCircuit, FileText, FlaskConical, History, Mic, Play, Radio, Server } from 'lucide-react';
import { IS_MOCK_API, api } from '../api/client';
import { EVENT_TYPES, toApiError } from '../api/types';
import type { MonitorMode, Session } from '../api/types';
import { useHealth } from '../hooks/HealthContext';
import { useAsync } from '../hooks/useAsync';
import { sortSessionsNewest } from '../lib/analysis';
import { EVENT_META, countOf, totalEvents } from '../lib/events';
import { formatDateTime, formatDuration, formatShortDate } from '../lib/format';
import { chartTooltipStyle } from '../components/ActivityChart';
import { Badge, Button, Card, DemoBadge, Disclaimer, EmptyState, ErrorBanner, Spinner, Stat, cx } from '../components/ui';
import type { Tone } from '../components/ui';

function ReadinessItem({
  icon,
  label,
  tone,
  status,
  detail,
}: {
  icon: ReactNode;
  label: string;
  tone: Tone;
  status: string;
  detail: string;
}) {
  const ring: Record<Tone, string> = {
    ok: 'text-emerald-300 bg-emerald-400/10 ring-emerald-400/20',
    warn: 'text-amber-300 bg-amber-400/10 ring-amber-400/20',
    bad: 'text-rose-300 bg-rose-400/10 ring-rose-400/20',
    neutral: 'text-ink-faint bg-white/5 ring-white/10',
    info: 'text-accent bg-accent/10 ring-accent/20',
  };
  return (
    <div className="card-inset flex items-center gap-3.5 px-4 py-3.5">
      <div className={cx('grid h-10 w-10 shrink-0 place-items-center rounded-xl ring-1', ring[tone])}>{icon}</div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-semibold text-ink">{label}</span>
          <Badge tone={tone} dot>
            {status}
          </Badge>
        </div>
        <p className="mt-0.5 truncate text-xs text-ink-faint">{detail}</p>
      </div>
    </div>
  );
}

function Readiness() {
  const { connection, health, error, modelReady, microphoneReady } = useHealth();
  const checking = connection === 'checking';
  const online = connection === 'online';

  return (
    <div className="grid gap-3">
      <ReadinessItem
        icon={<Server className="h-5 w-5" />}
        label="Backend"
        tone={checking ? 'neutral' : online ? 'ok' : 'bad'}
        status={checking ? 'Checking' : online ? 'Online' : 'Offline'}
        detail={
          online
            ? IS_MOCK_API
              ? 'In-browser mock API (Demo Mode)'
              : `Connected to ${api.baseUrl}`
            : error?.message ?? (health ? `Backend reports status "${health.status}"` : 'Waiting for response…')
        }
      />
      <ReadinessItem
        icon={<BrainCircuit className="h-5 w-5" />}
        label="AI model"
        tone={!online ? 'neutral' : modelReady ? 'ok' : 'warn'}
        status={!online ? 'Unknown' : modelReady ? 'Ready' : 'Not ready'}
        detail={!online ? 'Requires backend connection' : modelReady ? 'Sound classifier loaded' : 'Model is loading or unavailable'}
      />
      <ReadinessItem
        icon={<Mic className="h-5 w-5" />}
        label="Microphone"
        tone={!online ? 'neutral' : microphoneReady ? 'ok' : 'warn'}
        status={!online ? 'Unknown' : microphoneReady ? 'Ready' : 'Unavailable'}
        detail={
          !online ? 'Requires backend connection' : microphoneReady ? 'Input device available' : 'Check the microphone on the backend machine'
        }
      />
    </div>
  );
}

function LatestSession({ session }: { session: Session | undefined }) {
  if (!session) {
    return (
      <EmptyState
        icon={<FileText className="h-5 w-5" />}
        title="No sessions yet"
        message="Your most recent monitoring summary will appear here after your first session."
      />
    );
  }
  const total = totalEvents(session.counts);
  const top = EVENT_TYPES.map((t) => ({ t, n: countOf(session.counts, t) }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n)
    .slice(0, 4);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm text-ink-muted">
        {formatDateTime(session.startedAt)}
        {session.mode === 'demo' && <DemoBadge label="Demo session" />}
        {session.status !== 'completed' && <Badge tone="warn">{session.status}</Badge>}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Stat label="Duration" value={formatDuration(session.durationSeconds)} />
        <Stat label="Detected events" value={total} />
      </div>
      {top.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {top.map(({ t, n }) => (
            <span key={t} className="inline-flex items-center gap-1.5 rounded-lg bg-white/5 px-2.5 py-1 text-xs text-ink-muted">
              <span className="h-2 w-2 rounded-full" style={{ background: EVENT_META[t].color }} />
              {EVENT_META[t].label} <span className="font-mono text-ink">{n}</span>
            </span>
          ))}
        </div>
      )}
      <Link
        to={`/sessions/${encodeURIComponent(session.id)}`}
        className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-accent hover:text-accent-soft"
      >
        Open full report <ArrowRight className="h-4 w-4" />
      </Link>
    </div>
  );
}

function RecentActivity({ sessions }: { sessions: Session[] }) {
  const data = useMemo(
    () =>
      sessions
        .slice(0, 7)
        .reverse()
        .map((s) => {
          const row: Record<string, string | number> = { label: formatShortDate(s.startedAt), id: s.id };
          for (const t of EVENT_TYPES) row[t] = countOf(s.counts, t);
          return row;
        }),
    [sessions],
  );
  const present = EVENT_TYPES.filter((t) => data.some((d) => (d[t] as number) > 0));

  if (sessions.length === 0) {
    return (
      <EmptyState
        icon={<Radio className="h-5 w-5" />}
        title="No respiratory activity recorded"
        message="Start a monitoring session to see activity across your recent sessions."
      />
    );
  }

  return (
    <div>
      <div style={{ height: 220 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }} barCategoryGap="30%">
            <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
            <XAxis dataKey="label" tick={{ fill: '#6b7fa3', fontSize: 11 }} tickLine={false} axisLine={false} />
            <YAxis allowDecimals={false} tick={{ fill: '#6b7fa3', fontSize: 11 }} tickLine={false} axisLine={false} width={40} />
            <Tooltip {...chartTooltipStyle} />
            {present.map((t, i) => (
              <Bar
                key={t}
                dataKey={t}
                name={EVENT_META[t].label}
                stackId="s"
                fill={EVENT_META[t].color}
                radius={i === present.length - 1 ? [3, 3, 0, 0] : 0}
                isAnimationActive={false}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-2 text-xs text-ink-faint">Detected events per session, last {data.length} sessions.</p>
    </div>
  );
}

export function OverviewPage() {
  const navigate = useNavigate();
  const { canMonitor, connection } = useHealth();
  const [starting, setStarting] = useState<MonitorMode | null>(null);
  const [startError, setStartError] = useState<string | null>(null);

  const sessionsQ = useAsync((signal) => api.listSessions(signal), [connection === 'online']);
  const statusQ = useAsync((signal) => api.monitorStatus(signal), [connection === 'online']);
  const sessions = useMemo(() => sortSessionsNewest(sessionsQ.data ?? []), [sessionsQ.data]);
  const latest = sessions.find((s) => s.status !== 'recording');
  const alreadyActive = !!statusQ.data?.active;

  async function start(mode: MonitorMode) {
    setStarting(mode);
    setStartError(null);
    try {
      await api.startMonitoring(mode);
      navigate('/live');
    } catch (err) {
      setStartError(toApiError(err).message);
      setStarting(null);
    }
  }

  const blockedReason =
    connection === 'checking'
      ? 'Checking backend…'
      : connection === 'offline'
        ? 'Backend is offline — start the EchoHealth backend to begin.'
        : !canMonitor
          ? 'The AI model and microphone must both be ready before monitoring.'
          : null;

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-[1.35fr_1fr]">
        <section className="hero card relative overflow-hidden p-6 sm:p-8 animate-fade-up">
          <div className="relative">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Overview</p>
            <h1 className="mt-3 max-w-xl text-3xl font-bold leading-tight tracking-tight text-ink sm:text-[34px]">
              Respiratory sound monitoring, running on this laptop.
            </h1>
            <p className="mt-3 max-w-lg text-[15px] leading-relaxed text-ink-muted">
              EchoHealth listens through the microphone, detects coughing, wheezing, snoring and other respiratory sounds,
              and builds a report you can share with your clinician. Audio is processed locally.
            </p>

            <div className="mt-7 flex flex-wrap items-center gap-3">
              {alreadyActive ? (
                <Button variant="primary" icon={<Radio className="h-4 w-4" />} onClick={() => navigate('/live')} className="px-5 py-3">
                  Return to live session
                </Button>
              ) : (
                <Button
                  variant="primary"
                  icon={<Play className="h-4 w-4" />}
                  onClick={() => start('live')}
                  loading={starting === 'live'}
                  disabled={!canMonitor || starting !== null}
                  className="px-5 py-3"
                >
                  Start monitoring
                </Button>
              )}
              {!alreadyActive && !IS_MOCK_API && (
                <Button
                  variant="ghost"
                  icon={<FlaskConical className="h-4 w-4" />}
                  onClick={() => start('demo')}
                  loading={starting === 'demo'}
                  disabled={connection !== 'online' || starting !== null}
                  title="Asks the backend to run a demo-mode session"
                >
                  Run demo session
                </Button>
              )}
              <Link
                to="/history"
                className="inline-flex items-center gap-1.5 px-2 py-2 text-sm font-semibold text-ink-muted hover:text-ink"
              >
                <History className="h-4 w-4" /> Session history
              </Link>
            </div>

            {!alreadyActive && blockedReason && <p className="mt-4 text-sm text-ink-faint">{blockedReason}</p>}
            {startError && (
              <div className="mt-4">
                <ErrorBanner title="Could not start monitoring" message={startError} />
              </div>
            )}
          </div>
        </section>

        <Card title="System readiness" subtitle="Checked every 5 seconds">
          <Readiness />
        </Card>
      </div>

      {sessionsQ.error && connection === 'online' && (
        <ErrorBanner title="Could not load sessions" message={sessionsQ.error.message} onRetry={sessionsQ.reload} />
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_1.35fr]">
        <Card title="Latest session" subtitle="Most recent completed recording">
          {sessionsQ.loading && !sessionsQ.data ? <Spinner /> : <LatestSession session={latest} />}
        </Card>
        <Card
          title="Recent respiratory activity"
          subtitle="Across your latest sessions"
          action={
            <Link to="/history" className="inline-flex items-center gap-1 text-xs font-semibold text-accent hover:text-accent-soft">
              View history <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          }
        >
          {sessionsQ.loading && !sessionsQ.data ? <Spinner /> : <RecentActivity sessions={sessions} />}
        </Card>
      </div>

      <Disclaimer className="max-w-3xl" />
    </div>
  );
}
