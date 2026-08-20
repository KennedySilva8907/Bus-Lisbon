import type { Vehicle } from './api';

export const VEHICLE_SOURCE = 'vehicle';
export const VEHICLE_LAYER = 'vehicle-marker';
export const VEHICLE_GLOW_LAYER = 'vehicle-glow';
export const VEHICLE_IMAGE = 'bus-marker';
export const VEHICLE_IMAGE_URL = '/bus-marker.svg';
export const VEHICLE_IMAGE_WIDTH = 44;
export const VEHICLE_IMAGE_HEIGHT = 96;
export const VEHICLE_IMAGE_RATIO = 2;

export const SLIDE_MS = 1000;

export const vehicleSize = [
  'interpolate', ['linear'], ['zoom'],
  10, 0.34,
  13, 0.52,
  15, 0.68,
  17, 0.86,
  20, 1.05,
];

export const vehicleGlowRadius = [
  'interpolate', ['linear'], ['zoom'],
  10, 15,
  13, 22,
  15, 28,
  17, 35,
  20, 44,
];

export interface Placed {
  lon: number;
  lat: number;
  bearing: number;
}

export function placeVehicle(vehicle: Vehicle | null): Placed | null {
  if (!vehicle) return null;

  const lon = Number(vehicle.lon);
  const lat = Number(vehicle.lat);

  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;

  return { lon, lat, bearing: Number(vehicle.bearing) || 0 };
}

export function easeOut(fraction: number): number {
  const clamped = Math.min(1, Math.max(0, fraction));

  return 1 - Math.pow(1 - clamped, 3);
}

export function slideBetween(from: Placed, to: Placed, fraction: number): Placed {
  const eased = easeOut(fraction);

  return {
    lon: from.lon + (to.lon - from.lon) * eased,
    lat: from.lat + (to.lat - from.lat) * eased,
    bearing: to.bearing,
  };
}

export function tooFarToSlide(from: Placed, to: Placed): boolean {
  return Math.abs(to.lon - from.lon) > 0.02 || Math.abs(to.lat - from.lat) > 0.02;
}

export function toVehicleCollection(placed: Placed | null) {
  return {
    type: 'FeatureCollection' as const,
    features: placed
      ? [{
          type: 'Feature' as const,
          geometry: { type: 'Point' as const, coordinates: [placed.lon, placed.lat] as [number, number] },
          properties: { bearing: placed.bearing },
        }]
      : [],
  };
}
