import type { Vehicle } from './api';

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

export function backendIsAwake(state: BackendState): boolean {
  return state.connected || (state.answered && !state.failed);
}
