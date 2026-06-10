import useSWR from 'swr';

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
  line_id: string;
  headsign: string;
  estimated_arrival_unix: number;
  scheduled_arrival_unix: number;
  observed_arrival_unix?: number | null;
  vehicle_id: string;
  pattern_id: string;
}

// ── Stops (cached 1h, fetched once) ────────────────────

export function useStops() {
  const { data, error, isLoading } = useSWR<Stop[]>(`${API_BASE_URL}/stops`, fetcher, {
    revalidateOnFocus: false,
    revalidateIfStale: false,
    revalidateOnReconnect: false,
    dedupingInterval: 3600000,
    keepPreviousData: true,
  });
  
  return {
    stops: data || [],
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

export function useSingleVehicle(vehicleId: string | null, lineId?: string | null, patternId?: string | null) {
  const shouldFetch = !!(vehicleId || lineId);
  const { data, error, isLoading } = useSWR<Vehicle[]>(
    shouldFetch ? `${API_BASE_URL}/v2/vehicles` : null,
    fetcher,
    {
      refreshInterval: shouldFetch ? 8000 : 0,
      revalidateOnFocus: false,
      dedupingInterval: 7000,
      keepPreviousData: true,
    }
  );

  const liveVehicles = data ? data.filter(isLiveVehicle) : [];

  const vehicle = (vehicleId
    ? liveVehicles.find(v => v.id === vehicleId)
    : lineId
      ? liveVehicles.find(v => v.line_id === lineId && (!patternId || v.pattern_id === patternId))
      : null) || null;

  return { vehicle, isLoading, isError: error };
}

// ── ETAs ───────────────────────────────────────────────

// Tracks the wall-clock time of the last successful realtime fetch per stop.
// Module-scoped so the staleness check survives unmounts and is shared across
// any consumer of useStopETA for the same stop.
const lastETAFetchAt = new Map<string, number>();

export function useStopETA(stopId: string | null) {
  // v2 endpoint. The legacy `/stops/:id/realtime` path still answers but was
  // dropped from the v2 docs in favour of /arrivals/by_stop/:id (identical
  // payload). Stops/patterns/shapes intentionally stay on the unversioned
  // endpoints: their v2 variants currently return incomplete data (e.g.
  // /v2/stops ships empty `name`/`locality` for every stop).
  const key = stopId ? `${API_BASE_URL}/v2/arrivals/by_stop/${stopId}` : null;
  const { data, error, isLoading } = useSWR<ETA[]>(
    key,
    fetcher,
    {
      refreshInterval: 8000,
      revalidateOnFocus: true,
      revalidateOnReconnect: true,
      keepPreviousData: true,
      onSuccess: () => {
        if (key) lastETAFetchAt.set(key, Date.now());
      },
    }
  );

  // iOS Safari pauses background timers, so a "3min" prediction may have been
  // computed minutes ago. Null until the first fetch lands — the consumer is
  // expected to treat that as "fresh" rather than infinitely stale.
  const lastUpdated = (key && lastETAFetchAt.get(key)) || null;

  return { etas: data || [], lastUpdated, isLoading, isError: error };
}

// ── Pattern Shape (cached indefinitely) ────────────────

export function usePatternShape(patternId?: string | null) {
  const { data: patternData } = useSWR(
    patternId ? `${API_BASE_URL}/patterns/${patternId}` : null, 
    fetcher,
    { revalidateOnFocus: false, revalidateIfStale: false, dedupingInterval: 86400000 }
  );
  
  const shapeId = patternData?.shape_id;
  const { data: shapeData } = useSWR(
    shapeId ? `${API_BASE_URL}/shapes/${shapeId}` : null, 
    fetcher,
    { revalidateOnFocus: false, revalidateIfStale: false, dedupingInterval: 86400000 }
  );

  return {
    shape: shapeData?.geojson?.geometry?.coordinates || [],
    isLoading: !shapeData && !!patternId
  };
}
