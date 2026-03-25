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

// ── Single Vehicle (only fetches when vehicleId is set) ─
// Uses the LIGHTER v1 endpoint (~400KB vs 1.2MB from v2)

export function useSingleVehicle(vehicleId: string | null, lineId?: string | null, patternId?: string | null) {
  const shouldFetch = !!(vehicleId || lineId);
  const { data, error, isLoading } = useSWR<Vehicle[]>(
    shouldFetch ? `${API_BASE_URL}/v2/vehicles` : null,
    fetcher,
    {
      refreshInterval: shouldFetch ? 5000 : 0,
      revalidateOnFocus: false,
      dedupingInterval: 4000,
      keepPreviousData: true,
    }
  );

  const vehicle = data
    ? (vehicleId
        ? data.find(v => v.id === vehicleId)
        : lineId
          ? data.find(v => v.line_id === lineId && (!patternId || v.pattern_id === patternId))
          : null) || null
    : null;

  return { vehicle, isLoading, isError: error };
}

// ── ETAs ───────────────────────────────────────────────

export function useStopETA(stopId: string | null) {
  const { data, error, isLoading } = useSWR<ETA[]>(
    stopId ? `${API_BASE_URL}/stops/${stopId}/realtime` : null, 
    fetcher,
    { 
      refreshInterval: 8000,
      revalidateOnFocus: false,
      keepPreviousData: true,
    }
  );
  
  return { etas: data || [], isLoading, isError: error };
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
