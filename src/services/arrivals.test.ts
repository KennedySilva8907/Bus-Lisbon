import { describe, expect, it } from 'vitest';
import { describeArrival } from './arrivals';
import type { ETA } from './api';

const eta = (overrides: Partial<ETA>): ETA => ({
  line_id: '1235',
  headsign: 'Cascais',
  estimated_arrival_unix: 1_755_380_000,
  scheduled_arrival_unix: 1_755_380_000,
  vehicle_id: '',
  pattern_id: '1235_0_2',
  ...overrides,
});

describe('describeArrival', () => {
  it('lets you follow an arrival that names its bus', () => {
    const arrival = describeArrival(eta({ vehicle_id: '41|814' }));

    expect(arrival.trackable).toBe(true);
    expect(arrival.state).toBe('boarding');
    expect(arrival.label).toBe('Em viagem');
  });

  it('refuses to follow a scheduled arrival, and says the bus is not out yet', () => {
    const arrival = describeArrival(eta({ vehicle_id: '' }));

    expect(arrival.trackable).toBe(false);
    expect(arrival.state).toBe('scheduled');
    expect(arrival.label).toContain('ainda sem autocarro');
  });

  it('refuses to follow an estimate that names no bus', () => {
    const arrival = describeArrival(
      eta({ vehicle_id: '', estimated_arrival_unix: 1_755_380_600, scheduled_arrival_unix: 1_755_380_000 })
    );

    expect(arrival.trackable).toBe(false);
    expect(arrival.state).toBe('predicted');
    expect(arrival.label).toContain('ainda sem autocarro');
  });

  it('calls an arrival scheduled when the estimate only repeats the timetable', () => {
    expect(describeArrival(eta({ vehicle_id: '' })).state).toBe('scheduled');
  });
});
