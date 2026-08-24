import { describe, expect, it } from 'vitest';
import { compare } from './api-shape.mjs';

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
