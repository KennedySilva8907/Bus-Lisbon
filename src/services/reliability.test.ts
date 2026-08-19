import { describe, expect, it } from 'vitest';
import {
  describeAverage,
  describeFreshness,
  describeSpan,
  describeToleranceLabel,
  punctualityPercent,
  splitByFavourites,
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

describe('describeSpan', () => {
  it('counts both ends of the window', () => {
    expect(describeSpan('2026-08-18', '2026-08-19')).toBe('em 2 dias');
  });

  it('says a single day when the line was only seen once', () => {
    expect(describeSpan('2026-08-19', '2026-08-19')).toBe('num dia');
  });

  it('handles a full window', () => {
    expect(describeSpan('2026-07-21', '2026-08-19')).toBe('em 30 dias');
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
    expect(describeFreshness(0, now)).toBe('Ainda sem dados');
  });

  it('reads a summary from this morning as today', () => {
    expect(describeFreshness(Date.parse('2026-08-19T01:30:00Z') / 1000, now)).toBe('Actualizado hoje');
  });

  it('counts the days when the job has not run', () => {
    expect(describeFreshness(Date.parse('2026-08-16T01:30:00Z') / 1000, now)).toBe('Actualizado há 3 dias');
  });
});

describe('splitByFavourites', () => {
  const ranked = [line({ lineId: '1005' }), line({ lineId: '1702' }), line({ lineId: '2222' })];

  it('pulls the chosen lines out and keeps the rest in order', () => {
    const split = splitByFavourites(ranked, ['2222', '1005']);

    expect(split.mine.map(l => l.lineId)).toEqual(['1005', '2222']);
    expect(split.rest.map(l => l.lineId)).toEqual(['1702']);
  });

  it('reports a chosen line that has no number yet instead of dropping it', () => {
    const split = splitByFavourites(ranked, ['1005', '9999']);

    expect(split.missing).toEqual(['9999']);
    expect(split.mine.map(l => l.lineId)).toEqual(['1005']);
  });

  it('leaves everything in the rest when nothing is chosen', () => {
    const split = splitByFavourites(ranked, []);

    expect(split.mine).toEqual([]);
    expect(split.missing).toEqual([]);
    expect(split.rest).toHaveLength(3);
  });
});
