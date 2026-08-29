import { describe, expect, it } from 'vitest';
import { arrivalsStopped } from './api-contract-check.mjs';

const now = 1787950000;
const minutesAgo = m => now - (m * 60);

describe('arrivalsStopped', () => {
  it('is happy while the times are recent', () => {
    expect(arrivalsStopped({ newestUnix: minutesAgo(5), nowUnix: now, busesOnTheRoad: 900 }))
      .toEqual({ stopped: false, behindMinutes: 5 });
  });

  it('is happy when the next arrival is still ahead of us', () => {
    expect(arrivalsStopped({ newestUnix: now + 600, nowUnix: now, busesOnTheRoad: 900 }))
      .toEqual({ stopped: false, behindMinutes: -10 });
  });

  it('calls it stopped when the times go old with buses on the road', () => {
    expect(arrivalsStopped({ newestUnix: minutesAgo(156), nowUnix: now, busesOnTheRoad: 772 }))
      .toEqual({ stopped: true, behindMinutes: 156 });
  });

  it('stays quiet at four in the morning, when the rows are old because nobody is out', () => {
    const verdict = arrivalsStopped({ newestUnix: minutesAgo(180), nowUnix: now, busesOnTheRoad: 12 });

    expect(verdict.stopped).toBe(false);
    expect(verdict.quiet).toBe(true);
  });

  it('does not fire on the minute the threshold is reached', () => {
    expect(arrivalsStopped({ newestUnix: minutesAgo(45), nowUnix: now, busesOnTheRoad: 900 }).stopped)
      .toBe(false);
    expect(arrivalsStopped({ newestUnix: minutesAgo(46), nowUnix: now, busesOnTheRoad: 900 }).stopped)
      .toBe(true);
  });

  it('says nothing when there was no time to read', () => {
    expect(arrivalsStopped({ newestUnix: NaN, nowUnix: now, busesOnTheRoad: 900 })).toBeNull();
    expect(arrivalsStopped({ newestUnix: -Infinity, nowUnix: now, busesOnTheRoad: 900 })).toBeNull();
  });
});
