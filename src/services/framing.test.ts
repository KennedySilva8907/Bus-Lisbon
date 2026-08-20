import { describe, expect, it } from 'vitest';
import {
  FRAME_GAP,
  FRAME_MIN_ZOOM,
  FRAME_MARGIN,
  FRAME_MIN_VIEW,
  FRAME_TOP,
  coveredHeight,
  frameAround,
  framePadding,
  tooWideToFrame,
} from './framing';

const mapBox = { top: 0, bottom: 800, left: 0, right: 400 };

describe('frameAround', () => {
  it('wraps both points with a margin so neither sits on the edge', () => {
    const frame = frameAround([{ lon: -9.2, lat: 38.7 }, { lon: -9.1, lat: 38.75 }])!;

    expect(frame.southWest.lon).toBeCloseTo(-9.2 - FRAME_MARGIN, 6);
    expect(frame.northEast.lat).toBeCloseTo(38.75 + FRAME_MARGIN, 6);
  });

  it('still gives a frame when there is only one point', () => {
    const frame = frameAround([{ lon: -9.2, lat: 38.7 }])!;

    expect(frame.northEast.lon).toBeGreaterThan(frame.southWest.lon);
    expect(frame.northEast.lat).toBeGreaterThan(frame.southWest.lat);
  });

  it('ignores a point with no usable position', () => {
    const frame = frameAround([{ lon: -9.2, lat: 38.7 }, { lon: NaN, lat: 38.9 }])!;

    expect(frame.northEast.lat).toBeCloseTo(38.7 + FRAME_MARGIN, 6);
  });

  it('gives nothing when there is nothing to frame', () => {
    expect(frameAround([])).toBeNull();
    expect(frameAround([{ lon: NaN, lat: NaN }])).toBeNull();
  });
});

describe('coveredHeight', () => {
  it('measures the sheet sitting over the bottom of the map', () => {
    expect(coveredHeight(mapBox, { top: 360, bottom: 800, left: 0, right: 400 })).toBe(440);
  });

  it('counts only the handle when the sheet is swiped down', () => {
    expect(coveredHeight(mapBox, { top: 720, bottom: 1160, left: 0, right: 400 })).toBe(80);
  });

  it('ignores a panel parked beside the map instead of over it', () => {
    expect(coveredHeight({ ...mapBox, right: 1000 }, { top: 0, bottom: 800, left: 1000, right: 1384 })).toBe(0);
  });

  it('is nothing when no panel is open', () => {
    expect(coveredHeight(mapBox, null)).toBe(0);
  });
});

describe('framePadding', () => {
  it('lifts the frame clear of whatever covers the bottom', () => {
    expect(framePadding(400, 800, 440).bottom).toBe(440 + FRAME_GAP);
  });

  it('still leaves room for the search bar on top', () => {
    expect(framePadding(400, 800, 440).top).toBe(FRAME_TOP);
  });

  it('uses the whole map when nothing covers it', () => {
    expect(framePadding(400, 800, 0)).toEqual({ top: FRAME_TOP, bottom: FRAME_GAP, left: 40, right: 40 });
  });

  it('gives up the top strip before it gives up the visible band', () => {
    const padding = framePadding(400, 800, 700);

    expect(padding.top).toBe(0);
    expect(800 - padding.top - padding.bottom).toBeGreaterThanOrEqual(FRAME_MIN_VIEW);
  });

  it('never asks for more padding than the map has room for', () => {
    const padding = framePadding(320, 400, 5000);

    expect(padding.top + padding.bottom).toBeLessThanOrEqual(400 - FRAME_MIN_VIEW);
    expect(padding.left + padding.right).toBeLessThanOrEqual(320 - FRAME_MIN_VIEW);
  });

  it('drops the side margins on a narrow map rather than squeezing it flat', () => {
    expect(framePadding(180, 800, 0).left).toBe(20);
  });
});

describe('tooWideToFrame', () => {
  it('accepts a frame that still shows some street', () => {
    expect(tooWideToFrame(FRAME_MIN_ZOOM)).toBe(false);
    expect(tooWideToFrame(16)).toBe(false);
  });

  it('rejects a frame so wide that neither end is readable', () => {
    expect(tooWideToFrame(11.95)).toBe(true);
  });

  it('rejects a zoom the map could not work out', () => {
    expect(tooWideToFrame(undefined)).toBe(true);
    expect(tooWideToFrame(NaN)).toBe(true);
  });
});
