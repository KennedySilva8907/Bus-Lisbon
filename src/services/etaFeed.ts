export const ETA_BASE_URL = 'https://go.tmlmobilidade.pt/hub/api/v1';

export const ETA_MAX_AGE_SECONDS = 300;

export interface RawEta {
  trip_id?: string;
  vehicle_id?: string | number;
  stop_sequence?: string | number;
  stop_id?: string | number;
  eta_seconds?: string | number;
  eta_at?: string | number;
}

export interface TripParts {
  lineId: string;
  patternId: string;
  agencyPatternId: string;
}

export function readTripId(tripId: string | undefined | null): TripParts | null {
  if (!tripId) return null;

  const agencies = String(tripId).match(/^(?:\[[^\]]+\])+/)?.[0] ?? '';
  const agency = agencies.match(/\[([^\]]+)\]/g)?.slice(-1)[0] ?? '';
  const body = String(tripId).slice(agencies.length).split('|')[0];
  const parts = body.split('_');

  if (parts.length < 3) return null;

  const patternId = parts.slice(0, 3).join('_');

  if (!/^\d+_\d+_\d+$/.test(patternId)) return null;

  return { lineId: parts[0], patternId, agencyPatternId: `${agency}${patternId}` };
}

export function readEtaAt(value: string | number | undefined | null): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.round(value / 1000);

  if (typeof value === 'string') {
    const asNumber = Number(value);

    if (Number.isFinite(asNumber) && value.trim() !== '') return Math.round(asNumber / 1000);

    const parsed = Date.parse(value.replace(' ', 'T') + 'Z');

    if (Number.isFinite(parsed)) return Math.round(parsed / 1000);
  }

  return null;
}

export interface FeedEta {
  lineId: string;
  patternId: string;
  agencyPatternId: string;
  departure: string;
  vehicleId: string;
  stopSequence: number;
  estimatedArrivalUnix: number;
}

export function departureTag(tripId: string | undefined | null): string {
  const cut = String(tripId ?? '').lastIndexOf('|');

  return cut >= 0 ? String(tripId).slice(cut + 1) : '';
}

export function readEtaSeconds(value: string | number | undefined | null): number | null {
  const seconds = Number(value);

  return Number.isFinite(seconds) && String(value).trim() !== '' ? Math.round(seconds) : null;
}

export function toFeedEta(raw: RawEta, nowUnix: number): FeedEta | null {
  const trip = readTripId(raw.trip_id);
  const countdown = readEtaSeconds(raw.eta_seconds);
  const arrival = countdown === null ? readEtaAt(raw.eta_at) : nowUnix + countdown;

  if (!trip || arrival === null) return null;

  return {
    lineId: trip.lineId,
    patternId: trip.patternId,
    agencyPatternId: trip.agencyPatternId,
    departure: departureTag(raw.trip_id),
    vehicleId: String(raw.vehicle_id ?? ''),
    stopSequence: Number(raw.stop_sequence) || 0,
    estimatedArrivalUnix: arrival,
  };
}

export function readFeed(raw: RawEta[], nowUnix: number): FeedEta[] {
  return raw
    .map(row => toFeedEta(row, nowUnix))
    .filter((eta): eta is FeedEta => eta !== null)
    .filter(eta => eta.estimatedArrivalUnix > nowUnix - ETA_MAX_AGE_SECONDS)
    .sort((a, b) => a.estimatedArrivalUnix - b.estimatedArrivalUnix);
}
