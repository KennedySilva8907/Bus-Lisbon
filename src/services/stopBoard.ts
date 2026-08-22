export interface BoardEntry {
  lineId: string;
  patternId: string;
  headsign: string;
  tripId: string;
  vehicleId: string;
  scheduledUnix: number;
  estimatedUnix: number;
  isPast: boolean;
  isRealtime: boolean;
}

export interface PanelArrival {
  trip_id?: string;
  line_id: string;
  headsign: string;
  estimated_arrival_unix: number;
  scheduled_arrival_unix: number;
  observed_arrival_unix?: number | null;
  went_by_unix?: number | null;
  vehicle_id: string;
  pattern_id: string;
}

export function toPanelArrivals(board: BoardEntry[]): PanelArrival[] {
  return board.map(entry => ({
    trip_id: entry.tripId,
    line_id: entry.lineId,
    headsign: entry.headsign,
    estimated_arrival_unix: entry.isPast ? 0 : entry.estimatedUnix,
    scheduled_arrival_unix: entry.scheduledUnix,
    observed_arrival_unix: entry.isPast && entry.isRealtime ? entry.estimatedUnix : null,
    went_by_unix: entry.isPast ? entry.estimatedUnix || entry.scheduledUnix : null,
    vehicle_id: entry.isRealtime ? entry.vehicleId : '',
    pattern_id: entry.patternId,
  }));
}
