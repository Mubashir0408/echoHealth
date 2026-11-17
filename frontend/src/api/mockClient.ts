/**
 * DEMO MODE mock API.
 *
 * Implements the exact backend contract entirely in the browser so the UI can be
 * developed without the Python backend. Every value produced here is SIMULATED:
 * there is no microphone capture and no AI model. The UI labels this as Demo Mode.
 * It is only used when VITE_API_MODE=mock — never as a fallback for the real backend.
 */
import { ApiError, EVENT_TYPES } from './types';
import type { ApiClient, Counts, EventType, MonitorMode, MonitorStatus, RespiratoryEvent, Session } from './types';

const STORAGE_KEY = 'echohealth.demo.sessions';
const LATENCY_MS = 120;

/** Simulated events per minute — arbitrary demo values, not clinical rates. */
const DEMO_RATES_PER_MIN: Record<EventType, number> = {
  breathing: 5,
  cough: 3,
  snoring: 2.5,
  wheezing: 1.2,
  throat_clearing: 1,
  sneezing: 0.4,
  gasping: 0.3,
};

const uid = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

const emptyCounts = (): Counts =>
  Object.fromEntries(EVENT_TYPES.map((t) => [t, 0])) as Counts;

const delay = <T,>(value: T): Promise<T> => new Promise((r) => setTimeout(() => r(value), LATENCY_MS));
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

function loadSessions(): Session[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Session[]) : [];
  } catch {
    return [];
  }
}

function saveSessions(sessions: Session[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
  } catch {
    /* storage unavailable — demo data stays in memory */
  }
}

export function createMockClient(): ApiClient {
  let sessions = loadSessions();
  let active: Session | null = null;
  let lastTick = 0;
  let level = 0.08;

  function advance() {
    if (!active) return;
    const now = Date.now();
    const dt = Math.min((now - lastTick) / 1000, 5);
    lastTick = now;
    const elapsed = (now - Date.parse(active.startedAt)) / 1000;
    active.durationSeconds = Math.round(elapsed * 10) / 10;

    // Simulated ambient level drifting around a low baseline.
    level = Math.min(1, Math.max(0.02, level * 0.7 + (0.06 + Math.random() * 0.12) * 0.3));

    for (const type of EVENT_TYPES) {
      if (Math.random() < (DEMO_RATES_PER_MIN[type] / 60) * dt) {
        const event: RespiratoryEvent = {
          id: uid(),
          type,
          timestamp: new Date(now).toISOString(),
          offsetSeconds: Math.round(elapsed * 10) / 10,
          durationSeconds: Math.round((0.3 + Math.random() * 1.5) * 10) / 10,
          score: Math.round((0.35 + Math.random() * 0.6) * 100) / 100,
        };
        active.events.push(event);
        active.counts[type] += 1;
        level = Math.min(1, 0.45 + Math.random() * 0.5);
      }
    }
  }

  return {
    kind: 'mock',
    baseUrl: 'in-browser demo',

    health: () => delay({ status: 'online', modelReady: true, microphoneReady: true }),

    startMonitoring(mode: MonitorMode) {
      if (active) return Promise.reject(new ApiError('A monitoring session is already active', 409));
      active = {
        id: uid(),
        startedAt: new Date().toISOString(),
        endedAt: null,
        durationSeconds: 0,
        status: 'recording',
        mode,
        counts: emptyCounts(),
        events: [],
      };
      lastTick = Date.now();
      return delay(clone(active));
    },

    stopMonitoring() {
      if (!active) return Promise.reject(new ApiError('No active monitoring session', 409));
      advance();
      const done: Session = { ...active, status: 'completed', endedAt: new Date().toISOString() };
      active = null;
      level = 0.08;
      sessions = [done, ...sessions];
      saveSessions(sessions);
      return delay(clone(done));
    },

    monitorStatus() {
      advance();
      const status: MonitorStatus = active
        ? { active: true, audioLevel: Math.round(level * 1000) / 1000, session: clone(active) }
        : { active: false, audioLevel: 0, session: null };
      return delay(status);
    },

    listSessions: () => delay(clone(sessions)),

    getSession(id) {
      if (active?.id === id) return delay(clone(active));
      const found = sessions.find((s) => s.id === id);
      return found ? delay(clone(found)) : Promise.reject(new ApiError('Session not found', 404));
    },

    deleteSession(id) {
      const before = sessions.length;
      sessions = sessions.filter((s) => s.id !== id);
      if (sessions.length === before) return Promise.reject(new ApiError('Session not found', 404));
      saveSessions(sessions);
      return delay({ success: true });
    },
  };
}
