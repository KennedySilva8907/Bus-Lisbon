import { describe, expect, it } from 'vitest';
import { freshestVehicle, keepTheNewer, openVehicleStream, type StreamConnection } from './realtime';
import type { Vehicle } from './api';

class FakeConnection implements StreamConnection {
  calls: unknown[][] = [];
  failNextInvoke = false;

  private reconnected: (() => void) | null = null;
  private reconnecting: (() => void) | null = null;
  private closed: (() => void) | null = null;

  start(): Promise<void> {
    return Promise.resolve();
  }

  invoke(method: string, ...args: unknown[]): Promise<unknown> {
    this.calls.push([method, ...args]);

    if (this.failNextInvoke) {
      this.failNextInvoke = false;

      return Promise.reject(new Error('subscribe failed'));
    }

    return Promise.resolve();
  }

  onreconnecting(callback: () => void) {
    this.reconnecting = callback;
  }

  onreconnected(callback: () => void) {
    this.reconnected = callback;
  }

  onclose(callback: () => void) {
    this.closed = callback;
  }

  dropped() {
    this.reconnecting?.();
  }

  cameBack() {
    this.reconnected?.();
  }

  gaveUp() {
    this.closed?.();
  }
}

const flush = () => new Promise(resolve => setTimeout(resolve, 0));

const vehicleTarget = { vehicleId: '41|816', lineId: null, patternId: null };
const lineTarget = { vehicleId: null, lineId: '1997', patternId: '1997_0_2' };

describe('openVehicleStream', () => {
  it('subscribes to the vehicle once connected', async () => {
    const connection = new FakeConnection();
    const live: boolean[] = [];

    await openVehicleStream(connection, vehicleTarget, value => live.push(value));

    expect(connection.calls).toEqual([['SubscribeToVehicle', '41|816']]);
    expect(live).toEqual([true]);
  });

  it('subscribes to the line when no vehicle was picked', async () => {
    const connection = new FakeConnection();

    await openVehicleStream(connection, lineTarget, () => {});

    expect(connection.calls).toEqual([['SubscribeToLine', '1997', '1997_0_2']]);
  });

  it('subscribes again after a reconnect, because the server forgot the old connection', async () => {
    const connection = new FakeConnection();

    await openVehicleStream(connection, vehicleTarget, () => {});
    connection.dropped();
    connection.cameBack();
    await flush();

    expect(connection.calls).toEqual([
      ['SubscribeToVehicle', '41|816'],
      ['SubscribeToVehicle', '41|816'],
    ]);
  });

  it('reports dead while reconnecting and alive only once resubscribed', async () => {
    const connection = new FakeConnection();
    const live: boolean[] = [];

    await openVehicleStream(connection, vehicleTarget, value => live.push(value));
    connection.dropped();
    connection.cameBack();
    await flush();

    expect(live).toEqual([true, false, true]);
  });

  it('stays dead when the resubscription fails', async () => {
    const connection = new FakeConnection();
    const live: boolean[] = [];

    await openVehicleStream(connection, vehicleTarget, value => live.push(value));
    connection.dropped();
    connection.failNextInvoke = true;
    connection.cameBack();
    await flush();

    expect(live.at(-1)).toBe(false);
  });

  it('reports dead when the connection gives up', async () => {
    const connection = new FakeConnection();
    const live: boolean[] = [];

    await openVehicleStream(connection, vehicleTarget, value => live.push(value));
    connection.gaveUp();

    expect(live.at(-1)).toBe(false);
  });

  it('reports dead when it never manages to connect', async () => {
    const connection = new FakeConnection();
    connection.start = () => Promise.reject(new Error('unreachable'));
    const live: boolean[] = [];

    await openVehicleStream(connection, vehicleTarget, value => live.push(value));

    expect(live).toEqual([false]);
    expect(connection.calls).toEqual([]);
  });
});

const at = (lat: number, timestamp: number): Vehicle => ({
  id: '41|816',
  lat,
  lon: -9.3,
  line_id: '1997',
  pattern_id: '1997_0_2',
  trip_id: '',
  bearing: 0,
  speed: 10,
  timestamp,
});

describe('keepTheNewer', () => {
  it('takes the first position there is', () => {
    expect(keepTheNewer(null, 'v', at(38.1, 100))).toEqual({ target: 'v', vehicle: at(38.1, 100) });
  });

  it('takes a position reported later', () => {
    const held = { target: 'v', vehicle: at(38.1, 100) };

    expect(keepTheNewer(held, 'v', at(38.2, 200))).toEqual({ target: 'v', vehicle: at(38.2, 200) });
  });

  it('ignores a frame older than the one it is holding', () => {
    const held = { target: 'v', vehicle: at(38.1, 200) };

    expect(keepTheNewer(held, 'v', at(38.2, 100))).toBe(held);
  });

  it('starts over when the selection changed', () => {
    const held = { target: 'v', vehicle: at(38.1, 200) };

    expect(keepTheNewer(held, 'other', at(38.2, 100)))
      .toEqual({ target: 'other', vehicle: at(38.2, 100) });
  });
});

describe('freshestVehicle', () => {
  it('takes the newer position even when the stream is connected', () => {
    expect(freshestVehicle(at(38.1, 100), true, at(38.2, 200))).toEqual(at(38.2, 200));
  });

  it('keeps the newer streamed position when the stream drops', () => {
    expect(freshestVehicle(at(38.1, 200), false, at(38.2, 100))).toEqual(at(38.1, 200));
  });

  it('prefers the stream when both sides report the same moment', () => {
    expect(freshestVehicle(at(38.1, 200), true, at(38.2, 200))).toEqual(at(38.1, 200));
    expect(freshestVehicle(at(38.1, 200), false, at(38.2, 200))).toEqual(at(38.2, 200));
  });

  it('keeps the last streamed position when the poll has nothing yet', () => {
    expect(freshestVehicle(at(38.1, 100), false, null)).toEqual(at(38.1, 100));
  });

  it('falls back to the poll before the stream delivers anything', () => {
    expect(freshestVehicle(null, true, at(38.2, 200))).toEqual(at(38.2, 200));
  });

  it('has nothing to show when neither side has a position', () => {
    expect(freshestVehicle(null, false, null)).toBeNull();
  });
});
