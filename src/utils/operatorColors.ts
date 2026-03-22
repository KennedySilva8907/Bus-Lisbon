export const CARRIS_METROPOLITANA_COLOR = '#FFCC00';
export const CARRIS_LISBOA_COLOR = '#008000';

/** Detect Carris Lisboa by line_id (3-digit or alphanumeric like 65B) */
export function isCarrisLisboa(lineId: string | null | undefined): boolean {
  if (!lineId) return false;
  const id = lineId.trim();
  // 3-digit numbers (701, 723) or digit+letter combos (65B, 73B, 12E)
  return /^\d{1,3}[A-Z]?$/i.test(id);
}

/** Detect Carris Lisboa stop by stop ID prefix (CL_ for bundled data) */
export function isCarrisLisboaStop(stopId: string | null | undefined): boolean {
  if (!stopId) return false;
  return stopId.startsWith('CL_');
}

export function getOperatorColor(lineId: string | null | undefined): string {
  return isCarrisLisboa(lineId) ? CARRIS_LISBOA_COLOR : CARRIS_METROPOLITANA_COLOR;
}

export function getStopOperatorColor(stopId: string | null | undefined, lineId?: string | null): string {
  if (lineId) return getOperatorColor(lineId);
  if (isCarrisLisboaStop(stopId)) return CARRIS_LISBOA_COLOR;
  return CARRIS_METROPOLITANA_COLOR;
}
