import { describe, expect, it } from 'vitest';
import {
  describeAverage,
  describeFreshness,
  describeToleranceLabel,
  punctualityPercent,
  type RankedLine,
} from './reliability';

const line = (overrides: Partial<RankedLine>): RankedLine => ({
  lineId: '1005',
  passages: 100,
  withinTolerance: 100,
  late: 0,
  early: 0,
  averageLatenessSeconds: 0,
  firstServiceDate: '2026-08-18',
  lastServiceDate: '2026-08-19',
  ...overrides,
});

describe('punctualityPercent', () => {
  it('rounds to a whole percent', () => {
    expect(punctualityPercent(line({ passages: 90, withinTolerance: 6 }))).toBe(7);
  });

  it('does not divide by zero when a line has no passages', () => {
    expect(punctualityPercent(line({ passages: 0, withinTolerance: 0 }))).toBe(0);
  });
});

describe('describeAverage', () => {
  it('says early when the bus runs ahead of the timetable', () => {
    expect(describeAverage(-716)).toBe('12 min adiantada');
  });

  it('says late when it runs behind', () => {
    expect(describeAverage(280)).toBe('5 min atrasada');
  });

  it('does not call half a minute a delay', () => {
    expect(describeAverage(-20)).toBe('à tabela');
  });
});

describe('describeToleranceLabel', () => {
  it('turns the tolerance into minutes', () => {
    expect(describeToleranceLabel(300)).toBe('dentro de 5 min do horário');
  });
});

describe('describeFreshness', () => {
  const now = Date.parse('2026-08-19T12:00:00Z') / 1000;

  it('says nothing has been computed yet', () => {
    expect(describeFreshness(0, now)).toBe('ainda sem dados');
  });

  it('reads a summary from this morning as today', () => {
    expect(describeFreshness(Date.parse('2026-08-19T01:30:00Z') / 1000, now)).toBe('actualizado hoje');
  });

  it('counts the days when the job has not run', () => {
    expect(describeFreshness(Date.parse('2026-08-16T01:30:00Z') / 1000, now)).toBe('actualizado há 3 dias');
  });
});
