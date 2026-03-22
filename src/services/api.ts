import useSWR from 'swr';
import { useMemo } from 'react';

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
  operator?: 'carris_metropolitana' | 'carris_lisboa';
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

// ── Carris Lisboa Stops (fetched from GTFS at runtime) ──

const CARRIS_GTFS_URL = 'https://gateway.carris.pt/gateway/gtfs/api/v2.11/GTFS';
const CL_CACHE_KEY = 'bdt-carris-lisboa-stops';
const CL_CACHE_TTL = 7 * 24 * 3600 * 1000; // 7 days

async function fetchCarrisLisboaStops(): Promise<Stop[]> {
  // Check localStorage cache first
  try {
    const cached = localStorage.getItem(CL_CACHE_KEY);
    if (cached) {
      const { data, ts } = JSON.parse(cached);
      if (Date.now() - ts < CL_CACHE_TTL && Array.isArray(data) && data.length > 0) {
        return data;
      }
    }
  } catch { /* ignore cache errors */ }

  // Also try bundled static file as fallback
  try {
    const staticRes = await fetch('/data/carris-lisboa-stops.json');
    if (staticRes.ok) {
      const staticData = await staticRes.json();
      if (Array.isArray(staticData) && staticData.length > 0) {
        return staticData;
      }
    }
  } catch { /* continue to GTFS fetch */ }

  // Fetch GTFS zip and parse stops.txt
  try {
    const JSZip = (await import('jszip')).default;
    const res = await fetch(CARRIS_GTFS_URL);
    if (!res.ok) return [];
    const zipData = await res.arrayBuffer();
    const zip = await JSZip.loadAsync(zipData);
    const stopsFile = zip.file('stops.txt');
    if (!stopsFile) return [];
    const stopsCSV = await stopsFile.async('string');
    const stops = parseStopsCSV(stopsCSV);

    // Cache in localStorage
    try {
      localStorage.setItem(CL_CACHE_KEY, JSON.stringify({ data: stops, ts: Date.now() }));
    } catch { /* storage full, ignore */ }

    return stops;
  } catch {
    return [];
  }
}

function parseStopsCSV(csv: string): Stop[] {
  const lines = csv.trim().split('\n');
  if (lines.length < 2) return [];
  const header = lines[0].replace(/^\uFEFF/, '').split(',').map(h => h.trim().replace(/"/g, ''));
  const idIdx = header.indexOf('stop_id');
  const nameIdx = header.indexOf('stop_name');
  const latIdx = header.indexOf('stop_lat');
  const lonIdx = header.indexOf('stop_lon');
  if (idIdx < 0 || nameIdx < 0 || latIdx < 0 || lonIdx < 0) return [];

  const stops: Stop[] = [];
  for (let i = 1; i < lines.length; i++) {
    const vals = parseCSVLine(lines[i]);
    const lat = parseFloat(vals[latIdx]);
    const lon = parseFloat(vals[lonIdx]);
    if (isNaN(lat) || isNaN(lon)) continue;
    stops.push({
      id: `CL_${(vals[idIdx] || '').replace(/"/g, '')}`,
      name: (vals[nameIdx] || '').replace(/"/g, ''),
      lat,
      lon,
      operator: 'carris_lisboa',
    });
  }
  return stops;
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (const char of line) {
    if (char === '"') { inQuotes = !inQuotes; }
    else if (char === ',' && !inQuotes) { result.push(current); current = ''; }
    else { current += char; }
  }
  result.push(current);
  return result;
}

export function useCarrisLisboaStops() {
  const { data, error, isLoading } = useSWR<Stop[]>(
    'carris-lisboa-stops',
    fetchCarrisLisboaStops,
    {
      revalidateOnFocus: false,
      revalidateIfStale: false,
      revalidateOnReconnect: false,
      dedupingInterval: 86400000,
      keepPreviousData: true,
    }
  );

  return {
    stops: data || [],
    isLoading,
    isError: error,
  };
}

// ── Combined stops from both operators ────────────────

export function useAllStops() {
  const { stops: cmStops, isLoading: cmLoading } = useStops();
  const { stops: clStops, isLoading: clLoading } = useCarrisLisboaStops();

  const allStops = useMemo(() => {
    if (cmStops.length === 0 && clStops.length === 0) return [];
    const tagged: Stop[] = [
      ...cmStops.map(s => ({ ...s, operator: 'carris_metropolitana' as const })),
      ...clStops.map(s => ({ ...s, operator: 'carris_lisboa' as const })),
    ];
    return tagged;
  }, [cmStops, clStops]);

  return {
    stops: allStops,
    isLoading: cmLoading || clLoading,
  };
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
