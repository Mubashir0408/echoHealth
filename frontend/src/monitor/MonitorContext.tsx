/**
 * Live microphone monitoring over the backend's WebSocket protocol (echohealth/server.py):
 *
 *   client → {"threshold": 0.3}                 (JSON, first message)
 *   server → {"type":"ready","session_id":…}
 *   client → binary: 16 kHz mono int16 LE PCM, 31 200 samples (1.95 s) per message
 *   server → {"type":"result","sequence","offset_seconds","report","summary"} per segment
 *   client → "stop"           server → {"type":"stopped"} and closes
 *   server → {"type":"error","detail":…} on failure
 *
 * PCM conversion uses the backend's own AudioWorklet (/static/pcm-worklet.js, proxied),
 * so capture behaves exactly like the backend's reference page. Lives at the app root so
 * monitoring continues while the user navigates between screens.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { MonitorMessage, SegmentReport, SessionSummary } from '../api/types';

export type MonitorPhase = 'idle' | 'requesting' | 'connecting' | 'listening' | 'stopping';

export interface MonitorState {
  phase: MonitorPhase;
  sessionId: string | null;
  /** Wall-clock ms when the backend accepted the session. */
  startedAt: number | null;
  summary: SessionSummary | null;
  latestReport: SegmentReport | null;
  latestOffset: number;
  segments: number;
  /** Measured microphone level history (0–1, from dBFS), one sample per 250 ms. */
  levels: number[];
  levelDb: number | null;
  error: string | null;
  /** Session id of the most recent session that ended (stopped, failed or disconnected). */
  endedSessionId: string | null;
}

interface MonitorValue {
  state: MonitorState;
  active: boolean;
  threshold: number;
  setThreshold: (value: number) => void;
  start: () => Promise<void>;
  /** Stops monitoring; resolves with the session id once the backend has closed the session. */
  stop: (reason?: string) => Promise<string | null>;
  clearEnded: () => void;
}

const INITIAL: MonitorState = {
  phase: 'idle',
  sessionId: null,
  startedAt: null,
  summary: null,
  latestReport: null,
  latestOffset: 0,
  segments: 0,
  levels: [],
  levelDb: null,
  error: null,
  endedSessionId: null,
};

const CONNECT_TIMEOUT_MS = 15_000;
const STOP_TIMEOUT_MS = 8_000;
const LEVEL_INTERVAL_MS = 250;
const MAX_LEVELS = 160;

const MonitorContext = createContext<MonitorValue | null>(null);

export function MonitorProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<MonitorState>(INITIAL);
  const [threshold, setThreshold] = useState(0.3);

  const generation = useRef(0);
  const socketRef = useRef<WebSocket | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const workletRef = useRef<AudioWorkletNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const levelTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const connectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const readyRef = useRef(false);
  const stoppingRef = useRef(false);
  const busyRef = useRef(false);
  const stopWaiters = useRef<((id: string | null) => void)[]>([]);
  const stopRef = useRef<(reason?: string) => Promise<string | null>>(async () => null);

  /** Release microphone + audio graph (socket handled separately). */
  const releaseAudio = useCallback(() => {
    if (levelTimer.current) clearInterval(levelTimer.current);
    levelTimer.current = null;
    if (connectTimer.current) clearTimeout(connectTimer.current);
    connectTimer.current = null;
    if (workletRef.current) {
      workletRef.current.port.onmessage = null;
      workletRef.current.disconnect();
      workletRef.current = null;
    }
    analyserRef.current = null;
    streamRef.current?.getTracks().forEach((t) => {
      t.onended = null;
      t.stop();
    });
    streamRef.current = null;
    const ctx = contextRef.current;
    contextRef.current = null;
    if (ctx) {
      ctx.onstatechange = null;
      if (ctx.state !== 'closed') void ctx.close().catch(() => undefined);
    }
  }, []);

  const finish = useCallback(
    (error: string | null) => {
      releaseAudio();
      if (stopTimer.current) clearTimeout(stopTimer.current);
      stopTimer.current = null;
      const id = sessionIdRef.current;
      socketRef.current = null;
      sessionIdRef.current = null;
      readyRef.current = false;
      stoppingRef.current = false;
      busyRef.current = false;
      setState((s) => ({
        ...s,
        phase: 'idle',
        sessionId: null,
        levelDb: null,
        error: error ?? s.error,
        endedSessionId: id,
      }));
      const waiters = stopWaiters.current;
      stopWaiters.current = [];
      waiters.forEach((resolve) => resolve(id));
    },
    [releaseAudio],
  );

  const startAudioPipeline = useCallback((ws: WebSocket) => {
    const ctx = contextRef.current;
    const stream = streamRef.current;
    if (!ctx || !stream) return;
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    source.connect(analyser);
    analyserRef.current = analyser;

    const worklet = new AudioWorkletNode(ctx, 'pcm-processor');
    source.connect(worklet);
    const mute = ctx.createGain();
    mute.gain.value = 0;
    worklet.connect(mute).connect(ctx.destination);
    workletRef.current = worklet;

    worklet.port.onmessage = (e: MessageEvent<ArrayBuffer>) => {
      if (stoppingRef.current || ws.readyState !== WebSocket.OPEN) return;
      if (busyRef.current) {
        // Same policy as the backend's page: never silently drop audio.
        void stopRef.current('Inference is slower than capture. Monitoring stopped to avoid silently dropping audio.');
        return;
      }
      busyRef.current = true;
      ws.send(e.data);
    };

    ctx.onstatechange = () => {
      if (ctx.state === 'suspended' && readyRef.current) {
        void stopRef.current('Audio capture was suspended by the browser. Monitoring ended.');
      }
    };

    const buffer = new Float32Array(analyser.fftSize);
    levelTimer.current = setInterval(() => {
      const a = analyserRef.current;
      if (!a) return;
      a.getFloatTimeDomainData(buffer);
      let energy = 0;
      for (let i = 0; i < buffer.length; i++) energy += buffer[i] * buffer[i];
      const rms = Math.sqrt(energy / buffer.length);
      const db = rms > 0 ? Math.max(-80, 20 * Math.log10(rms)) : -80;
      const level = (db + 80) / 80;
      setState((s) => {
        const levels = [...s.levels, level];
        return { ...s, levels: levels.length > MAX_LEVELS ? levels.slice(-MAX_LEVELS) : levels, levelDb: rms > 0 ? db : null };
      });
    }, LEVEL_INTERVAL_MS);
  }, []);

  const start = useCallback(async () => {
    if (socketRef.current || streamRef.current) return;
    const gen = ++generation.current;
    stoppingRef.current = false;
    busyRef.current = false;
    readyRef.current = false;
    setState({ ...INITIAL, phase: 'requesting' });

    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof AudioWorkletNode === 'undefined') {
        throw new Error('Microphone monitoring needs a modern browser on localhost or HTTPS.');
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      if (gen !== generation.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      streamRef.current = stream;
      stream.getAudioTracks().forEach((track) => {
        track.onended = () => void stopRef.current('Microphone disconnected. Monitoring ended.');
      });
      setState((s) => ({ ...s, phase: 'connecting' }));

      // Let the browser resample to 16 kHz (anti-aliased) before the worklet, as the backend page does.
      const ctx = new AudioContext({ sampleRate: 16000 });
      contextRef.current = ctx;
      await ctx.resume();
      await ctx.audioWorklet.addModule('/static/pcm-worklet.js');
      if (gen !== generation.current) return;

      const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${proto}//${location.host}/api/monitor`);
      ws.binaryType = 'arraybuffer';
      socketRef.current = ws;

      connectTimer.current = setTimeout(() => {
        if (socketRef.current === ws && !readyRef.current) {
          ws.close();
          finish('The AI backend did not accept the monitoring session within 15 seconds.');
        }
      }, CONNECT_TIMEOUT_MS);

      ws.onopen = () => ws.send(JSON.stringify({ threshold }));

      ws.onmessage = (event) => {
        if (socketRef.current !== ws || typeof event.data !== 'string') return;
        let data: MonitorMessage;
        try {
          data = JSON.parse(event.data) as MonitorMessage;
        } catch {
          return;
        }
        if (data.type === 'ready') {
          sessionIdRef.current = data.session_id;
          readyRef.current = true;
          if (connectTimer.current) clearTimeout(connectTimer.current);
          if (stoppingRef.current) {
            ws.send('stop');
            return;
          }
          setState((s) => ({ ...s, phase: 'listening', sessionId: data.session_id, startedAt: Date.now() }));
          startAudioPipeline(ws);
        } else if (data.type === 'result') {
          busyRef.current = false;
          setState((s) => ({
            ...s,
            summary: data.summary,
            latestReport: data.report,
            latestOffset: data.offset_seconds,
            segments: s.segments + 1,
          }));
        } else if (data.type === 'error') {
          setState((s) => ({ ...s, error: data.detail || 'The backend reported a monitoring error.' }));
        }
        // 'stopped' needs no action: the backend closes the socket next.
      };

      ws.onclose = () => {
        if (socketRef.current !== ws) return;
        const wasReady = readyRef.current;
        const intentional = stoppingRef.current;
        let error: string | null = null;
        if (!intentional) {
          error = wasReady
            ? 'Connection to the backend was lost. Monitoring ended; saved observations remain in history.'
            : 'Could not open a monitoring session. Check that the EchoHealth backend is running and the AI model is ready.';
        }
        finish(error);
      };
    } catch (err) {
      if (gen !== generation.current) return;
      const message =
        err instanceof DOMException && (err.name === 'NotAllowedError' || err.name === 'SecurityError')
          ? 'Microphone permission was denied. Allow microphone access for this site and try again.'
          : err instanceof DOMException && err.name === 'NotFoundError'
            ? 'No microphone was found on this computer.'
            : err instanceof Error
              ? err.message
              : 'Could not start monitoring.';
      socketRef.current?.close();
      finish(message);
    }
  }, [finish, startAudioPipeline, threshold]);

  const stop = useCallback(
    (reason?: string) => {
      if (reason) setState((s) => ({ ...s, error: reason }));
      const ws = socketRef.current;
      if (!ws && !streamRef.current) {
        // Nothing connected yet (e.g. still waiting for permission): cancel.
        ++generation.current;
        finish(reason ?? null);
        return Promise.resolve<string | null>(null);
      }
      const done = new Promise<string | null>((resolve) => stopWaiters.current.push(resolve));
      if (stoppingRef.current) return done;
      stoppingRef.current = true;
      // Microphone is released immediately; the final partial 1.95 s segment is discarded.
      releaseAudio();
      setState((s) => ({ ...s, phase: 'stopping', levelDb: null }));
      if (!ws) {
        ++generation.current;
        finish(reason ?? null);
      } else if (ws.readyState === WebSocket.OPEN && readyRef.current) {
        ws.send('stop');
        stopTimer.current = setTimeout(() => ws.close(), STOP_TIMEOUT_MS);
      } else if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        // Not ready yet: the 'ready' handler sends stop. Guard with a timeout.
        stopTimer.current = setTimeout(() => ws.close(), STOP_TIMEOUT_MS);
      } else {
        finish(reason ?? null);
      }
      return done;
    },
    [finish, releaseAudio],
  );
  stopRef.current = stop;

  useEffect(() => {
    const onHide = () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      socketRef.current?.close();
    };
    window.addEventListener('pagehide', onHide);
    return () => window.removeEventListener('pagehide', onHide);
  }, []);

  const clearEnded = useCallback(() => setState((s) => ({ ...s, endedSessionId: null, error: null })), []);

  const value = useMemo<MonitorValue>(
    () => ({ state, active: state.phase !== 'idle', threshold, setThreshold, start, stop, clearEnded }),
    [state, threshold, start, stop, clearEnded],
  );

  return <MonitorContext.Provider value={value}>{children}</MonitorContext.Provider>;
}

export function useMonitor(): MonitorValue {
  const ctx = useContext(MonitorContext);
  if (!ctx) throw new Error('useMonitor must be used inside <MonitorProvider>');
  return ctx;
}
