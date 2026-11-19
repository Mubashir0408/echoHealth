import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, Mic, Radio, Square } from 'lucide-react';
import { countsFromSummary, emptyCounts, spansToEvents } from '../api/adapters';
import { useMonitor } from '../monitor/MonitorContext';
import { eventMeta } from '../lib/events';
import { formatClock, formatDuration } from '../lib/format';
import { ActivityChart } from '../components/ActivityChart';
import { AudioLevelMeter } from '../components/AudioLevelMeter';
import { CountGrid } from '../components/CountGrid';
import { EventTimeline } from '../components/EventTimeline';
import { ScoreBars } from '../components/ScoreBars';
import { Button, Card, EmptyState, ErrorBanner, Spinner } from '../components/ui';

function useNow(enabled: boolean) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [enabled]);
  return now;
}

const PHASE_LABEL = {
  requesting: 'Waiting for microphone permission…',
  connecting: 'Connecting to the local AI model…',
} as const;

export function LivePage() {
  const navigate = useNavigate();
  const { state, active, stop, clearEnded } = useMonitor();
  const [flashType, setFlashType] = useState<string | null>(null);

  const listening = state.phase === 'listening';
  const stopping = state.phase === 'stopping';
  const now = useNow(listening);
  const elapsed = state.startedAt ? (now - state.startedAt) / 1000 : 0;

  const events = useMemo(() => spansToEvents(state.summary?.timeline ?? []), [state.summary]);
  const counts = useMemo(() => (state.summary ? countsFromSummary(state.summary) : emptyCounts()), [state.summary]);
  const analyzed = state.summary?.monitoring_duration_seconds ?? 0;
  const total = state.summary?.total_respiratory_events ?? 0;

  // Briefly highlight the count tile of the newest span.
  const newest = useMemo(() => (events.length ? events.reduce((a, b) => (b.offsetSeconds >= a.offsetSeconds ? b : a)) : null), [events]);
  const [lastTotal, setLastTotal] = useState(0);
  useEffect(() => {
    if (total > lastTotal && newest) setFlashType(newest.type);
    setLastTotal(total);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [total]);
  useEffect(() => {
    if (!flashType) return;
    const id = setTimeout(() => setFlashType(null), 1200);
    return () => clearTimeout(id);
  }, [flashType]);

  async function handleStop() {
    const id = await stop();
    if (id) navigate(`/sessions/${encodeURIComponent(id)}`);
  }

  // ---- not monitoring ----
  if (!active) {
    if (state.error || state.endedSessionId) {
      return (
        <Card>
          <EmptyState
            icon={<Radio className="h-5 w-5" />}
            title="Monitoring ended"
            message={state.error ?? 'The monitoring session has ended.'}
            action={
              <div className="flex flex-wrap justify-center gap-2">
                {state.endedSessionId && (
                  <Button variant="primary" icon={<FileText className="h-4 w-4" />} onClick={() => navigate(`/sessions/${encodeURIComponent(state.endedSessionId!)}`)}>
                    Open session report
                  </Button>
                )}
                <Button
                  onClick={() => {
                    clearEnded();
                    navigate('/');
                  }}
                >
                  Back to Overview
                </Button>
              </div>
            }
          />
        </Card>
      );
    }
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

  if (state.phase === 'requesting' || state.phase === 'connecting') {
    return (
      <Card>
        <div className="flex flex-col items-center gap-4 py-6">
          <Spinner label={PHASE_LABEL[state.phase]} />
          {state.phase === 'requesting' && (
            <p className="flex items-center gap-2 text-xs text-ink-faint">
              <Mic className="h-4 w-4" /> Allow microphone access in the browser prompt.
            </p>
          )}
          <Button variant="ghost" onClick={() => void stop()}>
            Cancel
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <section className="card flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6 animate-fade-up">
        <div className="flex items-center gap-4">
          <div className="relative grid h-12 w-12 place-items-center">
            {listening && <span className="absolute inset-0 rounded-full bg-rose-500/40 animate-pulse-ring" />}
            <span className="relative grid h-12 w-12 place-items-center rounded-full bg-rose-500/15 ring-1 ring-rose-400/40">
              <span className="h-3.5 w-3.5 rounded-full bg-rose-400" />
            </span>
          </div>
          <div>
            <span className="text-xs font-semibold uppercase tracking-[0.16em] text-rose-300">
              {stopping ? 'Stopping…' : 'Monitoring'}
            </span>
            <div className="mt-1 font-mono text-4xl font-medium tabular-nums tracking-tight text-ink sm:text-5xl">{formatClock(elapsed)}</div>
            <div className="mt-1 text-xs text-ink-faint">
              {formatDuration(analyzed)} of audio analyzed · {state.segments} segment{state.segments === 1 ? '' : 's'}
            </div>
          </div>
        </div>
        <div className="flex flex-col items-stretch gap-2 sm:items-end">
          <Button variant="danger" icon={<Square className="h-4 w-4 fill-current" />} onClick={handleStop} loading={stopping} className="px-6 py-3">
            Stop monitoring
          </Button>
          <span className="text-center text-xs text-ink-faint sm:text-right">
            {total} respiratory spans
            {newest && ` · last: ${eventMeta(newest.type).label}`}
          </span>
        </div>
      </section>

      {state.error && <ErrorBanner title="Monitoring problem" message={state.error} />}

      {/* Audio + counts */}
      <div className="grid gap-6 lg:grid-cols-[1fr_1.6fr]">
        <Card title="Audio activity" subtitle="Live microphone input">
          <AudioLevelMeter samples={state.levels} active={listening} levelDb={state.levelDb} />
        </Card>
        <Card title="Event counts" subtitle="Merged model spans this session — not clinical episode counts">
          <CountGrid counts={counts} highlight={flashType} />
        </Card>
      </div>

      {/* Chart */}
      <Card title="Respiratory activity" subtitle="Updates after each analyzed 1.95-second segment">
        <ActivityChart events={events} durationSeconds={analyzed} height={240} />
      </Card>

      {/* Timeline + scores */}
      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card title="Detected events" subtitle="Newest first">
          <EventTimeline events={events} limit={50} />
        </Card>
        <Card title="Latest classification scores" subtitle="YAMNet scores for the most recent segment">
          <ScoreBars report={state.latestReport} offsetSeconds={state.latestReport ? state.latestOffset : undefined} />
        </Card>
      </div>

      <p className="text-xs text-ink-faint">
        Keep this tab open while monitoring. The final partial segment (under 1.95 s) is discarded when you stop. Raw audio is
        never stored — only scores and detected spans.
      </p>
    </div>
  );
}
