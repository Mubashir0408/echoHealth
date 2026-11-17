const pad = (n: number) => String(Math.floor(n)).padStart(2, '0');

/** Human duration: "45s", "12m 05s", "1h 02m". */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${pad(m)}m`;
  if (m > 0) return `${m}m ${pad(sec)}s`;
  return `${sec}s`;
}

/** Stopwatch style: "00:12:05". */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds || 0));
  return `${pad(s / 3600)}:${pad((s % 3600) / 60)}:${pad(s % 60)}`;
}

/** Offset within a session: "03:25" or "1:03:25". */
export function formatOffset(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds || 0));
  const h = Math.floor(s / 3600);
  const body = `${pad((s % 3600) / 60)}:${pad(s % 60)}`;
  return h > 0 ? `${h}:${body}` : body;
}

const dateTimeFmt = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const timeFmt = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
const shortDateFmt = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });

function safe(iso: string | null | undefined, fmt: Intl.DateTimeFormat): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : fmt.format(d);
}

export const formatDateTime = (iso: string | null | undefined) => safe(iso, dateTimeFmt);
export const formatTime = (iso: string | null | undefined) => safe(iso, timeFmt);
export const formatShortDate = (iso: string | null | undefined) => safe(iso, shortDateFmt);

export const formatScore = (score: number) => (Number.isFinite(score) ? score.toFixed(2) : '—');
