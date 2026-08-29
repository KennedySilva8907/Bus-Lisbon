import { describe, expect, it } from 'vitest';
import { compare, spread } from './api-shape.mjs';

const recorded = {
  'hub realtime/eta/by-stop/{id}': {
    always: { trip_id: 'string', eta_at: 'number', vehicle_id: 'string' },
    sometimes: { position_created_at: 'string', refreshed_at: 'string' },
  },
};

const live = (always, sometimes = {}) => ({
  'hub realtime/eta/by-stop/{id}': { always, sometimes },
});

const everything = { trip_id: 'string', eta_at: 'number', vehicle_id: 'string' };

describe('compare', () => {
  it('says nothing when the payload is the same', () => {
    expect(compare(recorded, live(everything, { position_created_at: 'string', refreshed_at: 'string' })))
      .toEqual([]);
  });

  it('does not report the fields that only ride along with some rows', () => {
    expect(compare(recorded, live(everything))).toEqual([]);
  });

  it('does not care that an optional field became a constant one', () => {
    expect(compare(recorded, live({ ...everything, position_created_at: 'string', refreshed_at: 'string' })))
      .toEqual([]);
  });

  it('speaks up when a field that was on every row disappears', () => {
    const changes = compare(recorded, live({ trip_id: 'string', vehicle_id: 'string' }));

    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ kind: 'gone', detail: 'eta_at (number)' });
  });

  it('speaks up when a field changes type', () => {
    const changes = compare(recorded, live({ ...everything, eta_at: 'string' }));

    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ kind: 'retyped', detail: 'eta_at: number -> string' });
  });

  it('speaks up when a name turns up that was never there', () => {
    const changes = compare(recorded, live({ ...everything, eta_at_utc: 'string' }));

    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ kind: 'new', detail: 'eta_at_utc (string)' });
  });

  it('catches a rename as both halves', () => {
    const changes = compare(recorded, live({ trip_id: 'string', vehicle_id: 'string', when: 'number' }));

    expect(changes.map(change => change.kind).sort()).toEqual(['gone', 'new']);
  });

  it('notices an endpoint that answered with nothing', () => {
    const changes = compare(recorded, live({}, {}));

    expect(changes).toEqual([
      { endpoint: 'hub realtime/eta/by-stop/{id}', kind: 'silent', detail: 'answered with nothing to read' },
    ]);
  });

  it('notices an endpoint nobody recorded yet', () => {
    const changes = compare(recorded, {
      ...live(everything, { position_created_at: 'string', refreshed_at: 'string' }),
      'hub something/new': { always: { id: 'string' }, sometimes: {} },
    });

    expect(changes).toEqual([
      { endpoint: 'hub something/new', kind: 'unwatched', detail: 'not in the recorded shape yet' },
    ]);
  });
});

describe('what the shape is built from', () => {
  const rows = n => Array.from({ length: n }, (_, i) => ({ id: i }));

  it('keeps everything when the collection is small', () => {
    expect(spread(rows(9))).toHaveLength(9);
  });

  it('reaches the end of a long collection, not just its head', () => {
    const sampled = spread(rows(1000)).map(row => row.id);

    expect(sampled).toHaveLength(40);
    expect(sampled[0]).toBe(0);
    expect(sampled[sampled.length - 1]).toBeGreaterThan(900);
  });

  it('asks the same rows every time', () => {
    expect(spread(rows(515)).map(r => r.id)).toEqual(spread(rows(515)).map(r => r.id));
  });

  it('does not trip over holes in the array', () => {
    expect(spread([null, { id: 1 }, undefined, { id: 2 }])).toEqual([{ id: 1 }, { id: 2 }]);
  });

  it('would have seen the two per cent the head hid', () => {
    const fleet = [
      ...Array.from({ length: 40 }, () => ({ id: 'plain' })),
      ...Array.from({ length: 475 }, () => ({ id: 'plain', bikes_allowed: true })),
    ];

    expect(spread(fleet).some(row => 'bikes_allowed' in row)).toBe(true);
  });
});
