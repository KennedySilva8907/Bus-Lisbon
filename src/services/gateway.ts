import type { Vehicle } from './api';

// The C# backend speaks camelCase; the rest of this app reads snake_case on
// vehicles. Rather than rename those fields across every component mid-migration,
// the conversion happens here and nowhere else.
export interface GatewayVehicle {
  id: string;
  lat: number;
  lon: number;
  lineId: string | null;
  patternId: string | null;
  tripId: string | null;
  bearing: number | null;
  speed: number | null;
  timestamp: number | null;
}

export interface GatewayVehicleResponse {
  vehicle: GatewayVehicle;
  ageSeconds: number;
  stale: boolean;
}

// Empty means "talk to Carris directly", which is what this app did before the
// backend existed. Note this is inlined at build time by Vite, so switching it
// needs a rebuild, not just an env change.
export const GATEWAY_BASE = (import.meta.env.VITE_GATEWAY_BASE as string | undefined) || '';

export function isGatewayEnabled(): boolean {
  return GATEWAY_BASE.length > 0;
}

export function toVehicle(payload: GatewayVehicleResponse): Vehicle {
  const v = payload.vehicle;

  return {
    id: v.id,
    lat: v.lat,
    lon: v.lon,
    line_id: v.lineId ?? '',
    pattern_id: v.patternId ?? '',
    trip_id: v.tripId ?? '',
    bearing: v.bearing ?? 0,
    speed: v.speed ?? 0,
    timestamp: v.timestamp ?? undefined,
  };
}

export function gatewayVehicleUrl(
  base: string,
  vehicleId: string | null,
  lineId: string | null | undefined,
  patternId: string | null | undefined
): string | null {
  if (vehicleId) return `${base}/api/vehicles/${encodeURIComponent(vehicleId)}`;
  if (!lineId) return null;

  const path = `${base}/api/vehicles/by-line/${encodeURIComponent(lineId)}`;

  return patternId ? `${path}?patternId=${encodeURIComponent(patternId)}` : path;
}

export interface BackendState {
  answered: boolean;
  failed: boolean;
  connected: boolean;
}

// While the backend is still starting there is nothing to show, and the wait is
// ten to fifteen seconds. A backend that answered 404 counts as awake: it knows
// the bus is gone. Treating that as asleep would leave the app pulling the whole
// Carris feed forever, which is what the realtime work removed.
export function backendIsAwake(state: BackendState): boolean {
  return state.connected || (state.answered && !state.failed);
}
