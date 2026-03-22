export const CARRIS_METROPOLITANA_COLOR = '#FFCC00';
export const CARRIS_LISBOA_COLOR = '#008000';

export function isCarrisLisboa(lineId: string | null | undefined): boolean {
  if (!lineId) return false;
  return /^\d{3}$/.test(lineId.trim());
}

export function getOperatorColor(lineId: string | null | undefined): string {
  return isCarrisLisboa(lineId) ? CARRIS_LISBOA_COLOR : CARRIS_METROPOLITANA_COLOR;
}
