export const LOCATION_SOURCE = 'user-location';
export const LOCATION_HALO_LAYER = 'user-location-halo';
export const LOCATION_DOT_LAYER = 'user-location-dot';

export const LOCATION_HALO_RADIUS = 14;
export const LOCATION_DOT_RADIUS = 6;
export const LOCATION_ZOOM = 15;
export const LOCATED_ONCE_KEY = 'bdt-located';

export interface Fix {
  lon: number;
  lat: number;
}

export function readFix(position: GeolocationPosition | null | undefined): Fix | null {
  const lat = Number(position?.coords?.latitude);
  const lon = Number(position?.coords?.longitude);

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  return { lon, lat };
}

export function toLocationCollection(fix: Fix | null) {
  return {
    type: 'FeatureCollection' as const,
    features: fix
      ? [{
          type: 'Feature' as const,
          geometry: { type: 'Point' as const, coordinates: [fix.lon, fix.lat] as [number, number] },
          properties: {},
        }]
      : [],
  };
}
