import { useMemo } from 'react';
import useSWR from 'swr';
import { GATEWAY_BASE, backendIsAwake, isFleetVehicleId, isGatewayEnabled, toVehicle, gatewayVehicleUrl, type GatewayVehicleResponse } from './gateway';
import { freshestVehicle, useVehicleStream } from './realtime';
import { toPanelArrivals, type BoardEntry } from './stopBoard';

const API_BASE_URL = 'https://api.carrismetropolitana.pt';

const fetcher = async (url: string) => {
  const res = await fetch(url);
  const json = await res.json();
  if (json && Array.isArray(json)) return json;
  if (json && json.value && Array.isArray(json.value)) return json.value;
  if (json && json.data && Array.isArray(json.data)) return json.data;
  return json;
};

// ── Types ──────────────────────────────────────────────

export interface Stop {
  id: string;
  name: string;
  lat: string | number;
  lon: string | number;
  locality?: string;
  municipality_name?: string;
}

export interface Vehicle {
  id: string;
  lat: number;
  lon: number;
  line_id: string;
  speed: number;
  bearing: number;
  heading?: number;
  trip_id: string;
  pattern_id: string;
  // Unix seconds of the last GPS fix. Used to drop parked buses whose position
  // is hours old (see isLiveVehicle).
  timestamp?: number;
}

export interface ETA {
  trip_id?: string;
  line_id: string;
  headsign: string;
  estimated_arrival_unix: number;
  scheduled_arrival_unix: number;
  observed_arrival_unix?: number | null;
  vehicle_id: string;
  pattern_id: string;
}

// ── Stops (cached 1h, fetched once) ────────────────────

const NO_STOPS: Stop[] = [];
const NO_SHAPE: number[][] = [];

export function useStops() {
  const { data, error, isLoading } = useSWR<Stop[]>(`${API_BASE_URL}/stops`, fetcher, {
    revalidateOnFocus: false,
    revalidateIfStale: false,
    revalidateOnReconnect: false,
    dedupingInterval: 3600000,
    keepPreviousData: true,
  });
  
  return {
    stops: data || NO_STOPS,
    isLoading,
    isError: error
  };
}

// ── Single Vehicle (only fetches when a vehicle/line is selected) ─
// The /vehicles feed returns the WHOLE fleet (~1700 entries, ~1.2MB), not just
// the buses currently on the road. Most entries are parked vehicles whose last
// GPS fix is hours (sometimes days) old, plus a handful of metadata-only rows
// with no position and a malformed "|undefined" id. We pull the full feed and
// filter down to the live subset client-side — there is no server-side filter.

// Drop a bus from consideration when it can't represent a vehicle in service:
// missing/invalid coordinates, the known junk row, or a stale GPS fix. Without
// the freshness check a "track by line" tap could lock onto a parked bus and
// pin it to the map at a position from hours ago.
const VEHICLE_FRESH_WINDOW_SEC = 300;

function isLiveVehicle(v: Vehicle): boolean {
  if (!v.id || v.id === '|undefined') return false;
  const lat = Number(v.lat);
  const lon = Number(v.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
  if (lat === 0 && lon === 0) return false;
  if (v.timestamp && Date.now() / 1000 - v.timestamp > VEHICLE_FRESH_WINDOW_SEC) return false;
  return true;
}

export function pickFromFleet(
  fleet: Vehicle[] | undefined,
  vehicleId: string | null,
  lineId?: string | null,
  patternId?: string | null
): Vehicle | null {
  const live = fleet ? fleet.filter(isLiveVehicle) : [];

  if (vehicleId) {
    return live.find(vehicle => vehicle.id === vehicleId) ?? null;
  }

  if (lineId) {
    return live.find(vehicle =>
      vehicle.line_id === lineId && (!patternId || vehicle.pattern_id === patternId)) ?? null;
  }

  return null;
}

export function useSingleVehicle(vehicleId: string | null, lineId?: string | null, patternId?: string | null, tripId?: string | null) {
  const shouldFetch = !!(vehicleId || lineId);
  const gatewayUrl = isGatewayEnabled()
    ? gatewayVehicleUrl(GATEWAY_BASE, vehicleId, lineId, patternId, tripId)
    : null;

  const trackedId = isFleetVehicleId(vehicleId) ? vehicleId : null;

  const stream = useVehicleStream(
    gatewayUrl ? trackedId : null,
    gatewayUrl ? lineId : null,
    patternId
  );

  const gateway = useSWR<GatewayVehicleResponse | null>(
    gatewayUrl,
    async (url: string) => {
      const res = await fetch(url);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`gateway ${res.status}`);
      return res.json();
    },
    {
      refreshInterval: stream.connected ? 0 : 8000,
      revalidateOnFocus: false,
      dedupingInterval: 7000,
      keepPreviousData: true,
    }
  );

  const backendAwake = gatewayUrl !== null && backendIsAwake({
    answered: !gateway.isLoading,
    failed: !!gateway.error,
    connected: stream.connected,
  });

  const fleet = useSWR<Vehicle[]>(
    shouldFetch && !backendAwake ? `${API_BASE_URL}/v2/vehicles` : null,
    fetcher,
    { refreshInterval: 8000, revalidateOnFocus: false, dedupingInterval: 7000, keepPreviousData: true }
  );

  const fromFeed = pickFromFleet(fleet.data, vehicleId, lineId, patternId);

  if (gatewayUrl) {
    const fromBackend = freshestVehicle(
      stream.vehicle,
      stream.connected,
      gateway.data ? toVehicle(gateway.data) : null
    );

    return {
      vehicle: fromBackend ?? fromFeed,
      isLoading: !fromBackend && !fromFeed && gateway.isLoading,
      isError: gateway.error,
    };
  }

  return { vehicle: fromFeed, isLoading: fleet.isLoading, isError: fleet.error };
}

// ── ETAs ───────────────────────────────────────────────

// Tracks the wall-clock time of the last successful realtime fetch per stop.
// Module-scoped so the staleness check survives unmounts and is shared across
// any consumer of useStopETA for the same stop.
const lastETAFetchAt = new Map<string, number>();

const NO_ETAS: ETA[] = [];



export function useStopETA(stopId: string | null) {
  const key = stopId && isGatewayEnabled() ? `${GATEWAY_BASE}/api/arrivals/by-stop/${stopId}` : null;
  const { data: board, error, isLoading } = useSWR<BoardEntry[]>(
    key,
    fetcher,
    {
      refreshInterval: 15000,
      revalidateOnFocus: true,
      revalidateOnReconnect: true,
      keepPreviousData: true,
      onSuccess: () => {
        if (key) lastETAFetchAt.set(key, Date.now());
      },
    }
  );

  const data = useMemo<ETA[]>(
    () => (board && board.length ? toPanelArrivals(board) : NO_ETAS),
    [board]
  );

  const lastUpdated = (key && lastETAFetchAt.get(key)) || null;

  return { etas: data, lastUpdated, isLoading, isError: error };
}

// ── Pattern Shape (cached indefinitely) ────────────────

export interface PatternStop {
  stop: Stop;
  stop_sequence: number;
}

export function usePattern(patternId?: string | null) {
  const { data } = useSWR(
    patternId ? `${API_BASE_URL}/patterns/${patternId}` : null,
    fetcher,
    { revalidateOnFocus: false, revalidateIfStale: false, dedupingInterval: 86400000 }
  );

  const shapeId = data?.shape_id;
  const { data: shapeData } = useSWR(
    shapeId ? `${API_BASE_URL}/shapes/${shapeId}` : null,
    fetcher,
    { revalidateOnFocus: false, revalidateIfStale: false, dedupingInterval: 86400000 }
  );

  return useMemo(() => ({
    shape: (shapeData?.geojson?.geometry?.coordinates || NO_SHAPE) as number[][],
    colour: (data?.color as string | undefined) || '#E53935',
    textColour: (data?.text_color as string | undefined) || '#FFFFFF',
    stops: ((data?.path || []) as PatternStop[]).map(entry => entry.stop).filter(Boolean),
  }), [data, shapeData]);
}

