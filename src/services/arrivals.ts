import type { ETA } from './api';

export type ArrivalState = 'boarding' | 'predicted' | 'scheduled';

export interface ArrivalDescription {
  state: ArrivalState;
  trackable: boolean;
  label: string;
}

// Only an arrival that names a vehicle can be followed. Without one the
// operator does not know which bus is doing this trip, and neither do we —
// showing another bus from the same line looks like an answer and is not one.
export function describeArrival(eta: ETA): ArrivalDescription {
  if (eta.vehicle_id) {
    return { state: 'boarding', trackable: true, label: 'Em viagem' };
  }

  const predicted =
    !!eta.estimated_arrival_unix && eta.estimated_arrival_unix !== eta.scheduled_arrival_unix;

  return {
    state: predicted ? 'predicted' : 'scheduled',
    trackable: false,
    label: predicted ? 'Previsto · ainda sem autocarro' : 'Agendado · ainda sem autocarro',
  };
}
