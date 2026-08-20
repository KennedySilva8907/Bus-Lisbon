export interface Corner {
  lon: number;
  lat: number;
}

export interface Framing {
  southWest: Corner;
  northEast: Corner;
}

export interface Insets {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export interface Box {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export const FRAME_MARGIN = 0.0012;
export const FRAME_TOP = 96;
export const FRAME_SIDE = 40;
export const FRAME_GAP = 56;
export const FRAME_MIN_VIEW = 140;
export const PANEL_SETTLE_MS = 340;
export const FRAME_MAX_ZOOM = 17;
export const FRAME_STOP_ZOOM = 16;
export const PANEL_ELEMENT_ID = 'stop-details-panel';

export function frameAround(points: Corner[]): Framing | null {
  const usable = points.filter(p => Number.isFinite(p.lon) && Number.isFinite(p.lat));

  if (usable.length === 0) return null;

  const lons = usable.map(p => p.lon);
  const lats = usable.map(p => p.lat);

  return {
    southWest: { lon: Math.min(...lons) - FRAME_MARGIN, lat: Math.min(...lats) - FRAME_MARGIN },
    northEast: { lon: Math.max(...lons) + FRAME_MARGIN, lat: Math.max(...lats) + FRAME_MARGIN },
  };
}

export function coveredHeight(map: Box, panel: Box | null): number {
  if (!panel) return 0;

  const sideBySide = panel.left >= map.right || panel.right <= map.left;

  if (sideBySide) return 0;

  const overlap = Math.min(map.bottom, panel.bottom) - Math.max(map.top, panel.top);

  return Math.max(0, Math.round(overlap));
}

export function framePadding(width: number, height: number, covered: number): Insets {
  const room = Math.max(0, height - FRAME_MIN_VIEW);
  const bottom = Math.min(covered + FRAME_GAP, room);
  const top = Math.min(FRAME_TOP, Math.max(0, room - bottom));
  const side = Math.min(FRAME_SIDE, Math.max(0, Math.floor((width - FRAME_MIN_VIEW) / 2)));

  return { top, bottom, left: side, right: side };
}

export function frameOffset(insets: Insets): [number, number] {
  return [(insets.left - insets.right) / 2, (insets.top - insets.bottom) / 2];
}
