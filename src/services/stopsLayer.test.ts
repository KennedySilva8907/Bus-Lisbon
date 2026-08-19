import { describe, expect, it } from 'vitest';
import { toStopCollection } from './stopsLayer';
import type { Stop } from './api';

const stop = (overrides: Partial<Stop>): Stop => ({
  id: '060003',
  name: 'Cascais',
  lat: '38.7223',
  lon: '-9.1393',
  ...overrides,
});

describe('toStopCollection', () => {
  it('puts longitude before latitude, the way GeoJSON wants it', () => {
    const collection = toStopCollection([stop({})]);

    expect(collection.features[0].geometry.coordinates).toEqual([-9.1393, 38.7223]);
  });

  it('keeps the stop id so a tap can find it again', () => {
    const collection = toStopCollection([stop({ id: '170453' })]);

    expect(collection.features[0].properties.stopId).toBe('170453');
  });

  it('drops a stop with no usable position instead of putting it at zero', () => {
    const collection = toStopCollection([
      stop({ id: 'ok' }),
      stop({ id: 'broken', lat: '', lon: '' }),
      stop({ id: 'nonsense', lat: 'x', lon: 'y' }),
    ]);

    expect(collection.features.map(f => f.properties.stopId)).toEqual(['ok']);
  });

  it('numbers the features so MapLibre can tell them apart', () => {
    const collection = toStopCollection([stop({ id: 'a' }), stop({ id: 'b' })]);

    expect(collection.features.map(f => f.id)).toEqual([0, 1]);
  });
});
