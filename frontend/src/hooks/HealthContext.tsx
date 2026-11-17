import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import { api } from '../api/client';
import type { ApiError, HealthStatus } from '../api/types';
import { usePolling } from './usePolling';

export type ConnectionState = 'checking' | 'online' | 'offline';

interface HealthValue {
  health: HealthStatus | null;
  error: ApiError | null;
  connection: ConnectionState;
  modelReady: boolean;
  microphoneReady: boolean;
  /** Backend online + model ready + microphone ready. */
  canMonitor: boolean;
  refresh: () => void;
}

const HealthContext = createContext<HealthValue | null>(null);

const HEALTH_INTERVAL_MS = 5000;

export function HealthProvider({ children }: { children: ReactNode }) {
  const { data, error, refresh } = usePolling((signal) => api.health(signal), HEALTH_INTERVAL_MS);

  // If the latest request failed, treat the backend as offline even if older data exists.
  const health = error ? null : data;
  let connection: ConnectionState = 'checking';
  if (error) connection = 'offline';
  else if (health) connection = health.status === 'online' ? 'online' : 'offline';
  const modelReady = connection === 'online' && !!health?.modelReady;
  const microphoneReady = connection === 'online' && !!health?.microphoneReady;

  return (
    <HealthContext.Provider
      value={{
        health,
        error,
        connection,
        modelReady,
        microphoneReady,
        canMonitor: connection === 'online' && modelReady && microphoneReady,
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
