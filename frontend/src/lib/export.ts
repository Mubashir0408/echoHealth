import type { Session } from '../api/types';
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

const baseName = (s: Session) => `echohealth-session-${s.startedAt.slice(0, 19).replace(/[:T]/g, '-')}`;

export function exportSessionJson(session: Session) {
  download(`${baseName(session)}.json`, JSON.stringify(session, null, 2), 'application/json');
}

const csvCell = (v: string | number) => {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function exportSessionCsv(session: Session) {
  const header = ['event_id', 'type', 'label', 'timestamp_utc', 'offset_seconds', 'duration_seconds', 'model_score'];
  const rows = session.events.map((e) => [
    e.id,
    e.type,
    eventMeta(e.type).label,
    e.timestamp,
    e.offsetSeconds,
    e.durationSeconds,
    e.score,
  ]);
  const csv = [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n');
  download(`${baseName(session)}.csv`, csv, 'text/csv');
}
