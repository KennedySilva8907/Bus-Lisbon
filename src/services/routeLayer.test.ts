import { describe, expect, it } from 'vitest';
import { toRouteCollection } from './routeLayer';

describe('toRouteCollection', () => {
  it('keeps the coordinates in the order the feed sends them', () => {
    const route = toRouteCollection([[-9.1, 38.7], [-9.2, 38.8]]);

    expect(route.features[0].geometry.coordinates).toEqual([[-9.1, 38.7], [-9.2, 38.8]]);
  });

  it('gives back nothing for a shape that cannot make a line', () => {
    expect(toRouteCollection([]).features).toEqual([]);
    expect(toRouteCollection([[-9.1, 38.7]]).features).toEqual([]);
  });

  it('throws away points that are not numbers rather than drawing through them', () => {
    const route = toRouteCollection([[-9.1, 38.7], [NaN, 38.8], [-9.3, 38.9]]);

    expect(route.features[0].geometry.coordinates).toEqual([[-9.1, 38.7], [-9.3, 38.9]]);
  });

  it('does not keep a line when only one good point survives', () => {
    expect(toRouteCollection([[-9.1, 38.7], [NaN, NaN]]).features).toEqual([]);
  });
});
