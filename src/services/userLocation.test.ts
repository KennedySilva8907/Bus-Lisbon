import { describe, expect, it } from 'vitest';
import { REFUSED_NOTICE, noticeFor, readFix, toLocationCollection } from './userLocation';

const fix = (latitude: number, longitude: number) =>
  ({ coords: { latitude, longitude } } as GeolocationPosition);

describe('readFix', () => {
  it('reads the position the browser gave us', () => {
    expect(readFix(fix(38.7223, -9.1393))).toEqual({ lon: -9.1393, lat: 38.7223 });
  });

  it('gives nothing when there is no position yet', () => {
    expect(readFix(null)).toBeNull();
    expect(readFix(undefined)).toBeNull();
  });

  it('refuses a reading with no usable numbers instead of putting me at zero', () => {
    expect(readFix(fix(NaN, -9.1393))).toBeNull();
    expect(readFix({ coords: {} } as GeolocationPosition)).toBeNull();
  });
});

describe('toLocationCollection', () => {
  it('puts the dot where the reading says', () => {
    const collection = toLocationCollection({ lon: -9.1393, lat: 38.7223 });

    expect(collection.features[0].geometry.coordinates).toEqual([-9.1393, 38.7223]);
  });

  it('draws nothing before the first reading', () => {
    expect(toLocationCollection(null).features).toEqual([]);
  });
});

describe('noticeFor', () => {
  it('explains that the block has to be undone in the phone settings', () => {
    expect(noticeFor({ code: 1 } as GeolocationPositionError)).toBe(REFUSED_NOTICE);
  });

  it('says something softer when the fix simply did not arrive', () => {
    expect(noticeFor({ code: 3 } as GeolocationPositionError)).not.toBe(REFUSED_NOTICE);
    expect(noticeFor(null)).not.toBe(REFUSED_NOTICE);
  });
});
