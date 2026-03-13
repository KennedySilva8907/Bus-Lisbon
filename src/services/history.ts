/**
 * Tracks historical arrival precision per line/stop.
 * Records the deviation between estimated and scheduled arrivals.
 * Over time, shows if a line typically delays at a given stop.
 */

interface ArrivalRecord {
  lineId: string;
  stopId: string;
  deviationSec: number; // estimated - scheduled (positive = delayed, negative = early)
  timestamp: number;
}

const STORAGE_KEY = 'bdt-arrival-history';
const MAX_RECORDS = 500;

function getRecords(): ArrivalRecord[] {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

function saveRecords(records: ArrivalRecord[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}

/**
 * Record the deviation between estimated and scheduled arrival.
 * Only records if both values are valid and different (i.e., there's real-time data).
 */
export function recordDeviation(lineId: string, stopId: string, estimatedUnix: number, scheduledUnix: number) {
  if (!estimatedUnix || !scheduledUnix || estimatedUnix === scheduledUnix) return;

  const deviationSec = estimatedUnix - scheduledUnix;
  const records = getRecords();

  // Avoid duplicate records for same line/stop/scheduled time
  const key = `${lineId}-${stopId}-${scheduledUnix}`;
  if (records.some(r => `${r.lineId}-${r.stopId}-${r.timestamp}` === key)) return;

  records.push({ lineId, stopId, deviationSec, timestamp: scheduledUnix });

  // Keep only last MAX_RECORDS, remove oldest
  if (records.length > MAX_RECORDS) {
    records.splice(0, records.length - MAX_RECORDS);
  }

  saveRecords(records);
}

/**
 * Get average delay for a line at a specific stop (or overall).
 * Returns null if not enough data (< 3 records).
 */
export function getLineReliability(lineId: string, stopId?: string): { avgDelaySec: number; count: number } | null {
  const records = getRecords().filter(r =>
    r.lineId === lineId && (!stopId || r.stopId === stopId)
  );

  if (records.length < 3) return null;

  const totalDeviation = records.reduce((sum, r) => sum + r.deviationSec, 0);
  return {
    avgDelaySec: Math.round(totalDeviation / records.length),
    count: records.length,
  };
}
