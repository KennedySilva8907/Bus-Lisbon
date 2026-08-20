import { setWorkerUrl } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';

setWorkerUrl(workerUrl);

const DARK = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';
const LIGHT = 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json';

export function basemapStyle(isDark: boolean): string {
  return isDark ? DARK : LIGHT;
}

export const LISBON = { lon: -9.1393, lat: 38.7223, zoom: 12 };
