import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Radio, Square, WifiOff } from 'lucide-react';
import { IS_MOCK_API, api } from '../api/client';
import { toApiError } from '../api/types';
import type { MonitorStatus, Session } from '../api/types';
import { usePolling } from '../hooks/usePolling';
import { elapsedSeconds, latestByType } from '../lib/analysis';
import { eventMeta, totalEvents } from '../lib/events';
import { formatClock, formatDateTime } from '../lib/format';
import { ActivityChart } from '../components/ActivityChart';
import { AudioLevelMeter } from '../components/AudioLevelMeter';
import { CountGrid } from '../components/CountGrid';
import { EventTimeline } from '../components/EventTimeline';
import { ScoreBars } from '../components/ScoreBars';
import { Button, Card, DemoBadge, EmptyState, ErrorBanner, Spinner } from '../components/ui';

const POLL_INTERVAL_MS = 750;
const MAX_LEVEL_SAMPLES = 120;

function useNow(enabled: boolean) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [enabled]);
  return now;
}

export function LivePage() {
  const navigate = useNavigate();
  const [stopping, setStopping] = useState(false);
  const [stopError, setStopError] = useState<string | null>(null);
  const [levels, setLevels] = useState<number[]>([]);
  const [session, setSession] = useState<Session | null>(null);
  const [flashType, setFlashType] = useState<string | null>(null);
  const lastEventCount = useRef(0);
  const sawActive = useRef(false);

  const onStatus = useCallback((s: MonitorStatus) => {
    if (s.active && s.session) {
      sawActive.current = true;
      setSession(s.session);
      setLevels((prev) => {
        const next = [...prev, Number.isFinite(s.audioLevel) ? s.audioLevel : 0];
        return next.length > MAX_LEVEL_SAMPLES ? next.slice(-MAX_LEVEL_SAMPLES) : next;
      });
      const events = s.session.events;
      if (events.length > lastEventCount.current) {
        const newest = events.reduce((a, b) => (b.offsetSeconds >= a.offsetSeconds ? b : a));
        setFlashType(newest.type);
      }
      lastEventCount.current = events.length;
    }
  }, []);

  // Poll only while this page is open and we're not in the middle of stopping.
  const poll = usePolling((signal) => api.monitorStatus(signal), POLL_INTERVAL_MS, !stopping, onStatus);
  const status = poll.data;
  const active = !!status?.active;

  // Session ended elsewhere (backend stopped, crashed, other tab) → go to its report.
  useEffect(() => {
    if (status && !status.active && sawActive.current && session && !stopping) {
      navigate(`/sessions/${encodeURIComponent(session.id)}`, { replace: true });
    }
  }, [status, session, stopping, navigate]);

  useEffect(() => {
    if (!flashType) return;
    const id = setTimeout(() => setFlashType(null), 1200);
    return () => clearTimeout(id);
  }, [flashType]);

  const now = useNow(active && !stopping);
  const elapsed = session ? elapsedSeconds(session, now) : 0;
  const latestScores = useMemo(() => latestByType(session?.events ?? []), [session?.events]);
  const isDemo = IS_MOCK_API || session?.mode === 'demo';

  async function stop() {
    setStopping(true);
    setStopError(null);
    try {
      const done = await api.stopMonitoring();
      navigate(`/sessions/${encodeURIComponent(done.id)}`);
    } catch (err) {
      setStopError(toApiError(err).message);
      setStopping(false);
    }
  }

  // ---- states before we have an active session ----
  if (poll.loading && !status) return <Spinner label="Connecting to monitor…" />;

  if (!status && poll.error) {
    return (
      <Card>
        <EmptyState
          icon={<WifiOff className="h-5 w-5" />}
          title="Cannot reach the backend"
          message={poll.error.message}
          action={<Button onClick={poll.refresh}>Retry</Button>}
        />
      </Card>
    );
  }

  if (status && !status.active && !sawActive.current) {
    return (
      <Card>
        <EmptyState
          icon={<Radio className="h-5 w-5" />}
          title="No active monitoring session"
          message="Start monitoring from the Overview screen to see live respiratory events here."
          action={
            <Button variant="primary" onClick={() => navigate('/')}>
              Go to Overview
            </Button>
          }
        />
      </Card>
    );
  }

  if (!session) return <Spinner label="Waiting for session data…" />;

  const latestEvent = session.events.length
    ? session.events.reduce((a, b) => (b.offsetSeconds >= a.offsetSeconds ? b : a))
    : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <section className="card flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6 animate-fade-up">
        <div className="flex items-center gap-4">
          <div className="relative grid h-12 w-12 place-items-center">
            {active && !stopping && <span className="absolute inset-0 rounded-full bg-rose-500/40 animate-pulse-ring" />}
            <span className="relative grid h-12 w-12 place-items-center rounded-full bg-rose-500/15 ring-1 ring-rose-400/40">
              <span className="h-3.5 w-3.5 rounded-full bg-rose-400" />
            </span>
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-[0.16em] text-rose-300">
                {stopping ? 'Stopping…' : 'Monitoring'}
              </span>
              {isDemo && <DemoBadge label={IS_MOCK_API ? 'Demo Mode — simulated' : 'Demo session'} />}
            </div>
            <div className="mt-1 font-mono text-4xl font-medium tabular-nums tracking-tight text-ink sm:text-5xl">
              {formatClock(elapsed)}
            </div>
            <div className="mt-1 text-xs text-ink-faint">Started {formatDateTime(session.startedAt)}</div>
          </div>
        </div>
        <div className="flex flex-col items-stretch gap-2 sm:items-end">
          <Button variant="danger" icon={<Square className="h-4 w-4 fill-current" />} onClick={stop} loading={stopping} className="px-6 py-3">
            Stop monitoring
          </Button>
          <span className="text-center text-xs text-ink-faint sm:text-right">
            {totalEvents(session.counts)} events detected
            {latestEvent && ` · last: ${eventMeta(latestEvent.type).label}`}
          </span>
        </div>
      </section>

      {stopError && <ErrorBanner title="Could not stop monitoring" message={stopError} onRetry={stop} />}
      {poll.error && status && (
        <ErrorBanner
          title="Connection interrupted"
          message={`${poll.error.message}. Showing last received data — retrying automatically.`}
        />
      )}

      {/* Audio + counts */}
      <div className="grid gap-6 lg:grid-cols-[1fr_1.6fr]">
        <Card title="Audio activity" subtitle={IS_MOCK_API ? 'Simulated level (Demo Mode)' : 'Live input level from backend'}>
          <AudioLevelMeter samples={levels} active={active && !stopping} />
        </Card>
        <Card title="Event counts" subtitle="Running totals for this session">
          <CountGrid counts={session.counts} highlight={flashType} />
        </Card>
      </div>

      {/* Chart */}
      <Card title="Respiratory activity" subtitle="Updates as events are detected">
        <ActivityChart events={session.events} durationSeconds={elapsed} height={240} />
      </Card>

      {/* Timeline + scores */}
      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card title="Detected events" subtitle="Newest first">
          <EventTimeline events={session.events} limit={50} />
        </Card>
        <Card title="Latest classification scores" subtitle="Most recent detection of each sound type">
          <ScoreBars events={latestScores} />
        </Card>
      </div>
    </div>
  );
}
