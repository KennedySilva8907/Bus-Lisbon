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

export type LocationPermission = 'granted' | 'prompt' | 'denied' | 'unknown';

export async function readPermission(): Promise<LocationPermission> {
  if (!navigator.permissions?.query) return 'unknown';

  try {
    const status = await navigator.permissions.query({ name: 'geolocation' as PermissionName });

    return status.state as LocationPermission;
  } catch {
    return 'unknown';
  }
}

export const REFUSED_NOTICE =
  'A localização está bloqueada. Vai às Definições do telemóvel, procura o Bus Lisbon e liga a Localização.';

export function noticeFor(error: GeolocationPositionError | null): string {
  if (error?.code === 1) return REFUSED_NOTICE;

  return 'Não consegui apanhar a tua localização. Tenta outra vez daqui a pouco.';
}
