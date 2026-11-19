import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { api } from '../api/client';
import type { ApiError, BackendHealth } from '../api/types';
import { usePolling } from './usePolling';

export type ConnectionState = 'checking' | 'online' | 'offline';
/** Microphone readiness is a browser concern: the backend receives PCM from this page. */
export type MicState = 'checking' | 'unsupported' | 'prompt' | 'granted' | 'denied';

interface HealthValue {
  health: BackendHealth | null;
  error: ApiError | null;
  connection: ConnectionState;
  modelReady: boolean;
  modelDetail: string | null;
  mic: MicState;
  microphoneReady: boolean;
  /** Backend online + model ready + microphone usable. */
  canMonitor: boolean;
  refresh: () => void;
}

const HealthContext = createContext<HealthValue | null>(null);
const HEALTH_INTERVAL_MS = 5000;

function useMicrophoneState(): MicState {
  const [mic, setMic] = useState<MicState>('checking');
  useEffect(() => {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia || typeof AudioWorkletNode === 'undefined') {
      setMic('unsupported');
      return;
    }
    let status: PermissionStatus | null = null;
    let cancelled = false;
    const update = () => {
      if (!cancelled && status) setMic(status.state === 'granted' ? 'granted' : status.state === 'denied' ? 'denied' : 'prompt');
    };
    if (navigator.permissions?.query) {
      navigator.permissions
        .query({ name: 'microphone' as PermissionName })
        .then((s) => {
          status = s;
          update();
          s.addEventListener('change', update);
        })
        .catch(() => !cancelled && setMic('prompt'));
    } else {
      setMic('prompt');
    }
    return () => {
      cancelled = true;
      status?.removeEventListener('change', update);
    };
  }, []);
  return mic;
}

export function HealthProvider({ children }: { children: ReactNode }) {
  const { data, error, refresh } = usePolling((signal) => api.health(signal), HEALTH_INTERVAL_MS);
  const mic = useMicrophoneState();

  const health = error ? null : data;
  let connection: ConnectionState = 'checking';
  if (error) connection = 'offline';
  else if (health) connection = 'online';

  const modelReady = connection === 'online' && health?.status === 'ready';
  const microphoneReady = mic === 'granted' || mic === 'prompt';

  return (
    <HealthContext.Provider
      value={{
        health,
        error,
        connection,
        modelReady,
        modelDetail: health?.detail ?? null,
        mic,
        microphoneReady,
        canMonitor: modelReady && microphoneReady,
        refresh,
      }}
    >
      {children}
    </HealthContext.Provider>
  );
}

export function useHealth(): HealthValue {
  const ctx = useContext(HealthContext);
  if (!ctx) throw new Error('useHealth must be used inside <HealthProvider>');
  return ctx;
}
