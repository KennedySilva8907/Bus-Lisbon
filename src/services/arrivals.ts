import type { ETA } from './api';

export type ArrivalState = 'boarding' | 'onTheWay' | 'predicted' | 'scheduled';

export interface ArrivalDescription {
  state: ArrivalState;
  trackable: boolean;
  label: string;
}

export type PunctualityTone = 'early' | 'late' | 'onTime' | 'finished' | 'running';

export interface Punctuality {
  label: string;
  tone: PunctualityTone;
}

export const EarlyBy = 60;
export const LateBy = 120;

export function describePunctuality(eta: ETA): Punctuality | null {
  if (eta.observed_arrival_unix == null) return null;

  const delay = eta.observed_arrival_unix - eta.scheduled_arrival_unix;

  if (delay < -EarlyBy) return { label: 'Adiantado', tone: 'early' };
  if (delay > LateBy) return { label: `+${Math.round(delay / 60)}min`, tone: 'late' };

  return { label: 'Pontual', tone: 'onTime' };
}

export function describePassage(eta: ETA): Punctuality {
  return eta.trip_running
    ? { label: 'Ainda em percurso', tone: 'running' }
    : { label: 'Terminou o percurso', tone: 'finished' };
}

export function anyArrivalTime(etas: ETA[]): boolean {
  return etas.some(eta => (eta.estimated_arrival_unix ?? 0) > 0 || (eta.observed_arrival_unix ?? 0) > 0);
}

export function wentByAt(eta: ETA): number | null {
  return eta.went_by_unix ?? eta.observed_arrival_unix ?? null;
}

export function describeArrival(eta: ETA): ArrivalDescription {
  const predicted =
    !!eta.estimated_arrival_unix && eta.estimated_arrival_unix !== eta.scheduled_arrival_unix;

  if (eta.vehicle_id && predicted) {
    return { state: 'boarding', trackable: true, label: 'Em viagem' };
  }

  if (eta.vehicle_id) {
    return { state: 'onTheWay', trackable: true, label: 'Agendado · autocarro a caminho' };
  }

  return {
    state: predicted ? 'predicted' : 'scheduled',
    trackable: false,
    label: predicted ? 'Previsto · ainda sem autocarro' : 'Agendado · ainda sem autocarro',
  };
}

export function countdownLabel(arrivalUnix: number, nowUnix: number): string {
  const diffSec = arrivalUnix - nowUnix;
  const diffMinutes = Math.floor(arrivalUnix / 60) - Math.floor(nowUnix / 60);

  if (diffSec <= 30) return 'Agora';
  if (diffMinutes <= 0) return '<1min';
  if (diffMinutes < 60) return `${diffMinutes}min`;

  const hours = Math.floor(diffMinutes / 60);
  const mins = diffMinutes % 60;

  return `${hours}h${mins > 0 ? String(mins).padStart(2, '0') : ''}`;
}
