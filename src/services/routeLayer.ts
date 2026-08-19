export interface RouteLine {
  type: 'Feature';
  geometry: { type: 'LineString'; coordinates: [number, number][] };
  properties: Record<string, never>;
}

export interface RouteCollection {
  type: 'FeatureCollection';
  features: RouteLine[];
}

export function toRouteCollection(shape: number[][]): RouteCollection {
  const coordinates = shape
    .filter(point => point.length >= 2 && Number.isFinite(point[0]) && Number.isFinite(point[1]))
    .map(point => [point[0], point[1]] as [number, number]);

  if (coordinates.length < 2) return { type: 'FeatureCollection', features: [] };

  return {
    type: 'FeatureCollection',
    features: [{ type: 'Feature', geometry: { type: 'LineString', coordinates }, properties: {} }],
  };
}

export const ROUTE_SOURCE = 'route';
export const ROUTE_CASING_LAYER = 'route-casing';
export const ROUTE_LINE_LAYER = 'route-line';
export const ROUTE_ARROWS_LAYER = 'route-arrows';

export const routeCasingWidth = [
  'interpolate', ['linear'], ['zoom'],
  10, 6, 20, 16,
];

export const ROAD_LABEL_LAYERS = ['roadname_minor', 'roadname_sec', 'roadname_pri', 'roadname_major'];

export const ROUTE_ARROW_IMAGE = 'route-arrow';

export function arrowImage(size = 40): ImageData {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;

  const pen = canvas.getContext('2d');

  if (!pen) throw new Error('the browser gave no 2d context to draw the route arrow');

  pen.fillStyle = '#ffffff';
  pen.beginPath();
  pen.moveTo(size * 0.14, size * 0.06);
  pen.lineTo(size * 0.9, size * 0.5);
  pen.lineTo(size * 0.14, size * 0.94);
  pen.closePath();
  pen.fill();

  return pen.getImageData(0, 0, size, size);
}

export const routeArrowSize = [
  'interpolate', ['linear'], ['zoom'],
  10, 0.16, 20, 0.32,
];

export const routeArrowSpacing = [
  'interpolate', ['linear'], ['zoom'],
  10, 2, 20, 30,
];

export const routeLineWidth = [
  'interpolate', ['linear'], ['zoom'],
  10, 4, 20, 12,
];

export const WAYPOINTS_SOURCE = 'route-waypoints';
export const WAYPOINTS_LAYER = 'route-waypoints-circles';

export const waypointRadius = [
  'interpolate', ['linear'], ['zoom'],
  9, 1, 26, 15,
];

export const waypointStrokeWidth = [
  'interpolate', ['linear'], ['zoom'],
  9, 1, 26, 7,
];

export function toWaypointCollection(stops: { id: string; lat: string | number; lon: string | number }[]) {
  const features = stops
    .map(stop => ({ id: stop.id, lat: Number(stop.lat), lon: Number(stop.lon) }))
    .filter(stop => Number.isFinite(stop.lat) && Number.isFinite(stop.lon))
    .map((stop, index) => ({
      type: 'Feature' as const,
      id: index,
      geometry: { type: 'Point' as const, coordinates: [stop.lon, stop.lat] as [number, number] },
      properties: { stopId: stop.id },
    }));

  return { type: 'FeatureCollection' as const, features };
}
