import { describe, expect, it } from 'vitest';
import { easeOut, placeVehicle, slideBetween, tooFarToSlide, toVehicleCollection } from './vehicleLayer';
import type { Vehicle } from './api';

const bus = (overrides: Partial<Vehicle>): Vehicle => ({
  id: '41|814',
  lat: 38.7223,
  lon: -9.1393,
  line_id: '1506',
  pattern_id: '1506_0_1',
  bearing: 90,
  speed: 8,
  ...overrides,
} as Vehicle);

describe('placeVehicle', () => {
  it('reads the position and the bearing', () => {
    expect(placeVehicle(bus({}))).toEqual({ lon: -9.1393, lat: 38.7223, bearing: 90 });
  });

  it('gives back nothing when there is no bus', () => {
    expect(placeVehicle(null)).toBeNull();
  });

  it('refuses a bus with no usable position instead of putting it at zero', () => {
    expect(placeVehicle(bus({ lat: NaN as unknown as number }))).toBeNull();
  });

  it('treats a missing bearing as pointing north', () => {
    expect(placeVehicle(bus({ bearing: undefined as unknown as number })!)!.bearing).toBe(0);
  });
});

describe('easeOut', () => {
  it('starts at nothing and ends at everything', () => {
    expect(easeOut(0)).toBe(0);
    expect(easeOut(1)).toBe(1);
  });

  it('has already covered most of the way at halfway through the time', () => {
    expect(easeOut(0.5)).toBeGreaterThan(0.8);
  });

  it('does not run past the ends when the clock overshoots', () => {
    expect(easeOut(1.4)).toBe(1);
    expect(easeOut(-0.2)).toBe(0);
  });
});

describe('slideBetween', () => {
  const from = { lon: 0, lat: 0, bearing: 0 };
  const to = { lon: 10, lat: 20, bearing: 90 };

  it('is at the start when no time has passed', () => {
    expect(slideBetween(from, to, 0)).toEqual({ lon: 0, lat: 0, bearing: 90 });
  });

  it('lands exactly on the target at the end', () => {
    expect(slideBetween(from, to, 1)).toEqual({ lon: 10, lat: 20, bearing: 90 });
  });

  it('takes the new bearing straight away rather than turning slowly', () => {
    expect(slideBetween(from, to, 0.1).bearing).toBe(90);
  });
});

describe('tooFarToSlide', () => {
  it('slides a bus that moved a street', () => {
    expect(tooFarToSlide({ lon: -9.1, lat: 38.7, bearing: 0 }, { lon: -9.101, lat: 38.7005, bearing: 0 })).toBe(false);
  });

  it('jumps a bus that changed to another one across town', () => {
    expect(tooFarToSlide({ lon: -9.1, lat: 38.7, bearing: 0 }, { lon: -9.25, lat: 38.6, bearing: 0 })).toBe(true);
  });
});

describe('toVehicleCollection', () => {
  it('carries the bearing so the layer can turn the bus', () => {
    const collection = toVehicleCollection({ lon: -9.1, lat: 38.7, bearing: 200 });

    expect(collection.features[0].properties.bearing).toBe(200);
    expect(collection.features[0].geometry.coordinates).toEqual([-9.1, 38.7]);
  });

  it('is empty when no bus is being followed', () => {
    expect(toVehicleCollection(null).features).toEqual([]);
  });
});
