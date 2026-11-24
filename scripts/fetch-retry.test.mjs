import { describe, expect, it } from 'vitest';
import { fetchWithRetry } from './fetch-retry.mjs';

const dropsFirst = drops => {
  let calls = 0;

  const fetcher = async () => {
    calls++;
    if (calls <= drops) throw new TypeError('fetch failed');

    return { ok: true, status: 200 };
  };

  return { fetcher, calls: () => calls };
};

const noPause = () => 0;

describe('a request whose connection drops', () => {
  it('tries again and returns the answer that got through', async () => {
    const upstream = dropsFirst(2);

    const response = await fetchWithRetry('https://example.test', { fetcher: upstream.fetcher, pause: noPause });

    expect(response.status).toBe(200);
    expect(upstream.calls()).toBe(3);
  });

  it('gives up after the last attempt with the real error', async () => {
    const upstream = dropsFirst(5);

    await expect(fetchWithRetry('https://example.test', { fetcher: upstream.fetcher, pause: noPause }))
      .rejects.toThrow('fetch failed');
    expect(upstream.calls()).toBe(3);
  });

  it('does not ask twice when the first answer arrives', async () => {
    const upstream = dropsFirst(0);

    await fetchWithRetry('https://example.test', { fetcher: upstream.fetcher, pause: noPause });

    expect(upstream.calls()).toBe(1);
  });
});
