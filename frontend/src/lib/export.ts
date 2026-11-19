import type { Session, SessionDetail } from '../api/types';
import { eventMeta } from './events';

function download(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const baseName = (startedAt: string) =>
  `echohealth-session-${(startedAt || 'unknown').slice(0, 19).replace(/[:T]/g, '-')}`;

/** Complete backend session (all segment reports, scores and summary), as the backend's own export does. */
export function exportSessionJson(detail: SessionDetail) {
  download(`${baseName(detail.created_at)}.json`, JSON.stringify(detail, null, 2), 'application/json');
}

const csvCell = (v: string | number) => {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Merged respiratory spans from the session summary timeline. */
export function exportSessionCsv(session: Session) {
  const header = ['type', 'label', 'start_seconds', 'end_seconds', 'duration_seconds', 'peak_model_score'];
  const rows = session.events.map((e) => [
    e.type,
    eventMeta(e.type).label,
    e.offsetSeconds.toFixed(2),
    (e.offsetSeconds + e.durationSeconds).toFixed(2),
    e.durationSeconds.toFixed(2),
    e.score.toFixed(4),
  ]);
  const csv = [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n');
  download(`${baseName(session.startedAt)}.csv`, csv, 'text/csv');
}
