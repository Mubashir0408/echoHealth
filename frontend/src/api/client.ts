import { createHttpClient } from './httpClient';
import { createMockClient } from './mockClient';
import type { ApiClient } from './types';

/**
 * Single switch between the real backend and the Demo Mode mock.
 *   VITE_API_MODE=mock  → in-browser mock (clearly labelled Demo Mode in the UI)
 *   anything else       → real backend at VITE_API_URL
 * There is deliberately NO automatic fallback from the real backend to the mock.
 */
export const API_BASE_URL = (import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000').replace(/\/+$/, '');

export const api: ApiClient =
  import.meta.env.VITE_API_MODE === 'mock' ? createMockClient() : createHttpClient(API_BASE_URL);

export const IS_MOCK_API = api.kind === 'mock';

export * from './types';
