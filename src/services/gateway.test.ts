import { describe, it, expect } from 'vitest';
import { gatewayVehicleUrl, isFleetVehicleId, streamSubscriptionFor, toVehicle, type GatewayVehicleResponse } from './gateway';

const payload: GatewayVehicleResponse = {
  vehicle: {
    id: '41|300',
    lat: 38.7856,
    lon: -9.3037,
    lineId: '1209',
    patternId: '1209_1_1',
    tripId: '[XS3H8]1209_1_1',
    bearing: 302,
    speed: 8.05,
    timestamp: 1786009950,
  },
  ageSeconds: 1.7,
  stale: false,
};

describe('toVehicle', () => {
  it('renames the camelCase fields the app reads as snake_case', () => {
    const vehicle = toVehicle(payload);

    expect(vehicle.line_id).toBe('1209');
    expect(vehicle.pattern_id).toBe('1209_1_1');
    expect(vehicle.trip_id).toBe('[XS3H8]1209_1_1');
  });

  it('keeps the fields the marker draws with', () => {
    const vehicle = toVehicle(payload);

    expect(vehicle.id).toBe('41|300');
    expect(vehicle.lat).toBe(38.7856);
    expect(vehicle.lon).toBe(-9.3037);
    expect(vehicle.bearing).toBe(302);
    expect(vehicle.speed).toBe(8.05);
    expect(vehicle.timestamp).toBe(1786009950);
  });

  it('survives a payload with the optional fields missing', () => {
    const vehicle = toVehicle({
      ...payload,
      vehicle: { ...payload.vehicle, lineId: null, patternId: null, tripId: null, bearing: null, speed: null },
    });

    expect(vehicle.id).toBe('41|300');
    expect(vehicle.line_id).toBe('');
    expect(vehicle.bearing).toBe(0);
  });
});

describe('gatewayVehicleUrl', () => {
  it('asks for a vehicle by id, encoding the pipe', () => {
    expect(gatewayVehicleUrl('https://api.example', '41|300', null, null))
      .toBe('https://api.example/api/vehicles/41%7C300');
  });

  it('asks by line when there is no vehicle id', () => {
    expect(gatewayVehicleUrl('https://api.example', null, '1209', null))
      .toBe('https://api.example/api/vehicles/by-line/1209');
  });

  it('adds the pattern when one is given', () => {
    expect(gatewayVehicleUrl('https://api.example', null, '1209', '1209_1_1'))
      .toBe('https://api.example/api/vehicles/by-line/1209?patternId=1209_1_1');
  });

  it('prefers the vehicle id over the line', () => {
    expect(gatewayVehicleUrl('https://api.example', '41|300', '1209', '1209_1_1'))
      .toBe('https://api.example/api/vehicles/41%7C300');
  });

  it('returns null when there is nothing to track', () => {
    expect(gatewayVehicleUrl('https://api.example', null, null, null)).toBeNull();
  });
});

describe('isFleetVehicleId', () => {
  it('accepts the ids the fleet feed uses', () => {
    expect(isFleetVehicleId('41|300')).toBe(true);
    expect(isFleetVehicleId('42|2512')).toBe(true);
  });

  it('rejects the bare numbers the arrivals feed sends', () => {
    expect(isFleetVehicleId('2600')).toBe(false);
    expect(isFleetVehicleId('544')).toBe(false);
  });

  it('rejects nothing at all', () => {
    expect(isFleetVehicleId(null)).toBe(false);
    expect(isFleetVehicleId(undefined)).toBe(false);
    expect(isFleetVehicleId('')).toBe(false);
  });
});

describe('gatewayVehicleUrl with an arrivals-feed id', () => {
  it('falls through to the line so the bus is still found', () => {
    expect(gatewayVehicleUrl('https://api.example', '2600', '2769', '2769_0_1'))
      .toBe('https://api.example/api/vehicles/by-line/2769?patternId=2769_0_1');
  });

  it('still goes straight to the vehicle when the id is a fleet one', () => {
    expect(gatewayVehicleUrl('https://api.example', '42|2512', '2769', '2769_0_1'))
      .toBe('https://api.example/api/vehicles/42%7C2512');
  });
});

describe('streamSubscriptionFor', () => {
  it('follows a fleet vehicle by its own id', () => {
    expect(streamSubscriptionFor('42|2524', '2812', '[0277F][BNA17]2812_0_2|2|3|1200'))
      .toEqual({ vehicleId: '42|2524', lineId: null });
  });

  it('subscribes to nothing when the trip is known but the id is not the fleet one', () => {
    expect(streamSubscriptionFor('2608', '2812', '[0277F][BNA17]2812_0_2|2|3|1200'))
      .toEqual({ vehicleId: null, lineId: null });
  });

  it('falls back to the line only when there is no trip to go on', () => {
    expect(streamSubscriptionFor('2608', '2812', null))
      .toEqual({ vehicleId: null, lineId: '2812' });
  });

  it('subscribes to nothing when nothing is selected', () => {
    expect(streamSubscriptionFor(null, null, null)).toEqual({ vehicleId: null, lineId: null });
  });
});
