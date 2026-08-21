import type { FeedEta } from './etaFeed';

export interface StopSchedule {
  lineId: string;
  patternId: string;
  headsign: string;
  departure: string;
  scheduledUnix: number;
}

export interface MergedArrival {
  line_id: string;
  headsign: string;
  estimated_arrival_unix: number;
  scheduled_arrival_unix: number;
  vehicle_id: string;
  pattern_id: string;
}

function keyOf(patternId: string, departure: string): string {
  return `${patternId}|${departure}`;
}

export function mergeArrivals(
  live: FeedEta[],
  scheduled: StopSchedule[],
  headsigns: Record<string, string>
): MergedArrival[] {
  const timetable = new Map<string, StopSchedule>();

  for (const call of scheduled) {
    timetable.set(keyOf(call.patternId, call.departure), call);
  }

  const running = new Set<string>();
  const merged: MergedArrival[] = [];

  for (const bus of live) {
    const key = keyOf(bus.agencyPatternId, bus.departure);
    const call = timetable.get(key);

    running.add(key);

    merged.push({
      line_id: bus.lineId,
      headsign: call?.headsign || headsigns[bus.patternId] || '',
      estimated_arrival_unix: bus.estimatedArrivalUnix,
      scheduled_arrival_unix: call?.scheduledUnix ?? 0,
      vehicle_id: bus.vehicleId,
      pattern_id: bus.patternId,
    });
  }

  for (const call of scheduled) {
    if (running.has(keyOf(call.patternId, call.departure))) continue;

    merged.push({
      line_id: call.lineId,
      headsign: call.headsign,
      estimated_arrival_unix: 0,
      scheduled_arrival_unix: call.scheduledUnix,
      vehicle_id: '',
      pattern_id: call.patternId,
    });
  }

  return merged.sort(
    (a, b) =>
      (a.estimated_arrival_unix || a.scheduled_arrival_unix) -
      (b.estimated_arrival_unix || b.scheduled_arrival_unix)
  );
}
