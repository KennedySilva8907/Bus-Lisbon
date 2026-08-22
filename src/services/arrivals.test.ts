import { describe, expect, it } from 'vitest';
import { describeArrival, describePassage, describePunctuality, wentByAt } from './arrivals';
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
  it('lets you follow an arrival that names its bus and says when it gets here', () => {
    const arrival = describeArrival(eta({ vehicle_id: '41|814', estimated_arrival_unix: 1_755_380_180 }));

    expect(arrival.trackable).toBe(true);
    expect(arrival.state).toBe('boarding');
    expect(arrival.label).toBe('Em viagem');
  });

  it('will not say a bus is on its way here just because it is out on the road', () => {
    const arrival = describeArrival(eta({ vehicle_id: '41|814', estimated_arrival_unix: 0 }));

    expect(arrival.trackable).toBe(true);
    expect(arrival.state).toBe('onTheWay');
    expect(arrival.label).toBe('Agendado · autocarro a caminho');
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

describe('describePunctuality', () => {
  const past = (overrides: Partial<ETA>): ETA => eta({
    scheduled_arrival_unix: 1787340000,
    ...overrides,
  });

  it('says nothing about a passage nobody saw', () => {
    expect(describePunctuality(past({ observed_arrival_unix: null }))).toBeNull();
    expect(describePunctuality(past({}))).toBeNull();
  });

  it('calls a bus that went by early Adiantado', () => {
    expect(describePunctuality(past({ observed_arrival_unix: 1787340000 - 180 })))
      .toEqual({ label: 'Adiantado', tone: 'early' });
  });

  it('gives the minutes for a bus that went by late', () => {
    expect(describePunctuality(past({ observed_arrival_unix: 1787340000 + 300 })))
      .toEqual({ label: '+5min', tone: 'late' });
  });

  it('calls the rest Pontual', () => {
    expect(describePunctuality(past({ observed_arrival_unix: 1787340000 })))
      .toEqual({ label: 'Pontual', tone: 'onTime' });
    expect(describePunctuality(past({ observed_arrival_unix: 1787340000 + 90 })))
      .toEqual({ label: 'Pontual', tone: 'onTime' });
  });
});

describe('wentByAt', () => {
  it('uses the time the board says it went by', () => {
    expect(wentByAt(eta({ went_by_unix: 1787340111, observed_arrival_unix: 1787340222 }))).toBe(1787340111);
  });

  it('falls back to the observed time when the board did not say', () => {
    expect(wentByAt(eta({ observed_arrival_unix: 1787340222 }))).toBe(1787340222);
  });

  it('says nothing for an arrival that has not happened', () => {
    expect(wentByAt(eta({}))).toBeNull();
  });
});

describe('describePassage', () => {
  it('says the bus is still out there', () => {
    expect(describePassage(eta({ trip_running: true })))
      .toEqual({ label: 'Ainda em percurso', tone: 'running' });
  });

  it('says the trip is over', () => {
    expect(describePassage(eta({ trip_running: false })))
      .toEqual({ label: 'Terminou o percurso', tone: 'finished' });
  });
});
