import { describe, expect, it } from 'vitest';
import { toPanelArrivals, type BoardEntry } from './stopBoard';

const now = 1787340000;

const entry = (overrides: Partial<BoardEntry> = {}): BoardEntry => ({
  lineId: '2753',
  patternId: '[BNA17]2753_0_1',
  headsign: 'Milharado',
  tripId: '[0277F][BNA17]2753_0_1|1|3|1835',
  vehicleId: '1257',
  scheduledUnix: now + 240,
  estimatedUnix: now + 300,
  isPast: false,
  isRealtime: true,
  ...overrides,
});

describe('toPanelArrivals', () => {
  it('gives a running bus its estimate and lets it be followed', () => {
    const [arrival] = toPanelArrivals([entry()]);

    expect(arrival.estimated_arrival_unix).toBe(now + 300);
    expect(arrival.scheduled_arrival_unix).toBe(now + 240);
    expect(arrival.vehicle_id).toBe('1257');
    expect(arrival.observed_arrival_unix).toBeNull();
  });

  it('turns a past entry into a passage, still worth following', () => {
    const [arrival] = toPanelArrivals([entry({ isPast: true, estimatedUnix: now - 600 })]);

    expect(arrival.observed_arrival_unix).toBe(now - 600);
    expect(arrival.estimated_arrival_unix).toBe(0);
    expect(arrival.vehicle_id).toBe('1257');
  });

  it('does not offer to follow a departure that has no bus yet', () => {
    const [arrival] = toPanelArrivals([entry({ isRealtime: false, estimatedUnix: 0 })]);

    expect(arrival.vehicle_id).toBe('');
    expect(arrival.estimated_arrival_unix).toBe(0);
    expect(arrival.scheduled_arrival_unix).toBe(now + 240);
  });

  it('carries the trip across so the map can find the right bus', () => {
    expect(toPanelArrivals([entry()])[0].trip_id).toBe('[0277F][BNA17]2753_0_1|1|3|1835');
  });

  it('keeps the order the API sent', () => {
    const board = [entry({ lineId: '1' }), entry({ lineId: '2' }), entry({ lineId: '3' })];

    expect(toPanelArrivals(board).map(a => a.line_id)).toEqual(['1', '2', '3']);
  });
});

describe('toPanelArrivals and what it will not claim', () => {
  it('gives no observed time to a passage that had no estimate', () => {
    const [arrival] = toPanelArrivals([
      entry({ isPast: true, isRealtime: false, estimatedUnix: 0, scheduledUnix: now - 900 }),
    ]);

    expect(arrival.observed_arrival_unix).toBeNull();
    expect(arrival.went_by_unix).toBe(now - 900);
  });

  it('gives an observed time only when the bus was actually seen', () => {
    const [arrival] = toPanelArrivals([
      entry({ isPast: true, isRealtime: true, estimatedUnix: now - 600, scheduledUnix: now - 900 }),
    ]);

    expect(arrival.observed_arrival_unix).toBe(now - 600);
    expect(arrival.went_by_unix).toBe(now - 600);
  });

  it('lets a bus that went by be followed', () => {
    const [arrival] = toPanelArrivals([
      entry({ isPast: true, isRealtime: true, estimatedUnix: now - 120, vehicleId: '2548' }),
    ]);

    expect(arrival.vehicle_id).toBe('2548');
  });
});
