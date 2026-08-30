import { afterEach, describe, expect, it, vi } from 'vitest';
import { backendIsAwake } from './gateway';
import { pickFromFleet } from './api';
import type { Vehicle } from './api';

const asleep = { answered: false, failed: false, connected: false };

describe('backendIsAwake', () => {
  it('is asleep while the first request is still in flight', () => {
    expect(backendIsAwake(asleep)).toBe(false);
  });

  it('is awake once it has answered', () => {
    expect(backendIsAwake({ ...asleep, answered: true })).toBe(true);
  });

  it('counts a backend that answered nothing as awake', () => {
    expect(backendIsAwake({ answered: true, failed: false, connected: false })).toBe(true);
  });

  it('is asleep when the request failed, so the feed keeps covering', () => {
    expect(backendIsAwake({ answered: true, failed: true, connected: false })).toBe(false);
  });

  it('is awake when the stream is connected even before the poll answers', () => {
    expect(backendIsAwake({ ...asleep, connected: true })).toBe(true);
  });
});

const withGateway = async (base: string, answer: () => Promise<unknown> = () => Promise.resolve({})) => {
  vi.resetModules();
  vi.stubEnv('VITE_GATEWAY_BASE', base);

  const called = vi.fn(answer);
  vi.stubGlobal('fetch', called);

  const { wakeBackend: wake } = await import('./gateway');

  return { wake, called };
};

describe('wakeBackend', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('asks for health so the container starts before a stop is opened', async () => {
    const { wake, called } = await withGateway('/gw');

    await wake();

    expect(called).toHaveBeenCalledTimes(1);
    expect(called).toHaveBeenCalledWith('/gw/health');
  });

  it('says nothing when the backend is still down', async () => {
    const { wake } = await withGateway('/gw', () => Promise.reject(new Error('asleep')));

    await expect(wake()).resolves.toBeUndefined();
  });

  it('leaves the network alone when there is no gateway', async () => {
    const { wake, called } = await withGateway('');

    await wake();

    expect(called).not.toHaveBeenCalled();
  });
});

const bus = (id: string, over: Partial<Vehicle> = {}): Vehicle => ({
  id,
  lat: 38.7,
  lon: -9.3,
  line_id: '1235',
  pattern_id: '1235_0_2',
  trip_id: 't',
  bearing: 0,
  speed: 10,
  timestamp: Math.floor(Date.now() / 1000),
  ...over,
});

describe('pickFromFleet', () => {
  it('finds the bus that was asked for', () => {
    expect(pickFromFleet([bus('41|1'), bus('41|2')], '41|2')?.id).toBe('41|2');
  });

  it('finds a bus on the line when no bus was picked', () => {
    const feed = [bus('41|1', { line_id: '9999' }), bus('41|2')];

    expect(pickFromFleet(feed, null, '1235')?.id).toBe('41|2');
  });

  it('honours the pattern when there is one', () => {
    const feed = [bus('41|1', { pattern_id: 'other' }), bus('41|2')];

    expect(pickFromFleet(feed, null, '1235', '1235_0_2')?.id).toBe('41|2');
  });

  it('ignores a bus whose position is hours old', () => {
    const stale = bus('41|1', { timestamp: Math.floor(Date.now() / 1000) - 7200 });

    expect(pickFromFleet([stale], '41|1')).toBeNull();
  });

  it('has nothing to give before the feed arrives', () => {
    expect(pickFromFleet(undefined, '41|1')).toBeNull();
  });
});
