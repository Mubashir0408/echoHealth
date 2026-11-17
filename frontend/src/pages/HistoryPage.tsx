import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronRight, History, Trash2 } from 'lucide-react';
import { api } from '../api/client';
import { EVENT_TYPES, toApiError } from '../api/types';
import type { Session } from '../api/types';
import { useAsync } from '../hooks/useAsync';
import { sortSessionsNewest } from '../lib/analysis';
import { EVENT_META, countOf, totalEvents } from '../lib/events';
import { formatDateTime, formatDuration } from '../lib/format';
import { Badge, Button, Card, DemoBadge, EmptyState, ErrorBanner, Spinner } from '../components/ui';
import type { Tone } from '../components/ui';

const STATUS_TONE: Record<string, Tone> = { completed: 'ok', recording: 'info', interrupted: 'warn', failed: 'bad' };

function SessionRow({
  session,
  onDelete,
}: {
  session: Session;
  onDelete: (id: string) => Promise<void>;
}) {
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const total = totalEvents(session.counts);
  const chips = EVENT_TYPES.filter((t) => countOf(session.counts, t) > 0);
  const reportUrl = `/sessions/${encodeURIComponent(session.id)}`;

  async function remove() {
    setDeleting(true);
    try {
      await onDelete(session.id);
    } finally {
      setDeleting(false);
      setConfirming(false);
    }
  }

  return (
    <li className="card-inset flex flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center animate-fade-up">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Link to={reportUrl} className="text-[15px] font-semibold text-ink hover:text-accent-soft">
            {formatDateTime(session.startedAt)}
          </Link>
          {session.status !== 'completed' && (
            <Badge tone={STATUS_TONE[session.status] ?? 'neutral'} dot>
              {session.status}
            </Badge>
          )}
          {session.mode === 'demo' && <DemoBadge label="Demo" />}
        </div>
        <div className="mt-1 text-sm text-ink-faint">
          {formatDuration(session.durationSeconds)} · <span className="text-ink-muted">{total} events</span>
        </div>
        {chips.length > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {chips.map((t) => (
              <span key={t} className="inline-flex items-center gap-1.5 rounded-md bg-white/5 px-2 py-0.5 text-xs text-ink-muted">
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: EVENT_META[t].color }} />
                {EVENT_META[t].label} <span className="font-mono text-ink">{countOf(session.counts, t)}</span>
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {confirming ? (
          <>
            <span className="text-xs text-ink-muted">Delete permanently?</span>
            <Button variant="danger" onClick={remove} loading={deleting} className="px-3 py-2">
              Delete
            </Button>
            <Button variant="ghost" onClick={() => setConfirming(false)} disabled={deleting} className="px-3 py-2">
              Cancel
            </Button>
          </>
        ) : (
          <>
            <Button
              variant="ghost"
              onClick={() => setConfirming(true)}
              icon={<Trash2 className="h-4 w-4" />}
              className="px-3 py-2 hover:text-rose-300"
              aria-label="Delete session"
              disabled={session.status === 'recording'}
              title={session.status === 'recording' ? 'Stop the session before deleting it' : 'Delete session'}
            />
            <Button onClick={() => navigate(reportUrl)} className="px-3 py-2">
              View report <ChevronRight className="h-4 w-4" />
            </Button>
          </>
        )}
      </div>
    </li>
  );
}

export function HistoryPage() {
  const navigate = useNavigate();
  const q = useAsync((signal) => api.listSessions(signal), []);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const sessions = useMemo(() => sortSessionsNewest(q.data ?? []), [q.data]);

  async function handleDelete(id: string) {
    setDeleteError(null);
    try {
      await api.deleteSession(id);
      q.setData((prev) => (prev ? prev.filter((s) => s.id !== id) : prev));
    } catch (err) {
      setDeleteError(toApiError(err).message);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">History</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-ink sm:text-3xl">Monitoring sessions</h1>
        <p className="mt-1 text-sm text-ink-faint">Stored locally by the EchoHealth backend on this machine.</p>
      </div>

      {deleteError && <ErrorBanner title="Could not delete session" message={deleteError} />}

      <Card>
        {q.loading && !q.data ? (
          <Spinner label="Loading sessions…" />
        ) : q.error ? (
          <ErrorBanner title="Could not load sessions" message={q.error.message} onRetry={q.reload} />
        ) : sessions.length === 0 ? (
          <EmptyState
            icon={<History className="h-5 w-5" />}
            title="No sessions recorded yet"
            message="Completed monitoring sessions will appear here."
            action={
              <Button variant="primary" onClick={() => navigate('/')}>
                Go to Overview
              </Button>
            }
          />
        ) : (
          <ul className="space-y-3">
            {sessions.map((s) => (
              <SessionRow key={s.id} session={s} onDelete={handleDelete} />
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
