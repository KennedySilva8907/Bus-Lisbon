import type { Stop } from './api';

export interface StopFeature {
  type: 'Feature';
  id: number;
  geometry: { type: 'Point'; coordinates: [number, number] };
  properties: { stopId: string };
}

export interface StopCollection {
  type: 'FeatureCollection';
  features: StopFeature[];
}

function coordinate(value: string | number): number | null {
  if (typeof value === 'string' && value.trim() === '') return null;

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : null;
}

export function toStopCollection(stops: Stop[]): StopCollection {
  const features: StopFeature[] = [];

  for (const stop of stops) {
    const lat = coordinate(stop.lat);
    const lon = coordinate(stop.lon);

    if (lat === null || lon === null) continue;

    features.push({
      type: 'Feature',
      id: features.length,
      geometry: { type: 'Point', coordinates: [lon, lat] },
      properties: { stopId: stop.id },
    });
  }

  return { type: 'FeatureCollection', features };
}

export const STOPS_SOURCE = 'stops';
export const STOPS_LAYER = 'stops-circles';
export const SELECTED_LAYER = 'stops-selected';
export const STOPS_MIN_ZOOM = 13;

export const stopRadius = [
  'interpolate',
  ['linear'],
  ['zoom'],
  13, 5,
  14, 6,
  15, 8,
  16, 10,
  18, 12,
];

export const selectedStopRadius = [
  'interpolate',
  ['linear'],
  ['zoom'],
  13, 11,
  14, 12,
  15, 14,
  16, 16,
  18, 18,
];
