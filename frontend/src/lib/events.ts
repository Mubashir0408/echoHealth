import { EVENT_TYPES } from '../api/types';
import type { Counts, EventType } from '../api/types';

export interface EventMeta {
  label: string;
  short: string;
  color: string;
}

export const EVENT_META: Record<EventType, EventMeta> = {
  cough: { label: 'Cough', short: 'Cough', color: '#fbbf24' },
  wheezing: { label: 'Wheezing', short: 'Wheeze', color: '#fb7185' },
  breathing: { label: 'Breathing', short: 'Breath', color: '#38bdf8' },
  sneezing: { label: 'Sneezing', short: 'Sneeze', color: '#a3e635' },
  snoring: { label: 'Snoring', short: 'Snore', color: '#a78bfa' },
  gasping: { label: 'Gasping', short: 'Gasp', color: '#e879f9' },
  throat_clearing: { label: 'Throat clearing', short: 'Throat', color: '#94a3b8' },
};

const UNKNOWN_COLOR = '#64748b';

export function isKnownType(type: string): type is EventType {
  return (EVENT_TYPES as readonly string[]).includes(type);
}

export function eventMeta(type: string): EventMeta {
  if (isKnownType(type)) return EVENT_META[type];
  const label = type.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
  return { label, short: label, color: UNKNOWN_COLOR };
}

export function totalEvents(counts: Partial<Counts> | null | undefined): number {
  if (!counts) return 0;
  return Object.values(counts).reduce<number>((sum, n) => sum + (typeof n === 'number' ? n : 0), 0);
}

export function countOf(counts: Partial<Counts> | null | undefined, type: EventType): number {
  return counts?.[type] ?? 0;
}
