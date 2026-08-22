import { describe, expect, it } from 'vitest';
import { mergeArrivals, type StopSchedule } from './mergeArrivals';
import type { FeedEta } from './etaFeed';

const now = 1787340000;

const bus = (overrides: Partial<FeedEta> = {}): FeedEta => ({
  tripId: '[0277F][BNA17]2753_0_1|150|3|1835',
  lineId: '2753',
  patternId: '2753_0_1',
  agencyPatternId: '[BNA17]2753_0_1',
  departure: '1835',
  vehicleId: '1257',
  stopSequence: 5,
  estimatedArrivalUnix: now + 300,
  ...overrides,
});

const call = (overrides: Partial<StopSchedule> = {}): StopSchedule => ({
  lineId: '2753',
  patternId: '[BNA17]2753_0_1',
  headsign: 'Milharado',
  departure: '1835',
  scheduledUnix: now + 240,
  ...overrides,
});

describe('mergeArrivals', () => {
  it('gives a running bus the time it was supposed to arrive', () => {
    const merged = mergeArrivals([bus()], [call()], {});

    expect(merged).toHaveLength(1);
    expect(merged[0].vehicle_id).toBe('1257');
    expect(merged[0].scheduled_arrival_unix).toBe(now + 240);
    expect(merged[0].estimated_arrival_unix).toBe(now + 300);
  });

  it('takes the destination from the timetable', () => {
    expect(mergeArrivals([bus()], [call()], {})[0].headsign).toBe('Milharado');
  });

  it('falls back to the pattern lookup when the timetable has no match', () => {
    const merged = mergeArrivals([bus({ departure: '9999' })], [call()], { '2753_0_1': 'Bucelas' });
    const running = merged.find(m => m.vehicle_id === '1257')!;

    expect(running.headsign).toBe('Bucelas');
    expect(running.scheduled_arrival_unix).toBe(0);
  });

  it('keeps departures that have not left yet', () => {
    const merged = mergeArrivals([], [call()], {});

    expect(merged).toHaveLength(1);
    expect(merged[0].vehicle_id).toBe('');
    expect(merged[0].estimated_arrival_unix).toBe(0);
  });

  it('does not list a bus twice when it is both running and timetabled', () => {
    expect(mergeArrivals([bus()], [call()], {})).toHaveLength(1);
  });

  it('puts them in the order they arrive, whichever kind they are', () => {
    const merged = mergeArrivals(
      [bus({ departure: '1900', estimatedArrivalUnix: now + 600 })],
      [call({ departure: '1835', scheduledUnix: now + 120 })],
      {}
    );

    expect(merged.map(m => m.vehicle_id)).toEqual(['', '1257']);
  });

  it('tells apart two departures of the same pattern', () => {
    const merged = mergeArrivals(
      [bus({ departure: '1835' })],
      [call({ departure: '1835' }), call({ departure: '1905', scheduledUnix: now + 1800 })],
      {}
    );

    expect(merged).toHaveLength(2);
    expect(merged.filter(m => m.vehicle_id === '1257')).toHaveLength(1);
  });
});
