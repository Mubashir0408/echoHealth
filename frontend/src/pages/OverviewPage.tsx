import { useMemo, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ArrowRight, BrainCircuit, FileAudio, FileText, History, Mic, Play, Radio, Server, Upload } from 'lucide-react';
import { MAX_UPLOAD_BYTES, api } from '../api/client';
import { sourceLabel } from '../api/adapters';
import { EVENT_TYPES, toApiError } from '../api/types';
import type { Session } from '../api/types';
import { useHealth } from '../hooks/HealthContext';
import { useAsync } from '../hooks/useAsync';
import { useSessionDetails } from '../hooks/useSessionDetails';
import { useMonitor } from '../monitor/MonitorContext';
import { sortRowsNewest } from '../lib/analysis';
import { EVENT_META, countOf, totalEvents } from '../lib/events';
import { formatDateTime, formatDuration, formatShortDate } from '../lib/format';
import { chartTooltipStyle } from '../components/ActivityChart';
import { Badge, Button, Card, Disclaimer, EmptyState, ErrorBanner, Spinner, Stat, cx } from '../components/ui';
import type { Tone } from '../components/ui';

const RECENT_LIMIT = 7;

function ReadinessItem({ icon, label, tone, status, detail }: { icon: ReactNode; label: string; tone: Tone; status: string; detail: string }) {
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
        <p className="mt-0.5 text-xs text-ink-faint" title={detail}>
          {detail}
        </p>
      </div>
    </div>
  );
}

function Readiness() {
  const { connection, error, modelReady, modelDetail, health, mic } = useHealth();
  const online = connection === 'online';

  const micInfo: Record<string, { tone: Tone; status: string; detail: string }> = {
    checking: { tone: 'neutral', status: 'Checking', detail: 'Checking browser microphone support…' },
    unsupported: { tone: 'bad', status: 'Unsupported', detail: 'Needs a modern browser on localhost or HTTPS.' },
    prompt: { tone: 'ok', status: 'Ready', detail: 'The browser will ask for microphone permission when you start.' },
    granted: { tone: 'ok', status: 'Ready', detail: 'Microphone permission granted for this site.' },
    denied: { tone: 'bad', status: 'Blocked', detail: 'Microphone permission is blocked. Allow it in the browser site settings.' },
  };
  const m = micInfo[mic];

  return (
    <div className="grid gap-3">
      <ReadinessItem
        icon={<Server className="h-5 w-5" />}
        label="Backend"
        tone={connection === 'checking' ? 'neutral' : online ? 'ok' : 'bad'}
        status={connection === 'checking' ? 'Checking' : online ? 'Online' : 'Offline'}
        detail={online ? `Local server · ${health?.inference ?? 'local'} inference` : error?.message ?? 'Waiting for response…'}
      />
      <ReadinessItem
        icon={<BrainCircuit className="h-5 w-5" />}
        label="AI model"
        tone={!online ? 'neutral' : modelReady ? 'ok' : 'warn'}
        status={!online ? 'Unknown' : modelReady ? 'Ready' : 'Unavailable'}
        detail={
          !online
            ? 'Requires backend connection'
            : modelReady
              ? `${health?.model ?? 'YAMNet'} loaded on this computer`
              : modelDetail ?? 'Model not loaded. Run: python -m echohealth download'
        }
      />
      <ReadinessItem icon={<Mic className="h-5 w-5" />} label="Microphone" tone={m.tone} status={m.status} detail={m.detail} />
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
        <Badge tone="neutral">{sourceLabel(session.source)}</Badge>
        {session.status !== 'completed' && <Badge tone="warn">{session.status}</Badge>}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Stat label="Analyzed audio" value={formatDuration(session.durationSeconds)} />
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
        .slice(0, RECENT_LIMIT)
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
        message="Start monitoring or analyze a recording to see activity across your recent sessions."
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
      <p className="mt-2 text-xs text-ink-faint">
        Detected respiratory spans per session, last {data.length} sessions.
        {present.length === 0 && ' No respiratory spans were selected in these sessions.'}
      </p>
    </div>
  );
}

function ThresholdControl() {
  const { threshold, setThreshold, active } = useMonitor();
  return (
    <div>
      <label htmlFor="threshold" className="flex items-center justify-between text-xs font-medium text-ink-muted">
        Minimum entry score
        <output className="font-mono text-sm text-ink">{threshold.toFixed(2)}</output>
      </label>
      <input
        id="threshold"
        type="range"
        min={0.05}
        max={1}
        step={0.05}
        value={threshold}
        disabled={active}
        onChange={(e) => setThreshold(Number(e.target.value))}
        className="mt-2 w-full accent-[#2dd4bf] disabled:opacity-50"
        aria-describedby="threshold-help"
      />
      <p id="threshold-help" className="mt-1 text-[11px] leading-relaxed text-ink-faint">
        Applies to live monitoring and uploads. Per-sound floors (0.45–0.55) still apply. No clinical calibration.
      </p>
    </div>
  );
}

function AnalyzeRecording({ disabled }: { disabled: boolean }) {
  const navigate = useNavigate();
  const { threshold } = useMonitor();
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!file) return;
    if (file.size > MAX_UPLOAD_BYTES) {
      setError('Maximum upload size is 25 MiB.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await api.analyze(file, threshold);
      navigate(`/sessions/${encodeURIComponent(res.session_id)}`);
    } catch (err) {
      setError(toApiError(err).message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="card-inset flex flex-wrap items-center gap-3 px-4 py-3">
        <FileAudio className="h-5 w-5 shrink-0 text-ink-faint" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-ink">{file ? file.name : 'No recording selected'}</p>
          <p className="text-xs text-ink-faint">
            {file ? `${(file.size / 1024 / 1024).toFixed(2)} MB` : 'WAV, FLAC or OGG · up to 10 minutes and 25 MiB'}
          </p>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept=".wav,.flac,.ogg,audio/wav,audio/flac,audio/ogg"
          className="sr-only"
          id="recording-file"
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            setError(null);
          }}
        />
        <Button type="button" onClick={() => inputRef.current?.click()} disabled={busy}>
          Choose file
        </Button>
      </div>
      <ThresholdControl />
      <Button type="submit" variant="primary" icon={<Upload className="h-4 w-4" />} loading={busy} disabled={!file || disabled}>
        {busy ? 'Analyzing locally…' : 'Analyze recording'}
      </Button>
      {error && <ErrorBanner title="Analysis failed" message={error} />}
      <p className="text-[11px] text-ink-faint">The file is sent only to the local backend and its temporary copy is deleted after analysis.</p>
    </form>
  );
}

export function OverviewPage() {
  const navigate = useNavigate();
  const { canMonitor, connection, modelReady, mic } = useHealth();
  const monitor = useMonitor();

  const rowsQ = useAsync((signal) => api.listSessions(signal), [connection === 'online']);
  const rows = useMemo(() => sortRowsNewest(rowsQ.data ?? []), [rowsQ.data]);
  const details = useSessionDetails(rows, RECENT_LIMIT);
  const loaded = useMemo(
    () => rows.map((r) => details[r.id]).filter((d): d is Session => typeof d === 'object'),
    [rows, details],
  );
  const latest = loaded.find((s) => s.status !== 'recording');
  const detailsPending = rows.slice(0, RECENT_LIMIT).some((r) => details[r.id] === 'loading');

  function start() {
    // Errors (permission denied, backend refused…) are shown on the Live screen.
    void monitor.start();
    navigate('/live');
  }

  const blockedReason =
    connection === 'checking'
      ? 'Checking backend…'
      : connection === 'offline'
        ? 'Backend is offline — start the EchoHealth backend to begin.'
        : !modelReady
          ? 'The AI model is not loaded on the backend.'
          : mic === 'denied'
            ? 'Microphone permission is blocked for this site.'
            : mic === 'unsupported'
              ? 'This browser cannot capture microphone audio here.'
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
              and builds a report you can share with your clinician. Audio is processed locally and never saved.
            </p>

            <div className="mt-7 flex flex-wrap items-center gap-3">
              {monitor.active ? (
                <Button variant="primary" icon={<Radio className="h-4 w-4" />} onClick={() => navigate('/live')} className="px-5 py-3">
                  Return to live session
                </Button>
              ) : (
                <Button variant="primary" icon={<Play className="h-4 w-4" />} onClick={start} disabled={!canMonitor} className="px-5 py-3">
                  Start monitoring
                </Button>
              )}
              <Link to="/history" className="inline-flex items-center gap-1.5 px-2 py-2 text-sm font-semibold text-ink-muted hover:text-ink">
                <History className="h-4 w-4" /> Session history
              </Link>
            </div>

            {!monitor.active && blockedReason && <p className="mt-4 text-sm text-ink-faint">{blockedReason}</p>}
          </div>
        </section>

        <Card title="System readiness" subtitle="Backend checked every 5 seconds">
          <Readiness />
        </Card>
      </div>

      {rowsQ.error && connection === 'online' && (
        <ErrorBanner title="Could not load sessions" message={rowsQ.error.message} onRetry={rowsQ.reload} />
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_1.35fr]">
        <Card title="Analyze a recording" subtitle="Classify an existing audio file with the local model">
          <AnalyzeRecording disabled={!modelReady || monitor.active} />
        </Card>
        <Card title="Latest session" subtitle="Most recent finished recording">
          {(rowsQ.loading && !rowsQ.data) || (!latest && detailsPending) ? <Spinner /> : <LatestSession session={latest} />}
        </Card>
      </div>

      <Card
        title="Recent respiratory activity"
        subtitle="Across your latest sessions"
        action={
          <Link to="/history" className="inline-flex items-center gap-1 text-xs font-semibold text-accent hover:text-accent-soft">
            View history <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        }
      >
        {(rowsQ.loading && !rowsQ.data) || (loaded.length === 0 && detailsPending) ? <Spinner /> : <RecentActivity sessions={loaded} />}
      </Card>

      <Disclaimer className="max-w-3xl" />
    </div>
  );
}
