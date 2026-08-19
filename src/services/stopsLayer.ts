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
export const SELECTED_DOT_LAYER = 'stops-selected-dot';
export const SELECTED_PIN_IMAGE = 'stop-pin';
export const SELECTED_PIN_URL = '/stop-pin.svg';
export const stopRadius = [
  'interpolate', ['linear'], ['zoom'],
  9, 1,
  26, 20,
];

export const mutedStopRadius = [
  'interpolate', ['linear'], ['zoom'],
  9, 1,
  26, 10,
];

export const mutedStopStrokeWidth = [
  'interpolate', ['linear'], ['zoom'],
  9, 0.01,
  26, 3,
];

export const stopStrokeWidth = [
  'interpolate', ['linear'], ['zoom'],
  9, 0.01,
  26, 7,
];

export const selectedDotRadius = [
  'interpolate', ['linear'], ['zoom'],
  9, 3,
  26, 22,
];

export const selectedPinSize = [
  'interpolate', ['linear'], ['zoom'],
  9, 0.28,
  16, 0.5,
  22, 0.7,
];
