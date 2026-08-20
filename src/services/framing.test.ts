import { describe, expect, it } from 'vitest';
import {
  FRAME_GAP,
  FRAME_MARGIN,
  FRAME_MIN_VIEW,
  FRAME_TOP,
  coveredHeight,
  frameAround,
  frameMovedEnough,
  frameOffset,
  framePadding,
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

describe('frameOffset', () => {
  it('pushes the target up by half of what the sheet covers', () => {
    expect(frameOffset({ top: 96, bottom: 537, left: 40, right: 40 })).toEqual([0, -220.5]);
  });

  it('leaves the target in the middle when nothing covers the map', () => {
    expect(frameOffset({ top: 0, bottom: 0, left: 0, right: 0 })).toEqual([0, 0]);
  });
});

describe('frameMovedEnough', () => {
  const frame = { southWest: { lon: -9.2, lat: 38.7 }, northEast: { lon: -9.1, lat: 38.8 } };

  it('always draws the first frame', () => {
    expect(frameMovedEnough(null, frame)).toBe(true);
  });

  it('ignores a bus that crept a few metres', () => {
    const crept = { southWest: { lon: -9.2001, lat: 38.7 }, northEast: { lon: -9.1, lat: 38.8 } };

    expect(frameMovedEnough(frame, crept)).toBe(false);
  });

  it('follows a bus that covered real ground', () => {
    const moved = { southWest: { lon: -9.2, lat: 38.7 }, northEast: { lon: -9.1, lat: 38.83 } };

    expect(frameMovedEnough(frame, moved)).toBe(true);
  });

  it('reframes completely when another bus is picked across town', () => {
    const outro = { southWest: { lon: -9.4, lat: 38.6 }, northEast: { lon: -9.3, lat: 38.7 } };

    expect(frameMovedEnough(frame, outro)).toBe(true);
  });
});
